import { useEffect, useState } from "react";
import { Loader2, Map, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import ScrollableModal, { ModalHeader } from "@/components/ui/scrollable-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Route, RouteInput, DayOfWeek, ROUTE_COLORS, DAY_LABELS } from "@/hooks/useRoutes";
import { useDrivers } from "@/hooks/useDrivers";
import { cn } from "@/lib/utils";

interface RouteFormModalProps {
  open: boolean;
  onClose: () => void;
  editing?: Route | null;
  onSave: (input: RouteInput) => Promise<void>;
}

export default function RouteFormModal({ open, onClose, editing, onSave }: RouteFormModalProps) {
  const isEdit = !!editing;
  const { data: drivers } = useDrivers();
  const deliveryDrivers = drivers.filter((d) => d.driver_type === "delivery" && d.is_active);

  const [form, setForm] = useState<RouteInput>({
    name: "",
    description: "",
    minimum_order_amount: 0,
    typical_day_of_week: null,
    assigned_driver_id: null,
    color: ROUTE_COLORS[0],
    is_active: true,
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof RouteInput, string>>>({});

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        name: editing.name,
        description: editing.description ?? "",
        minimum_order_amount: editing.minimum_order_amount,
        typical_day_of_week: editing.typical_day_of_week,
        assigned_driver_id: editing.assigned_driver_id,
        color: editing.color ?? ROUTE_COLORS[0],
        is_active: editing.is_active,
      });
      setShowAdvanced(true);
    } else {
      setForm({
        name: "",
        description: "",
        minimum_order_amount: 0,
        typical_day_of_week: null,
        assigned_driver_id: null,
        color: ROUTE_COLORS[0],
        is_active: true,
      });
      setShowAdvanced(false);
    }
    setErrors({});
  }, [editing, open]);

  const set = <K extends keyof RouteInput>(field: K, value: RouteInput[K]) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setErrors({ name: "Required" }); return; }
    setSaving(true);
    try {
      await onSave(form);
      toast.success(isEdit ? "Route updated" : "Route created");
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
      header={<ModalHeader icon={<Map className="w-4 h-4 text-primary" />} title={isEdit ? "Edit Route" : "Create Route"} subtitle="Organize deliveries by territory or day" />}
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
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Yakima Valley - Tuesdays" autoFocus />
        </Field>

        <Field label="Description">
          <textarea value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} rows={2}
            placeholder="Territory, special instructions, etc."
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
        </Field>

        <Field label="Color">
          <div className="flex flex-wrap gap-1.5">
            {ROUTE_COLORS.map((c) => (
              <button key={c} type="button" onClick={() => set("color", c)}
                className={cn("w-7 h-7 rounded-full border-2 transition-all",
                  form.color === c ? "border-foreground scale-110" : "border-transparent hover:scale-105",
                )}
                style={{ background: c }}
                title={c}
              />
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Day of Week">
            <select value={form.typical_day_of_week ?? ""} onChange={(e) => set("typical_day_of_week", (e.target.value as DayOfWeek) || null)}
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="">— None —</option>
              {(Object.keys(DAY_LABELS) as DayOfWeek[]).map((d) => <option key={d} value={d}>{DAY_LABELS[d]}</option>)}
            </select>
          </Field>
          <Field label="Min Order Amount">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input type="number" min={0} step={0.01}
                value={form.minimum_order_amount ?? 0}
                onChange={(e) => set("minimum_order_amount", parseFloat(e.target.value) || 0)}
                className="pl-7 font-mono" />
            </div>
          </Field>
        </div>

        <button type="button" onClick={() => setShowAdvanced((v) => !v)} className="flex items-center gap-1.5 text-[12px] font-medium text-primary hover:text-primary/80">
          {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {showAdvanced ? "Hide all fields" : "Show all fields"}
        </button>

        {showAdvanced && (
          <div className="space-y-3 pt-2 border-t border-border/50">
            <Field label="Assigned Driver" helper="Delivery drivers only. Leave blank if no default.">
              <select value={form.assigned_driver_id ?? ""} onChange={(e) => set("assigned_driver_id", e.target.value || null)}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="">— None —</option>
                {deliveryDrivers.map((d) => <option key={d.id} value={d.id}>{d.first_name} {d.last_name}</option>)}
              </select>
            </Field>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_active ?? true} onChange={(e) => set("is_active", e.target.checked)} className="w-4 h-4 rounded border-border accent-primary" />
              <span className="text-[13px] text-foreground">Active</span>
            </label>
          </div>
        )}
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
