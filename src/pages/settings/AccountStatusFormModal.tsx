import { useEffect, useState } from "react";
import { Loader2, Tag } from "lucide-react";
import { toast } from "sonner";
import ScrollableModal, { ModalHeader } from "@/components/ui/scrollable-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AccountStatus, AccountStatusInput, STATUS_COLORS } from "@/hooks/useAccountStatuses";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (input: AccountStatusInput) => Promise<void>;
  editing?: AccountStatus | null;
}

export default function AccountStatusFormModal({ open, onClose, onSave, editing }: Props) {
  const isEdit = !!editing;
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(STATUS_COLORS[0]);
  const [isDefault, setIsDefault] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setColor(editing.color ?? STATUS_COLORS[0]);
      setIsDefault(editing.is_default);
      setIsActive(editing.is_active);
    } else {
      setName("");
      setColor(STATUS_COLORS[0]);
      setIsDefault(false);
      setIsActive(true);
    }
    setError(null);
  }, [open, editing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError("Name is required"); return; }
    setSaving(true);
    try {
      await onSave({ name: name.trim(), color, is_default: isDefault, is_active: isActive });
      toast.success(isEdit ? "Status updated" : "Status created");
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
      size="sm"
      onSubmit={handleSubmit}
      header={
        <ModalHeader
          icon={<Tag className="w-4 h-4 text-primary" />}
          title={isEdit ? "Edit status" : "New status"}
          subtitle="Label for your customer accounts"
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
        <Field label="Name" required error={error ?? undefined}>
          <Input value={name} onChange={(e) => { setName(e.target.value); setError(null); }} placeholder="e.g. Hot Lead" autoFocus />
        </Field>

        <div className="space-y-1.5">
          <label className="block text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Color</label>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={cn(
                  "w-7 h-7 rounded-full border-2 transition-all",
                  color === c ? "border-foreground scale-110" : "border-border/40 hover:scale-105",
                )}
                style={{ background: c }}
                aria-label={c}
              />
            ))}
          </div>
        </div>

        <div className="space-y-2 pt-1">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="w-4 h-4 rounded border-border accent-primary"
            />
            <span className="text-[13px] text-foreground">Set as default for new accounts</span>
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

        <div className="mt-4 pt-3 border-t border-border">
          <p className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground mb-2">Preview</p>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium" style={{ background: `${color}20`, color }}>
            <span className="w-2 h-2 rounded-full" style={{ background: color }} />
            {name || "Status name"}
          </div>
        </div>
      </div>
    </ScrollableModal>
  );
}

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}
