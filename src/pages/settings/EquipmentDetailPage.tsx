import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, Wrench, Wifi, Edit, ClipboardCheck, PowerOff, Loader2,
  MapPin, Building2, Package, Calendar, AlertTriangle, ExternalLink,
  Gauge, FileText, Activity, Info,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import PageHeader from "@/components/shared/PageHeader";
import StatCard from "@/components/shared/StatCard";
import StatusPill from "@/components/shared/StatusPill";
import CopyableId from "@/components/shared/CopyableId";
import DateTime from "@/components/shared/DateTime";
import EmptyState from "@/components/shared/EmptyState";
import { useShortcut } from "@/components/shared/KeyboardShortcuts";
import { useCodyContext } from "@/hooks/useCodyContext";
import {
  useEquipmentItem, useEquipment, Equipment, EquipmentInput, HardwareDeviceInput,
} from "@/hooks/useEquipment";
import { useCalibrationLog, CalibrationEntryInput, CalibrationEntry } from "@/hooks/useCalibrationLog";
import {
  EQUIPMENT_TYPE_LABELS, EquipmentType,
  EQUIPMENT_STATUS_LABELS, EquipmentStatus,
  HARDWARE_CONNECTION_TYPE_LABELS, HARDWARE_INTEGRATION_TYPE_LABELS,
  CALIBRATION_RESULT_LABELS, CalibrationResult,
} from "@/lib/schema-enums";
import EquipmentFormModal from "./EquipmentFormModal";
import CalibrationLogModal from "./CalibrationLogModal";
import CodyInsightsPanel from "@/components/cody/CodyInsightsPanel";
import { supabase } from "@/lib/supabase";

const STATUS_VARIANT: Record<EquipmentStatus, "success" | "warning" | "muted" | "critical"> = {
  active: "success",
  maintenance: "warning",
  out_of_service: "critical",
  decommissioned: "muted",
};

const RESULT_VARIANT: Record<CalibrationResult, "success" | "critical" | "warning"> = {
  pass: "success",
  fail: "critical",
  adjusted: "warning",
};

export default function EquipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: equipment, loading, refresh } = useEquipmentItem(id);
  const { updateEquipment, decommissionEquipment } = useEquipment();
  const {
    data: calibrations,
    createCalibrationEntry,
    deleteCalibrationEntry,
  } = useCalibrationLog(id);

  const activeTab = searchParams.get("tab") ?? "overview";
  const setActiveTab = (t: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", t);
    setSearchParams(next, { replace: true });
  };

  const [editOpen, setEditOpen] = useState(false);
  const [calModalOpen, setCalModalOpen] = useState(false);

  // Deep-link: ?logCalibration=1 opens the calibration modal automatically
  useEffect(() => {
    if (searchParams.get("logCalibration") === "1") {
      setCalModalOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete("logCalibration");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const { setContext, clearContext } = useCodyContext();
  const sig = equipment ? `${equipment.id}:${equipment.updated_at}:${calibrations.length}` : "";
  const codyPayload = useMemo(() => {
    if (!equipment) return null;
    return {
      equipment: {
        name: equipment.name,
        type: equipment.equipment_type,
        make: equipment.make,
        model: equipment.model,
        status: equipment.status,
        integrated: !!equipment.hardware_device_id,
        last_calibration: equipment.last_calibration_date,
        next_calibration: equipment.next_calibration_due,
        calibration_count: calibrations.length,
        recent_result: calibrations[0]?.pass_fail,
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  useEffect(() => {
    if (!equipment || !codyPayload) return;
    setContext({ context_type: "equipment_detail", context_id: equipment.id, page_data: codyPayload });
    return () => clearContext();
  }, [setContext, clearContext, codyPayload, equipment?.id]);

  useShortcut(["e"], () => setEditOpen(true), { description: "Edit equipment", scope: "Equipment Detail", enabled: !!equipment && !editOpen && !calModalOpen });
  useShortcut(["c"], () => setCalModalOpen(true), { description: "Log calibration", scope: "Equipment Detail", enabled: !!equipment?.requires_calibration && !editOpen && !calModalOpen });

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!equipment) {
    return (
      <div className="p-6 md:p-8 max-w-7xl mx-auto">
        <EmptyState
          icon={Wrench}
          title="Equipment not found"
          description="This equipment may have been deleted or does not exist."
          primaryAction={<Button onClick={() => navigate("/settings/equipment")}>← Back to equipment</Button>}
        />
      </div>
    );
  }

  const displayName = equipment.name ?? [equipment.make, equipment.model].filter(Boolean).join(" ") ?? "Unnamed equipment";
  const typeLabel = equipment.equipment_type ? EQUIPMENT_TYPE_LABELS[equipment.equipment_type as EquipmentType] ?? equipment.equipment_type : "—";

  const now = Date.now();
  const nextDueTs = equipment.next_calibration_due ? new Date(equipment.next_calibration_due).getTime() : null;
  const overdue = nextDueTs != null && nextDueTs < now;
  const dueSoon = nextDueTs != null && nextDueTs >= now && nextDueTs - now < 7 * 24 * 60 * 60 * 1000;

  const handleSaveEdit = async (
    input: EquipmentInput,
    hardware?: { id?: string | null; data?: HardwareDeviceInput | null; disconnect?: boolean } | null,
  ) => {
    await updateEquipment(equipment.id, input, hardware);
    refresh();
  };

  const handleLogCalibration = async (input: CalibrationEntryInput) => {
    await createCalibrationEntry(input);
    refresh();
  };

  const handleDecommission = async () => {
    if (!confirm(`Decommission "${displayName}"? This marks it inactive.`)) return;
    try {
      await decommissionEquipment(equipment.id);
      toast.success("Equipment decommissioned");
      navigate("/settings/equipment");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <PageHeader
        title={displayName}
        description={`${typeLabel}${equipment.make ? ` · ${equipment.make}` : ""}${equipment.model ? ` ${equipment.model}` : ""}`}
        breadcrumbs={[
          { label: "Settings", to: "/settings" },
          { label: "Equipment", to: "/settings/equipment" },
          { label: displayName },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <StatusPill label={EQUIPMENT_STATUS_LABELS[equipment.status]} variant={STATUS_VARIANT[equipment.status]} />
            {equipment.hardware_device_id && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded bg-emerald-500/10 text-emerald-500 uppercase tracking-wider">
                <Wifi className="w-3 h-3" /> Connected
              </span>
            )}
            {equipment.requires_calibration && (
              <Button variant="outline" onClick={() => setCalModalOpen(true)} className="gap-1.5">
                <ClipboardCheck className="w-3.5 h-3.5" /> Log Calibration
              </Button>
            )}
            <Button variant="outline" onClick={() => setEditOpen(true)} className="gap-1.5">
              <Edit className="w-3.5 h-3.5" /> Edit
            </Button>
            {equipment.status !== "decommissioned" && (
              <Button variant="outline" onClick={handleDecommission} className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10">
                <PowerOff className="w-3.5 h-3.5" /> Decommission
              </Button>
            )}
          </div>
        }
      />

      {/* Key info grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <InfoCard icon={Package} label="Type & Serial">
          <div className="text-[13px] font-medium text-foreground">{typeLabel}</div>
          {equipment.serial_number ? (
            <CopyableId value={equipment.serial_number} />
          ) : (
            <div className="text-[11px] text-muted-foreground">No serial #</div>
          )}
        </InfoCard>
        <InfoCard icon={Building2} label="Facility / Area">
          {equipment.facility ? (
            <button onClick={() => navigate(`/settings/facilities/${equipment.facility!.id}`)} className="text-[13px] font-medium text-primary hover:underline text-left">
              {equipment.facility.name}
            </button>
          ) : <div className="text-[13px] text-muted-foreground">—</div>}
          {equipment.area ? (
            <div className="text-[11px] text-muted-foreground flex items-center gap-1">
              <MapPin className="w-3 h-3" /> {equipment.area.name}
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground">No area assigned</div>
          )}
        </InfoCard>
        <InfoCard icon={Calendar} label="Calibration">
          {equipment.requires_calibration ? (
            <>
              <div className="text-[13px] font-medium text-foreground">
                Last: {equipment.last_calibration_date ? <DateTime value={equipment.last_calibration_date} format="date-only" className="font-medium" /> : <span className="italic text-muted-foreground">Never</span>}
              </div>
              <div className={`text-[11px] font-medium flex items-center gap-1 ${overdue ? "text-destructive" : dueSoon ? "text-amber-500" : "text-muted-foreground"}`}>
                {overdue && <AlertTriangle className="w-3 h-3" />}
                Next: {equipment.next_calibration_due ? <DateTime value={equipment.next_calibration_due} format="date-only" className="font-medium" /> : <span className="italic">Not scheduled</span>}
              </div>
            </>
          ) : (
            <div className="text-[12px] text-muted-foreground">Not tracked</div>
          )}
        </InfoCard>
        <InfoCard icon={Wifi} label="Integration">
          {equipment.hardware_device ? (
            <>
              <div className="text-[13px] font-medium text-foreground">{HARDWARE_INTEGRATION_TYPE_LABELS[equipment.hardware_device.integration_type as keyof typeof HARDWARE_INTEGRATION_TYPE_LABELS] ?? "Custom"}</div>
              <div className="text-[11px] text-muted-foreground">
                {equipment.hardware_device.connection_type ? HARDWARE_CONNECTION_TYPE_LABELS[equipment.hardware_device.connection_type] : "—"}
                {equipment.hardware_device.last_ping_at && (
                  <> · Last ping <DateTime value={equipment.hardware_device.last_ping_at} format="auto" /></>
                )}
              </div>
            </>
          ) : (
            <div className="text-[12px] text-muted-foreground">Standalone device</div>
          )}
        </InfoCard>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="calibration">Calibration History</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewPanel equipment={equipment} calibrations={calibrations} />
        </TabsContent>
        <TabsContent value="calibration">
          <CalibrationHistoryPanel equipment={equipment} calibrations={calibrations} onLog={() => setCalModalOpen(true)} onDelete={deleteCalibrationEntry} />
        </TabsContent>
        <TabsContent value="usage">
          <UsagePanel equipment={equipment} />
        </TabsContent>
        <TabsContent value="documents">
          <DocumentsPanel equipmentId={equipment.id} />
        </TabsContent>
        <TabsContent value="activity">
          <div className="rounded-xl border border-border bg-card p-12 text-center">
            <Activity className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-[14px] font-semibold text-foreground mb-1">No activity yet</p>
            <p className="text-[12px] text-muted-foreground">Audit log will appear here as the equipment is used.</p>
          </div>
        </TabsContent>
      </Tabs>

      <EquipmentFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        editing={equipment}
        onSave={handleSaveEdit}
      />
      <CalibrationLogModal
        open={calModalOpen}
        onClose={() => setCalModalOpen(false)}
        onSave={handleLogCalibration}
        lockedEquipment={equipment}
      />
    </div>
  );
}

// ─── Overview panel ───────────────────────────────────────────────────────────

function OverviewPanel({ equipment, calibrations }: { equipment: Equipment; calibrations: CalibrationEntry[] }) {
  const recent = calibrations.slice(0, 5);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        {/* Device info card */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-muted/20">
            <h3 className="text-[13px] font-semibold text-foreground">Device Info</h3>
          </div>
          <dl className="divide-y divide-border">
            <InfoRow label="Asset Tag" value={equipment.asset_tag ? <span className="font-mono">{equipment.asset_tag}</span> : "—"} />
            <InfoRow label="Vendor" value={equipment.vendor ?? "—"} />
            <InfoRow label="Purchase Date" value={equipment.purchase_date ? <DateTime value={equipment.purchase_date} format="date-only" /> : "—"} />
            <InfoRow label="Purchase Price" value={equipment.purchase_price != null ? `$${Number(equipment.purchase_price).toFixed(2)}` : "—"} />
            <InfoRow label="Warranty Expires" value={equipment.warranty_expires ? <DateTime value={equipment.warranty_expires} format="date-only" /> : "—"} />
            <InfoRow label="Notes" value={equipment.notes ?? "—"} />
          </dl>
        </div>

        {/* Recent calibrations */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-muted/20 flex items-center justify-between">
            <h3 className="text-[13px] font-semibold text-foreground">Recent Calibrations</h3>
            {calibrations.length > 5 && (
              <a href="?tab=calibration" className="text-[11px] text-primary hover:underline">View all ({calibrations.length})</a>
            )}
          </div>
          {recent.length === 0 ? (
            <div className="p-8 text-center">
              <ClipboardCheck className="w-6 h-6 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-[12px] text-muted-foreground">No calibrations logged yet.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {recent.map((c) => (
                <li key={c.id} className="px-5 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <DateTime value={c.calibrated_at} format="full" className="text-[12px] font-medium text-foreground" />
                      {c.pass_fail && <StatusPill label={CALIBRATION_RESULT_LABELS[c.pass_fail]} variant={RESULT_VARIANT[c.pass_fail]} />}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      by {c.technician ? `${c.technician.first_name} ${c.technician.last_name}` : c.technician_name ?? "Unknown"}
                      {c.before_reading && <> · before <span className="font-mono">{c.before_reading}</span></>}
                      {c.after_reading && <> → after <span className="font-mono">{c.after_reading}</span></>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Scale readings placeholder (only for scales) */}
        {equipment.equipment_type === "scale" && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-muted/20">
              <h3 className="text-[13px] font-semibold text-foreground">Recent Weighings</h3>
            </div>
            <div className="p-8 text-center">
              <Gauge className="w-6 h-6 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-[12px] text-muted-foreground">Scale readings will appear here once the weighing UI is wired.</p>
            </div>
          </div>
        )}
      </div>

      <div className="lg:col-span-1">
        <CodyInsightsPanel />
      </div>
    </div>
  );
}

// ─── Calibration history panel ────────────────────────────────────────────────

function CalibrationHistoryPanel({
  equipment, calibrations, onLog, onDelete,
}: {
  equipment: Equipment;
  calibrations: CalibrationEntry[];
  onLog: () => void;
  onDelete: (id: string) => Promise<void>;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[13px] text-muted-foreground">
          {calibrations.length === 0 ? "No calibrations logged yet." : `${calibrations.length} ${calibrations.length === 1 ? "event" : "events"} recorded`}
        </p>
        {equipment.requires_calibration && (
          <Button onClick={onLog} className="gap-1.5">
            <ClipboardCheck className="w-3.5 h-3.5" /> Log Calibration
          </Button>
        )}
      </div>

      {calibrations.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title={equipment.requires_calibration ? "No calibrations logged" : "Calibration not tracked"}
          description={equipment.requires_calibration
            ? "Log the first calibration event to start building the WSLCB audit trail."
            : "This equipment isn't marked as requiring calibration. Enable it in the edit form to start tracking."}
        />
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full">
            <thead className="border-b border-border bg-muted/30">
              <tr>
                <th className="text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground px-4 py-2.5">Date</th>
                <th className="text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground px-4 py-2.5">Result</th>
                <th className="text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground px-4 py-2.5">Technician</th>
                <th className="text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground px-4 py-2.5">Before</th>
                <th className="text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground px-4 py-2.5">After</th>
                <th className="text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground px-4 py-2.5">Tolerance</th>
                <th className="text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground px-4 py-2.5">CoC</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {calibrations.map((c) => (
                <tr key={c.id} className="group hover:bg-accent/40">
                  <td className="px-4 py-2.5"><DateTime value={c.calibrated_at} format="full" className="text-[12px]" /></td>
                  <td className="px-4 py-2.5">{c.pass_fail ? <StatusPill label={CALIBRATION_RESULT_LABELS[c.pass_fail]} variant={RESULT_VARIANT[c.pass_fail]} /> : <span className="text-muted-foreground text-[12px]">—</span>}</td>
                  <td className="px-4 py-2.5 text-[12px]">
                    {c.technician ? `${c.technician.first_name} ${c.technician.last_name}` : (c.technician_name ? <span className="italic text-muted-foreground">{c.technician_name}</span> : <span className="text-muted-foreground">—</span>)}
                  </td>
                  <td className="px-4 py-2.5 text-[11px] font-mono">{c.before_reading ?? "—"}</td>
                  <td className="px-4 py-2.5 text-[11px] font-mono">{c.after_reading ?? "—"}</td>
                  <td className="px-4 py-2.5 text-[11px] font-mono">{c.tolerance ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    {c.certificate_url ? (
                      <a href={c.certificate_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary text-[12px] hover:underline">
                        <ExternalLink className="w-3 h-3" /> View
                      </a>
                    ) : <span className="text-muted-foreground text-[12px]">—</span>}
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    <button
                      onClick={async () => { if (confirm("Delete this calibration entry?")) await onDelete(c.id); }}
                      className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="Delete"
                      title="Delete (audit!)"
                    >
                      <PowerOff className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Usage panel ──────────────────────────────────────────────────────────────

function UsagePanel({ equipment }: { equipment: Equipment }) {
  const [readings, setReadings] = useState<any[]>([]);
  const [loading, setLoading] = useState(equipment.equipment_type === "scale");

  useEffect(() => {
    if (equipment.equipment_type !== "scale") { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("grow_scale_readings")
        .select("*")
        .eq("scale_equipment_id", equipment.id)
        .order("recorded_at", { ascending: false })
        .limit(10);
      if (cancelled) return;
      setReadings(data ?? []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [equipment.id, equipment.equipment_type]);

  if (equipment.equipment_type === "scale") {
    return (
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/20">
          <h3 className="text-[13px] font-semibold text-foreground">Recent Weighings</h3>
        </div>
        {loading ? (
          <div className="p-6 text-center"><Loader2 className="w-4 h-4 animate-spin mx-auto text-muted-foreground" /></div>
        ) : readings.length === 0 ? (
          <div className="p-12 text-center">
            <Gauge className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-[13px] font-medium text-foreground mb-1">No weighings yet</p>
            <p className="text-[12px] text-muted-foreground">Scale readings will appear here once the weighing UI is wired and this scale is used.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {readings.map((r: any) => (
              <li key={r.id} className="px-5 py-3 flex items-center justify-between">
                <DateTime value={r.recorded_at} format="full" className="text-[12px] text-muted-foreground" />
                <span className="font-mono text-[13px] font-semibold text-foreground tabular-nums">
                  {r.weight_grams != null ? `${r.weight_grams} g` : "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (["environmental_sensor", "thermometer", "hygrometer", "co2_meter", "ph_meter"].includes(equipment.equipment_type ?? "")) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <Gauge className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" />
        <p className="text-[13px] font-medium text-foreground mb-1">Sensor data coming soon</p>
        <p className="text-[12px] text-muted-foreground">Environmental readings charts will connect here once the telemetry pipeline ships.</p>
      </div>
    );
  }

  if (["printer", "label_printer"].includes(equipment.equipment_type ?? "")) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <FileText className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" />
        <p className="text-[13px] font-medium text-foreground mb-1">Print history coming soon</p>
        <p className="text-[12px] text-muted-foreground">Label print jobs will be tracked here once the label workflow ships.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-12 text-center">
      <Info className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" />
      <p className="text-[12px] text-muted-foreground">No usage tracking available for this equipment type.</p>
    </div>
  );
}

// ─── Documents panel ──────────────────────────────────────────────────────────

function DocumentsPanel({ equipmentId }: { equipmentId: string }) {
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("grow_documents")
        .select("*")
        .eq("entity_type", "equipment")
        .eq("entity_id", equipmentId)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      setDocs(data ?? []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [equipmentId]);

  if (loading) {
    return <div className="rounded-xl border border-border bg-card p-12 text-center"><Loader2 className="w-4 h-4 animate-spin mx-auto text-muted-foreground" /></div>;
  }

  if (docs.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <FileText className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" />
        <p className="text-[13px] font-medium text-foreground mb-1">No documents yet</p>
        <p className="text-[12px] text-muted-foreground">Attach manuals, warranty docs, and calibration certificates here.</p>
        <p className="text-[11px] text-muted-foreground/70 mt-2">Upload wiring is planned with the Documents page.</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {docs.map((d: any) => (
        <li key={d.id} className="rounded-lg border border-border bg-card px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <FileText className="w-4 h-4 text-primary shrink-0" />
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-foreground truncate">{d.title ?? d.file_name}</div>
              <div className="text-[11px] text-muted-foreground">
                {d.document_category ?? "Document"} · <DateTime value={d.created_at} format="date-only" />
              </div>
            </div>
          </div>
          {d.file_url && (
            <a href={d.file_url} target="_blank" rel="noreferrer" className="text-[12px] text-primary hover:underline inline-flex items-center gap-1">
              <ExternalLink className="w-3 h-3" /> Open
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function InfoCard({ icon: Icon, label, children }: { icon: any; label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-2 text-muted-foreground">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-[11px] uppercase tracking-wider font-medium">{label}</span>
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 px-5 py-2.5">
      <dt className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground">{label}</dt>
      <dd className="text-[12px] text-foreground">{value}</dd>
    </div>
  );
}

void ArrowLeft; void StatCard;
