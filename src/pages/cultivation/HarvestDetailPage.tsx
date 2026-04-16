import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  Scissors, Edit, Archive, Loader2, Gauge, Beaker, Package, Activity,
  MapPin, Building2, MoreHorizontal, CheckCircle2, ArrowRight, Thermometer,
  Droplets, Wind, Send, Clock, Sparkles, CalendarDays,
} from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, Cell,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import PageHeader from "@/components/shared/PageHeader";
import StatusPill from "@/components/shared/StatusPill";
import DataTable from "@/components/shared/DataTable";
import DateTime from "@/components/shared/DateTime";
import EmptyState from "@/components/shared/EmptyState";
import EnvironmentChart from "@/components/shared/EnvironmentChart";
import HarvestTimeline, { StepKey, timelineStepToModal } from "@/components/shared/HarvestTimeline";
import CodyInsightsPanel from "@/components/cody/CodyInsightsPanel";
import { useShortcut } from "@/components/shared/KeyboardShortcuts";
import { useCodyContext } from "@/hooks/useCodyContext";
import {
  useHarvest, useHarvestPlants, useHarvestWeightLog, Harvest,
} from "@/hooks/useHarvests";
import { useAreaEnvironment } from "@/hooks/useAreas";
import {
  HARVEST_STATUS_LABELS, HarvestStatus,
  HARVEST_TYPE_LABELS, HarvestType,
  STRAIN_TYPE_COLORS, StrainType,
} from "@/lib/schema-enums";
import { supabase } from "@/lib/supabase";
import {
  RecordWetWeightModal, RecordDryWeightModal, StartCureModal, MarkCuredModal,
} from "./HarvestRecordModals";
import FinishHarvestPageModal from "./FinishHarvestPageModal";
import { cn } from "@/lib/utils";

const STATUS_VARIANT: Record<HarvestStatus, "success" | "warning" | "muted" | "info" | "critical"> = {
  active: "info",
  drying: "warning",
  curing: "warning",
  cured: "success",
  processing: "info",
  completed: "muted",
};

type ModalKey = "wet" | "dry" | "cure" | "cured" | "finish" | null;

export default function HarvestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") ?? "overview";
  const setActiveTab = (t: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", t);
    setSearchParams(next, { replace: true });
  };

  const { data: harvest, loading, refresh } = useHarvest(id);
  const { data: harvestPlants, updatePlantWeights } = useHarvestPlants(id);
  const weightLog = useHarvestWeightLog(harvest);

  // Environmental data from the drying area during the drying/curing window
  const envRangeStart = harvest?.harvest_started_at ?? null;
  const envRangeEnd = harvest?.completed_at ?? harvest?.cured_at ?? null;
  const { data: envReadings, loading: envLoading } = useAreaEnvironment(
    harvest?.area_id ?? undefined,
    envRangeEnd ? "30d" : "7d",
  );

  const [modal, setModal] = useState<ModalKey>(null);
  const modalOpen = modal !== null;

  // Deep-link from the list page: ?rec=wet|dry|cure|finish auto-opens a modal
  useEffect(() => {
    const rec = searchParams.get("rec");
    if (!rec || !harvest) return;
    if (rec === "wet" || rec === "dry" || rec === "cure" || rec === "finish" || rec === "cured") {
      setModal(rec as ModalKey);
      const next = new URLSearchParams(searchParams);
      next.delete("rec");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, harvest, setSearchParams]);

  // Cody context
  const { setContext, clearContext } = useCodyContext();
  const sig = harvest ? `${harvest.id}:${harvest.updated_at}:${harvest.status}` : "";
  const codyPayload = useMemo(() => {
    if (!harvest) return null;
    const wet = harvest.wet_weight_grams != null ? Number(harvest.wet_weight_grams) : null;
    const dry = harvest.dry_weight_grams != null ? Number(harvest.dry_weight_grams) : null;
    return {
      harvest: {
        name: harvest.name,
        strain: harvest.strain?.name,
        cycle: harvest.cycle?.name,
        type: harvest.harvest_type,
        status: harvest.status,
        wet_g: wet,
        dry_g: dry,
        waste_g: harvest.waste_weight_grams,
        yield_pct: wet && dry ? (dry / wet) * 100 : null,
        plants_harvested: harvest.total_plants_harvested,
      },
      resulting_batch: harvest.resulting_batch,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  useEffect(() => {
    if (!harvest || !codyPayload) return;
    setContext({ context_type: "harvest_detail", context_id: harvest.id, page_data: codyPayload });
    return () => clearContext();
  }, [setContext, clearContext, codyPayload, harvest?.id]);

  useShortcut(["w"], () => setModal("wet"), { description: "Record wet weight", scope: "Harvest Detail", enabled: !!harvest && !modalOpen });
  useShortcut(["d"], () => setModal("dry"), { description: "Record dry weight", scope: "Harvest Detail", enabled: !!harvest && !modalOpen });
  useShortcut(["c"], () => setModal("cure"), { description: "Start cure", scope: "Harvest Detail", enabled: !!harvest && !modalOpen });
  useShortcut(["f"], () => setModal("finish"), { description: "Finish harvest", scope: "Harvest Detail", enabled: !!harvest && !modalOpen });

  if (loading) {
    return <div className="flex h-[60vh] items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  if (!harvest) {
    return (
      <div className="p-6 md:p-8 max-w-7xl mx-auto">
        <EmptyState
          icon={Scissors}
          title="Harvest not found"
          description="This harvest may have been archived or doesn't exist."
          primaryAction={<Button onClick={() => navigate("/cultivation/harvests")}>← Back to harvests</Button>}
        />
      </div>
    );
  }

  const strainType = harvest.strain?.type as StrainType | null;
  const strainColor = strainType ? STRAIN_TYPE_COLORS[strainType] : null;
  const wet = harvest.wet_weight_grams != null ? Number(harvest.wet_weight_grams) : null;
  const dry = harvest.dry_weight_grams != null ? Number(harvest.dry_weight_grams) : null;
  const waste = harvest.waste_weight_grams != null ? Number(harvest.waste_weight_grams) : null;
  const ratio = wet && wet > 0 && dry && dry > 0 ? (dry / wet) * 100 : null;
  const ratioColor = ratio == null ? "text-muted-foreground" : ratio > 25 ? "text-emerald-500" : ratio >= 20 ? "text-amber-500" : "text-destructive";

  // Context-sensitive primary action + label
  const primaryAction = (() => {
    if (harvest.status === "drying") return { label: "Record Dry Weight", onClick: () => setModal("dry"), icon: Gauge };
    if (harvest.status === "curing") return { label: "Mark Cured", onClick: () => setModal("cured"), icon: CheckCircle2 };
    if (harvest.status === "cured") return { label: "Finish → Create Inventory", onClick: () => setModal("finish"), icon: Package };
    if (harvest.status === "completed" && harvest.resulting_batch) {
      return { label: "View Batch", onClick: () => navigate(`/inventory/batches/${harvest.resulting_batch!.id}`), icon: ArrowRight };
    }
    // Default / drying without wet weight
    if (wet == null) return { label: "Record Wet Weight", onClick: () => setModal("wet"), icon: Gauge };
    return null;
  })();

  const handleStepClick = (step: StepKey) => {
    const m = timelineStepToModal(step);
    if (m) setModal(m);
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <PageHeader
        title={harvest.name}
        breadcrumbs={[
          { label: "Cultivation" },
          { label: "Harvests", to: "/cultivation/harvests" },
          { label: harvest.name },
        ]}
        actions={
          <div className="flex items-center gap-2">
            {harvest.harvest_type && (
              <span className="inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-semibold uppercase tracking-wider bg-muted text-muted-foreground">
                {HARVEST_TYPE_LABELS[harvest.harvest_type as HarvestType]}
              </span>
            )}
            <StatusPill label={harvest.status ? HARVEST_STATUS_LABELS[harvest.status as HarvestStatus] ?? harvest.status : "—"} variant={STATUS_VARIANT[harvest.status as HarvestStatus] ?? "muted"} />

            {primaryAction && (
              <Button onClick={primaryAction.onClick} className="gap-1.5">
                <primaryAction.icon className="w-3.5 h-3.5" /> {primaryAction.label}
              </Button>
            )}

            {harvest.status === "drying" && wet != null && (
              <Button variant="outline" onClick={() => setModal("cure")} className="gap-1.5">
                <Beaker className="w-3.5 h-3.5" /> Start Cure
              </Button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="w-9 h-9">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setModal("wet")}>
                  <Gauge className="w-3.5 h-3.5" /> Record Wet Weight
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setModal("dry")}>
                  <Gauge className="w-3.5 h-3.5" /> Record Dry Weight
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setModal("cure")}>
                  <Beaker className="w-3.5 h-3.5" /> Start Cure
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setModal("cured")}>
                  <CheckCircle2 className="w-3.5 h-3.5" /> Mark Cured
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setModal("finish")}>
                  <Package className="w-3.5 h-3.5" /> Finish Harvest
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  <Edit className="w-3.5 h-3.5" /> Edit (soon)
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  <Send className="w-3.5 h-3.5" /> Upload to CCRS (soon)
                </DropdownMenuItem>
                <DropdownMenuItem disabled className="text-destructive">
                  <Archive className="w-3.5 h-3.5" /> Archive (soon)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      {/* Hero subtitle */}
      <div className="flex items-center gap-2 text-[12px] text-muted-foreground mb-6 -mt-4 flex-wrap">
        {harvest.strain && (
          <button onClick={() => navigate(`/cultivation/strains/${harvest.strain!.id}`)} className="inline-flex items-center gap-1.5 text-primary hover:underline">
            {harvest.strain.name}
            {strainType && strainColor && (
              <span className={cn("inline-flex items-center h-4 px-1.5 rounded-full text-[9px] font-semibold uppercase tracking-wider", strainColor.bg, strainColor.text)}>
                {strainType}
              </span>
            )}
          </button>
        )}
        {harvest.cycle && (
          <>
            <span>·</span>
            <button onClick={() => navigate(`/cultivation/grow-cycles/${harvest.cycle!.id}`)} className="inline-flex items-center gap-1 text-primary hover:underline">
              <CalendarDays className="w-3 h-3" />
              {harvest.cycle.name}
            </button>
          </>
        )}
        {harvest.harvest_started_at && (
          <>
            <span>·</span>
            <span>Harvested <DateTime value={harvest.harvest_started_at} format="date-only" /></span>
          </>
        )}
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        <InfoCard icon={Scissors} label="Type">
          <div className="text-[13px] font-semibold text-foreground">{harvest.harvest_type ? HARVEST_TYPE_LABELS[harvest.harvest_type as HarvestType] : "—"}</div>
          {harvest.harvest_started_at && <p className="text-[11px] text-muted-foreground"><DateTime value={harvest.harvest_started_at} format="date-only" /></p>}
        </InfoCard>
        <InfoCard icon={CalendarDays} label="Cycle / Area">
          {harvest.cycle && (
            <button onClick={() => navigate(`/cultivation/grow-cycles/${harvest.cycle!.id}`)} className="text-[13px] font-medium text-primary hover:underline text-left truncate block max-w-full">
              {harvest.cycle.name}
            </button>
          )}
          {harvest.area && (
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <MapPin className="w-3 h-3" /> {harvest.area.name}
            </p>
          )}
        </InfoCard>
        <InfoCard icon={Sparkles} label="Plants Harvested">
          <div className="text-[22px] font-bold font-mono tabular-nums text-foreground">{harvest.total_plants_harvested ?? harvestPlants.length}</div>
        </InfoCard>
        <InfoCard icon={Gauge} label="Weights">
          <div className="space-y-0.5 text-[11px] font-mono">
            <p><span className="text-muted-foreground w-10 inline-block">Wet</span> <span className="font-semibold">{wet != null ? `${wet.toFixed(0)}g` : "—"}</span></p>
            <p><span className="text-muted-foreground w-10 inline-block">Dry</span> <span className="font-semibold">{dry != null ? `${dry.toFixed(0)}g` : "—"}</span></p>
            <p><span className="text-muted-foreground w-10 inline-block">Waste</span> <span className="font-semibold">{waste != null ? `${waste.toFixed(0)}g` : "—"}</span></p>
          </div>
        </InfoCard>
        <InfoCard icon={CheckCircle2} label="Yield Ratio">
          <div className={cn("text-[22px] font-bold font-mono tabular-nums", ratioColor)}>{ratio != null ? `${ratio.toFixed(1)}%` : "—"}</div>
          {ratio != null && (
            <p className="text-[10px] text-muted-foreground">{ratio > 25 ? "Above average" : ratio >= 20 ? "Typical range" : "Below target"}</p>
          )}
        </InfoCard>
      </div>

      {/* Harvest workflow timeline */}
      <div className="mb-6">
        <HarvestTimeline harvest={harvest} onStepClick={handleStepClick} />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="plants">Plants ({harvestPlants.length})</TabsTrigger>
          <TabsTrigger value="weight_log">Weight Log</TabsTrigger>
          <TabsTrigger value="environmental">Environmental</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview"><OverviewPanel harvest={harvest} wet={wet} dry={dry} waste={waste} ratio={ratio} /></TabsContent>
        <TabsContent value="plants"><PlantsPanel harvestPlants={harvestPlants} onUpdate={updatePlantWeights} /></TabsContent>
        <TabsContent value="weight_log"><WeightLogPanel events={weightLog} /></TabsContent>
        <TabsContent value="environmental"><EnvironmentalPanel harvest={harvest} readings={envReadings} loading={envLoading} /></TabsContent>
        <TabsContent value="activity">
          <div className="rounded-xl border border-border bg-card p-12 text-center">
            <Activity className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-[14px] font-semibold text-foreground mb-1">Audit log coming soon</p>
            <p className="text-[12px] text-muted-foreground">Weight recordings, phase changes, and CCRS uploads will appear here.</p>
          </div>
        </TabsContent>
      </Tabs>

      {/* Modals */}
      <RecordWetWeightModal open={modal === "wet"} onClose={() => setModal(null)} harvest={harvest} onSuccess={refresh} />
      <RecordDryWeightModal open={modal === "dry"} onClose={() => setModal(null)} harvest={harvest} onSuccess={refresh} />
      <StartCureModal open={modal === "cure"} onClose={() => setModal(null)} harvest={harvest} onSuccess={refresh} />
      <MarkCuredModal open={modal === "cured"} onClose={() => setModal(null)} harvest={harvest} onSuccess={refresh} />
      <FinishHarvestPageModal
        open={modal === "finish"}
        onClose={() => setModal(null)}
        harvest={harvest}
        onSuccess={(r) => { refresh(); if (r.batch_id) toast.success("Batch created", { action: { label: "View Batch →", onClick: () => navigate(`/inventory/batches/${r.batch_id}`) } }); }}
      />
    </div>
  );
}

// ─── Overview panel ──────────────────────────────────────────────────────────

function OverviewPanel({ harvest, wet, dry, waste, ratio }: { harvest: Harvest; wet: number | null; dry: number | null; waste: number | null; ratio: number | null }) {
  const navigate = useNavigate();

  const weightChart = useMemo(() => {
    if (wet == null && dry == null) return null;
    const rows = [
      { label: "Wet", value: wet ?? 0, color: "#F97316" },
      { label: "Dry", value: dry ?? 0, color: "#14B8A6" },
      { label: "Waste", value: waste ?? 0, color: "#6B7280" },
    ].filter((r) => r.value > 0);
    return rows.length > 0 ? rows : null;
  }, [wet, dry, waste]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        {/* Weights visualization */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-muted/20">
            <h3 className="text-[13px] font-semibold text-foreground">Weight Conversion</h3>
          </div>
          <div className="p-5">
            {weightChart ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={weightChart} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} label={{ value: "grams", angle: -90, position: "insideLeft", style: { fontSize: 11, fill: "hsl(var(--muted-foreground))" } }} />
                  <RTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid var(--glass-border)", borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [`${Number(v).toFixed(0)}g`, ""]} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {weightChart.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-[12px] text-muted-foreground italic text-center py-8">Record wet weight to see the conversion chart.</p>
            )}
            {ratio != null && (
              <div className="mt-3 pt-3 border-t border-border text-center">
                <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Dry-to-Wet Ratio</p>
                <p className={cn("text-[28px] font-bold font-mono tabular-nums mt-1", ratio > 25 ? "text-emerald-500" : ratio >= 20 ? "text-amber-500" : "text-destructive")}>
                  {ratio.toFixed(1)}%
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {ratio > 25 ? "Excellent conversion" : ratio >= 20 ? "Typical range" : "Below expected"}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Cycle info */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-muted/20">
            <h3 className="text-[13px] font-semibold text-foreground">Cycle Info</h3>
          </div>
          <dl className="divide-y divide-border">
            <Row label="Cycle" value={harvest.cycle
              ? <a href={`/cultivation/grow-cycles/${harvest.cycle.id}`} className="text-primary hover:underline">{harvest.cycle.name}</a>
              : "—"} />
            <Row label="Strain" value={harvest.strain?.name ?? "—"} />
            <Row label="Drying Area" value={harvest.area?.name ?? "—"} />
            <Row label="External ID" value={harvest.ccrs_external_identifier ? <span className="font-mono">{harvest.ccrs_external_identifier}</span> : "—"} />
            <Row label="Flower Lot ID" value={harvest.flower_lot_external_id ? <span className="font-mono">{harvest.flower_lot_external_id}</span> : "—"} />
            <Row label="CCRS Reported" value={harvest.ccrs_reported ? "Yes" : "Pending"} />
            <Row label="Notes" value={harvest.notes ?? "—"} />
          </dl>
        </div>

        {/* Resulting batch (if finalized) */}
        {harvest.resulting_batch && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
            <div className="flex items-center gap-2 mb-2">
              <Package className="w-4 h-4 text-primary" />
              <h3 className="text-[13px] font-semibold text-foreground">Resulting Batch</h3>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Barcode</p>
                <p className="font-mono text-[15px] font-bold text-foreground mt-0.5">{harvest.resulting_batch.barcode ?? harvest.resulting_batch.external_id}</p>
                {dry != null && <p className="text-[12px] text-muted-foreground mt-1">{dry.toFixed(0)}g · {HARVEST_TYPE_LABELS[harvest.harvest_type as HarvestType] ?? "—"} harvest</p>}
              </div>
              <Button variant="outline" onClick={() => navigate(`/inventory/batches/${harvest.resulting_batch!.id}`)} className="gap-1.5">
                View Batch <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
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
              ratio != null
                ? `Is ${ratio.toFixed(1)}% a good yield for ${harvest.strain?.name ?? "this strain"}?`
                : `What dry weight should I expect from ${wet != null ? `${wet.toFixed(0)}g wet` : "this harvest"}?`,
              "How did environmental conditions during dry compare to my best cure?",
              harvest.status === "cured" ? "Am I ready to finalize this harvest?" : "When should I start the cure?",
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

// ─── Plants panel ────────────────────────────────────────────────────────────

function PlantsPanel({ harvestPlants, onUpdate }: { harvestPlants: any[]; onUpdate: (rowId: string, patch: any) => Promise<void> }) {
  const navigate = useNavigate();
  const [edits, setEdits] = useState<Record<string, { wet?: string; dry?: string; notes?: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const handleSave = async (rowId: string) => {
    const patch = edits[rowId] ?? {};
    if (!patch.wet && !patch.dry && patch.notes == null) return;
    setSaving(rowId);
    try {
      await onUpdate(rowId, {
        wet_weight_grams: patch.wet != null && patch.wet !== "" ? Number(patch.wet) : undefined,
        dry_weight_grams: patch.dry != null && patch.dry !== "" ? Number(patch.dry) : undefined,
        notes: patch.notes,
      });
      toast.success("Plant updated");
      setEdits((prev) => { const { [rowId]: _, ...rest } = prev; return rest; });
    } catch (e: any) {
      toast.error(e?.message ?? "Update failed");
    } finally {
      setSaving(null);
    }
  };

  const totalWet = harvestPlants.reduce((s, hp) => s + Number(hp.wet_weight_grams ?? 0), 0);
  const totalDry = harvestPlants.reduce((s, hp) => s + Number(hp.dry_weight_grams ?? 0), 0);

  if (harvestPlants.length === 0) {
    return <EmptyState icon={Sparkles} title="No plants attached" description="Per-plant records weren't created for this harvest." />;
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <table className="w-full">
        <thead className="border-b border-border bg-muted/30">
          <tr>
            <th className="text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground px-4 py-2.5">Plant ID</th>
            <th className="text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground px-4 py-2.5">State</th>
            <th className="text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground px-4 py-2.5">Wet (g)</th>
            <th className="text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground px-4 py-2.5">Dry (g)</th>
            <th className="text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground px-4 py-2.5">Notes</th>
            <th className="w-20" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {harvestPlants.map((hp) => {
            const edit = edits[hp.id] ?? {};
            const dirty = edit.wet != null || edit.dry != null || edit.notes != null;
            return (
              <tr key={hp.id} className="group hover:bg-accent/20">
                <td className="px-4 py-2">
                  <button onClick={() => navigate(`/cultivation/plants/${hp.plant_id}`)} className="font-mono text-[12px] text-primary hover:underline">
                    {hp.plant?.plant_identifier ?? hp.plant_id.slice(0, 8)}
                  </button>
                </td>
                <td className="px-4 py-2 text-[12px]">
                  {hp.plant?.ccrs_plant_state ?? "—"}
                </td>
                <td className="px-4 py-2 text-right">
                  <input
                    type="number" step="0.1" min="0"
                    value={edit.wet ?? (hp.wet_weight_grams != null ? String(hp.wet_weight_grams) : "")}
                    onChange={(e) => setEdits((prev) => ({ ...prev, [hp.id]: { ...prev[hp.id], wet: e.target.value } }))}
                    className="h-7 w-24 text-right font-mono text-[12px] rounded bg-background border border-border px-2 focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </td>
                <td className="px-4 py-2 text-right">
                  <input
                    type="number" step="0.1" min="0"
                    value={edit.dry ?? (hp.dry_weight_grams != null ? String(hp.dry_weight_grams) : "")}
                    onChange={(e) => setEdits((prev) => ({ ...prev, [hp.id]: { ...prev[hp.id], dry: e.target.value } }))}
                    className="h-7 w-24 text-right font-mono text-[12px] rounded bg-background border border-border px-2 focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="text"
                    value={edit.notes ?? hp.notes ?? ""}
                    onChange={(e) => setEdits((prev) => ({ ...prev, [hp.id]: { ...prev[hp.id], notes: e.target.value } }))}
                    className="h-7 w-full text-[12px] rounded bg-background border border-border px-2 focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder="Optional"
                  />
                </td>
                <td className="px-2 py-2 text-right">
                  {dirty && (
                    <button
                      onClick={() => handleSave(hp.id)}
                      disabled={saving === hp.id}
                      className="text-[11px] font-medium text-primary hover:text-primary/80"
                    >
                      {saving === hp.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="border-t-2 border-border bg-muted/30">
          <tr>
            <td colSpan={2} className="px-4 py-2 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Totals</td>
            <td className="px-4 py-2 text-right font-mono text-[13px] font-bold text-foreground">{totalWet > 0 ? `${totalWet.toFixed(1)}g` : "—"}</td>
            <td className="px-4 py-2 text-right font-mono text-[13px] font-bold text-foreground">{totalDry > 0 ? `${totalDry.toFixed(1)}g` : "—"}</td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ─── Weight log panel ────────────────────────────────────────────────────────

function WeightLogPanel({ events }: { events: ReturnType<typeof useHarvestWeightLog> }) {
  if (events.length === 0) {
    return <EmptyState icon={Clock} title="No events yet" description="Weight recordings, cure milestones, and finalization will appear here as you progress through the workflow." />;
  }
  return (
    <div className="relative">
      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
      <div className="space-y-3">
        {events.map((e, i) => (
          <motion.div
            key={`${e.key}-${i}`}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className="relative pl-10"
          >
            <div className="absolute left-2.5 top-2 w-3 h-3 rounded-full bg-primary ring-4 ring-card" />
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-[13px] font-medium text-foreground">{e.label}</h4>
                {e.value && <span className="font-mono text-[13px] font-semibold text-primary">{e.value}</span>}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                <DateTime value={e.at} format="full" />
                {e.detail && <> · {e.detail}</>}
              </p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ─── Environmental panel ─────────────────────────────────────────────────────

function EnvironmentalPanel({ harvest, readings, loading }: { harvest: Harvest; readings: any[]; loading: boolean }) {
  const navigate = useNavigate();

  const startTs = harvest.harvest_started_at ? new Date(harvest.harvest_started_at).getTime() : null;
  const endTs = harvest.completed_at ? new Date(harvest.completed_at).getTime() : harvest.cured_at ? new Date(harvest.cured_at).getTime() : Date.now();

  // Only keep readings during the harvest's dry/cure window
  const windowed = useMemo(() =>
    startTs == null ? [] : readings.filter((r) => {
      const t = new Date(r.recorded_at).getTime();
      return t >= startTs && t <= endTs;
    }),
  [readings, startTs, endTs]);

  if (!harvest.area_id) {
    return <EmptyState icon={MapPin} title="No area assigned" description="Environmental data tracks per area. Edit this harvest to assign a drying area." />;
  }

  if (loading) {
    return <div className="flex h-[30vh] items-center justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>;
  }

  if (windowed.length === 0) {
    return (
      <EmptyState
        icon={Thermometer}
        title="No environmental data during dry/cure"
        description={`No sensor readings for ${harvest.area?.name ?? "this area"} during the harvest window. Target for optimal cure: 60°F / 60% humidity.`}
        primaryAction={<Button variant="outline" onClick={() => navigate(`/cultivation/areas/${harvest.area_id}?tab=environment`)}>Go to Area Environment →</Button>}
      />
    );
  }

  // Target ranges for dry/cure (per spec)
  const tempTarget = { min: 58, max: 65 };
  const humidityTarget = { min: 55, max: 65 };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-muted-foreground">
          <span className="font-semibold text-foreground">{windowed.length}</span> readings in{" "}
          <button onClick={() => navigate(`/cultivation/areas/${harvest.area_id}`)} className="text-primary hover:underline">{harvest.area?.name}</button>
          {" "}from <DateTime value={new Date(startTs!).toISOString()} format="date-only" /> to <DateTime value={new Date(endTs).toISOString()} format="date-only" />
        </p>
      </div>

      <div className="flex items-start gap-2 rounded-lg bg-primary/5 border border-primary/20 p-3 text-[11px] text-foreground">
        <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" />
        <span>Optimal dry/cure targets: <span className="font-mono font-semibold">{tempTarget.min}–{tempTarget.max}°F</span> temperature, <span className="font-mono font-semibold">{humidityTarget.min}–{humidityTarget.max}%</span> humidity. Readings outside these bands are flagged on the charts below.</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <EnvironmentChart data={windowed} metric="temperature" targetRange={tempTarget} timeRange="30d" />
        <EnvironmentChart data={windowed} metric="humidity" targetRange={humidityTarget} timeRange="30d" />
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-3 px-5 py-2.5">
      <dt className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground">{label}</dt>
      <dd className="text-[12px] text-foreground">{value}</dd>
    </div>
  );
}

void Building2; void Droplets; void Wind;
