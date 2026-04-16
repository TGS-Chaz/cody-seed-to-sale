import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronUp, Loader2, Wrench, Wifi, EyeOff, Eye } from "lucide-react";
import { toast } from "sonner";
import ScrollableModal, { ModalHeader } from "@/components/ui/scrollable-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { useOrg } from "@/lib/org";
import {
  EQUIPMENT_TYPES, EQUIPMENT_TYPE_LABELS, EquipmentType,
  EQUIPMENT_STATUSES, EQUIPMENT_STATUS_LABELS, EquipmentStatus,
  EQUIPMENT_INTEGRATABLE_TYPES,
  HARDWARE_CONNECTION_TYPES, HARDWARE_CONNECTION_TYPE_LABELS,
  HARDWARE_INTEGRATION_TYPES, HARDWARE_INTEGRATION_TYPE_LABELS,
  HARDWARE_DEVICE_TYPES,
  HardwareDeviceType,
  CALIBRATION_FREQUENCIES,
} from "@/lib/schema-enums";
import {
  Equipment, EquipmentInput, HardwareDeviceInput,
} from "@/hooks/useEquipment";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (input: EquipmentInput, hardware?: {
    id?: string | null;
    data?: HardwareDeviceInput | null;
    disconnect?: boolean;
  } | null) => Promise<void>;
  editing?: Equipment | null;
}

interface FacilityOption { id: string; name: string }
interface AreaOption { id: string; name: string; facility_id: string | null }

/** Map an EquipmentType to the closest HardwareDeviceType allowed by the
 * grow_hardware_devices_device_type CHECK constraint. Equipment-only types
 * (HVAC, lighting, irrigation, dehumidifier, tool) fall back to "other". */
function hardwareTypeFor(et: EquipmentType): HardwareDeviceType {
  if ((HARDWARE_DEVICE_TYPES as readonly string[]).includes(et)) return et as HardwareDeviceType;
  // Equipment-level "scanner" / "printer" map to their hardware equivalents
  if (et === "scanner") return "barcode_scanner";
  if (et === "printer") return "label_printer";
  return "other";
}

export default function EquipmentFormModal({ open, onClose, onSave, editing }: Props) {
  const isEdit = !!editing;
  const { orgId } = useOrg();

  const [form, setForm] = useState<EquipmentInput>({
    name: "",
    equipment_type: "scale",
    status: "active",
    requires_calibration: false,
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof EquipmentInput | "hardware", string>>>({});

  // Integration sub-form
  const [isIntegrated, setIsIntegrated] = useState(false);
  const [integrationType, setIntegrationType] = useState<string>("manual");
  const [connectionType, setConnectionType] = useState<string>("bluetooth");
  const [macAddress, setMacAddress] = useState("");
  const [ipAddress, setIpAddress] = useState("");
  const [apiEndpoint, setApiEndpoint] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [revealApiKey, setRevealApiKey] = useState(false);

  // Calibration preset ("monthly", "quarterly", etc., or "custom")
  const [calibrationPreset, setCalibrationPreset] = useState<string>("monthly");
  const [customDays, setCustomDays] = useState<string>("");

  // Dropdowns
  const [facilities, setFacilities] = useState<FacilityOption[]>([]);
  const [areas, setAreas] = useState<AreaOption[]>([]);

  useEffect(() => {
    if (!open || !orgId) return;
    (async () => {
      const [facRes, areaRes] = await Promise.all([
        supabase.from("grow_facilities").select("id, name").eq("org_id", orgId).order("name"),
        supabase.from("grow_areas").select("id, name, facility_id").eq("org_id", orgId).order("name"),
      ]);
      setFacilities((facRes.data ?? []) as FacilityOption[]);
      setAreas((areaRes.data ?? []) as AreaOption[]);
    })();
  }, [open, orgId]);

  // Reset/hydrate on open
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setRevealApiKey(false);
    if (editing) {
      setForm({
        name: editing.name ?? "",
        equipment_type: editing.equipment_type ?? "scale",
        make: editing.make,
        model: editing.model,
        serial_number: editing.serial_number,
        asset_tag: editing.asset_tag,
        facility_id: editing.facility_id,
        area_id: editing.area_id,
        status: editing.status,
        requires_calibration: editing.requires_calibration ?? false,
        calibration_frequency_days: editing.calibration_frequency_days,
        last_calibration_date: editing.last_calibration_date,
        next_calibration_due: editing.next_calibration_due,
        purchase_date: editing.purchase_date,
        purchase_price: editing.purchase_price,
        warranty_expires: editing.warranty_expires,
        vendor: editing.vendor,
        hardware_device_id: editing.hardware_device_id,
        notes: editing.notes,
      });

      // Seed integration fields from the joined hardware_device
      const hw = editing.hardware_device;
      setIsIntegrated(!!hw);
      if (hw) {
        setIntegrationType(hw.integration_type ?? "manual");
        setConnectionType(hw.connection_type ?? "bluetooth");
        setMacAddress(hw.mac_address ?? "");
        setIpAddress(hw.ip_address ?? "");
        setApiEndpoint(hw.api_endpoint ?? "");
        setApiKey(hw.api_key_encrypted ?? "");
        setWebhookUrl(hw.webhook_url ?? "");
      }

      // Seed calibration preset from frequency_days
      const preset = CALIBRATION_FREQUENCIES.find((p) => p.days === editing.calibration_frequency_days);
      setCalibrationPreset(preset?.id ?? (editing.calibration_frequency_days ? "custom" : "monthly"));
      setCustomDays(editing.calibration_frequency_days ? String(editing.calibration_frequency_days) : "");

      setShowAdvanced(true);
    } else {
      setForm({
        name: "",
        equipment_type: "scale",
        status: "active",
        requires_calibration: false,
      });
      setIsIntegrated(false);
      setIntegrationType("manual");
      setConnectionType("bluetooth");
      setMacAddress("");
      setIpAddress("");
      setApiEndpoint("");
      setApiKey("");
      setWebhookUrl("");
      setCalibrationPreset("monthly");
      setCustomDays("");
      setShowAdvanced(false);
    }
  }, [open, editing]);

  const filteredAreas = useMemo(() => {
    if (!form.facility_id) return areas;
    return areas.filter((a) => !a.facility_id || a.facility_id === form.facility_id);
  }, [areas, form.facility_id]);

  const canIntegrate = EQUIPMENT_INTEGRATABLE_TYPES.includes(form.equipment_type as EquipmentType);

  const set = <K extends keyof EquipmentInput>(field: K, value: EquipmentInput[K]) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const validate = (): boolean => {
    const next: typeof errors = {};
    if (!form.name?.trim()) next.name = "Name is required";
    if (!form.equipment_type) next.equipment_type = "Type is required";
    if (form.requires_calibration && calibrationPreset === "custom") {
      const n = Number(customDays);
      if (!n || n <= 0) next.calibration_frequency_days = "Enter a positive number of days";
    }
    if (isIntegrated && canIntegrate && !integrationType) next.hardware = "Pick an integration type";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    // Resolve calibration frequency (days) from preset
    let freqDays: number | null = null;
    if (form.requires_calibration) {
      if (calibrationPreset === "custom") {
        freqDays = Number(customDays) || null;
      } else {
        freqDays = CALIBRATION_FREQUENCIES.find((p) => p.id === calibrationPreset)?.days ?? null;
      }
    }

    // Compute next_calibration_due if user set last_calibration_date + frequency
    let nextDue: string | null | undefined = form.next_calibration_due;
    if (form.requires_calibration && form.last_calibration_date && freqDays && !nextDue) {
      const d = new Date(form.last_calibration_date);
      d.setUTCDate(d.getUTCDate() + freqDays);
      nextDue = d.toISOString().slice(0, 10);
    }

    const payload: EquipmentInput = {
      ...form,
      name: form.name.trim(),
      calibration_frequency_days: freqDays,
      next_calibration_due: nextDue ?? null,
    };

    // Build hardware patch
    let hardwarePatch:
      | { id?: string | null; data?: HardwareDeviceInput | null; disconnect?: boolean }
      | null = null;
    if (canIntegrate) {
      if (!isIntegrated && editing?.hardware_device_id) {
        hardwarePatch = { disconnect: true };
      } else if (isIntegrated) {
        const hwData: HardwareDeviceInput = {
          device_type: hardwareTypeFor(payload.equipment_type),
          manufacturer: payload.make,
          model: payload.model,
          serial_number: payload.serial_number,
          mac_address: macAddress.trim() || null,
          ip_address: ipAddress.trim() || null,
          connection_type: (connectionType as any) || null,
          integration_type: (integrationType as any) || null,
          api_endpoint: apiEndpoint.trim() || null,
          api_key_encrypted: apiKey.trim() || null,
          webhook_url: webhookUrl.trim() || null,
          facility_id: payload.facility_id ?? null,
          assigned_to_area_id: payload.area_id ?? null,
        };
        hardwarePatch = { id: editing?.hardware_device_id ?? null, data: hwData };
      }
    }

    setSaving(true);
    try {
      await onSave(payload, hardwarePatch);
      toast.success(isEdit ? "Equipment updated" : "Equipment created");
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
          icon={<Wrench className="w-4 h-4 text-primary" />}
          title={isEdit ? "Edit equipment" : "New equipment"}
          subtitle="Hardware, scales, sensors — anything tracked for WSLCB"
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
        {/* Type pills */}
        <div className="space-y-1.5">
          <label className="block text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Type <span className="text-destructive">*</span></label>
          <div className="flex flex-wrap gap-1.5">
            {EQUIPMENT_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => set("equipment_type", t)}
                className={cn(
                  "inline-flex items-center h-7 px-2.5 rounded-full border text-[12px] font-medium transition-colors",
                  form.equipment_type === t
                    ? "bg-primary/15 border-primary/40 text-primary"
                    : "bg-muted/30 border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {EQUIPMENT_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        <Field label="Name" required error={errors.name}>
          <Input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder={form.equipment_type === "scale" ? "e.g. Main Trim Room Scale" : "Descriptive name"}
            autoFocus
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Manufacturer">
            <Input value={form.make ?? ""} onChange={(e) => set("make", e.target.value)} placeholder="e.g. Ohaus" />
          </Field>
          <Field label="Model">
            <Input value={form.model ?? ""} onChange={(e) => set("model", e.target.value)} placeholder="e.g. Ranger 3000" />
          </Field>
        </div>

        {/* Advanced toggle */}
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex items-center gap-1.5 text-[12px] font-medium text-primary hover:text-primary/80 pt-2"
        >
          {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {showAdvanced ? "Hide advanced fields" : "Show all fields"}
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
              {/* Identification */}
              <Section title="Identification">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Serial Number">
                    <Input value={form.serial_number ?? ""} onChange={(e) => set("serial_number", e.target.value)} className="font-mono" />
                  </Field>
                  <Field label="Asset Tag">
                    <Input value={form.asset_tag ?? ""} onChange={(e) => set("asset_tag", e.target.value)} placeholder="Internal tag #" className="font-mono" />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Facility">
                    <select
                      value={form.facility_id ?? ""}
                      onChange={(e) => set("facility_id", e.target.value || null)}
                      className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="">— Select facility —</option>
                      {facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Area">
                    <select
                      value={form.area_id ?? ""}
                      onChange={(e) => set("area_id", e.target.value || null)}
                      className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="">— None —</option>
                      {filteredAreas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </Field>
                </div>
              </Section>

              {/* Integration — only for integratable types */}
              {canIntegrate && (
                <Section title="Integration">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isIntegrated}
                      onChange={(e) => setIsIntegrated(e.target.checked)}
                      className="w-4 h-4 rounded border-border accent-primary"
                    />
                    <Wifi className={cn("w-3.5 h-3.5", isIntegrated ? "text-primary" : "text-muted-foreground")} />
                    <span className="text-[13px] text-foreground">This device integrates with Cody Grow</span>
                  </label>

                  <AnimatePresence initial={false}>
                    {isIntegrated && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="space-y-3 overflow-hidden pt-2"
                      >
                        <div className="grid grid-cols-2 gap-3">
                          <Field label="Integration">
                            <select
                              value={integrationType}
                              onChange={(e) => setIntegrationType(e.target.value)}
                              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            >
                              {HARDWARE_INTEGRATION_TYPES.map((t) => (
                                <option key={t} value={t}>{HARDWARE_INTEGRATION_TYPE_LABELS[t]}</option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Connection">
                            <select
                              value={connectionType}
                              onChange={(e) => setConnectionType(e.target.value)}
                              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            >
                              {HARDWARE_CONNECTION_TYPES.map((t) => (
                                <option key={t} value={t}>{HARDWARE_CONNECTION_TYPE_LABELS[t]}</option>
                              ))}
                            </select>
                          </Field>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <Field label="MAC Address">
                            <Input value={macAddress} onChange={(e) => setMacAddress(e.target.value)} className="font-mono" placeholder="AA:BB:CC:DD:EE:FF" />
                          </Field>
                          <Field label="IP Address">
                            <Input value={ipAddress} onChange={(e) => setIpAddress(e.target.value)} className="font-mono" placeholder="192.168.1.10" />
                          </Field>
                        </div>
                        <Field label="API Endpoint">
                          <Input value={apiEndpoint} onChange={(e) => setApiEndpoint(e.target.value)} className="font-mono" placeholder="https://api.vendor.com/v1/devices/…" />
                        </Field>
                        <Field label="API Key" helper="Stored encrypted at rest">
                          <div className="relative">
                            <Input
                              type={revealApiKey ? "text" : "password"}
                              value={apiKey}
                              onChange={(e) => setApiKey(e.target.value)}
                              className="font-mono pr-9"
                              placeholder="sk_live_…"
                            />
                            <button
                              type="button"
                              onClick={() => setRevealApiKey((v) => !v)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-accent text-muted-foreground"
                              aria-label={revealApiKey ? "Hide" : "Reveal"}
                            >
                              {revealApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </Field>
                        <Field label="Webhook URL">
                          <Input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} className="font-mono" placeholder="https://your-app.com/webhooks/device" />
                        </Field>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Section>
              )}

              {/* Calibration */}
              <Section title="Calibration">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={!!form.requires_calibration}
                    onChange={(e) => set("requires_calibration", e.target.checked)}
                    className="w-4 h-4 rounded border-border accent-primary"
                  />
                  <span className="text-[13px] text-foreground">Requires regular calibration</span>
                </label>

                <AnimatePresence initial={false}>
                  {form.requires_calibration && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-3 overflow-hidden pt-2"
                    >
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Frequency" error={errors.calibration_frequency_days}>
                          <select
                            value={calibrationPreset}
                            onChange={(e) => setCalibrationPreset(e.target.value)}
                            className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          >
                            {CALIBRATION_FREQUENCIES.map((p) => (
                              <option key={p.id} value={p.id}>{p.label}</option>
                            ))}
                            <option value="custom">Custom</option>
                          </select>
                        </Field>
                        {calibrationPreset === "custom" ? (
                          <Field label="Every X Days">
                            <Input type="number" min="1" value={customDays} onChange={(e) => setCustomDays(e.target.value)} className="font-mono" placeholder="30" />
                          </Field>
                        ) : (
                          <Field label="Last Calibrated">
                            <Input type="date" value={form.last_calibration_date ?? ""} onChange={(e) => set("last_calibration_date", e.target.value || null)} />
                          </Field>
                        )}
                      </div>
                      {calibrationPreset === "custom" && (
                        <Field label="Last Calibrated">
                          <Input type="date" value={form.last_calibration_date ?? ""} onChange={(e) => set("last_calibration_date", e.target.value || null)} />
                        </Field>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </Section>

              {/* Purchase */}
              <Section title="Purchase Info">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Purchase Date">
                    <Input type="date" value={form.purchase_date ?? ""} onChange={(e) => set("purchase_date", e.target.value || null)} />
                  </Field>
                  <Field label="Purchase Price">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">$</span>
                      <Input
                        type="number"
                        step="0.01"
                        value={form.purchase_price ?? ""}
                        onChange={(e) => set("purchase_price", e.target.value ? Number(e.target.value) : null)}
                        className="font-mono pl-6"
                        placeholder="0.00"
                      />
                    </div>
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Warranty Expires">
                    <Input type="date" value={form.warranty_expires ?? ""} onChange={(e) => set("warranty_expires", e.target.value || null)} />
                  </Field>
                  <Field label="Vendor">
                    <Input value={form.vendor ?? ""} onChange={(e) => set("vendor", e.target.value)} placeholder="Supplier / vendor" />
                  </Field>
                </div>
              </Section>

              {/* Status */}
              <Section title="Status">
                <Field label="Status">
                  <select
                    value={form.status ?? "active"}
                    onChange={(e) => set("status", e.target.value as EquipmentStatus)}
                    className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {EQUIPMENT_STATUSES.map((s) => (
                      <option key={s} value={s}>{EQUIPMENT_STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Notes">
                  <textarea
                    value={form.notes ?? ""}
                    onChange={(e) => set("notes", e.target.value)}
                    rows={3}
                    placeholder="Location, usage notes, quirks…"
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
