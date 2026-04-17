import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Sprout, Flower, GitBranch, FlaskConical, CheckCircle2, ArrowUpCircle,
  Plus, MoreHorizontal, Edit, Archive, Split, Eye, LayoutGrid, Table2,
  Ban,
} from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import PageHeader from "@/components/shared/PageHeader";
import StatCard from "@/components/shared/StatCard";
import DataTable, { RowActionsCell } from "@/components/shared/DataTable";
import FiltersBar from "@/components/shared/FiltersBar";
import StatusPill from "@/components/shared/StatusPill";
import CopyableId from "@/components/shared/CopyableId";
import DateTime from "@/components/shared/DateTime";
import { useShortcut } from "@/components/shared/KeyboardShortcuts";
import { useCodyContext } from "@/hooks/useCodyContext";
import { useSources, useSourceStats, Source, SourceInput } from "@/hooks/useSources";
import {
  SOURCE_TYPES, SOURCE_TYPE_LABELS, SOURCE_TYPE_COLORS, SourceType,
  SOURCE_STATUSES, SOURCE_STATUS_LABELS, SourceStatus,
  STRAIN_TYPE_COLORS, StrainType,
} from "@/lib/schema-enums";
import SourceFormModal from "./SourceFormModal";
import PromoteToCycleModal from "./PromoteToCycleModal";
import { cn } from "@/lib/utils";

type ViewMode = "card" | "table";
const VIEW_KEY = "cody-grow.sources.view";

const SOURCE_ICONS: Record<SourceType, React.ComponentType<{ className?: string }>> = {
  seed: Flower,
  clone: GitBranch,
  tissue_culture: FlaskConical,
};

export default function SourcesPage() {
  const navigate = useNavigate();
  const { data: sources, loading, createSource, archiveSource } = useSources();
  const stats = useSourceStats(sources);
  const { setContext, clearContext } = useCodyContext();

  const [searchValue, setSearchValue] = useState("");
  const [typeFilter, setTypeFilter] = useState<SourceType | "">("");
  const [strainFilter, setStrainFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<SourceStatus | "">("");
  const [view, setView] = useState<ViewMode>(() => (localStorage.getItem(VIEW_KEY) as ViewMode) ?? "card");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<SourceType>("seed");
  const [editing, setEditing] = useState<Source | null>(null);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [promoteSource, setPromoteSource] = useState<Source | null>(null);

  useEffect(() => { localStorage.setItem(VIEW_KEY, view); }, [view]);

  // Cody context
  const sig = useMemo(() => sources.map((s) => `${s.id}:${s.status}:${s.current_quantity ?? 0}`).join(","), [sources]);
  const payload = useMemo(() => ({
    counts: stats,
    sources: sources.map((s) => ({
      type: s.source_type,
      strain: s.strain?.name,
      status: s.status,
      initial_qty: s.initial_quantity,
      remaining: s.current_quantity,
      cut_date: s.cut_date,
      acquired_date: s.acquired_date,
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [sig, stats.total]);

  useEffect(() => {
    setContext({ context_type: "sources_list", page_data: payload });
    return () => clearContext();
  }, [setContext, clearContext, payload]);

  useShortcut(["n"], () => { setEditing(null); setModalType("seed"); setModalOpen(true); }, { description: "Add source", scope: "Sources", enabled: !modalOpen && !promoteOpen });
  useShortcut(["/"], () => document.querySelector<HTMLInputElement>("[data-filters-search]")?.focus(), { description: "Focus search", scope: "Sources", enabled: !modalOpen });
  const [lastG, setLastG] = useState(false);
  useShortcut(["g"], () => setLastG(true), { description: "View toggle prefix", scope: "Sources", enabled: !modalOpen });
  useShortcut(["c"], () => { if (lastG) { setView("card"); setLastG(false); } }, { description: "Card view (after g)", scope: "Sources", enabled: !modalOpen && lastG });
  useShortcut(["t"], () => { if (lastG) { setView("table"); setLastG(false); } }, { description: "Table view (after g)", scope: "Sources", enabled: !modalOpen && lastG });
  useEffect(() => { if (!lastG) return; const t = setTimeout(() => setLastG(false), 1500); return () => clearTimeout(t); }, [lastG]);

  const strainOptions = useMemo(() => {
    const map = new Map<string, string>();
    sources.forEach((s) => { if (s.strain) map.set(s.strain.id, s.strain.name); });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [sources]);

  const filtered = useMemo(() => {
    const q = searchValue.trim().toLowerCase();
    return sources.filter((s) => {
      if (q) {
        const hay = `${s.strain?.name ?? ""} ${s.external_id} ${s.notes ?? ""} ${s.source_vendor ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (typeFilter && s.source_type !== typeFilter) return false;
      if (strainFilter && s.strain_id !== strainFilter) return false;
      if (statusFilter && s.status !== statusFilter) return false;
      return true;
    });
  }, [sources, searchValue, typeFilter, strainFilter, statusFilter]);

  const handleSave = async (input: SourceInput) => {
    const saved = await createSource(input);
    return saved;
  };

  const openPromote = (s: Source) => {
    setPromoteSource(s);
    setPromoteOpen(true);
  };

  // Table view columns
  const columns: ColumnDef<Source>[] = useMemo(() => [
    {
      id: "batch_id",
      header: "Batch ID",
      cell: ({ row }) => <CopyableId value={row.original.external_id} truncate={3} />,
    },
    {
      id: "type",
      header: "Type",
      cell: ({ row }) => {
        const t = row.original.source_type;
        const Icon = SOURCE_ICONS[t];
        const c = SOURCE_TYPE_COLORS[t];
        return (
          <span className={cn("inline-flex items-center gap-1 h-5 px-2 rounded-full text-[11px] font-medium", c.bg, c.text)}>
            <Icon className="w-3 h-3" />
            {SOURCE_TYPE_LABELS[t]}
          </span>
        );
      },
    },
    {
      id: "strain",
      header: "Strain",
      cell: ({ row }) => row.original.strain
        ? (
          <button onClick={(e) => { e.stopPropagation(); navigate(`/cultivation/strains/${row.original.strain!.id}`); }} className="text-[12px] text-primary hover:underline">
            {row.original.strain.name}
          </button>
        )
        : <span className="text-muted-foreground text-[12px]">—</span>,
    },
    {
      id: "quantity",
      header: "Qty",
      cell: ({ row }) => {
        const remaining = row.original.current_quantity ?? 0;
        const initial = row.original.initial_quantity ?? 0;
        return (
          <span className="font-mono text-[12px] tabular-nums">
            <span className={cn("font-semibold", remaining === 0 ? "text-muted-foreground" : "text-foreground")}>{remaining}</span>
            <span className="text-muted-foreground"> / {initial}</span>
          </span>
        );
      },
    },
    {
      id: "source",
      header: "Source",
      cell: ({ row }) => {
        const s = row.original;
        if (s.source_type === "clone") {
          return s.mother_plant
            ? <button onClick={(e) => { e.stopPropagation(); navigate(`/cultivation/plants/${s.mother_plant!.id}`); }} className="text-[12px] text-primary hover:underline font-mono">{s.mother_plant.plant_identifier ?? s.mother_plant.id.slice(0, 8)}</button>
            : <span className="text-[12px] text-muted-foreground italic">External</span>;
        }
        return s.source_vendor ? <span className="text-[12px]">{s.source_vendor}</span> : <span className="text-muted-foreground text-[12px]">—</span>;
      },
    },
    {
      id: "area",
      header: "Area",
      cell: ({ row }) => row.original.area
        ? <button onClick={(e) => { e.stopPropagation(); navigate(`/cultivation/areas/${row.original.area!.id}`); }} className="text-[12px] text-primary hover:underline">{row.original.area.name}</button>
        : <span className="text-muted-foreground text-[12px]">—</span>,
    },
    {
      id: "date",
      header: "Date",
      cell: ({ row }) => {
        const d = row.original.source_type === "clone" ? row.original.cut_date : row.original.acquired_date;
        return d ? <DateTime value={d} format="date-only" className="text-[12px]" /> : <span className="text-muted-foreground text-[12px]">—</span>;
      },
    },
    {
      id: "age",
      header: "Age",
      cell: ({ row }) => {
        const start = row.original.source_type === "clone" ? row.original.cut_date : row.original.acquired_date;
        if (!start) return <span className="text-muted-foreground text-[12px]">—</span>;
        const days = Math.floor((Date.now() - new Date(start).getTime()) / 86400000);
        return <span className="text-[12px] font-mono">{days}d</span>;
      },
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => <SourceStatusPill status={row.original.status} />,
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
              {row.original.status === "available" && (row.original.current_quantity ?? 0) > 0 && (
                <DropdownMenuItem onClick={() => openPromote(row.original)}>
                  <ArrowUpCircle className="w-3.5 h-3.5" /> Promote to Cycle
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => navigate(`/cultivation/sources/${row.original.id}`)}>
                <Eye className="w-3.5 h-3.5" /> View
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setEditing(row.original); setModalType(row.original.source_type); setModalOpen(true); }}>
                <Edit className="w-3.5 h-3.5" /> Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={async () => { if (confirm(`Archive this source? It'll be marked as destroyed.`)) await archiveSource(row.original.id); }}
                className="text-destructive"
              >
                <Ban className="w-3.5 h-3.5" /> Archive
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </RowActionsCell>
      ),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [navigate, archiveSource]);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <PageHeader
        title="Grow Sources"
        description="Seeds, clones, and propagation material — the starting point of every grow"
        breadcrumbs={[{ label: "Cultivation" }, { label: "Grow Sources" }]}
        actions={
          <div className="flex items-center gap-2">
            <ViewToggle view={view} setView={setView} />
            <Button onClick={() => { setEditing(null); setModalType("seed"); setModalOpen(true); }} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Add Source
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <StatCard label="Total Sources" value={stats.total} accentClass="stat-accent-blue" />
        <StatCard label="Seeds" value={stats.seeds} accentClass="stat-accent-amber" delay={0.05} />
        <StatCard label="Clones" value={stats.clones} accentClass="stat-accent-emerald" delay={0.1} />
        <StatCard label="Available" value={stats.available} accentClass="stat-accent-emerald" delay={0.15} />
        <StatCard label="Ready to Promote" value={stats.readyToPromote} accentClass="stat-accent-teal" delay={0.2} />
      </div>

      <FiltersBar
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        searchPlaceholder="Search batch, strain, vendor, notes…"
        pageKey="sources"
        currentFilters={{ typeFilter, strainFilter, statusFilter, search: searchValue }}
        onApplyView={(f) => {
          setTypeFilter(f.typeFilter ?? "");
          setStrainFilter(f.strainFilter ?? "");
          setStatusFilter(f.statusFilter ?? "");
          setSearchValue(f.search ?? "");
        }}
        actions={
          <div className="flex items-center gap-1.5 flex-wrap">
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)} className="h-9 px-3 text-[12px] rounded-md bg-background border border-border">
              <option value="">All types</option>
              {SOURCE_TYPES.map((t) => <option key={t} value={t}>{SOURCE_TYPE_LABELS[t]}</option>)}
            </select>
            <select value={strainFilter} onChange={(e) => setStrainFilter(e.target.value)} className="h-9 px-3 text-[12px] rounded-md bg-background border border-border" disabled={strainOptions.length === 0}>
              <option value="">All strains</option>
              {strainOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="h-9 px-3 text-[12px] rounded-md bg-background border border-border">
              <option value="">All statuses</option>
              {SOURCE_STATUSES.map((s) => <option key={s} value={s}>{SOURCE_STATUS_LABELS[s]}</option>)}
            </select>
          </div>
        }
      />

      {loading ? (
        <div className="flex h-[40vh] items-center justify-center"><Sprout className="w-6 h-6 animate-pulse text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <EmptyBlock hasSources={sources.length > 0} onAdd={(t) => { setEditing(null); setModalType(t); setModalOpen(true); }} />
      ) : view === "card" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((s, i) => (
            <SourceCard
              key={s.id}
              source={s}
              delay={i * 0.03}
              onClick={() => navigate(`/cultivation/sources/${s.id}`)}
              onPromote={() => openPromote(s)}
              onEdit={() => { setEditing(s); setModalType(s.source_type); setModalOpen(true); }}
              onArchive={() => archiveSource(s.id)}
            />
          ))}
        </div>
      ) : (
        <DataTable columns={columns} data={filtered} />
      )}

      <SourceFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        editing={editing}
        initialType={modalType}
        onSave={handleSave}
      />
      {promoteSource && (
        <PromoteToCycleModal
          open={promoteOpen}
          onClose={() => { setPromoteOpen(false); setPromoteSource(null); }}
          source={promoteSource}
        />
      )}
    </div>
  );
}

// ─── Source card ──────────────────────────────────────────────────────────────

function SourceCard({
  source, delay, onClick, onPromote, onEdit, onArchive,
}: {
  source: Source; delay: number;
  onClick: () => void;
  onPromote: () => void;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const type = source.source_type;
  const color = SOURCE_TYPE_COLORS[type];
  const Icon = SOURCE_ICONS[type];
  const remaining = source.current_quantity ?? 0;
  const initial = source.initial_quantity ?? 0;
  const canPromote = source.status === "available" && remaining > 0;

  const dateField = type === "clone" ? source.cut_date : source.acquired_date;
  const ageDays = dateField ? Math.floor((Date.now() - new Date(dateField).getTime()) / 86400000) : null;

  const strainType = source.strain?.type as StrainType | undefined;
  const strainTypeColor = strainType ? STRAIN_TYPE_COLORS[strainType] : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
      whileHover={{ y: -3 }}
      onClick={onClick}
      className="group relative rounded-xl border border-border bg-card overflow-hidden cursor-pointer transition-all hover:shadow-lg hover:border-primary/30"
      style={{ boxShadow: "0 1px 3px var(--shadow-color)" }}
    >
      {/* Top color bar */}
      <div className="h-1 w-full" style={{ background: color.hex }} />

      {/* Header */}
      <div className="p-4 pb-2 flex items-start gap-3">
        <div className={cn("shrink-0 w-10 h-10 rounded-lg flex items-center justify-center", color.iconBg)} style={{ color: color.hex }}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <h3 className="text-[14px] font-semibold text-foreground truncate">{source.strain?.name ?? "(no strain)"}</h3>
            {strainTypeColor && (
              <span className={cn("inline-flex items-center h-4 px-1.5 rounded-full text-[9px] font-semibold uppercase tracking-wider", strainTypeColor.bg, strainTypeColor.text)}>
                {strainType}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground font-mono truncate">{source.external_id.slice(-6)}</span>
            <SourceStatusPill status={source.status} small />
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button onClick={(e) => e.stopPropagation()} className="p-1 rounded hover:bg-accent opacity-0 group-hover:opacity-100 transition-opacity">
              <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            {canPromote && (
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onPromote(); }}>
                <ArrowUpCircle className="w-3.5 h-3.5" /> Promote to Cycle
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); }}>
              <Edit className="w-3.5 h-3.5" /> Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={async (e) => { e.stopPropagation(); if (confirm("Archive this source?")) await onArchive(); }}
              className="text-destructive"
            >
              <Archive className="w-3.5 h-3.5" /> Archive
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Quantity badge */}
      <div className="px-4 pb-3 flex items-center gap-2">
        <div className={cn(
          "inline-flex items-center h-6 px-2.5 rounded-full text-[12px] font-semibold",
          remaining === 0 ? "bg-muted text-muted-foreground" :
          source.status === "in_cycle" ? "bg-blue-500/15 text-blue-500" :
          "bg-emerald-500/15 text-emerald-500",
        )}>
          <span className="font-mono tabular-nums">{remaining}</span>
          <span className="ml-1 font-normal opacity-80">/ {initial}</span>
          <span className="ml-1 font-normal opacity-80">{SOURCE_TYPE_LABELS[type].toLowerCase()}{remaining === 1 ? "" : "s"}</span>
        </div>
      </div>

      {/* Progress bar */}
      {initial > 0 && (
        <div className="px-4 pb-3">
          <div className="h-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full transition-all"
              style={{
                width: `${(remaining / initial) * 100}%`,
                background: remaining === 0 ? "var(--muted-foreground)" : color.hex,
              }}
            />
          </div>
        </div>
      )}

      {/* Details */}
      <div className="px-4 pb-3 space-y-1 text-[11px] text-muted-foreground">
        {type === "seed" && source.source_vendor && (
          <Detail label="Vendor" value={source.source_vendor} />
        )}
        {type === "seed" && (source.is_feminized || source.is_autoflower) && (
          <div className="flex flex-wrap gap-1 pt-1">
            {source.is_feminized && <span className="inline-flex items-center h-4 px-1.5 rounded-full text-[9px] font-semibold bg-pink-500/10 text-pink-500 uppercase tracking-wider">Feminized</span>}
            {source.is_autoflower && <span className="inline-flex items-center h-4 px-1.5 rounded-full text-[9px] font-semibold bg-amber-500/10 text-amber-500 uppercase tracking-wider">Autoflower</span>}
          </div>
        )}
        {type === "clone" && (
          <>
            {source.mother_plant
              ? <Detail label="Mother" value={<span className="font-mono">{source.mother_plant.plant_identifier ?? source.mother_plant.id.slice(0, 8)}</span>} />
              : <Detail label="Mother" value={<span className="italic">External</span>} />}
            {source.is_rooted != null && (
              <div className="flex items-center gap-1.5">
                <span className={cn("w-1.5 h-1.5 rounded-full", source.is_rooted ? "bg-emerald-500" : "bg-amber-500")} />
                <span>{source.is_rooted ? "Rooted" : "Rooting"}</span>
              </div>
            )}
          </>
        )}
        {source.area && (
          <Detail label="Area" value={source.area.name} />
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          {dateField ? (
            <>
              <DateTime value={dateField} format="date-only" className="text-foreground font-medium" />
              {ageDays != null && <span className="ml-1">· {ageDays}d old</span>}
            </>
          ) : "—"}
        </span>
        {canPromote && (
          <button
            onClick={(e) => { e.stopPropagation(); onPromote(); }}
            className="inline-flex items-center gap-1 text-primary font-medium hover:text-primary/80 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ArrowUpCircle className="w-3 h-3" /> Promote →
          </button>
        )}
      </div>
    </motion.div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] uppercase tracking-wider font-medium">{label}</span>
      <span className="text-foreground text-[11px]">{value}</span>
    </div>
  );
}

function SourceStatusPill({ status, small }: { status: SourceStatus; small?: boolean }) {
  const variant: "success" | "info" | "muted" | "critical" | "warning" =
    status === "available" ? "success" :
    status === "in_cycle" ? "info" :
    status === "depleted" ? "muted" :
    status === "destroyed" ? "critical" :
    "warning";
  void small;
  return <StatusPill label={SOURCE_STATUS_LABELS[status]} variant={variant} />;
}

function ViewToggle({ view, setView }: { view: ViewMode; setView: (v: ViewMode) => void }) {
  return (
    <div className="inline-flex rounded-md border border-border bg-muted/30 p-0.5">
      <button
        type="button"
        onClick={() => setView("card")}
        className={cn("px-2 h-8 text-[11px] font-medium rounded inline-flex items-center gap-1", view === "card" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
      >
        <LayoutGrid className="w-3.5 h-3.5" /> Cards
      </button>
      <button
        type="button"
        onClick={() => setView("table")}
        className={cn("px-2 h-8 text-[11px] font-medium rounded inline-flex items-center gap-1", view === "table" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
      >
        <Table2 className="w-3.5 h-3.5" /> Table
      </button>
    </div>
  );
}

function EmptyBlock({ hasSources, onAdd }: { hasSources: boolean; onAdd: (t: SourceType) => void }) {
  return (
    <div className="rounded-xl border border-border bg-card p-12 text-center">
      <Sprout className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
      <p className="text-[15px] font-semibold text-foreground mb-1">
        {hasSources ? "No matches" : "Add your first grow source"}
      </p>
      <p className="text-[12px] text-muted-foreground mb-5 max-w-md mx-auto">
        {hasSources
          ? "No sources match your current filters. Clear them or widen the search."
          : "Grow sources are where cultivation begins. Add seeds you've purchased or clones you've taken from mother plants. When they're ready, promote them to a Grow Cycle."}
      </p>
      {!hasSources && (
        <div className="flex items-center justify-center gap-2">
          <Button onClick={() => onAdd("seed")} className="gap-1.5"><Plus className="w-3.5 h-3.5" /> Add Seeds</Button>
          <Button variant="outline" onClick={() => onAdd("clone")} className="gap-1.5"><Plus className="w-3.5 h-3.5" /> Add Clones</Button>
        </div>
      )}
    </div>
  );
}

void CheckCircle2; void Split;
