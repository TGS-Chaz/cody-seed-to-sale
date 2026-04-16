import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  FlaskConical, Loader2, Beaker, Plus, Package, Scale, CheckCircle2, XCircle, Activity,
  ClipboardCheck, Archive, MoreHorizontal, FileText, Building, Send, Truck,
} from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import PageHeader from "@/components/shared/PageHeader";
import StatusPill from "@/components/shared/StatusPill";
import DataTable from "@/components/shared/DataTable";
import DateTime from "@/components/shared/DateTime";
import EmptyState from "@/components/shared/EmptyState";
import CopyableId from "@/components/shared/CopyableId";
import { useShortcut } from "@/components/shared/KeyboardShortcuts";
import { useCodyContext } from "@/hooks/useCodyContext";
import {
  useQALot, useQASamples, useQAResults, useShipSample, useReceiveAtLab, useVoidQALot,
  QASample, QAResult,
} from "@/hooks/useQA";
import { CreateSampleModal, AddResultsModal } from "./QAModals";
import { cn } from "@/lib/utils";

const LOT_STATUS_VARIANT: Record<string, "success" | "warning" | "critical" | "info" | "muted"> = {
  created: "info", sampled: "info", in_testing: "warning", passed: "success", failed: "critical", voided: "muted",
};

const SAMPLE_STATUS_VARIANT: Record<string, "success" | "warning" | "critical" | "info" | "muted"> = {
  created: "info", shipped: "warning", received_at_lab: "warning", testing: "warning", complete: "success", voided: "muted",
};

export default function QALotDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") ?? "overview";
  const setActiveTab = (t: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", t);
    setSearchParams(next, { replace: true });
  };

  const { data: lot, loading, refresh } = useQALot(id);
  const { data: samples, loading: samplesLoading, refresh: refreshSamples } = useQASamples(id);
  const { data: results, loading: resultsLoading, refresh: refreshResults } = useQAResults({ lot_id: id });
  const shipSample = useShipSample();
  const receive = useReceiveAtLab();
  const voidLot = useVoidQALot();

  const [sampleOpen, setSampleOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const modalOpen = sampleOpen || resultOpen;

  const { setContext, clearContext } = useCodyContext();
  const payload = useMemo(() => {
    if (!lot) return null;
    return {
      lot: { lot_number: lot.lot_number, status: lot.status, weight: lot.lot_weight_grams },
      batch: lot.batch ? { barcode: lot.batch.barcode, id: lot.batch.id } : null,
      samples_count: samples.length,
      results_count: results.length,
      latest_result: results[0] ? {
        thc: results[0].thc_total_pct, cbd: results[0].cbd_total_pct,
        terpenes: results[0].total_terpenes_pct, pass: results[0].overall_pass,
      } : null,
    };
  }, [lot, samples.length, results]);
  useEffect(() => {
    if (!lot || !payload) return;
    setContext({ context_type: "qa_lot_detail", context_id: lot.id, page_data: payload });
    return () => clearContext();
  }, [setContext, clearContext, payload, lot?.id]);

  useShortcut(["s"], () => setSampleOpen(true), { description: "Pull sample", scope: "QA Lot Detail", enabled: !!lot && !modalOpen });
  useShortcut(["r"], () => setResultOpen(true), { description: "Add result", scope: "QA Lot Detail", enabled: !!lot && !modalOpen });

  if (loading) return <div className="flex h-[60vh] items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  if (!lot) {
    return (
      <div className="p-6 md:p-8 max-w-7xl mx-auto">
        <EmptyState icon={FlaskConical} title="Lot not found" description="This QA lot may have been voided or doesn't exist." primaryAction={<Button onClick={() => navigate("/inventory/qa")}>← Back to QA</Button>} />
      </div>
    );
  }

  const latest = results[0];

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <PageHeader
        title={lot.lot_number}
        breadcrumbs={[
          { label: "Inventory" },
          { label: "QA & Lab Testing", to: "/inventory/qa" },
          { label: lot.lot_number },
        ]}
        actions={
          <div className="flex items-center gap-2">
            {lot.status && <StatusPill label={lot.status.replace(/_/g, " ")} variant={LOT_STATUS_VARIANT[lot.status] ?? "muted"} />}
            <Button onClick={() => setSampleOpen(true)} className="gap-1.5" disabled={lot.status === "voided"}>
              <Beaker className="w-3.5 h-3.5" /> Pull Sample
            </Button>
            <Button variant="outline" onClick={() => setResultOpen(true)} className="gap-1.5" disabled={lot.status === "voided"}>
              <ClipboardCheck className="w-3.5 h-3.5" /> Add Result
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="outline" size="icon" className="w-9 h-9"><MoreHorizontal className="w-4 h-4" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={async () => { try { await voidLot(lot.id); toast.success("Lot voided"); refresh(); } catch (err: any) { toast.error(err?.message ?? "Failed"); } }} className="text-destructive">
                  <Archive className="w-3.5 h-3.5" /> Void Lot
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      <div className="flex items-center gap-2 text-[12px] text-muted-foreground mb-6 -mt-4 flex-wrap">
        {lot.batch && (
          <button onClick={() => navigate(`/inventory/batches/${lot.batch!.id}`)} className="inline-flex items-center gap-1.5 text-primary hover:underline font-mono">
            <Package className="w-3 h-3" /> {lot.batch.barcode}
          </button>
        )}
        {lot.product && <><span>·</span><span>{lot.product.name}</span></>}
        {lot.strain && <><span>·</span><span>{lot.strain.name}</span></>}
        {lot.created_at && <><span>·</span><span>Created <DateTime value={lot.created_at} format="date-only" /></span></>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <InfoCard icon={FlaskConical} label="Status">
          {lot.status ? <StatusPill label={lot.status.replace(/_/g, " ")} variant={LOT_STATUS_VARIANT[lot.status] ?? "muted"} /> : <span className="text-[13px] text-muted-foreground">—</span>}
        </InfoCard>
        <InfoCard icon={Package} label="Batch">
          {lot.batch
            ? <button onClick={() => navigate(`/inventory/batches/${lot.batch!.id}`)} className="text-[13px] font-mono font-semibold text-primary hover:underline text-left truncate block max-w-full">{lot.batch.barcode}</button>
            : <span className="text-[13px] text-muted-foreground">—</span>}
          <CopyableId value={lot.external_id} className="text-[10px] mt-1" truncate={6} />
        </InfoCard>
        <InfoCard icon={Scale} label="Weight">
          <div className="text-[18px] font-bold font-mono tabular-nums">{lot.lot_weight_grams != null ? Number(lot.lot_weight_grams).toFixed(0) : "—"}<span className="text-[11px] text-muted-foreground">g</span></div>
        </InfoCard>
        <InfoCard icon={Beaker} label="Samples">
          <div className="text-[18px] font-bold font-mono tabular-nums">{samples.length}</div>
          <p className="text-[10px] text-muted-foreground">{results.length} result{results.length === 1 ? "" : "s"}</p>
        </InfoCard>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="samples">Samples ({samples.length})</TabsTrigger>
          <TabsTrigger value="results">Results ({results.length})</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewPanel lot={lot} latest={latest} />
        </TabsContent>
        <TabsContent value="samples">
          <SamplesPanel
            samples={samples}
            loading={samplesLoading}
            onShip={async (id) => { try { await shipSample(id); toast.success("Shipped"); refreshSamples(); refresh(); } catch (err: any) { toast.error(err?.message ?? "Failed"); } }}
            onReceive={async (id) => { try { await receive(id); toast.success("Received"); refreshSamples(); } catch (err: any) { toast.error(err?.message ?? "Failed"); } }}
            onPull={() => setSampleOpen(true)}
          />
        </TabsContent>
        <TabsContent value="results">
          <ResultsPanel results={results} loading={resultsLoading} onAdd={() => setResultOpen(true)} />
        </TabsContent>
        <TabsContent value="activity">
          <div className="rounded-xl border border-border bg-card p-12 text-center">
            <Activity className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-[14px] font-semibold text-foreground mb-1">Audit log coming soon</p>
            <p className="text-[12px] text-muted-foreground">Lot creation, sample pulls, ship/receive, and result submissions will appear here.</p>
          </div>
        </TabsContent>
      </Tabs>

      <CreateSampleModal open={sampleOpen} onClose={() => setSampleOpen(false)} initialLotId={lot.id} onSuccess={() => { refreshSamples(); refresh(); }} />
      <AddResultsModal open={resultOpen} onClose={() => setResultOpen(false)} initialLotId={lot.id} onSuccess={() => { refreshResults(); refresh(); }} />
    </div>
  );
}

// ─── Overview ───────────────────────────────────────────────────────────────
function OverviewPanel({ lot, latest }: { lot: any; latest: QAResult | undefined }) {
  const navigate = useNavigate();
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <Card title="Lot info">
          <Row label="Lot number" value={<span className="font-mono font-semibold">{lot.lot_number}</span>} />
          <Row label="External ID" value={<CopyableId value={lot.external_id} className="text-[11px]" />} />
          <Row label="Status" value={lot.status ? <StatusPill label={lot.status.replace(/_/g, " ")} variant={LOT_STATUS_VARIANT[lot.status] ?? "muted"} /> : "—"} />
          <Row label="Weight" value={lot.lot_weight_grams != null ? <span className="font-mono">{Number(lot.lot_weight_grams).toFixed(1)}g</span> : "—"} />
          <Row label="Batch" value={lot.batch ? <button onClick={() => navigate(`/inventory/batches/${lot.batch.id}`)} className="font-mono text-primary hover:underline">{lot.batch.barcode}</button> : "—"} />
          <Row label="Product" value={lot.product?.name ?? "—"} />
          <Row label="Strain" value={lot.strain?.name ?? "—"} />
          <Row label="Created" value={lot.created_at ? <DateTime value={lot.created_at} /> : "—"} />
          <Row label="Notes" value={lot.notes ?? <span className="text-muted-foreground italic">None</span>} />
        </Card>

        {latest && (
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-4">Latest potency</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <PotencyStat label="THC Total" value={latest.thc_total_pct} color="text-emerald-500" />
              <PotencyStat label="CBD Total" value={latest.cbd_total_pct} color="text-blue-500" />
              <PotencyStat label="Total Terpenes" value={latest.total_terpenes_pct} color="text-purple-500" />
              <PotencyStat label="Moisture" value={latest.moisture_pct} color="text-cyan-500" />
            </div>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Notes</h3>
          {lot.status === "passed" && <p className="text-[12px]">This lot passed all contaminant tests — the batch can be made available.</p>}
          {lot.status === "failed" && <p className="text-[12px] text-destructive">Failed — review results and consider retest or destruction.</p>}
          {lot.status === "in_testing" && <p className="text-[12px]">Samples are at the lab. Results will appear here when received.</p>}
          {lot.status === "created" && <p className="text-[12px]">Pull a sample and ship it to a certified lab to begin testing.</p>}
          {lot.status === "sampled" && <p className="text-[12px]">Sample pulled — ship it to the lab to begin testing.</p>}
        </div>
      </div>
    </div>
  );
}

function PotencyStat({ label, value, color }: { label: string; value: number | null | undefined; color: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className={cn("text-[22px] font-bold font-mono tabular-nums", value != null ? color : "text-muted-foreground")}>
        {value != null ? `${Number(value).toFixed(2)}%` : "—"}
      </div>
    </div>
  );
}

// ─── Samples ────────────────────────────────────────────────────────────────
function SamplesPanel({ samples, loading, onShip, onReceive, onPull }: {
  samples: QASample[]; loading: boolean; onShip: (id: string) => void; onReceive: (id: string) => void; onPull: () => void;
}) {
  const columns: ColumnDef<QASample>[] = useMemo(() => [
    { id: "id", header: "Sample", cell: ({ row }) => <span className="font-mono text-[11px]">{row.original.id.slice(0, 8)}</span> },
    { accessorKey: "lab_name", header: "Lab", cell: ({ row }) => row.original.lab_name ?? <span className="text-muted-foreground">—</span> },
    { accessorKey: "sample_weight_grams", header: "Weight", cell: ({ row }) => <span className="font-mono text-[12px]">{Number(row.original.sample_weight_grams).toFixed(2)}g</span> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => row.original.status ? <StatusPill label={row.original.status.replace(/_/g, " ")} variant={SAMPLE_STATUS_VARIANT[row.original.status] ?? "muted"} /> : <span className="text-muted-foreground">—</span> },
    { id: "timeline", header: "Timeline", cell: ({ row }) => (
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <Dot done />
        <span className="w-2 border-t border-border" />
        <Dot done={!!row.original.sent_at} />
        <span className="w-2 border-t border-border" />
        <Dot done={!!row.original.received_at_lab_at} />
        <span className="w-2 border-t border-border" />
        <Dot done={!!row.original.completed_at} />
      </div>
    ) },
    { accessorKey: "created_at", header: "Created", cell: ({ row }) => row.original.created_at ? <DateTime value={row.original.created_at} format="date-only" className="text-[12px]" /> : "—" },
    {
      id: "actions", enableSorting: false, header: "",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          {!row.original.sent_at && <Button size="sm" variant="outline" onClick={() => onShip(row.original.id)} className="h-7 px-2 text-[11px] gap-1"><Send className="w-3 h-3" /> Ship</Button>}
          {row.original.sent_at && !row.original.received_at_lab_at && <Button size="sm" variant="outline" onClick={() => onReceive(row.original.id)} className="h-7 px-2 text-[11px] gap-1"><Truck className="w-3 h-3" /> Received</Button>}
        </div>
      ),
    },
  ], [onShip, onReceive]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-semibold">Samples</h3>
        <Button size="sm" onClick={onPull} className="gap-1.5"><Plus className="w-3.5 h-3.5" /> Pull Sample</Button>
      </div>
      <DataTable
        columns={columns}
        data={samples}
        loading={loading}
        empty={{
          icon: Beaker,
          title: "No samples",
          description: "Pull a sample to send to the lab.",
          action: <Button onClick={onPull} className="gap-1.5"><Plus className="w-3.5 h-3.5" /> Pull Sample</Button>,
        }}
      />
    </div>
  );
}

function Dot({ done }: { done?: boolean }) {
  return <span className={cn("w-2 h-2 rounded-full", done ? "bg-emerald-500" : "bg-muted-foreground/30")} />;
}

// ─── Results ────────────────────────────────────────────────────────────────
function ResultsPanel({ results, loading, onAdd }: { results: QAResult[]; loading: boolean; onAdd: () => void }) {
  const first = results[0];
  const contaminants = first ? [
    ["Pesticides", first.pesticides_pass],
    ["Heavy Metals", first.heavy_metals_pass],
    ["Microbials", first.microbials_pass],
    ["Mycotoxins", first.mycotoxins_pass],
    ["Residual Solvents", first.residual_solvents_pass],
    ["Foreign Matter", first.foreign_matter_pass],
  ] as const : [];

  const columns: ColumnDef<QAResult>[] = useMemo(() => [
    { accessorKey: "test_date", header: "Date", cell: ({ row }) => <DateTime value={row.original.test_date} format="date-only" className="text-[12px]" /> },
    { accessorKey: "lab_name", header: "Lab", cell: ({ row }) => row.original.lab_name ?? <span className="text-muted-foreground">—</span> },
    { accessorKey: "thc_total_pct", header: "THC", cell: ({ row }) => row.original.thc_total_pct != null ? <span className="font-mono text-[12px] font-semibold text-emerald-500">{Number(row.original.thc_total_pct).toFixed(2)}%</span> : "—" },
    { accessorKey: "cbd_total_pct", header: "CBD", cell: ({ row }) => row.original.cbd_total_pct != null ? <span className="font-mono text-[12px] font-semibold text-blue-500">{Number(row.original.cbd_total_pct).toFixed(2)}%</span> : "—" },
    { accessorKey: "total_terpenes_pct", header: "Terps", cell: ({ row }) => row.original.total_terpenes_pct != null ? <span className="font-mono text-[12px] font-semibold text-purple-500">{Number(row.original.total_terpenes_pct).toFixed(2)}%</span> : "—" },
    { accessorKey: "lab_test_status", header: "CCRS", cell: ({ row }) => row.original.lab_test_status ?? "—" },
    { accessorKey: "overall_pass", header: "Overall", cell: ({ row }) => row.original.overall_pass === true ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : row.original.overall_pass === false ? <XCircle className="w-4 h-4 text-destructive" /> : <span className="text-muted-foreground">—</span> },
    { id: "coa", header: "COA", cell: ({ row }) => (row.original.coa_urls?.length ?? 0) > 0 ? <a href={row.original.coa_urls![0]} target="_blank" rel="noreferrer" className="text-primary hover:underline text-[11px]"><FileText className="w-3.5 h-3.5 inline" /></a> : "—" },
  ], []);

  return (
    <div className="space-y-4">
      {first && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-4">Potency summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <PotencyStat label="THC Total" value={first.thc_total_pct} color="text-emerald-500" />
            <PotencyStat label="CBD Total" value={first.cbd_total_pct} color="text-blue-500" />
            <PotencyStat label="Total Terpenes" value={first.total_terpenes_pct} color="text-purple-500" />
            <PotencyStat label="Moisture" value={first.moisture_pct} color="text-cyan-500" />
          </div>
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Contaminant panel</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {contaminants.map(([label, v]) => (
              <div key={label} className={cn("flex items-center justify-between rounded-md border px-3 py-2",
                v === true ? "border-emerald-500/30 bg-emerald-500/5" : v === false ? "border-destructive/30 bg-destructive/5" : "border-border bg-muted/20")}>
                <span className="text-[12px] font-medium">{label}</span>
                <span className={cn("text-[10px] font-bold uppercase tracking-wider",
                  v === true ? "text-emerald-500" : v === false ? "text-destructive" : "text-muted-foreground")}>
                  {v === true ? "Pass" : v === false ? "Fail" : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-semibold">All test results</h3>
        <Button size="sm" onClick={onAdd} className="gap-1.5"><Plus className="w-3.5 h-3.5" /> Add Result</Button>
      </div>
      <DataTable
        columns={columns}
        data={results}
        loading={loading}
        empty={{
          icon: ClipboardCheck,
          title: "No results yet",
          description: "Add results manually or import from WCIA JSON.",
          action: <Button onClick={onAdd} className="gap-1.5"><Plus className="w-3.5 h-3.5" /> Add Result</Button>,
        }}
      />
    </div>
  );
}

// ─── primitives ─────────────────────────────────────────────────────────────
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
      <div className="px-5 py-3 border-b border-border bg-muted/30">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      </div>
      <dl className="divide-y divide-border/50">{children}</dl>
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

void Building;
