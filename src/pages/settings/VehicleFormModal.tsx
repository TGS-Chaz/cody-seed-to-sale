import { useEffect, useState } from "react";
import { Loader2, Truck, ChevronDown, ChevronUp, Info } from "lucide-react";
import { toast } from "sonner";
import ScrollableModal, { ModalHeader } from "@/components/ui/scrollable-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Vehicle, VehicleInput, VehicleType } from "@/hooks/useVehicles";
import { supabase } from "@/lib/supabase";
import { useOrg } from "@/lib/org";
import { cn } from "@/lib/utils";

const COLORS = [
  { name: "Black", hex: "#000000" }, { name: "White", hex: "#FFFFFF" }, { name: "Silver", hex: "#C0C0C0" },
  { name: "Gray", hex: "#6B7280" }, { name: "Red", hex: "#EF4444" }, { name: "Blue", hex: "#3B82F6" },
  { name: "Green", hex: "#10B981" }, { name: "Brown", hex: "#92400E" }, { name: "Tan", hex: "#D2B48C" },
  { name: "Yellow", hex: "#EAB308" }, { name: "Orange", hex: "#F97316" }, { name: "Other", hex: "#8B5CF6" },
];

interface VehicleFormModalProps {
  open: boolean;
  onClose: () => void;
  editing?: Vehicle | null;
  onSave: (input: VehicleInput) => Promise<void>;
}

interface Account { id: string; company_name: string; }

export default function VehicleFormModal({ open, onClose, editing, onSave }: VehicleFormModalProps) {
  const isEdit = !!editing;
  const { orgId } = useOrg();
  const [accounts, setAccounts] = useState<Account[]>([]);

  const currentYear = new Date().getFullYear();
  const [type, setType] = useState<VehicleType>("delivery");
  const [form, setForm] = useState<VehicleInput>({
    vehicle_type: "delivery",
    make: "",
    model: "",
    year: String(currentYear),
    license_plate: "",
    is_active: true,
    hide_for_fulfillment: false,
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof VehicleInput, string>>>({});

  useEffect(() => {
    if (!open || !orgId) return;
    (async () => {
      const { data } = await supabase.from("grow_accounts").select("id, company_name").eq("org_id", orgId).order("company_name");
      setAccounts((data ?? []) as Account[]);
    })();
  }, [open, orgId]);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setType(editing.vehicle_type);
      setForm({ ...editing });
      setShowAdvanced(true);
    } else {
      setType("delivery");
      setForm({
        vehicle_type: "delivery",
        make: "",
        model: "",
        year: String(currentYear),
        license_plate: "",
        is_active: true,
        hide_for_fulfillment: false,
      });
      setShowAdvanced(false);
    }
    setErrors({});
  }, [editing, open, currentYear]);

  useEffect(() => {
    setForm((f) => ({ ...f, vehicle_type: type }));
  }, [type]);

  const set = <K extends keyof VehicleInput>(field: K, value: VehicleInput[K]) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const validate = (): boolean => {
    const next: typeof errors = {};
    if (!form.make.trim()) next.make = "Required";
    if (!form.model.trim()) next.model = "Required";
    const y = parseInt(form.year, 10);
    if (!y || y < 1990 || y > currentYear + 1) next.year = `Year must be 1990–${currentYear + 1}`;
    if (!form.license_plate.trim()) next.license_plate = "Required";
    if (type === "pickup" && !form.client_account_id) next.client_account_id = "Select an account";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      await onSave(form);
      toast.success(isEdit ? "Vehicle updated" : "Vehicle added");
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const noAccounts = type === "pickup" && accounts.length === 0;

  return (
    <ScrollableModal
      open={open}
      onClose={onClose}
      size="md"
      onSubmit={handleSubmit}
      header={<ModalHeader icon={<Truck className="w-4 h-4 text-primary" />} title={isEdit ? "Edit Vehicle" : "Add Vehicle"} subtitle="CCRS requires make, model, year, color, VIN, plate" />}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving || noAccounts} className="min-w-[100px]">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : isEdit ? "Save" : "Add Vehicle"}
          </Button>
        </>
      }
    >
      <div className="p-6 space-y-4">
        <div>
          <label className="block text-[11px] uppercase tracking-wider font-medium text-muted-foreground mb-1.5">Vehicle Type</label>
          <div className="flex gap-1 rounded-lg p-0.5 bg-muted/40 w-full">
            <button type="button" disabled={isEdit} onClick={() => setType("delivery")}
              className={cn("flex-1 h-8 rounded-md text-[12px] font-medium transition-all", type === "delivery" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground", isEdit && "opacity-60 cursor-not-allowed")}>
              Delivery
            </button>
            <button type="button" disabled={isEdit} onClick={() => setType("pickup")}
              className={cn("flex-1 h-8 rounded-md text-[12px] font-medium transition-all", type === "pickup" ? "bg-purple-500 text-white shadow-sm" : "text-muted-foreground", isEdit && "opacity-60 cursor-not-allowed")}>
              Pickup
            </button>
          </div>
        </div>

        {noAccounts && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-[12px] text-amber-500">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>You need to create at least one customer account first.</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Make" required error={errors.make}>
            <Input value={form.make} onChange={(e) => set("make", e.target.value)} placeholder="Ford" />
          </Field>
          <Field label="Model" required error={errors.model}>
            <Input value={form.model} onChange={(e) => set("model", e.target.value)} placeholder="Transit" />
          </Field>
        </div>
        <div className="grid grid-cols-[100px_1fr] gap-3">
          <Field label="Year" required error={errors.year}>
            <Input type="number" min={1990} max={currentYear + 1} value={form.year} onChange={(e) => set("year", e.target.value)} className="font-mono" />
          </Field>
          <Field label="License Plate" required error={errors.license_plate}>
            <Input value={form.license_plate} onChange={(e) => set("license_plate", e.target.value.toUpperCase())} className="font-mono uppercase" />
          </Field>
        </div>
        <Field label="VIN" helper={form.vin && form.vin.length !== 17 ? `VIN should be 17 characters (you have ${form.vin.length})` : "17 characters"}>
          <Input value={form.vin ?? ""} onChange={(e) => set("vin", e.target.value.toUpperCase())} className="font-mono uppercase" maxLength={17} />
        </Field>

        <button type="button" onClick={() => setShowAdvanced((v) => !v)} className="flex items-center gap-1.5 text-[12px] font-medium text-primary hover:text-primary/80">
          {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {showAdvanced ? "Hide all fields" : "Show all fields"}
        </button>

        {showAdvanced && (
          <div className="space-y-3 pt-2 border-t border-border/50">
            <Field label="Color">
              <div className="flex flex-wrap gap-1.5">
                {COLORS.map((c) => (
                  <button key={c.name} type="button" onClick={() => set("color", c.name)}
                    className={cn("inline-flex items-center gap-1.5 h-7 px-2 rounded-full border text-[11px] font-medium",
                      form.color === c.name ? "ring-2 ring-primary border-primary" : "border-border hover:border-foreground/30",
                    )}>
                    <span className="w-2.5 h-2.5 rounded-full border border-border/50" style={{ background: c.hex }} />
                    {c.name}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Unit Name / Nickname" helper="Helpful for fleets: 'Yakima Route Van', 'Truck #3'">
              <Input value={form.unit_name ?? ""} onChange={(e) => set("unit_name", e.target.value)} />
            </Field>

            {type === "pickup" && (
              <Field label="Client Account" required error={errors.client_account_id}>
                <select value={form.client_account_id ?? ""} onChange={(e) => set("client_account_id", e.target.value || null)}
                  className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="">— Select an account —</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.company_name}</option>)}
                </select>
              </Field>
            )}

            <Section title="Insurance">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Insurance Company">
                  <Input value={form.insurance_company ?? ""} onChange={(e) => set("insurance_company", e.target.value)} />
                </Field>
                <Field label="Policy Number">
                  <Input value={form.insurance_policy_number ?? ""} onChange={(e) => set("insurance_policy_number", e.target.value)} className="font-mono" />
                </Field>
              </div>
              <Field label="Insurance Expires">
                <Input type="date" value={form.insurance_expires ?? ""} onChange={(e) => set("insurance_expires", e.target.value || null)} />
              </Field>
            </Section>

            <Section title="Registration">
              <Field label="Registration Expires">
                <Input type="date" value={form.registration_expires ?? ""} onChange={(e) => set("registration_expires", e.target.value || null)} />
              </Field>
            </Section>

            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={!!form.hide_for_fulfillment} onChange={(e) => set("hide_for_fulfillment", e.target.checked)} className="w-4 h-4 rounded border-border accent-primary" />
              <span className="text-[13px] text-foreground">Hide for Fulfillment</span>
            </label>
            <Field label="Notes">
              <textarea value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} rows={2}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
            </Field>
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
