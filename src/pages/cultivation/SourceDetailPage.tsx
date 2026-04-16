import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  Sprout, Flower, GitBranch, FlaskConical, ArrowUpCircle, Edit, Archive,
  Loader2, Split, TrendingDown, Activity, Info, MapPin, Package,
  Sparkles, Building2, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import PageHeader from "@/components/shared/PageHeader";
import StatusPill from "@/components/shared/StatusPill";
import DataTable from "@/components/shared/DataTable";
import CopyableId from "@/components/shared/CopyableId";
import DateTime from "@/components/shared/DateTime";
import EmptyState from "@/components/shared/EmptyState";
import CodyInsightsPanel from "@/components/cody/CodyInsightsPanel";
import { useShortcut } from "@/components/shared/KeyboardShortcuts";
import { useCodyContext } from "@/hooks/useCodyContext";
import {
  useSource, useSources, useSourcePromotionHistory,
  Source, SourceInput,
} from "@/hooks/useSources";
import {
  SOURCE_TYPE_LABELS, SOURCE_TYPE_COLORS, SourceType,
  SOURCE_STATUS_LABELS, SourceStatus,
  ROOTING_MEDIUM_LABELS, HEALTH_RATING_LABELS,
} from "@/lib/schema-enums";
import SourceFormModal from "./SourceFormModal";
import PromoteToCycleModal from "./PromoteToCycleModal";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const SOURCE_ICONS: Record<SourceType, React.ComponentType<{ className?: string }>> = {
  seed: Flower,
  clone: GitBranch,
  tissue_culture: FlaskConical,
};

const STATUS_VARIANT: Record<SourceStatus, "success" | "info" | "muted" | "critical" | "warning"> = {
  available: "success",
  in_cycle: "info",
  depleted: "muted",
  destroyed: "critical",
  quarantine: "warning",
};

export default function SourceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") ?? "overview";
  const setActiveTab = (t: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", t);
    setSearchParams(next, { replace: true });
  };

  const { data: source, loading, refresh } = useSource(id);
  const { updateSource, archiveSource, splitSource, recordLoss } = useSources();
  const { data: history } = useSourcePromotionHistory(id);

  const [editOpen, setEditOpen] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [splitQty, setSplitQty] = useState(1);
  const [lossOpen, setLossOpen] = useState(false);
  const [lossQty, setLossQty] = useState(1);
  const [lossReason, setLossReason] = useState("");

  const { setContext, clearContext } = useCodyContext();
  const sig = source ? `${source.id}:${source.updated_at}:${source.current_quantity}` : "";
  const codyPayload = useMemo(() => {
    if (!source) return null;
    const dateField = source.source_type === "clone" ? source.cut_date : source.acquired_date;
    const age = dateField ? Math.floor((Date.now() - new Date(dateField).getTime()) / 86400000) : null;
    return {
      source: {
        type: source.source_type,
        strain: source.strain?.name,
        remaining: source.current_quantity,
        initial: source.initial_quantity,
        status: source.status,
        age_days: age,
        vendor: source.source_vendor,
        mother_plant: source.mother_plant?.plant_identifier,
        is_rooted: source.is_rooted,
        area: source.area?.name,
      },
      promotion_history: history,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, history.length]);

  useEffect(() => {
    if (!source || !codyPayload) return;
    setContext({ context_type: "source_detail", context_id: source.id, page_data: codyPayload });
    return () => clearContext();
  }, [setContext, clearContext, codyPayload, source?.id]);

  useShortcut(["e"], () => setEditOpen(true), { description: "Edit source", scope: "Source Detail", enabled: !!source && !editOpen && !promoteOpen });
  useShortcut(["p"], () => setPromoteOpen(true), { description: "Promote to cycle", scope: "Source Detail", enabled: !!source && source.status === "available" && (source.current_quantity ?? 0) > 0 && !editOpen && !promoteOpen });

  if (loading) {
    return <div className="flex h-[60vh] items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  if (!source) {
    return (
      <div className="p-6 md:p-8 max-w-7xl mx-auto">
        <EmptyState
          icon={Sprout}
          title="Source not found"
          description="This grow source may have been archived or doesn't exist."
          primaryAction={<Button onClick={() => navigate("/cultivation/sources")}>← Back to sources</Button>}
        />
      </div>
    );
  }

  const type = source.source_type;
  const color = SOURCE_TYPE_COLORS[type];
  const Icon = SOURCE_ICONS[type];
  const remaining = source.current_quantity ?? 0;
  const initial = source.initial_quantity ?? 0;
  const canPromote = source.status === "available" && remaining > 0;

  const dateField = type === "clone" ? source.cut_date : source.acquired_date;
  const ageDays = dateField ? Math.floor((Date.now() - new Date(dateField).getTime()) / 86400000) : null;

  const handleSave = async (input: SourceInput) => {
    // Only editable metadata — skip creating a new row
    const patch: Partial<Source> = {
      source_vendor: input.source_vendor,
      vendor_lot_number: input.vendor_lot_number,
      cost_per_unit: input.cost_per_unit,
      is_feminized: input.is_feminized,
      is_autoflower: input.is_autoflower,
      germination_rate_expected: input.germination_rate_expected,
      mother_plant_id: input.mother_plant_id,
      phenotype_id: input.phenotype_id,
      is_rooted: input.is_rooted,
      root_date: input.root_date,
      rooting_medium: input.rooting_medium,
      rooting_hormone: input.rooting_hormone,
      health_rating: input.health_rating,
      status: input.status,
      notes: input.notes,
      ccrs_notes: input.ccrs_notes,
      area_id: input.area_id,
    };
    const row = await updateSource(source.id, patch);
    refresh();
    return row;
  };

  const handleArchive = async () => {
    if (!confirm(`Archive this ${SOURCE_TYPE_LABELS[type].toLowerCase()} source?`)) return;
    try {
      await archiveSource(source.id);
      toast.success("Source archived");
      navigate("/cultivation/sources");
    } catch (e: any) { toast.error(e?.message ?? "Archive failed"); }
  };

  const handleSplit = async () => {
    if (splitQty <= 0 || splitQty >= remaining) { toast.error(`Split quantity must be between 1 and ${remaining - 1}`); return; }
    try {
      await splitSource(source.id, splitQty);
      toast.success(`Split into 2 batches: ${remaining - splitQty} + ${splitQty}`);
      setSplitOpen(false);
      setSplitQty(1);
      refresh();
    } catch (e: any) { toast.error(e?.message ?? "Split failed"); }
  };

  const handleLoss = async () => {
    if (lossQty <= 0 || lossQty > remaining) { toast.error(`Loss quantity must be between 1 and ${remaining}`); return; }
    try {
      await recordLoss(source.id, lossQty, lossReason || undefined);
      toast.success(`Recorded loss of ${lossQty} units`);
      setLossOpen(false);
      setLossQty(1);
      setLossReason("");
      refresh();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <PageHeader
        title={source.strain?.name ?? "Grow Source"}
        breadcrumbs={[
          { label: "Cultivation" },
          { label: "Grow Sources", to: "/cultivation/sources" },
          { label: source.strain?.name ?? source.external_id.slice(-6) },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <span className={cn("inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-[11px] font-semibold uppercase tracking-wider", color.bg, color.text)}>
              <Icon className="w-3 h-3" />
              {SOURCE_TYPE_LABELS[type]}
            </span>
            <StatusPill label={SOURCE_STATUS_LABELS[source.status]} variant={STATUS_VARIANT[source.status]} />
            {canPromote && (
              <Button
                onClick={() => setPromoteOpen(true)}
                className="gap-1.5 bg-primary hover:bg-primary/90"
                title="Promote to Grow Cycle (P)"
              >
                <ArrowUpCircle className="w-3.5 h-3.5" /> Promote to Cycle
              </Button>
            )}
            <Button variant="outline" onClick={() => setEditOpen(true)} className="gap-1.5">
              <Edit className="w-3.5 h-3.5" /> Edit
            </Button>
            <Button variant="outline" disabled={remaining < 2} onClick={() => setSplitOpen(true)} className="gap-1.5">
              <Split className="w-3.5 h-3.5" /> Split
            </Button>
            <Button variant="outline" disabled={remaining === 0} onClick={() => setLossOpen(true)} className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10">
              <TrendingDown className="w-3.5 h-3.5" /> Record Loss
            </Button>
            <Button variant="outline" onClick={handleArchive} className="gap-1.5">
              <Archive className="w-3.5 h-3.5" /> Archive
            </Button>
          </div>
        }
      />

      {/* Hero block */}
      <div className="rounded-xl border border-border bg-card p-6 mb-6">
        <div className="flex flex-col md:flex-row gap-6">
          <div className={cn("w-20 h-20 rounded-2xl flex items-center justify-center shrink-0", color.iconBg)} style={{ color: color.hex }}>
            <Icon className="w-10 h-10" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <CopyableId value={source.external_id} />
              {ageDays != null && <span className="text-[12px] text-muted-foreground">· {ageDays}d since {type === "clone" ? "cut" : "acquired"}</span>}
            </div>
            {/* Quantity progress */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[12px] font-medium text-foreground">
                  <span className="font-mono tabular-nums text-[15px] font-bold">{remaining}</span>
                  <span className="text-muted-foreground"> of </span>
                  <span className="font-mono tabular-nums">{initial}</span>
                  <span className="text-muted-foreground"> remaining</span>
                </span>
                {initial > 0 && (
                  <span className="text-[11px] text-muted-foreground font-mono">
                    {Math.round((remaining / initial) * 100)}% available
                  </span>
                )}
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${initial > 0 ? (remaining / initial) * 100 : 0}%`,
                    background: remaining === 0 ? "hsl(var(--muted-foreground))" : color.hex,
                  }}
                />
              </div>
            </div>
            {/* Tag badges */}
            <div className="flex flex-wrap gap-1.5">
              {source.is_feminized && <Badge color="pink">Feminized</Badge>}
              {source.is_autoflower && <Badge color="amber">Autoflower</Badge>}
              {type === "clone" && source.is_rooted != null && (
                <Badge color={source.is_rooted ? "emerald" : "amber"}>
                  {source.is_rooted ? "Rooted" : "Rooting"}
                </Badge>
              )}
              {source.health_rating && <Badge color="blue">Health: {HEALTH_RATING_LABELS[source.health_rating]}</Badge>}
              {(source.promoted_cycles_count ?? 0) > 0 && <Badge color="purple">{source.promoted_cycles_count} cycle{source.promoted_cycles_count === 1 ? "" : "s"}</Badge>}
            </div>
          </div>
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <InfoCard icon={Sprout} label="Type / Strain">
          <div className="text-[13px] font-medium text-foreground">{SOURCE_TYPE_LABELS[type]}</div>
          {source.strain && (
            <button onClick={() => navigate(`/cultivation/strains/${source.strain!.id}`)} className="text-[11px] text-primary hover:underline">
              {source.strain.name}
            </button>
          )}
        </InfoCard>
        <InfoCard icon={type === "clone" ? GitBranch : Building2} label={type === "clone" ? "Mother Plant" : "Vendor"}>
          {type === "clone" ? (
            source.mother_plant
              ? <button onClick={() => navigate(`/cultivation/plants/${source.mother_plant!.id}`)} className="text-[13px] font-medium text-primary hover:underline text-left font-mono">{source.mother_plant.plant_identifier ?? source.mother_plant.id.slice(0, 8)}</button>
              : <div className="text-[13px] font-medium text-foreground italic">External / Unknown</div>
          ) : (
            <div className="text-[13px] font-medium text-foreground">{source.source_vendor ?? <span className="italic text-muted-foreground">—</span>}</div>
          )}
          {source.vendor_lot_number && <div className="text-[11px] text-muted-foreground font-mono">Lot {source.vendor_lot_number}</div>}
        </InfoCard>
        <InfoCard icon={MapPin} label="Area / Facility">
          {source.area ? (
            <button onClick={() => navigate(`/cultivation/areas/${source.area!.id}`)} className="text-[13px] font-medium text-primary hover:underline text-left">
              {source.area.name}
            </button>
          ) : <div className="text-[13px] text-muted-foreground">—</div>}
        </InfoCard>
        <InfoCard icon={Info} label="CCRS External ID">
          <CopyableId value={source.external_id} />
          <div className="text-[10px] text-muted-foreground">PropagationMaterial</div>
        </InfoCard>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="history">Promotion History{history.length > 0 && ` (${history.length})`}</TabsTrigger>
          <TabsTrigger value="inventory">Batch / Inventory</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview"><OverviewPanel source={source} /></TabsContent>
        <TabsContent value="history"><HistoryPanel sourceId={source.id} /></TabsContent>
        <TabsContent value="inventory"><InventoryPanel source={source} /></TabsContent>
        <TabsContent value="activity">
          <div className="rounded-xl border border-border bg-card p-12 text-center">
            <Activity className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-[14px] font-semibold text-foreground mb-1">Audit log coming soon</p>
            <p className="text-[12px] text-muted-foreground">Edits, splits, losses, and promotions will appear here.</p>
          </div>
        </TabsContent>
      </Tabs>

      {/* Modals */}
      <SourceFormModal open={editOpen} onClose={() => setEditOpen(false)} editing={source} onSave={handleSave} />
      <PromoteToCycleModal open={promoteOpen} onClose={() => setPromoteOpen(false)} source={source} onSuccess={() => refresh()} />

      {/* Split modal (inline lightweight) */}
      {splitOpen && (
        <MiniModal
          title="Split batch"
          subtitle={`Move some of this ${SOURCE_TYPE_LABELS[type].toLowerCase()} batch to a new source row`}
          onClose={() => setSplitOpen(false)}
          actions={
            <>
              <Button variant="ghost" onClick={() => setSplitOpen(false)}>Cancel</Button>
              <Button onClick={handleSplit} disabled={splitQty <= 0 || splitQty >= remaining}>Split</Button>
            </>
          }
        >
          <p className="text-[12px] text-muted-foreground mb-3">
            Current batch has <span className="font-mono font-semibold text-foreground">{remaining}</span> units.
            Enter how many to move to a new batch. The original keeps the rest.
          </p>
          <input
            type="number"
            min="1" max={remaining - 1}
            value={splitQty}
            onChange={(e) => setSplitQty(Number(e.target.value) || 0)}
            className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono"
          />
          <p className="text-[11px] text-muted-foreground mt-2">
            After split: original = <span className="font-mono">{remaining - splitQty}</span> · new batch = <span className="font-mono">{splitQty}</span>
          </p>
        </MiniModal>
      )}

      {/* Loss modal */}
      {lossOpen && (
        <MiniModal
          title="Record loss"
          subtitle="Record destruction, mortality, or quarantine loss"
          onClose={() => setLossOpen(false)}
          actions={
            <>
              <Button variant="ghost" onClick={() => setLossOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleLoss} disabled={lossQty <= 0 || lossQty > remaining}>Record Loss</Button>
            </>
          }
        >
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] uppercase tracking-wider font-medium text-muted-foreground mb-1.5">Quantity Lost</label>
              <input
                type="number"
                min="1" max={remaining}
                value={lossQty}
                onChange={(e) => setLossQty(Number(e.target.value) || 0)}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wider font-medium text-muted-foreground mb-1.5">Reason</label>
              <input
                type="text"
                value={lossReason}
                onChange={(e) => setLossReason(e.target.value)}
                placeholder="e.g. Failed germination, mold, pest damage"
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
        </MiniModal>
      )}
    </div>
  );
}

// ─── Overview panel ───────────────────────────────────────────────────────────

function OverviewPanel({ source }: { source: Source }) {
  const type = source.source_type;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <Card title="Source details">
          <dl className="divide-y divide-border">
            <Row label="Type" value={SOURCE_TYPE_LABELS[type]} />
            <Row label="Strain" value={source.strain?.name ?? "—"} />
            {type === "seed" && (
              <>
                <Row label="Vendor" value={source.source_vendor ?? "—"} />
                <Row label="Vendor Lot #" value={source.vendor_lot_number ? <span className="font-mono">{source.vendor_lot_number}</span> : "—"} />
                <Row label="Feminized" value={source.is_feminized ? "Yes" : "No"} />
                <Row label="Autoflower" value={source.is_autoflower ? "Yes" : "No"} />
                <Row label="Expected Germination %" value={source.germination_rate_expected != null ? <span className="font-mono">{source.germination_rate_expected}%</span> : "—"} />
                <Row label="Cost per Seed" value={source.cost_per_unit != null ? `$${Number(source.cost_per_unit).toFixed(2)}` : "—"} />
              </>
            )}
            {type === "clone" && (
              <>
                <Row label="Mother Plant" value={source.mother_plant ? source.mother_plant.plant_identifier ?? source.mother_plant.id.slice(0, 8) : <span className="italic">External / Unknown</span>} />
                <Row label="Is Rooted" value={source.is_rooted ? "Yes" : "No"} />
                <Row label="Root Date" value={source.root_date ? <DateTime value={source.root_date} format="date-only" /> : "—"} />
                <Row label="Rooting Medium" value={source.rooting_medium ? ROOTING_MEDIUM_LABELS[source.rooting_medium] : "—"} />
                <Row label="Rooting Hormone" value={source.rooting_hormone ?? "—"} />
                <Row label="Health Rating" value={source.health_rating ? HEALTH_RATING_LABELS[source.health_rating] : "—"} />
                <Row label="Cost per Clone" value={source.cost_per_unit != null ? `$${Number(source.cost_per_unit).toFixed(2)}` : "—"} />
              </>
            )}
            <Row label="Area" value={source.area?.name ?? "—"} />
            <Row label="Status" value={<StatusPill label={SOURCE_STATUS_LABELS[source.status]} variant={STATUS_VARIANT[source.status]} />} />
            <Row label="Notes" value={source.notes ?? "—"} />
            <Row label="CCRS Notes" value={source.ccrs_notes ?? "—"} />
          </dl>
        </Card>
      </div>

      <div className="lg:col-span-1 space-y-4">
        <CodyInsightsPanel />
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <h4 className="text-[12px] font-semibold text-foreground">Ask Cody</h4>
          </div>
          <div className="space-y-1.5">
            {[
              `Are these ${source.source_type === "clone" ? "clones" : "seeds"} ready to promote?`,
              `What's a reasonable yield forecast for ${source.current_quantity} ${source.strain?.name ?? ""} plants?`,
              source.source_type === "clone" ? "Should I transplant these clones soon?" : "What germination rate should I expect?",
            ].map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => {
                  window.dispatchEvent(new Event("open-cody-chat"));
                  window.dispatchEvent(new CustomEvent("cody-prefill", { detail: q }));
                }}
                className="w-full text-left text-[11px] text-muted-foreground hover:text-primary hover:bg-accent/50 rounded p-2 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Promotion history ───────────────────────────────────────────────────────

function HistoryPanel({ sourceId }: { sourceId: string }) {
  const navigate = useNavigate();
  const { data: history, loading } = useSourcePromotionHistory(sourceId);

  const columns: ColumnDef<any>[] = [
    {
      accessorKey: "cycle_name",
      header: "Cycle",
      cell: ({ row }) => (
        <button onClick={() => navigate(`/cultivation/grow-cycles/${row.original.cycle_id}`)} className="text-[13px] font-medium text-primary hover:underline">
          {row.original.cycle_name ?? row.original.cycle_id.slice(0, 8)}
        </button>
      ),
    },
    { accessorKey: "promoted_at", header: "Promoted", cell: ({ row }) => <DateTime value={row.original.promoted_at} format="date-only" className="text-[12px]" /> },
    { accessorKey: "quantity_promoted", header: "Quantity", cell: ({ row }) => <span className="font-mono text-[12px] tabular-nums">{row.original.quantity_promoted}</span> },
    {
      id: "area", header: "Area",
      cell: ({ row }) => row.original.area
        ? <button onClick={() => navigate(`/cultivation/areas/${row.original.area.id}`)} className="text-[12px] text-primary hover:underline">{row.original.area.name}</button>
        : <span className="text-muted-foreground text-[12px]">—</span>,
    },
    {
      id: "phase", header: "Current Phase",
      cell: ({ row }) => <span className="text-[11px] px-2 py-0.5 rounded bg-muted text-muted-foreground font-medium capitalize">{row.original.cycle_phase?.replaceAll("_", " ") ?? "—"}</span>,
    },
  ];

  if (loading) return <div className="flex h-[30vh] items-center justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>;
  if (history.length === 0) {
    return <EmptyState icon={ArrowUpCircle} title="Not yet promoted" description="Once you promote any of this source to a grow cycle, the cycles and their current phases will appear here." />;
  }
  return <DataTable columns={columns} data={history} />;
}

// ─── Inventory / batch panel ─────────────────────────────────────────────────

function InventoryPanel({ source }: { source: Source }) {
  const [batch, setBatch] = useState<any>(null);
  const [loading, setLoading] = useState(!!source.batch_id);

  useEffect(() => {
    if (!source.batch_id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("grow_batches").select("*").eq("id", source.batch_id).maybeSingle();
      if (cancelled) return;
      setBatch(data);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [source.batch_id]);

  if (!source.batch_id) {
    return (
      <EmptyState
        icon={Package}
        title="No inventory batch linked"
        description="Grow sources map to CCRS PropagationMaterial inventory. A batch record wires the source into the broader inventory lineage. This link is created automatically when CCRS submission files are generated."
      />
    );
  }
  if (loading) return <div className="flex h-[30vh] items-center justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>;
  if (!batch) return <EmptyState icon={Package} title="Batch not found" description="The linked batch was removed." />;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-muted/20">
        <h3 className="text-[13px] font-semibold text-foreground">Propagation Material Batch</h3>
      </div>
      <dl className="divide-y divide-border">
        <Row label="External ID" value={<span className="font-mono">{batch.external_id ?? "—"}</span>} />
        <Row label="Status" value={<span className="capitalize">{batch.status ?? "—"}</span>} />
        <Row label="CCRS Category" value={<span className="font-mono">PropagationMaterial</span>} />
        <Row label="Initial Qty" value={<span className="font-mono">{batch.quantity_initial ?? "—"}</span>} />
        <Row label="Current Qty" value={<span className="font-mono">{batch.quantity_current ?? "—"}</span>} />
      </dl>
    </div>
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

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-muted/20">
        <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-3 px-5 py-2.5">
      <dt className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground">{label}</dt>
      <dd className="text-[12px] text-foreground">{value}</dd>
    </div>
  );
}

function Badge({ color, children }: { color: "pink" | "amber" | "emerald" | "blue" | "purple"; children: React.ReactNode }) {
  const palette: Record<string, string> = {
    pink: "bg-pink-500/10 text-pink-500",
    amber: "bg-amber-500/10 text-amber-500",
    emerald: "bg-emerald-500/10 text-emerald-500",
    blue: "bg-blue-500/10 text-blue-500",
    purple: "bg-purple-500/10 text-purple-500",
  };
  return <span className={cn("inline-flex items-center h-5 px-2 rounded-full text-[10px] font-semibold uppercase tracking-wider", palette[color])}>{children}</span>;
}

function MiniModal({ title, subtitle, onClose, actions, children }: {
  title: string; subtitle?: string;
  onClose: () => void;
  actions: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
          {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        <div className="p-5">{children}</div>
        <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
          {actions}
        </div>
      </div>
    </div>
  );
}

void CheckCircle2;
