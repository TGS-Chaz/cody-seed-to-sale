import { useEffect, useState } from "react";
import { Loader2, Percent } from "lucide-react";
import { toast } from "sonner";
import ScrollableModal, { ModalHeader } from "@/components/ui/scrollable-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Discount, DiscountInput } from "@/hooks/useDiscounts";
import { DISCOUNT_TYPES, DISCOUNT_TYPE_SHORT_LABELS, DiscountType } from "@/lib/schema-enums";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (input: DiscountInput) => Promise<void>;
  editing?: Discount | null;
}

export default function DiscountFormModal({ open, onClose, onSave, editing }: Props) {
  const isEdit = !!editing;
  const [name, setName] = useState("");
  const [discountType, setDiscountType] = useState<DiscountType>("percentage");
  const [discountValue, setDiscountValue] = useState<string>("");
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [minimumOrder, setMinimumOrder] = useState<string>("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<"name" | "value" | "dates", string>>>({});

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setDiscountType((editing.discount_type as DiscountType) ?? "percentage");
      setDiscountValue(String(editing.discount_value ?? ""));
      setValidFrom(editing.valid_from ?? "");
      setValidUntil(editing.valid_until ?? "");
      setMinimumOrder(editing.minimum_order_amount != null ? String(editing.minimum_order_amount) : "");
      setIsActive(editing.is_active);
    } else {
      setName("");
      setDiscountType("percentage");
      setDiscountValue("");
      setValidFrom("");
      setValidUntil("");
      setMinimumOrder("");
      setIsActive(true);
    }
    setErrors({});
  }, [open, editing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!name.trim()) next.name = "Name is required";
    const parsed = Number(discountValue);
    if (!discountValue || Number.isNaN(parsed) || parsed <= 0) next.value = "Enter a positive number";
    if (discountType === "percentage" && parsed > 100) next.value = "Percent cannot exceed 100";
    if (validFrom && validUntil && new Date(validUntil) < new Date(validFrom)) next.dates = "End date must be after start date";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        discount_type: discountType,
        discount_value: parsed,
        valid_from: validFrom || null,
        valid_until: validUntil || null,
        minimum_order_amount: minimumOrder ? Number(minimumOrder) : null,
        is_active: isActive,
      });
      toast.success(isEdit ? "Discount updated" : "Discount created");
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
          icon={<Percent className="w-4 h-4 text-primary" />}
          title={isEdit ? "Edit discount" : "New discount"}
          subtitle="Promotional discount applied at order time"
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
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 420 Sale 10% Off" autoFocus />
        </Field>

        <div className="space-y-1.5">
          <label className="block text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Type</label>
          <div className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5">
            {DISCOUNT_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setDiscountType(t)}
                className={cn(
                  "px-3 h-8 text-[12px] font-medium rounded-md transition-colors whitespace-nowrap",
                  discountType === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {DISCOUNT_TYPE_SHORT_LABELS[t]}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground/70 pt-0.5">
            {discountType === "percentage" && "Discount a percentage off the line total."}
            {discountType === "fixed_amount" && "Discount a flat dollar amount off the order."}
            {discountType === "unit_price_override" && "Override the unit price directly for matching products."}
          </p>
        </div>

        <Field
          label={
            discountType === "percentage" ? "Percent Off" :
            discountType === "fixed_amount" ? "Amount Off" :
            "Override Unit Price"
          }
          required
          error={errors.value}
        >
          <div className="relative">
            <Input
              type="number"
              step={discountType === "percentage" ? "1" : "0.01"}
              min="0"
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              placeholder={discountType === "percentage" ? "10" : "25.00"}
              className={cn("font-mono", discountType === "percentage" ? "pr-8" : "pl-6")}
            />
            {discountType === "percentage" ? (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">%</span>
            ) : (
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">$</span>
            )}
          </div>
        </Field>

        <Field label="Minimum Order" helper="Minimum order amount to qualify (optional)">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">$</span>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={minimumOrder}
              onChange={(e) => setMinimumOrder(e.target.value)}
              placeholder="0.00"
              className="font-mono pl-6"
            />
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Valid From">
            <Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
          </Field>
          <Field label="Valid Until" error={errors.dates}>
            <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </Field>
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none pt-1">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="w-4 h-4 rounded border-border accent-primary"
          />
          <span className="text-[13px] text-foreground">Active</span>
        </label>
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
