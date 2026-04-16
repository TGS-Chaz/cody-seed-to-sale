import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Scissors, Wind, Timer, CheckCircle2, Package, Plus, MoreHorizontal,
  Edit, Archive, Eye, Gauge, Beaker, Send, CloudUpload, AlertTriangle,
} from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import PageHeader from "@/components/shared/PageHeader";
import StatCard from "@/components/shared/StatCard";
import DataTable, { RowActionsCell } from "@/components/shared/DataTable";
import FiltersBar from "@/components/shared/FiltersBar";
import StatusPill from "@/components/shared/StatusPill";
import DateTime from "@/components/shared/DateTime";
import { useShortcut } from "@/components/shared/KeyboardShortcuts";
import { useCodyContext } from "@/hooks/useCodyContext";
import {
  useHarvests, useHarvestStats, Harvest, HarvestFilters,
} from "@/hooks/useHarvests";
import {
  HARVEST_TYPES, HARVEST_TYPE_LABELS, HARVEST_STATUS_LABELS, HarvestStatus,
  STRAIN_TYPE_COLORS, StrainType,
} from "@/lib/schema-enums";
import CreateHarvestModal from "./CreateHarvestModal";
import { cn } from "@/lib/utils";

const STATUS_VARIANT: Record<HarvestStatus, "success" | "warning" | "muted" | "info" | "critical"> = {
  active: "info",
  drying: "warning",
  curing: "warning",
  cured: "success",
  processing: "info",
  completed: "muted",
};

export default function HarvestsPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<HarvestFilters>({ status: "active" });
  const { data: harvests, loading, refresh } = useHarvests(filters);
  const stats = useHarvestStats(harvests);
  const { setContext, clearContext } = useCodyContext();

  const [searchValue, setSearchValue] = useState("");
  const [dateRange, setDateRange] = useState<"" | "this_month" | "last_30" | "last_90">("");
  const [createOpen, setCreateOpen] = useState(false);

  const sig = useMemo(() => harvests.map((h) => `${h.id}:${h.status}:${h.dry_weight_grams ?? 0}`).join(","), [harvests]);
  const payload = useMemo(() => ({
    stats,
    filters,
    harvests: harvests.slice(0, 50).map((h) => ({
      name: h.name,
      strain: h.strain?.name,
      cycle: h.cycle?.name,
      type: h.harvest_type,
      status: h.status,
      wet: h.wet_weight_grams,
      dry: h.dry_weight_grams,
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [sig, stats.total]);

  useEffect(() => {
    setContext({ context_type: "harvests_list", page_data: payload });
    return () => clearContext();
  }, [setContext, clearContext, payload]);

  useShortcut(["n"], () => setCreateOpen(true), { description: "Create harvest", scope: "Harvests", enabled: !createOpen });
  useShortcut(["/"], () => document.querySelector<HTMLInputElement>("[data-filters-search]")?.focus(), { description: "Focus search", scope: "Harvests", enabled: !createOpen });

  const strainOptions = useMemo(() => {
    const m = new Map<string, string>();
    harvests.forEach((h) => { if (h.strain) m.set(h.strain.id, h.strain.name); });
    return Array.from(m.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [harvests]);
  const cycleOptions = useMemo(() => {
    const m = new Map<string, string>();
    harvests.forEach((h) => { if (h.cycle?.id) m.set(h.cycle.id, h.cycle.name); });
    return Array.from(m.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [harvests]);
  const areaOptions = useMemo(() => {
    const m = new Map<string, string>();
    harvests.forEach((h) => { if (h.area) m.set(h.area.id, h.area.name); });
    return Array.from(m.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [harvests]);

  const filtered = useMemo(() => {
    const q = searchValue.trim().toLowerCase();
    const now = Date.now();
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    const days30Ago = now - 30 * 86400000;
    const days90Ago = now - 90 * 86400000;
    return harvests.filter((h) => {
      if (q) {
        const hay = `${h.name} ${h.strain?.name ?? ""} ${h.cycle?.name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (dateRange && h.harvest_started_at) {
        const s = new Date(h.harvest_started_at).getTime();
        if (dateRange === "this_month" && s < monthStart) return false;
        if (dateRange === "last_30" && s < days30Ago) return false;
        if (dateRange === "last_90" && s < days90Ago) return false;
      }
      return true;
    });
  }, [harvests, searchValue, dateRange]);

  const columns: ColumnDef<Harvest>[] = useMemo(() => [
    {
      accessorKey: "name", header: "Name",
      cell: ({ row }) => (
        <button onClick={() => navigate(`/cultivation/harvests/${row.original.id}`)} className="text-[13px] font-medium text-primary hover:underline text-left">
          {row.original.name}
        </button>
      ),
    },
    {
      id: "strain", header: "Strain",
      cell: ({ row }) => {
        const s = row.original.strain;
        if (!s) return <span className="text-muted-foreground text-[12px]">—</span>;
        const type = s.type as StrainType | null;
        const c = type ? STRAIN_TYPE_COLORS[type] : null;
        return (
          <div className="flex items-center gap-1.5 min-w-0">
            <button onClick={(e) => { e.stopPropagation(); navigate(`/cultivation/strains/${s.id}`); }} className="text-[12px] text-primary hover:underline truncate">
              {s.name}
            </button>
            {c && type && (
              <span className={cn("inline-flex items-center h-4 px-1.5 rounded-full text-[9px] font-semibold uppercase tracking-wider", c.bg, c.text)}>
                {type}
              </span>
            )}
          </div>
        );
      },
    },
    {
      id: "cycle", header: "Cycle",
      cell: ({ row }) => row.original.cycle
        ? <button onClick={(e) => { e.stopPropagation(); navigate(`/cultivation/grow-cycles/${row.original.cycle!.id}`); }} className="text-[12px] text-primary hover:underline truncate max-w-[140px] inline-block">{row.original.cycle.name}</button>
        : <span className="text-muted-foreground text-[12px]">—</span>,
    },
    {
      accessorKey: "harvest_type", header: "Type",
      cell: ({ row }) => row.original.harvest_type
        ? <span className="inline-flex items-center h-5 px-2 rounded-full text-[11px] font-medium bg-muted text-muted-foreground">{HARVEST_TYPE_LABELS[row.original.harvest_type]}</span>
        : <span className="text-muted-foreground text-[12px]">—</span>,
    },
    {
      accessorKey: "total_plants_harvested", header: "Plants",
      cell: ({ row }) => row.original.total_plants_harvested != null
        ? <span className="font-mono text-[12px]">{row.original.total_plants_harvested}</span>
        : <span className="text-muted-foreground text-[12px]">—</span>,
    },
    {
      accessorKey: "harvest_started_at", header: "Date",
      cell: ({ row }) => row.original.harvest_started_at
        ? <DateTime value={row.original.harvest_started_at} format="date-only" className="text-[12px]" />
        : <span className="text-muted-foreground text-[12px]">—</span>,
    },
    {
      accessorKey: "wet_weight_grams", header: "Wet",
      cell: ({ row }) => row.original.wet_weight_grams != null
        ? <span className="font-mono text-[12px]">{Number(row.original.wet_weight_grams).toFixed(0)}g</span>
        : <span className="text-muted-foreground text-[12px]">—</span>,
    },
    {
      accessorKey: "dry_weight_grams", header: "Dry",
      cell: ({ row }) => row.original.dry_weight_grams != null
        ? <span className="font-mono text-[12px] font-semibold">{Number(row.original.dry_weight_grams).toFixed(0)}g</span>
        : <span className="text-muted-foreground text-[12px]">—</span>,
    },
    {
      accessorKey: "waste_weight_grams", header: "Waste",
      cell: ({ row }) => row.original.waste_weight_grams != null
        ? <span className="font-mono text-[12px]">{Number(row.original.waste_weight_grams).toFixed(0)}g</span>
        : <span className="text-muted-foreground text-[12px]">—</span>,
    },
    {
      id: "ratio", header: "Dry/Wet",
      cell: ({ row }) => {
        const wet = Number(row.original.wet_weight_grams ?? 0);
        const dry = Number(row.original.dry_weight_grams ?? 0);
        if (wet <= 0 || dry <= 0) return <span className="text-muted-foreground text-[12px]">—</span>;
        const pct = (dry / wet) * 100;
        return <span className={cn("font-mono text-[12px] font-semibold", pct > 25 ? "text-emerald-500" : pct >= 20 ? "text-amber-500" : "text-destructive")}>{pct.toFixed(1)}%</span>;
      },
    },
    {
      accessorKey: "status", header: "Status",
      cell: ({ row }) => row.original.status
        ? <StatusPill label={HARVEST_STATUS_LABELS[row.original.status as HarvestStatus] ?? row.original.status} variant={STATUS_VARIANT[row.original.status as HarvestStatus] ?? "muted"} />
        : <span className="text-muted-foreground text-[12px]">—</span>,
    },
    {
      id: "ccrs", header: "",
      enableSorting: false,
      cell: ({ row }) => row.original.ccrs_reported
        ? <CloudUpload className="w-3.5 h-3.5 text-emerald-500" aria-label="Reported to CCRS" />
        : <AlertTriangle className="w-3.5 h-3.5 text-muted-foreground/40" aria-label="Pending CCRS upload" />,
    },
    {
      id: "actions", enableSorting: false, header: "",
      cell: ({ row }) => (
        <RowActionsCell>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-1 rounded hover:bg-accent"><MoreHorizontal className="w-4 h-4 text-muted-foreground" /></button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigate(`/cultivation/harvests/${row.original.id}`)}>
                <Eye className="w-3.5 h-3.5" /> View
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(`/cultivation/harvests/${row.original.id}?rec=wet`)}>
                <Gauge className="w-3.5 h-3.5" /> Record Wet Weight
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(`/cultivation/harvests/${row.original.id}?rec=dry`)}>
                <Gauge className="w-3.5 h-3.5" /> Record Dry Weight
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(`/cultivation/harvests/${row.original.id}?rec=cure`)}>
                <Beaker className="w-3.5 h-3.5" /> Start Cure
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(`/cultivation/harvests/${row.original.id}?rec=finish`)}>
                <Package className="w-3.5 h-3.5" /> Finish Harvest
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled>
                <Send className="w-3.5 h-3.5" /> Upload to CCRS (soon)
              </DropdownMenuItem>
              <DropdownMenuItem disabled className="text-destructive">
                <Archive className="w-3.5 h-3.5" /> Archive (soon)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </RowActionsCell>
      ),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [navigate]);

  return (
    <div className="p-6 md:p-8 max-w-[1700px] mx-auto">
      <PageHeader
        title="Harvests"
        description="Plant-to-product: wet/dry weights, cure tracking, inventory creation"
        breadcrumbs={[{ label: "Cultivation" }, { label: "Harvests" }]}
        actions={
          <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Create Harvest
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        <StatCard label="Total" value={stats.total} accentClass="stat-accent-blue" />
        <StatCard label="Drying" value={stats.drying} accentClass="stat-accent-amber" delay={0.05} />
        <StatCard label="Curing" value={stats.curing} accentClass="stat-accent-amber" delay={0.1} />
        <StatCard label="Cured / Ready" value={stats.cured} accentClass="stat-accent-teal" delay={0.15} />
        <StatCard label="Finalized" value={stats.finalized} accentClass="stat-accent-emerald" delay={0.2} />
      </div>

      <FiltersBar
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        searchPlaceholder="Search name, strain, cycle…"
        actions={
          <div className="flex items-center gap-1.5 flex-wrap">
            <select value={filters.status ?? "active"} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as any }))} className="h-9 px-3 text-[12px] rounded-md bg-background border border-border">
              <option value="active">Active</option>
              <option value="drying">Drying</option>
              <option value="curing">Curing</option>
              <option value="cured">Cured</option>
              <option value="completed">Finalized</option>
            </select>
            <select value={filters.harvest_type ?? ""} onChange={(e) => setFilters((f) => ({ ...f, harvest_type: (e.target.value || undefined) as any }))} className="h-9 px-3 text-[12px] rounded-md bg-background border border-border">
              <option value="">All types</option>
              {HARVEST_TYPES.map((t) => <option key={t} value={t}>{HARVEST_TYPE_LABELS[t]}</option>)}
            </select>
            <select value={filters.strain_id ?? ""} onChange={(e) => setFilters((f) => ({ ...f, strain_id: e.target.value || undefined }))} className="h-9 px-3 text-[12px] rounded-md bg-background border border-border" disabled={strainOptions.length === 0}>
              <option value="">All strains</option>
              {strainOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select value={filters.cycle_id ?? ""} onChange={(e) => setFilters((f) => ({ ...f, cycle_id: e.target.value || undefined }))} className="h-9 px-3 text-[12px] rounded-md bg-background border border-border" disabled={cycleOptions.length === 0}>
              <option value="">All cycles</option>
              {cycleOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={filters.area_id ?? ""} onChange={(e) => setFilters((f) => ({ ...f, area_id: e.target.value || undefined }))} className="h-9 px-3 text-[12px] rounded-md bg-background border border-border" disabled={areaOptions.length === 0}>
              <option value="">All areas</option>
              {areaOptions.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <select value={dateRange} onChange={(e) => setDateRange(e.target.value as any)} className="h-9 px-3 text-[12px] rounded-md bg-background border border-border">
              <option value="">Any date</option>
              <option value="this_month">This month</option>
              <option value="last_30">Last 30</option>
              <option value="last_90">Last 90</option>
            </select>
          </div>
        }
      />

      <DataTable
        columns={columns}
        data={filtered}
        loading={loading}
        empty={{
          icon: Scissors,
          title: harvests.length === 0 ? "No harvests yet" : "No matches",
          description: harvests.length === 0
            ? "Harvests are created from the Grow Board (drag a flowering cycle to Drying) or directly from a grow cycle's detail page."
            : "Clear filters or adjust the search.",
          action: harvests.length === 0 ? (
            <div className="flex items-center gap-2">
              <Button onClick={() => setCreateOpen(true)} className="gap-1.5"><Plus className="w-3.5 h-3.5" /> Create Harvest</Button>
              <Button variant="outline" onClick={() => navigate("/cultivation/board")} className="gap-1.5">Go to Grow Board</Button>
            </div>
          ) : undefined,
        }}
      />

      <CreateHarvestModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={() => refresh()}
      />
    </div>
  );
}

void Wind; void Timer; void CheckCircle2; void Edit;
