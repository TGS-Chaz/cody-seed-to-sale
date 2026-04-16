import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronUp, Loader2, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import ScrollableModal, { ModalHeader } from "@/components/ui/scrollable-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { useOrg } from "@/lib/org";
import {
  CALIBRATION_RESULTS, CALIBRATION_RESULT_LABELS, CalibrationResult,
} from "@/lib/schema-enums";
import { CalibrationEntryInput } from "@/hooks/useCalibrationLog";
import type { Equipment } from "@/hooks/useEquipment";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (input: CalibrationEntryInput) => Promise<void>;
  /** If provided, the equipment picker is pre-selected and locked. */
  lockedEquipment?: Equipment | null;
}

interface EmployeeOption { id: string; first_name: string; last_name: string }
interface EquipmentOption {
  id: string;
  name: string | null;
  make: string | null;
  model: string | null;
  calibration_frequency_days: number | null;
}

export default function CalibrationLogModal({ open, onClose, onSave, lockedEquipment }: Props) {
  const { orgId } = useOrg();
  const [equipmentId, setEquipmentId] = useState<string>("");
  const [calibratedAt, setCalibratedAt] = useState<string>(() => new Date().toISOString().slice(0, 16));
  const [technicianMode, setTechnicianMode] = useState<"employee" | "external">("employee");
  const [technicianEmployeeId, setTechnicianEmployeeId] = useState<string>("");
  const [technicianName, setTechnicianName] = useState<string>("");
  const [result, setResult] = useState<CalibrationResult>("pass");
  const [nextDue, setNextDue] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  // Readings
  const [referenceStandard, setReferenceStandard] = useState("");
  const [beforeReading, setBeforeReading] = useState("");
  const [afterReading, setAfterReading] = useState("");
  const [tolerance, setTolerance] = useState("");
  const [deviation, setDeviation] = useState("");
  const [certificateUrl, setCertificateUrl] = useState("");

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});

  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [equipmentOptions, setEquipmentOptions] = useState<EquipmentOption[]>([]);

  useEffect(() => {
    if (!open || !orgId) return;
    (async () => {
      const [empRes, eqRes] = await Promise.all([
        supabase.from("grow_employees").select("id, first_name, last_name").eq("org_id", orgId).eq("employment_status", "active").order("last_name"),
        supabase
          .from("grow_equipment")
          .select("id, name, make, model, calibration_frequency_days")
          .eq("org_id", orgId)
          .eq("requires_calibration", true)
          .order("name", { ascending: true, nullsFirst: false }),
      ]);
      setEmployees((empRes.data ?? []) as EmployeeOption[]);
      setEquipmentOptions((eqRes.data ?? []) as EquipmentOption[]);
    })();
  }, [open, orgId]);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setCalibratedAt(new Date().toISOString().slice(0, 16));
    setResult("pass");
    setTechnicianMode("employee");
    setTechnicianEmployeeId("");
    setTechnicianName("");
    setNextDue("");
    setNotes("");
    setReferenceStandard("");
    setBeforeReading("");
    setAfterReading("");
    setTolerance("");
    setDeviation("");
    setCertificateUrl("");
    setShowAdvanced(false);
    setEquipmentId(lockedEquipment?.id ?? "");
  }, [open, lockedEquipment]);

  // Auto-compute next calibration due from the selected equipment's frequency
  const selectedEquipment = useMemo(() => {
    if (lockedEquipment) return {
      id: lockedEquipment.id,
      name: lockedEquipment.name,
      make: lockedEquipment.make,
      model: lockedEquipment.model,
      calibration_frequency_days: lockedEquipment.calibration_frequency_days,
    } as EquipmentOption;
    return equipmentOptions.find((e) => e.id === equipmentId) ?? null;
  }, [lockedEquipment, equipmentOptions, equipmentId]);

  useEffect(() => {
    if (!selectedEquipment?.calibration_frequency_days || !calibratedAt) return;
    // Only auto-fill if user hasn't manually set a next_due yet
    if (nextDue) return;
    const d = new Date(calibratedAt);
    d.setUTCDate(d.getUTCDate() + selectedEquipment.calibration_frequency_days);
    setNextDue(d.toISOString().slice(0, 10));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEquipment?.id, calibratedAt]);

  const equipmentLabel = (e: EquipmentOption) => {
    const parts = [e.name, [e.make, e.model].filter(Boolean).join(" ")].filter(Boolean);
    return parts.join(" — ") || "Unnamed equipment";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!equipmentId) next.equipment_id = "Pick an equipment";
    if (!calibratedAt) next.calibrated_at = "Date is required";
    if (technicianMode === "external" && !technicianName.trim()) next.technician_name = "Technician name required";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const payload: CalibrationEntryInput = {
      equipment_id: equipmentId,
      calibrated_at: new Date(calibratedAt).toISOString(),
      calibrated_by: technicianMode === "employee" ? (technicianEmployeeId || null) : null,
      technician_name: technicianMode === "external" ? technicianName.trim() : null,
      pass_fail: result,
      reference_standard: referenceStandard.trim() || null,
      before_reading: beforeReading.trim() || null,
      after_reading: result === "adjusted" ? (afterReading.trim() || null) : null,
      tolerance: tolerance.trim() || null,
      deviation: deviation.trim() || null,
      certificate_url: certificateUrl.trim() || null,
      next_calibration_due: nextDue || null,
      notes: notes.trim() || null,
    };

    setSaving(true);
    try {
      await onSave(payload);
      const eqName = lockedEquipment?.name ?? selectedEquipment?.name ?? "equipment";
      toast.success(`Calibration logged for ${eqName}`);
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
          icon={<ClipboardCheck className="w-4 h-4 text-primary" />}
          title="Log calibration"
          subtitle="Record a calibration event for WSLCB audit trail"
        />
      }
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving} className="min-w-[100px]">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Log calibration"}
          </Button>
        </>
      }
    >
      <div className="p-6 space-y-4">
        <Field label="Equipment" required error={errors.equipment_id}>
          {lockedEquipment ? (
            <div className="flex items-center gap-2 h-10 px-3 rounded-lg border border-border bg-muted/30">
              <ClipboardCheck className="w-3.5 h-3.5 text-primary" />
              <span className="text-[13px] font-medium text-foreground">
                {equipmentLabel({
                  id: lockedEquipment.id,
                  name: lockedEquipment.name,
                  make: lockedEquipment.make,
                  model: lockedEquipment.model,
                  calibration_frequency_days: lockedEquipment.calibration_frequency_days,
                })}
              </span>
            </div>
          ) : (
            <select
              value={equipmentId}
              onChange={(e) => setEquipmentId(e.target.value)}
              autoFocus
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">— Select equipment —</option>
              {equipmentOptions.map((e) => (
                <option key={e.id} value={e.id}>{equipmentLabel(e)}</option>
              ))}
            </select>
          )}
          {equipmentOptions.length === 0 && !lockedEquipment && (
            <p className="text-[11px] text-muted-foreground/70">No equipment with "Requires calibration" enabled yet.</p>
          )}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="When" required error={errors.calibrated_at}>
            <Input
              type="datetime-local"
              value={calibratedAt}
              onChange={(e) => setCalibratedAt(e.target.value)}
            />
          </Field>
          <Field label="Result" required>
            <div className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5 w-full">
              {CALIBRATION_RESULTS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setResult(r)}
                  className={cn(
                    "flex-1 h-9 text-[12px] font-medium rounded-md transition-colors",
                    result === r
                      ? (r === "pass" ? "bg-emerald-500/15 text-emerald-500"
                        : r === "fail" ? "bg-red-500/15 text-red-500"
                        : "bg-amber-500/15 text-amber-500")
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {CALIBRATION_RESULT_LABELS[r]}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <div className="space-y-1.5">
          <label className="block text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Technician</label>
          <div className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5">
            <button
              type="button"
              onClick={() => setTechnicianMode("employee")}
              className={cn(
                "px-3 h-8 text-[12px] font-medium rounded-md transition-colors",
                technicianMode === "employee" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              Employee
            </button>
            <button
              type="button"
              onClick={() => setTechnicianMode("external")}
              className={cn(
                "px-3 h-8 text-[12px] font-medium rounded-md transition-colors",
                technicianMode === "external" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              External Tech
            </button>
          </div>
          {technicianMode === "employee" ? (
            <select
              value={technicianEmployeeId}
              onChange={(e) => setTechnicianEmployeeId(e.target.value)}
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">— Select employee —</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name}</option>
              ))}
            </select>
          ) : (
            <div>
              <Input
                value={technicianName}
                onChange={(e) => setTechnicianName(e.target.value)}
                placeholder="e.g. Jane Smith, NIST Calibration Services"
              />
              {errors.technician_name && <p className="text-[11px] text-destructive mt-1">{errors.technician_name}</p>}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex items-center gap-1.5 text-[12px] font-medium text-primary hover:text-primary/80 pt-1"
        >
          {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {showAdvanced ? "Hide readings & docs" : "Add readings, docs, notes"}
        </button>

        <AnimatePresence initial={false}>
          {showAdvanced && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-5 overflow-hidden"
            >
              <Section title="Readings">
                <Field label="Reference Standard" helper="e.g. NIST-traceable 1kg calibration weight">
                  <Input value={referenceStandard} onChange={(e) => setReferenceStandard(e.target.value)} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Before Reading">
                    <Input value={beforeReading} onChange={(e) => setBeforeReading(e.target.value)} className="font-mono" placeholder="e.g. 1000.2 g" />
                  </Field>
                  <Field label={result === "adjusted" ? "After Reading" : "Tolerance"}>
                    {result === "adjusted" ? (
                      <Input value={afterReading} onChange={(e) => setAfterReading(e.target.value)} className="font-mono" placeholder="e.g. 1000.0 g" />
                    ) : (
                      <Input value={tolerance} onChange={(e) => setTolerance(e.target.value)} className="font-mono" placeholder="±0.1 g" />
                    )}
                  </Field>
                </div>
                {result === "adjusted" && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Tolerance">
                      <Input value={tolerance} onChange={(e) => setTolerance(e.target.value)} className="font-mono" placeholder="±0.1 g" />
                    </Field>
                    <Field label="Actual Deviation">
                      <Input value={deviation} onChange={(e) => setDeviation(e.target.value)} className="font-mono" placeholder="+0.2 g" />
                    </Field>
                  </div>
                )}
                {result !== "adjusted" && (
                  <Field label="Actual Deviation">
                    <Input value={deviation} onChange={(e) => setDeviation(e.target.value)} className="font-mono" placeholder="+0.2 g" />
                  </Field>
                )}
              </Section>

              <Section title="Documentation">
                <Field label="Certificate URL" helper="Upload the CoC to Supabase Storage and paste the URL here">
                  <Input value={certificateUrl} onChange={(e) => setCertificateUrl(e.target.value)} placeholder="https://…" className="font-mono text-[12px]" />
                </Field>
                <Field label="Next Calibration Due" helper={selectedEquipment?.calibration_frequency_days ? `Auto-filled from equipment's ${selectedEquipment.calibration_frequency_days}-day frequency` : "Override if needed"}>
                  <Input type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} />
                </Field>
                <Field label="Notes">
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    placeholder="Observations, adjustments made, follow-up needed…"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  />
                </Field>
              </Section>
            </motion.div>
          )}
        </AnimatePresence>
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
    <div className="space-y-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
