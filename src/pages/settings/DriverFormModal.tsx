import { useEffect, useMemo, useState } from "react";
import { Loader2, Truck, UserCheck, ChevronDown, ChevronUp, Info } from "lucide-react";
import { toast } from "sonner";
import ScrollableModal, { ModalHeader } from "@/components/ui/scrollable-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Driver, DriverInput, DriverType } from "@/hooks/useDrivers";
import { useEmployees } from "@/hooks/useEmployees";
import { supabase } from "@/lib/supabase";
import { useOrg } from "@/lib/org";
import { cn } from "@/lib/utils";

interface DriverFormModalProps {
  open: boolean;
  onClose: () => void;
  editing?: Driver | null;
  onSave: (input: DriverInput) => Promise<void>;
  takenEmployeeIds?: string[];
}

interface Account { id: string; company_name: string; license_number: string | null; }

export default function DriverFormModal({ open, onClose, editing, onSave, takenEmployeeIds = [] }: DriverFormModalProps) {
  const isEdit = !!editing;
  const { orgId } = useOrg();
  const { data: employees } = useEmployees();
  const [accounts, setAccounts] = useState<Account[]>([]);

  const [type, setType] = useState<DriverType>("delivery");
  const [form, setForm] = useState<DriverInput>({
    driver_type: "delivery",
    first_name: "",
    last_name: "",
    drivers_license_number: "",
    drivers_license_state: "WA",
    is_active: true,
    hide_for_fulfillment: false,
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof DriverInput, string>>>({});

  // Load accounts for pickup type
  useEffect(() => {
    if (!open || !orgId) return;
    (async () => {
      const { data } = await supabase.from("grow_accounts").select("id, company_name, license_number").eq("org_id", orgId).order("company_name");
      setAccounts((data ?? []) as Account[]);
    })();
  }, [open, orgId]);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setType(editing.driver_type);
      setForm({ ...editing });
      setShowAdvanced(true);
    } else {
      setType("delivery");
      setForm({
        driver_type: "delivery",
        first_name: "",
        last_name: "",
        drivers_license_number: "",
        drivers_license_state: "WA",
        is_active: true,
        hide_for_fulfillment: false,
      });
      setShowAdvanced(false);
    }
    setErrors({});
  }, [editing, open]);

  // Keep form.driver_type synced with type
  useEffect(() => {
    setForm((f) => ({ ...f, driver_type: type }));
  }, [type]);

  const set = <K extends keyof DriverInput>(field: K, value: DriverInput[K]) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  };

  // Employee dropdown: filter out already-linked employees (unless editing this driver)
  const availableEmployees = useMemo(() => {
    const taken = new Set(takenEmployeeIds);
    if (editing?.employee_id) taken.delete(editing.employee_id);
    return employees.filter((e) => !taken.has(e.id));
  }, [employees, takenEmployeeIds, editing?.employee_id]);

  // Auto-fill from employee when selected
  const linkToEmployee = (empId: string) => {
    set("employee_id", empId);
    const e = employees.find((x) => x.id === empId);
    if (!e) return;
    setForm((f) => ({
      ...f,
      employee_id: empId,
      first_name: e.first_name,
      last_name: e.last_name,
      drivers_license_number: e.wa_drivers_license ?? f.drivers_license_number,
      drivers_license_expires: e.wa_drivers_license_expires ?? f.drivers_license_expires,
      phone: e.phone ?? f.phone,
      email: e.email ?? f.email,
    }));
  };

  const linkToAccount = (accId: string) => {
    const a = accounts.find((x) => x.id === accId);
    if (!a) return;
    setForm((f) => ({
      ...f,
      client_account_id: accId,
      client_license_number: a.license_number ?? f.client_license_number,
    }));
  };

  const validate = (): boolean => {
    const next: typeof errors = {};
    if (!form.first_name.trim()) next.first_name = "Required";
    if (!form.last_name.trim()) next.last_name = "Required";
    if (!form.drivers_license_number.trim()) next.drivers_license_number = "Required";
    if (type === "delivery" && !form.employee_id) next.employee_id = "Select an employee to link";
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
      toast.success(isEdit ? "Driver updated" : "Driver added");
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
      header={<ModalHeader icon={<Truck className="w-4 h-4 text-primary" />} title={isEdit ? "Edit Driver" : "Add Driver"} subtitle="Drivers are required on every CCRS manifest" />}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving || noAccounts} className="min-w-[100px]">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : isEdit ? "Save" : "Add Driver"}
          </Button>
        </>
      }
    >
      <div className="p-6 space-y-4">
        {/* Type segmented control */}
        <div>
          <label className="block text-[11px] uppercase tracking-wider font-medium text-muted-foreground mb-1.5">Driver Type</label>
          <div className="flex gap-1 rounded-lg p-0.5 bg-muted/40 w-full">
            <button
              type="button"
              disabled={isEdit}
              onClick={() => setType("delivery")}
              className={cn("flex-1 flex items-center justify-center gap-1.5 h-8 rounded-md text-[12px] font-medium transition-all",
                type === "delivery" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                isEdit && "opacity-60 cursor-not-allowed",
              )}
            >
              <UserCheck className="w-3.5 h-3.5" /> Delivery Driver
            </button>
            <button
              type="button"
              disabled={isEdit}
              onClick={() => setType("pickup")}
              className={cn("flex-1 flex items-center justify-center gap-1.5 h-8 rounded-md text-[12px] font-medium transition-all",
                type === "pickup" ? "bg-purple-500 text-white shadow-sm" : "text-muted-foreground hover:text-foreground",
                isEdit && "opacity-60 cursor-not-allowed",
              )}
            >
              <Truck className="w-3.5 h-3.5" /> Pickup Driver
            </button>
          </div>
          {isEdit && <p className="text-[11px] text-muted-foreground mt-1">Type can't be changed after creation.</p>}
        </div>

        {noAccounts && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-[12px] text-amber-500">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>You need to create at least one customer account first. <a href="/sales/accounts" className="underline font-medium">Go to Accounts</a>.</span>
          </div>
        )}

        {type === "delivery" ? (
          <Field label="Link to Employee" required error={errors.employee_id}>
            <select
              value={form.employee_id ?? ""}
              onChange={(e) => linkToEmployee(e.target.value)}
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">— Select an employee —</option>
              {availableEmployees.map((e) => (
                <option key={e.id} value={e.id}>{e.first_name} {e.last_name}{e.job_title ? ` · ${e.job_title}` : ""}</option>
              ))}
            </select>
          </Field>
        ) : (
          <>
            <Field label="Client Account" required error={errors.client_account_id}>
              <select
                value={form.client_account_id ?? ""}
                onChange={(e) => linkToAccount(e.target.value)}
                disabled={noAccounts}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                <option value="">— Select an account —</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.company_name}</option>
                ))}
              </select>
            </Field>
            <Field label="Client License #">
              <Input value={form.client_license_number ?? ""} onChange={(e) => set("client_license_number", e.target.value)} className="font-mono" />
            </Field>
          </>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="First Name" required error={errors.first_name}>
            <Input value={form.first_name} onChange={(e) => set("first_name", e.target.value)} />
          </Field>
          <Field label="Last Name" required error={errors.last_name}>
            <Input value={form.last_name} onChange={(e) => set("last_name", e.target.value)} />
          </Field>
        </div>

        <Field label="WA Driver's License #" required error={errors.drivers_license_number}>
          <Input value={form.drivers_license_number} onChange={(e) => set("drivers_license_number", e.target.value)} className="font-mono" />
        </Field>

        <button type="button" onClick={() => setShowAdvanced((v) => !v)} className="flex items-center gap-1.5 text-[12px] font-medium text-primary hover:text-primary/80">
          {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {showAdvanced ? "Hide all fields" : "Show all fields"}
        </button>

        {showAdvanced && (
          <div className="space-y-3 pt-2 border-t border-border/50">
            <div className="grid grid-cols-2 gap-3">
              <Field label="License State">
                <Input value={form.drivers_license_state ?? "WA"} onChange={(e) => set("drivers_license_state", e.target.value)} className="font-mono w-20" maxLength={2} />
              </Field>
              <Field label="License Expires">
                <Input type="date" value={form.drivers_license_expires ?? ""} onChange={(e) => set("drivers_license_expires", e.target.value || null)} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone">
                <Input type="tel" value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
              </Field>
              <Field label="Email">
                <Input type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} />
              </Field>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={!!form.hide_for_fulfillment} onChange={(e) => set("hide_for_fulfillment", e.target.checked)} className="w-4 h-4 rounded border-border accent-primary" />
              <span className="text-[13px] text-foreground">Hide for Fulfillment</span>
              <span className="text-[11px] text-muted-foreground">— Won't appear in manifest driver dropdowns</span>
            </label>
            <Field label="Notes">
              <textarea value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} rows={2}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
            </Field>
          </div>
        )}
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
