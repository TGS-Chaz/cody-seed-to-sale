import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Dna, Moon, Sun, Blend, Plus, MoreHorizontal, Edit, Archive, Copy,
  Eye, LayoutGrid, Table2, Image as ImageIcon, Leaf,
} from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import PageHeader from "@/components/shared/PageHeader";
import StatCard from "@/components/shared/StatCard";
import DataTable, { RowActionsCell } from "@/components/shared/DataTable";
import FiltersBar from "@/components/shared/FiltersBar";
import { useShortcut } from "@/components/shared/KeyboardShortcuts";
import { useCodyContext } from "@/hooks/useCodyContext";
import { useStrains, useStrainStats, Strain, StrainInput } from "@/hooks/useStrains";
import {
  STRAIN_TYPES, STRAIN_TYPE_COLORS, STRAIN_TYPE_LABELS, StrainType,
  TERPENE_COLORS, COMMON_TERPENES,
} from "@/lib/schema-enums";
import StrainFormModal from "./StrainFormModal";
import { cn } from "@/lib/utils";

type ViewMode = "card" | "table";
const VIEW_STORAGE_KEY = "cody-grow.strains.view";

export default function StrainsPage() {
  const navigate = useNavigate();
  const { data: strains, loading, createStrain, updateStrain, archiveStrain, duplicateStrain } = useStrains();
  const stats = useStrainStats(strains);
  const { setContext, clearContext } = useCodyContext();

  const [searchValue, setSearchValue] = useState("");
  const [typeFilter, setTypeFilter] = useState<StrainType | "">("");
  const [breederFilter, setBreederFilter] = useState<string>("");
  const [activeFilter, setActiveFilter] = useState<"yes" | "no" | "">("");
  const [terpeneFilter, setTerpeneFilter] = useState<string>("");
  const [view, setView] = useState<ViewMode>(() => (localStorage.getItem(VIEW_STORAGE_KEY) as ViewMode) ?? "card");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Strain | null>(null);

  // Persist view preference
  useEffect(() => { localStorage.setItem(VIEW_STORAGE_KEY, view); }, [view]);

  // Cody context
  const sig = useMemo(() => strains.map((s) => `${s.id}:${s.active_plant_count ?? 0}`).join(","), [strains]);
  const topByPlants = useMemo(
    () => [...strains].sort((a, b) => (b.active_plant_count ?? 0) - (a.active_plant_count ?? 0)).slice(0, 5),
    [strains],
  );
  const payload = useMemo(() => ({
    counts: stats,
    top_by_active_plants: topByPlants.map((s) => ({
      name: s.name, type: s.type, active_plants: s.active_plant_count,
    })),
    strains: strains.map((s) => ({
      name: s.name, type: s.type, breeder: s.breeder,
      avg_thc: s.average_thc_pct, avg_flower_days: s.average_flower_days,
      dominant_terpenes: s.dominant_terpenes,
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [sig, stats.total]);

  useEffect(() => {
    setContext({ context_type: "strains_list", page_data: payload });
    return () => clearContext();
  }, [setContext, clearContext, payload]);

  useShortcut(["n"], () => { setEditing(null); setModalOpen(true); }, { description: "Add strain", scope: "Strains", enabled: !modalOpen });
  useShortcut(["/"], () => document.querySelector<HTMLInputElement>("[data-filters-search]")?.focus(), { description: "Focus search", scope: "Strains", enabled: !modalOpen });
  // G then C / T sequence shortcut — simple lastG flag
  const [lastG, setLastG] = useState(false);
  useShortcut(["g"], () => setLastG(true), { description: "View toggle prefix", scope: "Strains", enabled: !modalOpen });
  useShortcut(["c"], () => { if (lastG) { setView("card"); setLastG(false); } }, { description: "Card view (after g)", scope: "Strains", enabled: !modalOpen && lastG });
  useShortcut(["t"], () => { if (lastG) { setView("table"); setLastG(false); } }, { description: "Table view (after g)", scope: "Strains", enabled: !modalOpen && lastG });
  useEffect(() => {
    if (!lastG) return;
    const t = setTimeout(() => setLastG(false), 1500);
    return () => clearTimeout(t);
  }, [lastG]);

  const breeders = useMemo(() => {
    const set = new Set<string>();
    strains.forEach((s) => { if (s.breeder) set.add(s.breeder); });
    return Array.from(set).sort();
  }, [strains]);

  const allTerpenes = useMemo(() => {
    const set = new Set<string>();
    COMMON_TERPENES.forEach((t) => set.add(t));
    strains.forEach((s) => (s.dominant_terpenes ?? []).forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [strains]);

  const filtered = useMemo(() => {
    const q = searchValue.trim().toLowerCase();
    return strains.filter((s) => {
      if (q) {
        const hay = `${s.name} ${s.breeder ?? ""} ${s.genetics ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (typeFilter && s.type !== typeFilter) return false;
      if (breederFilter && s.breeder !== breederFilter) return false;
      if (activeFilter === "yes" && (s.active_plant_count ?? 0) === 0) return false;
      if (activeFilter === "no" && (s.active_plant_count ?? 0) > 0) return false;
      if (terpeneFilter && !(s.dominant_terpenes ?? []).includes(terpeneFilter)) return false;
      return true;
    });
  }, [strains, searchValue, typeFilter, breederFilter, activeFilter, terpeneFilter]);

  const handleSave = async (input: StrainInput) => {
    if (editing) return await updateStrain(editing.id, input);
    return await createStrain(input);
  };

  const handleDuplicate = async (s: Strain) => {
    const dup = await duplicateStrain(s);
    navigate(`/cultivation/strains/${dup.id}`);
  };

  // ─── Card view column defs (only used for Table view) ────────────────────
  const columns: ColumnDef<Strain>[] = useMemo(() => [
    {
      id: "photo",
      header: "",
      enableSorting: false,
      cell: ({ row }) => {
        const s = row.original;
        const type = s.type ?? "Hybrid";
        const color = STRAIN_TYPE_COLORS[type];
        return (
          <div className={cn("w-10 h-10 rounded-md overflow-hidden shrink-0 flex items-center justify-center bg-gradient-to-br", color.gradient)}>
            {s.image_url ? <img src={s.image_url} alt="" className="w-full h-full object-cover" /> : <Dna className="w-4 h-4 text-foreground/50" />}
          </div>
        );
      },
    },
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => {
        const s = row.original;
        return (
          <button onClick={(e) => { e.stopPropagation(); navigate(`/cultivation/strains/${s.id}`); }} className="text-[13px] font-medium text-primary hover:underline text-left">
            {s.name}
          </button>
        );
      },
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => {
        const t = row.original.type;
        if (!t) return <span className="text-muted-foreground text-[12px]">—</span>;
        const c = STRAIN_TYPE_COLORS[t];
        return <span className={cn("inline-flex items-center h-5 px-2 rounded-full text-[11px] font-medium", c.bg, c.text)}>{STRAIN_TYPE_LABELS[t]}</span>;
      },
    },
    {
      accessorKey: "breeder",
      header: "Breeder",
      cell: ({ row }) => row.original.breeder ? <span className="text-[12px]">{row.original.breeder}</span> : <span className="text-muted-foreground text-[12px]">—</span>,
    },
    {
      accessorKey: "genetics",
      header: "Genetics",
      cell: ({ row }) => row.original.genetics ? <span className="text-[12px] text-muted-foreground line-clamp-1 max-w-[220px]">{row.original.genetics}</span> : <span className="text-muted-foreground text-[12px]">—</span>,
    },
    {
      id: "terpenes",
      header: "Terpenes",
      cell: ({ row }) => {
        const ts = row.original.dominant_terpenes ?? [];
        if (ts.length === 0) return <span className="text-muted-foreground text-[12px]">—</span>;
        return <TerpeneChips terpenes={ts} max={3} />;
      },
    },
    {
      accessorKey: "average_thc_pct",
      header: "THC %",
      cell: ({ row }) => row.original.average_thc_pct != null
        ? <span className="font-mono text-[12px] tabular-nums">{Number(row.original.average_thc_pct).toFixed(1)}%</span>
        : <span className="text-muted-foreground text-[12px]">—</span>,
    },
    {
      accessorKey: "average_cbd_pct",
      header: "CBD %",
      cell: ({ row }) => row.original.average_cbd_pct != null
        ? <span className="font-mono text-[12px] tabular-nums">{Number(row.original.average_cbd_pct).toFixed(1)}%</span>
        : <span className="text-muted-foreground text-[12px]">—</span>,
    },
    {
      accessorKey: "average_flower_days",
      header: "Flower Days",
      cell: ({ row }) => row.original.average_flower_days != null
        ? <span className="font-mono text-[12px] tabular-nums">{row.original.average_flower_days}</span>
        : <span className="text-muted-foreground text-[12px]">—</span>,
    },
    {
      id: "phenotype_count",
      header: "Phenos",
      cell: ({ row }) => <span className="font-mono text-[12px] tabular-nums">{row.original.phenotype_count ?? 0}</span>,
    },
    {
      id: "active_plants",
      header: "Active",
      cell: ({ row }) => {
        const n = row.original.active_plant_count ?? 0;
        if (n === 0) return <span className="text-[12px] text-muted-foreground">0</span>;
        return (
          <button onClick={(e) => { e.stopPropagation(); navigate(`/cultivation/plants?strain=${row.original.id}`); }} className="text-[12px] text-primary hover:underline tabular-nums">
            {n}
          </button>
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
              <DropdownMenuItem onClick={() => navigate(`/cultivation/strains/${row.original.id}`)}>
                <Eye className="w-3.5 h-3.5" /> View
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setEditing(row.original); setModalOpen(true); }}>
                <Edit className="w-3.5 h-3.5" /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleDuplicate(row.original)}>
                <Copy className="w-3.5 h-3.5" /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={async () => { if (confirm(`Archive "${row.original.name}"? Plants and cycles already tracked will keep their references.`)) await archiveStrain(row.original.id); }} className="text-destructive">
                <Archive className="w-3.5 h-3.5" /> Archive
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </RowActionsCell>
      ),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [navigate, archiveStrain]);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <PageHeader
        title="Strains"
        description="Your genetics library — every plant traces back here"
        breadcrumbs={[{ label: "Cultivation" }, { label: "Strains" }]}
        actions={
          <div className="flex items-center gap-2">
            <ViewToggle view={view} setView={setView} />
            <Button onClick={() => { setEditing(null); setModalOpen(true); }} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Add Strain
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Strains" value={stats.total} accentClass="stat-accent-blue" />
        <StatCard label="Indica" value={stats.indica} accentClass="stat-accent-purple" delay={0.05} />
        <StatCard label="Sativa" value={stats.sativa} accentClass="stat-accent-amber" delay={0.1} />
        <StatCard label="Hybrid" value={stats.hybrid} accentClass="stat-accent-emerald" delay={0.15} />
      </div>

      <FiltersBar
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        searchPlaceholder="Search name, breeder, genetics…"
        actions={
          <div className="flex items-center gap-1.5 flex-wrap">
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as StrainType | "")} className="h-9 px-3 text-[12px] rounded-md bg-background border border-border">
              <option value="">All types</option>
              {STRAIN_TYPES.map((t) => <option key={t} value={t}>{STRAIN_TYPE_LABELS[t]}</option>)}
            </select>
            <select value={breederFilter} onChange={(e) => setBreederFilter(e.target.value)} className="h-9 px-3 text-[12px] rounded-md bg-background border border-border" disabled={breeders.length === 0}>
              <option value="">All breeders</option>
              {breeders.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
            <select value={terpeneFilter} onChange={(e) => setTerpeneFilter(e.target.value)} className="h-9 px-3 text-[12px] rounded-md bg-background border border-border">
              <option value="">All terpenes</option>
              {allTerpenes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={activeFilter} onChange={(e) => setActiveFilter(e.target.value as any)} className="h-9 px-3 text-[12px] rounded-md bg-background border border-border">
              <option value="">All strains</option>
              <option value="yes">Has active plants</option>
              <option value="no">No active plants</option>
            </select>
          </div>
        }
      />

      {loading ? (
        <div className="flex h-[40vh] items-center justify-center">
          <Dna className="w-6 h-6 animate-pulse text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyBlock
          hasStrains={strains.length > 0}
          onAdd={() => { setEditing(null); setModalOpen(true); }}
        />
      ) : view === "card" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((s, i) => (
            <StrainCard
              key={s.id}
              strain={s}
              delay={i * 0.03}
              onClick={() => navigate(`/cultivation/strains/${s.id}`)}
              onEdit={() => { setEditing(s); setModalOpen(true); }}
              onDuplicate={() => handleDuplicate(s)}
              onArchive={() => archiveStrain(s.id)}
            />
          ))}
        </div>
      ) : (
        <DataTable columns={columns} data={filtered} />
      )}

      <StrainFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        editing={editing}
        onSave={handleSave}
      />
    </div>
  );
}

// ─── Strain card ──────────────────────────────────────────────────────────────

function StrainCard({
  strain, delay, onClick, onEdit, onDuplicate, onArchive,
}: {
  strain: Strain; delay: number;
  onClick: () => void; onEdit: () => void;
  onDuplicate: () => void; onArchive: () => void;
}) {
  const type = strain.type ?? "Hybrid";
  const color = STRAIN_TYPE_COLORS[type];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
      whileHover={{ y: -3 }}
      className="group relative rounded-xl border border-border bg-card overflow-hidden cursor-pointer transition-all hover:shadow-lg hover:border-primary/30"
      style={{ boxShadow: "0 1px 3px var(--shadow-color)" }}
      onClick={onClick}
    >
      {/* Photo */}
      <div className="relative" style={{ aspectRatio: "16 / 9" }}>
        {strain.image_url ? (
          <img src={strain.image_url} alt={strain.name} className="w-full h-full object-cover" />
        ) : (
          <div className={cn("w-full h-full flex items-center justify-center bg-gradient-to-br", color.gradient)}>
            <Dna className="w-10 h-10 text-foreground/20" />
          </div>
        )}
        <span className={cn("absolute top-2 right-2 inline-flex items-center h-5 px-2 rounded-full text-[10px] font-semibold uppercase tracking-wider", color.bg, color.text)}>
          {STRAIN_TYPE_LABELS[type]}
        </span>
        <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                className="p-1 rounded-md bg-background/90 hover:bg-background border border-border"
              >
                <MoreHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); }}>
                <Edit className="w-3.5 h-3.5" /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDuplicate(); }}>
                <Copy className="w-3.5 h-3.5" /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={async (e) => { e.stopPropagation(); if (confirm(`Archive "${strain.name}"?`)) await onArchive(); }}
                className="text-destructive"
              >
                <Archive className="w-3.5 h-3.5" /> Archive
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Body */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="text-[15px] font-semibold text-foreground truncate">{strain.name}</h3>
        </div>
        {strain.breeder && <p className="text-[12px] text-muted-foreground truncate">by {strain.breeder}</p>}
        {strain.genetics && <p className="text-[11px] text-muted-foreground/70 line-clamp-1 mt-0.5 italic">{strain.genetics}</p>}

        {/* Terpenes */}
        {(strain.dominant_terpenes ?? []).length > 0 && (
          <div className="mt-3">
            <TerpeneChips terpenes={strain.dominant_terpenes ?? []} max={3} />
          </div>
        )}

        {/* Stats row */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border text-[11px]">
          {strain.average_thc_pct != null && (
            <Stat label="THC" value={`${Number(strain.average_thc_pct).toFixed(1)}%`} />
          )}
          {strain.average_flower_days != null && (
            <Stat label="Flower" value={`${strain.average_flower_days}d`} />
          )}
          <Stat label="Phenos" value={String(strain.phenotype_count ?? 0)} />
          {(strain.active_plant_count ?? 0) > 0 && (
            <Stat label="Active" value={String(strain.active_plant_count)} className="text-primary" />
          )}
        </div>
      </div>

      {/* Hover CTA */}
      <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-[11px] font-medium text-primary">
        View Strain →
      </div>
    </motion.div>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn("flex flex-col", className)}>
      <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
      <span className="font-mono font-semibold tabular-nums">{value}</span>
    </div>
  );
}

export function TerpeneChips({ terpenes, max = 3 }: { terpenes: string[]; max?: number }) {
  const shown = terpenes.slice(0, max);
  const hidden = terpenes.length - shown.length;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((t) => (
        <span
          key={t}
          className={cn(
            "inline-flex items-center h-5 px-2 rounded-full text-[10px] font-medium",
            TERPENE_COLORS[t] ?? "bg-muted text-muted-foreground",
          )}
        >
          {t}
        </span>
      ))}
      {hidden > 0 && (
        <span className="inline-flex items-center h-5 px-2 rounded-full text-[10px] font-medium bg-muted text-muted-foreground">
          +{hidden} more
        </span>
      )}
    </div>
  );
}

function ViewToggle({ view, setView }: { view: ViewMode; setView: (v: ViewMode) => void }) {
  return (
    <div className="inline-flex rounded-md border border-border bg-muted/30 p-0.5">
      <button
        type="button"
        onClick={() => setView("card")}
        title="Card view (G C)"
        className={cn("px-2 h-8 text-[11px] font-medium rounded inline-flex items-center gap-1", view === "card" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
      >
        <LayoutGrid className="w-3.5 h-3.5" />
        Cards
      </button>
      <button
        type="button"
        onClick={() => setView("table")}
        title="Table view (G T)"
        className={cn("px-2 h-8 text-[11px] font-medium rounded inline-flex items-center gap-1", view === "table" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
      >
        <Table2 className="w-3.5 h-3.5" />
        Table
      </button>
    </div>
  );
}

function EmptyBlock({ hasStrains, onAdd }: { hasStrains: boolean; onAdd: () => void }) {
  return (
    <div className="rounded-xl border border-border bg-card p-12 text-center">
      <Leaf className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
      <p className="text-[15px] font-semibold text-foreground mb-1">
        {hasStrains ? "No matches" : "Add your first strain"}
      </p>
      <p className="text-[12px] text-muted-foreground mb-5 max-w-md mx-auto">
        {hasStrains
          ? "No strains match your current filters. Try clearing them or widening the search."
          : "Your genetics library is the foundation of everything in Cody Grow. Start by adding the strains you currently grow."}
      </p>
      {!hasStrains && (
        <div className="flex items-center justify-center gap-2">
          <Button onClick={onAdd} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Add First Strain
          </Button>
          <Button variant="outline" disabled className="gap-1.5">
            Import from CCRS
          </Button>
        </div>
      )}
    </div>
  );
}

void Moon; void Sun; void Blend; void ImageIcon;
