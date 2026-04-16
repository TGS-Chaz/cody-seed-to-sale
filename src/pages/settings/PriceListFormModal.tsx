import { useEffect, useState } from "react";
import { Loader2, DollarSign } from "lucide-react";
import { toast } from "sonner";
import ScrollableModal, { ModalHeader } from "@/components/ui/scrollable-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PriceList, PriceListInput } from "@/hooks/usePriceLists";

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (input: PriceListInput) => Promise<void>;
  editing?: PriceList | null;
}

export default function PriceListFormModal({ open, onClose, onSave, editing }: Props) {
  const isEdit = !!editing;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<"name" | "dates", string>>>({});

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setDescription(editing.description ?? "");
      setValidFrom(editing.valid_from ?? "");
      setValidUntil(editing.valid_until ?? "");
      setIsDefault(editing.is_default);
      setIsActive(editing.is_active);
    } else {
      setName("");
      setDescription("");
      setValidFrom("");
      setValidUntil("");
      setIsDefault(false);
      setIsActive(true);
    }
    setErrors({});
  }, [open, editing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!name.trim()) next.name = "Name is required";
    if (validFrom && validUntil && new Date(validUntil) < new Date(validFrom)) next.dates = "End date must be after start date";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || null,
        valid_from: validFrom || null,
        valid_until: validUntil || null,
        is_default: isDefault,
        is_active: isActive,
      });
      toast.success(isEdit ? "Price list updated" : "Price list created");
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollableModal
      open={open}
      onClose={onClose}
      size="md"
      onSubmit={handleSubmit}
      header={
        <ModalHeader
          icon={<DollarSign className="w-4 h-4 text-primary" />}
          title={isEdit ? "Edit price list" : "New price list"}
          subtitle="Assign product pricing for a group of customers"
        />
      }
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving} className="min-w-[100px]">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : isEdit ? "Save" : "Create"}
          </Button>
        </>
      }
    >
      <div className="p-6 space-y-4">
        <Field label="Name" required error={errors.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Wholesale Tier 1" autoFocus />
        </Field>

        <Field label="Description" helper="Who this price list is for, and why">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Volume discount for tier-1 wholesale accounts…"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Valid From">
            <Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
          </Field>
          <Field label="Valid Until" error={errors.dates}>
            <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </Field>
        </div>
        <p className="text-[11px] text-muted-foreground -mt-2">Leave blank for an open-ended price list.</p>

        <div className="space-y-2 pt-1">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="w-4 h-4 rounded border-border accent-primary"
            />
            <span className="text-[13px] text-foreground">Use as default for new accounts</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 rounded border-border accent-primary"
            />
            <span className="text-[13px] text-foreground">Active</span>
          </label>
        </div>
      </div>
    </ScrollableModal>
  );
}

function Field({ label, required, error, helper, children }: { label: string; required?: boolean; error?: string; helper?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-[11px] text-destructive">{error}</p>}
      {!error && helper && <p className="text-[11px] text-muted-foreground/70">{helper}</p>}
    </div>
  );
}
