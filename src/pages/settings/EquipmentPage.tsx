import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Wrench, Wifi, AlertTriangle, XCircle, ClipboardCheck, Calendar, Plus,
  MoreHorizontal, Edit, Archive, FileText, Eye, ExternalLink, PowerOff,
} from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import PageHeader from "@/components/shared/PageHeader";
import StatCard from "@/components/shared/StatCard";
import DataTable, { RowActionsCell } from "@/components/shared/DataTable";
import FiltersBar from "@/components/shared/FiltersBar";
import StatusPill from "@/components/shared/StatusPill";
import CopyableId from "@/components/shared/CopyableId";
import DateTime from "@/components/shared/DateTime";
import { useShortcut } from "@/components/shared/KeyboardShortcuts";
import { useCodyContext } from "@/hooks/useCodyContext";
import {
  useEquipment, useEquipmentStats, Equipment, EquipmentInput, HardwareDeviceInput,
} from "@/hooks/useEquipment";
import {
  useCalibrationLog, useCalibrationStats, CalibrationEntry, CalibrationEntryInput,
} from "@/hooks/useCalibrationLog";
import {
  EQUIPMENT_TYPES, EQUIPMENT_TYPE_LABELS, EquipmentType,
  EQUIPMENT_STATUSES, EQUIPMENT_STATUS_LABELS, EquipmentStatus,
  CALIBRATION_RESULTS, CALIBRATION_RESULT_LABELS, CalibrationResult,
} from "@/lib/schema-enums";
import EquipmentFormModal from "./EquipmentFormModal";
import CalibrationLogModal from "./CalibrationLogModal";
import { cn } from "@/lib/utils";

type TabKey = "devices" | "calibration";

export default function EquipmentPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get("tab") as TabKey) ?? "devices";
  const setActiveTab = (t: TabKey) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", t);
    setSearchParams(next, { replace: true });
  };

  useShortcut(["1"], () => setActiveTab("devices"), { description: "Switch to Devices tab", scope: "Equipment" });
  useShortcut(["2"], () => setActiveTab("calibration"), { description: "Switch to Calibration Log tab", scope: "Equipment" });

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <PageHeader
        title="Equipment"
        description="Hardware, devices, and calibration tracking for WSLCB compliance"
        breadcrumbs={[{ label: "Settings", to: "/settings" }, { label: "Equipment" }]}
      />
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)} className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="devices">Devices</TabsTrigger>
          <TabsTrigger value="calibration">Calibration Log</TabsTrigger>
        </TabsList>
        <TabsContent value="devices"><DevicesTab active={activeTab === "devices"} /></TabsContent>
        <TabsContent value="calibration"><CalibrationTab active={activeTab === "calibration"} /></TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Tab 1: Devices ───────────────────────────────────────────────────────────

function DevicesTab({ active }: { active: boolean }) {
  const navigate = useNavigate();
  const { data: equipment, loading, createEquipment, updateEquipment, decommissionEquipment } = useEquipment();
  const stats = useEquipmentStats(equipment);
  const [searchValue, setSearchValue] = useState("");
  const [typeFilter, setTypeFilter] = useState<EquipmentType | "">("");
  const [statusFilter, setStatusFilter] = useState<EquipmentStatus | "">("");
  const [integrationFilter, setIntegrationFilter] = useState<"yes" | "no" | "">("");
  const [calFilter, setCalFilter] = useState<"current" | "due_soon" | "overdue" | "">("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Equipment | null>(null);
  const { setContext, clearContext } = useCodyContext();

  const signature = useMemo(
    () => equipment.map((e) => `${e.id}:${e.status}:${e.next_calibration_due ?? ""}:${e.hardware_device_id ?? ""}`).join(","),
    [equipment],
  );
  const payload = useMemo(() => ({
    counts: stats,
    equipment: equipment.map((e) => ({
      name: e.name,
      type: e.equipment_type,
      status: e.status,
      integrated: !!e.hardware_device_id,
      next_calibration_due: e.next_calibration_due,
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [signature, stats.total, stats.integrated, stats.needsCalibration, stats.outOfService]);

  useEffect(() => {
    if (!active) return;
    setContext({ context_type: "equipment_list", page_data: payload });
    return () => clearContext();
  }, [active, setContext, clearContext, payload]);

  useShortcut(["n"], () => { setEditing(null); setModalOpen(true); }, { description: "Add equipment", scope: "Equipment", enabled: active && !modalOpen });
  useShortcut(["/"], () => document.querySelector<HTMLInputElement>("[data-filters-search]")?.focus(), { description: "Focus search", scope: "Equipment", enabled: active && !modalOpen });

  const filtered = useMemo(() => {
    const q = searchValue.trim().toLowerCase();
    const now = Date.now();
    const in7 = now + 7 * 24 * 60 * 60 * 1000;
    return equipment.filter((e) => {
      if (q) {
        const hay = `${e.name ?? ""} ${e.make ?? ""} ${e.model ?? ""} ${e.serial_number ?? ""} ${e.asset_tag ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (typeFilter && e.equipment_type !== typeFilter) return false;
      if (statusFilter && e.status !== statusFilter) return false;
      if (integrationFilter === "yes" && !e.hardware_device_id) return false;
      if (integrationFilter === "no" && e.hardware_device_id) return false;
      if (calFilter) {
        if (!e.requires_calibration) return false;
        const t = e.next_calibration_due ? new Date(e.next_calibration_due).getTime() : null;
        if (calFilter === "current" && (!t || t <= in7)) return false;
        if (calFilter === "due_soon" && (!t || t < now || t > in7)) return false;
        if (calFilter === "overdue" && (!t || t >= now)) return false;
      }
      return true;
    });
  }, [equipment, searchValue, typeFilter, statusFilter, integrationFilter, calFilter]);

  const statusVariant = (s: EquipmentStatus): "success" | "warning" | "muted" | "critical" => {
    switch (s) {
      case "active": return "success";
      case "maintenance": return "warning";
      case "out_of_service": return "critical";
      case "decommissioned": return "muted";
    }
  };

  const calColor = (dueStr: string | null) => {
    if (!dueStr) return "text-muted-foreground";
    const t = new Date(dueStr).getTime();
    const now = Date.now();
    if (t < now) return "text-destructive";
    if (t - now < 7 * 24 * 60 * 60 * 1000) return "text-amber-500";
    return "text-muted-foreground";
  };

  const columns: ColumnDef<Equipment>[] = useMemo(() => [
    {
      id: "name",
      header: "Name",
      cell: ({ row }) => {
        const e = row.original;
        return (
          <button
            onClick={(ev) => { ev.stopPropagation(); navigate(`/settings/equipment/${e.id}`); }}
            className="flex items-center gap-2 text-left"
          >
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Wrench className="w-3.5 h-3.5 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] font-medium text-primary hover:underline truncate">{e.name ?? [e.make, e.model].filter(Boolean).join(" ") ?? "Unnamed"}</span>
                {e.hardware_device_id && (
                  <span title="Integrated device" className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 uppercase tracking-wider">
                    <Wifi className="w-2.5 h-2.5" /> Connected
                  </span>
                )}
              </div>
              {e.asset_tag && <div className="text-[11px] text-muted-foreground font-mono truncate">{e.asset_tag}</div>}
            </div>
          </button>
        );
      },
    },
    {
      accessorKey: "equipment_type",
      header: "Type",
      cell: ({ row }) => {
        const t = row.original.equipment_type;
        if (!t) return <span className="text-muted-foreground text-[12px]">—</span>;
        return <span className="text-[11px] px-2 py-0.5 rounded bg-muted text-muted-foreground font-medium">{EQUIPMENT_TYPE_LABELS[t as EquipmentType] ?? t}</span>;
      },
    },
    {
      id: "make_model",
      header: "Make / Model",
      cell: ({ row }) => {
        const e = row.original;
        if (!e.make && !e.model) return <span className="text-muted-foreground text-[12px]">—</span>;
        return (
          <div className="text-[12px]">
            <div className="text-foreground">{e.make ?? "—"}</div>
            {e.model && <div className="text-muted-foreground">{e.model}</div>}
          </div>
        );
      },
    },
    {
      accessorKey: "serial_number",
      header: "Serial #",
      cell: ({ row }) => {
        const s = row.original.serial_number;
        if (!s) return <span className="text-muted-foreground text-[12px]">—</span>;
        return <CopyableId value={s} />;
      },
    },
    {
      id: "facility",
      header: "Facility",
      cell: ({ row }) => {
        const f = row.original.facility;
        if (!f) return <span className="text-muted-foreground text-[12px]">—</span>;
        return (
          <button
            onClick={(e) => { e.stopPropagation(); navigate(`/settings/facilities/${f.id}`); }}
            className="text-[12px] text-primary hover:underline"
          >
            {f.name}
          </button>
        );
      },
    },
    {
      id: "last_calibrated",
      header: "Last Calibrated",
      cell: ({ row }) => {
        const d = row.original.last_calibration_date;
        if (!d) return <span className="text-[12px] text-muted-foreground italic">Never</span>;
        return <DateTime value={d} format="date-only" className="text-[12px] text-muted-foreground" />;
      },
    },
    {
      id: "next_due",
      header: "Next Due",
      cell: ({ row }) => {
        const e = row.original;
        if (!e.requires_calibration) return <span className="text-[12px] text-muted-foreground">—</span>;
        if (!e.next_calibration_due) return <span className="text-[12px] text-destructive italic">Not scheduled</span>;
        return <DateTime value={e.next_calibration_due} format="date-only" className={`text-[12px] ${calColor(e.next_calibration_due)}`} />;
      },
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <StatusPill label={EQUIPMENT_STATUS_LABELS[row.original.status]} variant={statusVariant(row.original.status)} />
      ),
    },
    {
      id: "actions",
      enableSorting: false,
      header: "",
      cell: ({ row }) => (
        <RowActionsCell>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-1 rounded hover:bg-accent"><MoreHorizontal className="w-4 h-4 text-muted-foreground" /></button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigate(`/settings/equipment/${row.original.id}`)}>
                <Eye className="w-3.5 h-3.5" /> View details
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setEditing(row.original); setModalOpen(true); }}>
                <Edit className="w-3.5 h-3.5" /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(`/settings/equipment/${row.original.id}?logCalibration=1`)}>
                <ClipboardCheck className="w-3.5 h-3.5" /> Log calibration
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(`/settings/equipment/${row.original.id}?tab=calibration`)}>
                <FileText className="w-3.5 h-3.5" /> Calibration history
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {row.original.status !== "decommissioned" && (
                <DropdownMenuItem
                  onClick={async () => { if (confirm(`Decommission "${row.original.name}"? It won't appear in active lists.`)) await decommissionEquipment(row.original.id); }}
                  className="text-destructive"
                >
                  <PowerOff className="w-3.5 h-3.5" /> Decommission
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </RowActionsCell>
      ),
    },
  ], [navigate, decommissionEquipment]);

  const handleSave = async (
    input: EquipmentInput,
    hardware?: { id?: string | null; data?: HardwareDeviceInput | null; disconnect?: boolean } | null,
  ) => {
    if (editing) {
      await updateEquipment(editing.id, input, hardware);
    } else {
      await createEquipment(input, hardware?.data ?? null);
    }
  };

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Devices" value={stats.total} accentClass="stat-accent-blue" />
        <StatCard label="Integrated" value={stats.integrated} accentClass="stat-accent-emerald" delay={0.05} />
        <StatCard label="Needs Calibration" value={stats.needsCalibration} accentClass={stats.needsCalibration > 0 ? "stat-accent-amber" : "stat-accent-emerald"} delay={0.1} />
        <StatCard label="Out of Service" value={stats.outOfService} accentClass={stats.outOfService > 0 ? "stat-accent-rose" : "stat-accent-emerald"} delay={0.15} />
      </div>

      <FiltersBar
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        searchPlaceholder="Search name, serial, manufacturer, model…"
        pageKey="equipment"
        currentFilters={{ typeFilter, statusFilter, integrationFilter, calFilter, search: searchValue }}
        onApplyView={(f) => {
          setTypeFilter(f.typeFilter ?? "");
          setStatusFilter(f.statusFilter ?? "");
          setIntegrationFilter(f.integrationFilter ?? "");
          setCalFilter(f.calFilter ?? "");
          setSearchValue(f.search ?? "");
        }}
        actions={
          <div className="flex items-center gap-1.5 flex-wrap">
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as EquipmentType | "")} className="h-9 px-3 text-[12px] rounded-md bg-background border border-border">
              <option value="">All types</option>
              {EQUIPMENT_TYPES.map((t) => <option key={t} value={t}>{EQUIPMENT_TYPE_LABELS[t]}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as EquipmentStatus | "")} className="h-9 px-3 text-[12px] rounded-md bg-background border border-border">
              <option value="">All statuses</option>
              {EQUIPMENT_STATUSES.map((s) => <option key={s} value={s}>{EQUIPMENT_STATUS_LABELS[s]}</option>)}
            </select>
            <select value={integrationFilter} onChange={(e) => setIntegrationFilter(e.target.value as any)} className="h-9 px-3 text-[12px] rounded-md bg-background border border-border">
              <option value="">Any integration</option>
              <option value="yes">Integrated</option>
              <option value="no">Standalone</option>
            </select>
            <select value={calFilter} onChange={(e) => setCalFilter(e.target.value as any)} className="h-9 px-3 text-[12px] rounded-md bg-background border border-border">
              <option value="">Any calibration</option>
              <option value="current">Current</option>
              <option value="due_soon">Due within 7d</option>
              <option value="overdue">Overdue</option>
            </select>
            <Button onClick={() => { setEditing(null); setModalOpen(true); }} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Add Equipment
            </Button>
          </div>
        }
      />

      <DataTable
        columns={columns}
        data={filtered}
        loading={loading}
        empty={{
          icon: Wrench,
          title: "Add your first equipment",
          description: "Track scales, sensors, printers, HVAC, lighting — anything that needs calibration or maintenance records for WSLCB audits.",
          action: (
            <Button onClick={() => { setEditing(null); setModalOpen(true); }} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Add First Equipment
            </Button>
          ),
        }}
      />

      <EquipmentFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        editing={editing}
        onSave={handleSave}
      />
    </div>
  );
}

// ─── Tab 2: Calibration Log ───────────────────────────────────────────────────

function CalibrationTab({ active }: { active: boolean }) {
  const navigate = useNavigate();
  const { data: entries, loading, createCalibrationEntry, deleteCalibrationEntry } = useCalibrationLog();
  const { data: equipment } = useEquipment();
  const stats = useCalibrationStats(entries);
  const [searchValue, setSearchValue] = useState("");
  const [typeFilter, setTypeFilter] = useState<EquipmentType | "">("");
  const [resultFilter, setResultFilter] = useState<CalibrationResult | "">("");
  const [periodFilter, setPeriodFilter] = useState<"week" | "month" | "quarter" | "ytd" | "">("");
  const [modalOpen, setModalOpen] = useState(false);
  const { setContext, clearContext } = useCodyContext();

  const signature = useMemo(() => entries.map((e) => `${e.id}:${e.pass_fail}`).join(","), [entries]);
  const payload = useMemo(() => ({
    counts: stats,
    recent: entries.slice(0, 10).map((e) => ({
      equipment: e.equipment?.name,
      date: e.calibrated_at,
      result: e.pass_fail,
      technician: e.technician ? `${e.technician.first_name} ${e.technician.last_name}` : e.technician_name,
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [signature, stats.total, stats.thisMonth, stats.failures, stats.overdueDevices]);

  useEffect(() => {
    if (!active) return;
    setContext({ context_type: "calibration_log_list", page_data: payload });
    return () => clearContext();
  }, [active, setContext, clearContext, payload]);

  useShortcut(["n"], () => setModalOpen(true), { description: "Log calibration", scope: "Calibration", enabled: active && !modalOpen });

  const filtered = useMemo(() => {
    const q = searchValue.trim().toLowerCase();
    const now = new Date();
    const start = (() => {
      if (periodFilter === "week") {
        const d = new Date(now);
        d.setDate(d.getDate() - 7);
        return d.getTime();
      }
      if (periodFilter === "month") return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      if (periodFilter === "quarter") {
        const q = Math.floor(now.getMonth() / 3);
        return new Date(now.getFullYear(), q * 3, 1).getTime();
      }
      if (periodFilter === "ytd") return new Date(now.getFullYear(), 0, 1).getTime();
      return 0;
    })();

    return entries.filter((e) => {
      if (q) {
        const hay = `${e.equipment?.name ?? ""} ${e.technician ? `${e.technician.first_name} ${e.technician.last_name}` : e.technician_name ?? ""} ${e.notes ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (typeFilter && e.equipment?.equipment_type !== typeFilter) return false;
      if (resultFilter && e.pass_fail !== resultFilter) return false;
      if (start && new Date(e.calibrated_at).getTime() < start) return false;
      return true;
    });
  }, [entries, searchValue, typeFilter, resultFilter, periodFilter]);

  const resultVariant = (r: CalibrationResult | null): "success" | "critical" | "warning" | "muted" => {
    switch (r) {
      case "pass": return "success";
      case "fail": return "critical";
      case "adjusted": return "warning";
      default: return "muted";
    }
  };

  const columns: ColumnDef<CalibrationEntry>[] = useMemo(() => [
    {
      accessorKey: "calibrated_at",
      header: "Date",
      cell: ({ row }) => <DateTime value={row.original.calibrated_at} format="full" className="text-[12px]" />,
    },
    {
      id: "equipment",
      header: "Equipment",
      cell: ({ row }) => {
        const e = row.original.equipment;
        if (!e) return <span className="text-[12px] text-muted-foreground italic">Deleted</span>;
        return (
          <button
            onClick={(ev) => { ev.stopPropagation(); navigate(`/settings/equipment/${e.id}`); }}
            className="text-[12px] font-medium text-primary hover:underline text-left"
          >
            {e.name ?? [e.make, e.model].filter(Boolean).join(" ") ?? "Unnamed"}
          </button>
        );
      },
    },
    {
      id: "type",
      header: "Type",
      cell: ({ row }) => {
        const t = row.original.equipment?.equipment_type;
        if (!t) return <span className="text-muted-foreground text-[12px]">—</span>;
        return <span className="text-[11px] px-2 py-0.5 rounded bg-muted text-muted-foreground font-medium">{EQUIPMENT_TYPE_LABELS[t as EquipmentType] ?? t}</span>;
      },
    },
    {
      id: "technician",
      header: "Technician",
      cell: ({ row }) => {
        const e = row.original;
        if (e.technician) return <span className="text-[12px]">{e.technician.first_name} {e.technician.last_name}</span>;
        if (e.technician_name) return <span className="text-[12px] italic text-muted-foreground">{e.technician_name} <span className="text-[10px]">(external)</span></span>;
        return <span className="text-muted-foreground text-[12px]">—</span>;
      },
    },
    {
      id: "result",
      header: "Result",
      cell: ({ row }) => {
        const r = row.original.pass_fail;
        if (!r) return <span className="text-muted-foreground text-[12px]">—</span>;
        return <StatusPill label={CALIBRATION_RESULT_LABELS[r]} variant={resultVariant(r)} />;
      },
    },
    {
      accessorKey: "before_reading",
      header: "Before",
      cell: ({ row }) => row.original.before_reading ? <span className="text-[11px] font-mono">{row.original.before_reading}</span> : <span className="text-muted-foreground text-[11px]">—</span>,
    },
    {
      accessorKey: "after_reading",
      header: "After",
      cell: ({ row }) => row.original.after_reading ? <span className="text-[11px] font-mono">{row.original.after_reading}</span> : <span className="text-muted-foreground text-[11px]">—</span>,
    },
    {
      accessorKey: "tolerance",
      header: "Tolerance",
      cell: ({ row }) => row.original.tolerance ? <span className="text-[11px] font-mono">{row.original.tolerance}</span> : <span className="text-muted-foreground text-[11px]">—</span>,
    },
    {
      accessorKey: "notes",
      header: "Notes",
      cell: ({ row }) => <span className="text-[12px] text-muted-foreground line-clamp-1 max-w-[200px]">{row.original.notes?.slice(0, 60) ?? "—"}</span>,
    },
    {
      id: "certificate",
      header: "CoC",
      cell: ({ row }) => {
        const url = row.original.certificate_url;
        if (!url) return <span className="text-muted-foreground text-[12px]">—</span>;
        return (
          <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary text-[12px] hover:underline">
            <ExternalLink className="w-3 h-3" /> View
          </a>
        );
      },
    },
    {
      id: "actions",
      enableSorting: false,
      header: "",
      cell: ({ row }) => (
        <RowActionsCell>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-1 rounded hover:bg-accent"><MoreHorizontal className="w-4 h-4 text-muted-foreground" /></button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {row.original.equipment && (
                <DropdownMenuItem onClick={() => navigate(`/settings/equipment/${row.original.equipment!.id}?tab=calibration`)}>
                  <Eye className="w-3.5 h-3.5" /> View on equipment
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={async () => {
                  if (confirm("Delete this calibration entry? WSLCB audits rely on this log — only delete if the entry was a mistake.")) {
                    await deleteCalibrationEntry(row.original.id);
                    toast.success("Entry deleted");
                  }
                }}
                className="text-destructive"
              >
                <Archive className="w-3.5 h-3.5" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </RowActionsCell>
      ),
    },
  ], [navigate, deleteCalibrationEntry]);

  const handleSave = async (input: CalibrationEntryInput) => {
    await createCalibrationEntry(input);
  };

  return (
    <div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <StatCard label="Total Calibrations" value={stats.total} accentClass="stat-accent-blue" />
        <StatCard label="This Month" value={stats.thisMonth} accentClass="stat-accent-emerald" delay={0.05} />
        <StatCard label="Overdue Devices" value={stats.overdueDevices} accentClass={stats.overdueDevices > 0 ? "stat-accent-rose" : "stat-accent-emerald"} delay={0.1} />
      </div>

      <FiltersBar
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        searchPlaceholder="Search equipment, technician, notes…"
        pageKey="calibrations"
        currentFilters={{ typeFilter, resultFilter, periodFilter, search: searchValue }}
        onApplyView={(f) => {
          setTypeFilter(f.typeFilter ?? "");
          setResultFilter(f.resultFilter ?? "");
          setPeriodFilter(f.periodFilter ?? "");
          setSearchValue(f.search ?? "");
        }}
        actions={
          <div className="flex items-center gap-1.5 flex-wrap">
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as EquipmentType | "")} className="h-9 px-3 text-[12px] rounded-md bg-background border border-border">
              <option value="">All types</option>
              {EQUIPMENT_TYPES.map((t) => <option key={t} value={t}>{EQUIPMENT_TYPE_LABELS[t]}</option>)}
            </select>
            <select value={resultFilter} onChange={(e) => setResultFilter(e.target.value as CalibrationResult | "")} className="h-9 px-3 text-[12px] rounded-md bg-background border border-border">
              <option value="">All results</option>
              {CALIBRATION_RESULTS.map((r) => <option key={r} value={r}>{CALIBRATION_RESULT_LABELS[r]}</option>)}
            </select>
            <select value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value as any)} className="h-9 px-3 text-[12px] rounded-md bg-background border border-border">
              <option value="">All time</option>
              <option value="week">This week</option>
              <option value="month">This month</option>
              <option value="quarter">This quarter</option>
              <option value="ytd">Year to date</option>
            </select>
            <Button onClick={() => setModalOpen(true)} className="gap-1.5" disabled={equipment.filter((e) => e.requires_calibration).length === 0}>
              <Plus className="w-3.5 h-3.5" /> Log Calibration
            </Button>
          </div>
        }
      />

      <DataTable
        columns={columns}
        data={filtered}
        loading={loading}
        empty={{
          icon: ClipboardCheck,
          title: "Start logging calibrations",
          description: "WSLCB audits require calibration records for all scales, sensors, and measurement devices. Log every calibration here.",
          action: (
            <Button onClick={() => setModalOpen(true)} className="gap-1.5" disabled={equipment.filter((e) => e.requires_calibration).length === 0}>
              <Plus className="w-3.5 h-3.5" /> Log First Calibration
            </Button>
          ),
        }}
      />

      <CalibrationLogModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
      />
    </div>
  );
}

// Keep imports live to avoid future-tree-shake confusion
void Archive; void AlertTriangle; void Calendar; void Plus; void XCircle;
void cn;
