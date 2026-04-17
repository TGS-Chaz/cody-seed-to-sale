import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarDays, Sprout, Flower2, Scissors, CheckCircle2, Plus,
  MoreHorizontal, Edit, Archive, Eye, ArrowUpDown, LayoutGrid,
  AlertTriangle,
} from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import PageHeader from "@/components/shared/PageHeader";
import StatCard from "@/components/shared/StatCard";
import DataTable, { RowActionsCell } from "@/components/shared/DataTable";
import FiltersBar from "@/components/shared/FiltersBar";
import PhaseColorBadge from "@/components/shared/PhaseColorBadge";
import DateTime from "@/components/shared/DateTime";
import { useShortcut } from "@/components/shared/KeyboardShortcuts";
import { useCodyContext } from "@/hooks/useCodyContext";
import {
  useCycles, useCycleStats, Cycle, CycleInput, CycleFilters,
} from "@/hooks/useCycles";
import { CYCLE_PHASES, CyclePhase, STRAIN_TYPE_COLORS, StrainType } from "@/lib/schema-enums";
import CycleFormModal from "./CycleFormModal";
import { cn } from "@/lib/utils";

const PHASE_LABELS: Record<CyclePhase, string> = {
  immature: "Immature",
  vegetative: "Vegetative",
  flowering: "Flowering",
  ready_for_harvest: "Ready for Harvest",
  harvesting: "Harvesting",
  completed: "Completed",
};

export default function CyclesPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<CycleFilters>({ status: "active" });
  const { data: cycles, loading, createCycle, archiveCycle } = useCycles(filters);
  const stats = useCycleStats(cycles);
  const { setContext, clearContext } = useCodyContext();

  const [searchValue, setSearchValue] = useState("");
  const [dateRange, setDateRange] = useState<"" | "this_month" | "last_30" | "last_90">("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Cycle | null>(null);

  // Cody context
  const sig = useMemo(() => cycles.map((c) => `${c.id}:${c.phase}:${c.active_plant_count}`).join(","), [cycles]);
  const payload = useMemo(() => ({
    stats,
    filters,
    cycles: cycles.slice(0, 50).map((c) => ({
      name: c.name,
      strain: c.strain?.name,
      area: c.area?.name,
      phase: c.phase,
      plants: c.active_plant_count,
      start: c.start_date,
      target: c.target_harvest_date,
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [sig, stats.total]);

  useEffect(() => {
    setContext({ context_type: "cycles_list", page_data: payload });
    return () => clearContext();
  }, [setContext, clearContext, payload]);

  useShortcut(["n"], () => { setEditing(null); setFormOpen(true); }, { description: "Create cycle", scope: "Grow Cycles", enabled: !formOpen });
  useShortcut(["/"], () => document.querySelector<HTMLInputElement>("[data-filters-search]")?.focus(), { description: "Focus search", scope: "Grow Cycles", enabled: !formOpen });

  const strainOptions = useMemo(() => {
    const m = new Map<string, string>();
    cycles.forEach((c) => { if (c.strain) m.set(c.strain.id, c.strain.name); });
    return Array.from(m.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [cycles]);
  const areaOptions = useMemo(() => {
    const m = new Map<string, string>();
    cycles.forEach((c) => { if (c.area) m.set(c.area.id, c.area.name); });
    return Array.from(m.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [cycles]);

  const filtered = useMemo(() => {
    const q = searchValue.trim().toLowerCase();
    const now = Date.now();
    const thisMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    const days30Ago = now - 30 * 86400000;
    const days90Ago = now - 90 * 86400000;
    return cycles.filter((c) => {
      if (q) {
        const hay = `${c.name} ${c.strain?.name ?? ""} ${c.area?.name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (dateRange && c.start_date) {
        const s = new Date(c.start_date).getTime();
        if (dateRange === "this_month" && s < thisMonthStart) return false;
        if (dateRange === "last_30" && s < days30Ago) return false;
        if (dateRange === "last_90" && s < days90Ago) return false;
      }
      return true;
    });
  }, [cycles, searchValue, dateRange]);

  const handleSave = async (input: CycleInput) => {
    if (editing) throw new Error("Edit not wired yet — use archive + recreate");
    return await createCycle(input);
  };

  const columns: ColumnDef<Cycle>[] = useMemo(() => [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <button onClick={() => navigate(`/cultivation/cycles/${row.original.id}`)} className="text-[13px] font-medium text-primary hover:underline text-left">
          {row.original.name}
        </button>
      ),
    },
    {
      id: "strain",
      header: "Strain",
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
      accessorKey: "phase",
      header: "Phase",
      cell: ({ row }) => <PhaseColorBadge phase={row.original.phase ?? "default"} label={row.original.phase ? PHASE_LABELS[row.original.phase as CyclePhase] : undefined} />,
    },
    {
      id: "area",
      header: "Area",
      cell: ({ row }) => row.original.area
        ? <button onClick={(e) => { e.stopPropagation(); navigate(`/cultivation/areas/${row.original.area!.id}`); }} className="text-[12px] text-primary hover:underline truncate max-w-[140px] inline-block">{row.original.area.name}</button>
        : <span className="text-muted-foreground text-[12px]">—</span>,
    },
    {
      accessorKey: "active_plant_count",
      header: "Plants",
      cell: ({ row }) => {
        const n = row.original.active_plant_count ?? 0;
        if (n === 0) return <span className="text-muted-foreground text-[12px]">0</span>;
        return (
          <button onClick={(e) => { e.stopPropagation(); navigate(`/cultivation/plants?cycle=${row.original.id}`); }} className="text-[12px] font-mono text-primary hover:underline">
            {n}
          </button>
        );
      },
    },
    {
      accessorKey: "start_date",
      header: "Start",
      cell: ({ row }) => row.original.start_date
        ? <DateTime value={row.original.start_date} format="date-only" className="text-[12px]" />
        : <span className="text-muted-foreground text-[12px]">—</span>,
    },
    {
      accessorKey: "target_harvest_date",
      header: "Expected",
      cell: ({ row }) => {
        const t = row.original.target_harvest_date;
        if (!t) return <span className="text-muted-foreground text-[12px]">—</span>;
        const overdue = new Date(t).getTime() < Date.now() && row.original.phase !== "completed" && row.original.phase !== "harvesting";
        return (
          <div className="flex items-center gap-1">
            {overdue && <AlertTriangle className="w-3 h-3 text-amber-500" />}
            <DateTime value={t} format="date-only" className={cn("text-[12px]", overdue ? "text-amber-500 font-medium" : "")} />
          </div>
        );
      },
    },
    {
      accessorKey: "actual_harvest_date",
      header: "Actual",
      cell: ({ row }) => row.original.actual_harvest_date
        ? <DateTime value={row.original.actual_harvest_date} format="date-only" className="text-[12px] text-emerald-500" />
        : <span className="text-muted-foreground text-[12px]">—</span>,
    },
    {
      id: "age",
      header: "Age",
      accessorFn: (c) => c.start_date ? Math.floor((Date.now() - new Date(c.start_date).getTime()) / 86400000) : null,
      cell: ({ getValue }) => {
        const days = getValue() as number | null;
        return days != null ? <span className="font-mono text-[12px]">Day {days}</span> : <span className="text-muted-foreground text-[12px]">—</span>;
      },
    },
    {
      id: "board",
      header: "",
      enableSorting: false,
      cell: ({ row }) => row.original.has_board_card
        ? <LayoutGrid className="w-3.5 h-3.5 text-primary" aria-label="On Grow Board" />
        : null,
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
              <DropdownMenuItem onClick={() => navigate(`/cultivation/cycles/${row.original.id}`)}>
                <Eye className="w-3.5 h-3.5" /> View
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(`/cultivation/board`)}>
                <LayoutGrid className="w-3.5 h-3.5" /> Open on Grow Board
              </DropdownMenuItem>
              <DropdownMenuItem disabled>
                <ArrowUpDown className="w-3.5 h-3.5" /> Phase Change (via detail)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={async () => { if (confirm(`Mark "${row.original.name}" as completed and remove from the Board?`)) { await archiveCycle(row.original.id); toast.success("Cycle archived"); } }}
                className="text-destructive"
              >
                <Archive className="w-3.5 h-3.5" /> Archive
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </RowActionsCell>
      ),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [navigate, archiveCycle]);

  return (
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto">
      <PageHeader
        title="Grow Cycles"
        description="Batches of plants moving through veg → flower → harvest together"
        breadcrumbs={[{ label: "Cultivation" }, { label: "Grow Cycles" }]}
        actions={
          <Button onClick={() => { setEditing(null); setFormOpen(true); }} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Create Cycle
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        <StatCard label="Total" value={stats.total} accentClass="stat-accent-blue" />
        <StatCard label="Vegetative" value={stats.vegetative} accentClass="stat-accent-emerald" delay={0.05} />
        <StatCard label="Flowering" value={stats.flowering} accentClass="stat-accent-purple" delay={0.1} />
        <StatCard label="Harvesting" value={stats.harvesting} accentClass="stat-accent-amber" delay={0.15} />
        <StatCard label="Completed" value={stats.completed} accentClass="stat-accent-teal" delay={0.2} />
      </div>

      <FiltersBar
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        searchPlaceholder="Search name, strain, area…"
        pageKey="cycles"
        currentFilters={{ ...filters, dateRange, search: searchValue }}
        onApplyView={(f) => {
          setFilters({ status: f.status ?? "active", phase: f.phase, strain_id: f.strain_id, area_id: f.area_id });
          setDateRange(f.dateRange ?? "");
          setSearchValue(f.search ?? "");
        }}
        actions={
          <div className="flex items-center gap-1.5 flex-wrap">
            <select value={filters.status ?? "active"} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as any }))} className="h-9 px-3 text-[12px] rounded-md bg-background border border-border">
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="all">All</option>
            </select>
            <select value={filters.phase ?? ""} onChange={(e) => setFilters((f) => ({ ...f, phase: (e.target.value || undefined) as CyclePhase | undefined }))} className="h-9 px-3 text-[12px] rounded-md bg-background border border-border">
              <option value="">All phases</option>
              {CYCLE_PHASES.map((p) => <option key={p} value={p}>{PHASE_LABELS[p]}</option>)}
            </select>
            <select value={filters.strain_id ?? ""} onChange={(e) => setFilters((f) => ({ ...f, strain_id: e.target.value || undefined }))} className="h-9 px-3 text-[12px] rounded-md bg-background border border-border" disabled={strainOptions.length === 0}>
              <option value="">All strains</option>
              {strainOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select value={filters.area_id ?? ""} onChange={(e) => setFilters((f) => ({ ...f, area_id: e.target.value || undefined }))} className="h-9 px-3 text-[12px] rounded-md bg-background border border-border" disabled={areaOptions.length === 0}>
              <option value="">All areas</option>
              {areaOptions.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <select value={dateRange} onChange={(e) => setDateRange(e.target.value as any)} className="h-9 px-3 text-[12px] rounded-md bg-background border border-border">
              <option value="">Any date</option>
              <option value="this_month">This month</option>
              <option value="last_30">Last 30 days</option>
              <option value="last_90">Last 90 days</option>
            </select>
          </div>
        }
      />

      <DataTable
        columns={columns}
        data={filtered}
        loading={loading}
        empty={{
          icon: CalendarDays,
          title: cycles.length === 0 ? "No cycles yet" : "No matches",
          description: cycles.length === 0
            ? "Cycles are created when you promote grow sources on the Grow Board, or create one manually."
            : "Clear filters or adjust your search.",
          action: cycles.length === 0 ? (
            <div className="flex items-center gap-2">
              <Button onClick={() => { setEditing(null); setFormOpen(true); }} className="gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Create Manually
              </Button>
              <Button variant="outline" onClick={() => navigate("/cultivation/board")} className="gap-1.5">
                <LayoutGrid className="w-3.5 h-3.5" /> Go to Grow Board
              </Button>
            </div>
          ) : undefined,
        }}
      />

      <CycleFormModal
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        editing={editing}
        onSave={handleSave}
      />
    </div>
  );
}

void Sprout; void Flower2; void Scissors; void CheckCircle2; void Edit;
