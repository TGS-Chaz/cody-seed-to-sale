import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  FlaskConical, Plus, Eye, MoreHorizontal, Clock, CheckCircle, XCircle, Beaker, Send,
  Building, ClipboardCheck, Leaf, Percent, FileText, Upload, Archive, Truck,
} from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import PageHeader from "@/components/shared/PageHeader";
import StatCard from "@/components/shared/StatCard";
import DataTable, { RowActionsCell } from "@/components/shared/DataTable";
import FiltersBar from "@/components/shared/FiltersBar";
import StatusPill from "@/components/shared/StatusPill";
import DateTime from "@/components/shared/DateTime";
import CopyableId from "@/components/shared/CopyableId";
import { useShortcut } from "@/components/shared/KeyboardShortcuts";
import { useCodyContext } from "@/hooks/useCodyContext";
import {
  useQALots, useQASamples, useQAResults, useQALotStats, useQASampleStats, useQAResultStats,
  useShipSample, useReceiveAtLab, useVoidQALot, useVoidQASample,
  QALot, QASample, QAResult,
} from "@/hooks/useQA";
import { QaResultLabTestStatus } from "@/lib/schema-enums";
import { CreateQALotModal, CreateSampleModal, AddResultsModal, ImportJSONModal } from "./QAModals";
import { cn } from "@/lib/utils";

const LOT_STATUS_VARIANT: Record<string, "success" | "warning" | "critical" | "info" | "muted"> = {
  created: "info",
  sampled: "info",
  in_testing: "warning",
  passed: "success",
  failed: "critical",
  voided: "muted",
};

const SAMPLE_STATUS_VARIANT: Record<string, "success" | "warning" | "critical" | "info" | "muted"> = {
  created: "info",
  shipped: "warning",
  received_at_lab: "warning",
  testing: "warning",
  complete: "success",
  voided: "muted",
};

const CCRS_STATUS_VARIANT: Record<QaResultLabTestStatus, "success" | "warning" | "critical" | "info" | "muted"> = {
  Required: "info",
  NotRequired: "muted",
  Pass: "success",
  Fail: "critical",
  FailExtractableOnly: "warning",
  FailRetestAllowed: "warning",
  FailRetestAllowedExtractableOnly: "warning",
  InProcess: "info",
  SampleCreated: "info",
};

export default function QAPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") ?? "lots";
  const setTab = (t: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", t);
    setSearchParams(next, { replace: true });
  };

  const { data: lots, loading: lotsLoading, refresh: refreshLots } = useQALots();
  const { data: samples, loading: samplesLoading, refresh: refreshSamples } = useQASamples();
  const { data: results, loading: resultsLoading, refresh: refreshResults } = useQAResults();
  const lotStats = useQALotStats(lots);
  const sampleStats = useQASampleStats(samples);
  const resultStats = useQAResultStats(results);
  const shipSample = useShipSample();
  const receive = useReceiveAtLab();
  const voidLot = useVoidQALot();
  const voidSample = useVoidQASample();

  const [createLotOpen, setCreateLotOpen] = useState(false);
  const [createSampleOpen, setCreateSampleOpen] = useState(false);
  const [addResultsOpen, setAddResultsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [search, setSearch] = useState("");

  const modalOpen = createLotOpen || createSampleOpen || addResultsOpen || importOpen;

  useShortcut(["n"], () => {
    if (tab === "lots") setCreateLotOpen(true);
    else if (tab === "samples") setCreateSampleOpen(true);
    else if (tab === "results") setAddResultsOpen(true);
  }, { description: "New entry", scope: "QA", enabled: !modalOpen });
  useShortcut(["/"], () => document.querySelector<HTMLInputElement>("[data-filters-search]")?.focus(), { description: "Focus search", scope: "QA" });
  useShortcut(["i"], () => setImportOpen(true), { description: "Import JSON", scope: "QA", enabled: tab === "results" && !modalOpen });

  const { setContext, clearContext } = useCodyContext();
  const payload = useMemo(() => ({
    tab,
    lot_stats: lotStats,
    sample_stats: sampleStats,
    result_stats: resultStats,
    recent_results: results.slice(0, 10).map((r) => ({
      date: r.test_date, lab: r.lab_name, status: r.lab_test_status, pass: r.overall_pass,
      thc: r.thc_total_pct, cbd: r.cbd_total_pct, terpenes: r.total_terpenes_pct,
    })),
  }), [tab, lotStats, sampleStats, resultStats, results]);
  useEffect(() => {
    setContext({ context_type: "qa_list", page_data: payload });
    return () => clearContext();
  }, [setContext, clearContext, payload]);

  // filters
  const filteredLots = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return lots;
    return lots.filter((l) => `${l.lot_number} ${l.batch?.barcode ?? ""} ${l.product?.name ?? ""} ${l.strain?.name ?? ""}`.toLowerCase().includes(q));
  }, [lots, search]);
  const filteredSamples = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return samples;
    return samples.filter((s) => `${s.id} ${s.lab_name ?? ""} ${s.lab_license_number ?? ""} ${s.lot?.lot_number ?? ""}`.toLowerCase().includes(q));
  }, [samples, search]);
  const filteredResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return results;
    return results.filter((r) => `${r.lot?.lot_number ?? ""} ${r.batch?.barcode ?? ""} ${r.product?.name ?? ""} ${r.lab_name ?? ""}`.toLowerCase().includes(q));
  }, [results, search]);

  const lotColumns: ColumnDef<QALot>[] = useMemo(() => [
    { accessorKey: "lot_number", header: "Lot #", cell: ({ row }) => <button onClick={() => navigate(`/inventory/qa/${row.original.id}`)} className="font-mono text-[12px] font-semibold text-primary hover:underline">{row.original.lot_number}</button> },
    { id: "external", header: "External", cell: ({ row }) => <CopyableId value={row.original.external_id} className="text-[11px]" truncate={5} /> },
    { id: "batch", header: "Batch", cell: ({ row }) => row.original.batch
      ? <button onClick={(e) => { e.stopPropagation(); navigate(`/inventory/batches/${row.original.batch!.id}`); }} className="font-mono text-[12px] text-primary hover:underline">{row.original.batch.barcode}</button>
      : <span className="text-muted-foreground">—</span> },
    { id: "product", header: "Product", cell: ({ row }) => row.original.product ? <span className="text-[12px]">{row.original.product.name}</span> : <span className="text-muted-foreground">—</span> },
    { id: "strain", header: "Strain", cell: ({ row }) => row.original.strain ? <span className="text-[12px]">{row.original.strain.name}</span> : <span className="text-muted-foreground">—</span> },
    { id: "weight", header: "Weight", cell: ({ row }) => row.original.lot_weight_grams != null ? <span className="font-mono text-[12px]">{Number(row.original.lot_weight_grams).toFixed(0)}g</span> : <span className="text-muted-foreground">—</span> },
    { id: "samples", header: "Samples", cell: ({ row }) => <span className="font-mono text-[12px]">{row.original.sample_count ?? 0}</span> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => row.original.status ? <StatusPill label={row.original.status.replace(/_/g, " ")} variant={LOT_STATUS_VARIANT[row.original.status] ?? "muted"} /> : <span className="text-muted-foreground">—</span> },
    { accessorKey: "created_at", header: "Created", cell: ({ row }) => row.original.created_at ? <DateTime value={row.original.created_at} format="date-only" className="text-[12px]" /> : "—" },
    {
      id: "actions", enableSorting: false, header: "",
      cell: ({ row }) => (
        <RowActionsCell>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><button className="p-1 rounded hover:bg-accent"><MoreHorizontal className="w-4 h-4 text-muted-foreground" /></button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigate(`/inventory/qa/${row.original.id}`)}><Eye className="w-3.5 h-3.5" /> View</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCreateSampleOpen(true)}><Beaker className="w-3.5 h-3.5" /> Pull Sample</DropdownMenuItem>
              <DropdownMenuItem onClick={async () => { try { await voidLot(row.original.id); toast.success("Voided"); refreshLots(); } catch (err: any) { toast.error(err?.message ?? "Failed"); } }} className="text-destructive">
                <Archive className="w-3.5 h-3.5" /> Void
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </RowActionsCell>
      ),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [navigate]);

  const sampleColumns: ColumnDef<QASample>[] = useMemo(() => [
    { id: "id", header: "Sample", cell: ({ row }) => <span className="font-mono text-[11px]">{row.original.id.slice(0, 8)}</span> },
    { id: "lot", header: "Lot #", cell: ({ row }) => row.original.lot ? <span className="font-mono text-[12px]">{row.original.lot.lot_number}</span> : <span className="text-muted-foreground">—</span> },
    { accessorKey: "lab_name", header: "Lab", cell: ({ row }) => row.original.lab_name ?? <span className="text-muted-foreground">—</span> },
    { accessorKey: "lab_license_number", header: "License #", cell: ({ row }) => row.original.lab_license_number ? <span className="font-mono text-[11px]">{row.original.lab_license_number}</span> : "—" },
    { accessorKey: "sample_weight_grams", header: "Weight", cell: ({ row }) => <span className="font-mono text-[12px]">{Number(row.original.sample_weight_grams).toFixed(2)}g</span> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => row.original.status ? <StatusPill label={row.original.status.replace(/_/g, " ")} variant={SAMPLE_STATUS_VARIANT[row.original.status] ?? "muted"} /> : <span className="text-muted-foreground">—</span> },
    { accessorKey: "sent_at", header: "Shipped", cell: ({ row }) => row.original.sent_at ? <DateTime value={row.original.sent_at} format="date-only" className="text-[12px]" /> : <span className="text-muted-foreground">—</span> },
    { accessorKey: "received_at_lab_at", header: "Received", cell: ({ row }) => row.original.received_at_lab_at ? <DateTime value={row.original.received_at_lab_at} format="date-only" className="text-[12px]" /> : <span className="text-muted-foreground">—</span> },
    { accessorKey: "completed_at", header: "Completed", cell: ({ row }) => row.original.completed_at ? <DateTime value={row.original.completed_at} format="date-only" className="text-[12px]" /> : <span className="text-muted-foreground">—</span> },
    {
      id: "actions", enableSorting: false, header: "",
      cell: ({ row }) => (
        <RowActionsCell>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><button className="p-1 rounded hover:bg-accent"><MoreHorizontal className="w-4 h-4 text-muted-foreground" /></button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={async () => { try { await shipSample(row.original.id); toast.success("Marked shipped"); refreshSamples(); refreshLots(); } catch (err: any) { toast.error(err?.message ?? "Failed"); } }}>
                <Send className="w-3.5 h-3.5" /> Ship
              </DropdownMenuItem>
              <DropdownMenuItem onClick={async () => { try { await receive(row.original.id); toast.success("Marked received"); refreshSamples(); } catch (err: any) { toast.error(err?.message ?? "Failed"); } }}>
                <Truck className="w-3.5 h-3.5" /> Mark Received
              </DropdownMenuItem>
              <DropdownMenuItem onClick={async () => { try { await voidSample(row.original.id); toast.success("Voided"); refreshSamples(); } catch (err: any) { toast.error(err?.message ?? "Failed"); } }} className="text-destructive">
                <Archive className="w-3.5 h-3.5" /> Void
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </RowActionsCell>
      ),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], []);

  const resultColumns: ColumnDef<QAResult>[] = useMemo(() => [
    { accessorKey: "test_date", header: "Test Date", cell: ({ row }) => <DateTime value={row.original.test_date} format="date-only" className="text-[12px]" /> },
    { id: "lot", header: "Lot #", cell: ({ row }) => row.original.lot ? <button onClick={() => navigate(`/inventory/qa/${row.original.lot!.id}`)} className="font-mono text-[12px] text-primary hover:underline">{row.original.lot.lot_number}</button> : <span className="text-muted-foreground">—</span> },
    { id: "batch", header: "Batch", cell: ({ row }) => row.original.batch ? <button onClick={() => navigate(`/inventory/batches/${row.original.batch!.id}`)} className="font-mono text-[12px] text-primary hover:underline">{row.original.batch.barcode}</button> : <span className="text-muted-foreground">—</span> },
    { id: "product", header: "Product", cell: ({ row }) => row.original.product?.name ?? <span className="text-muted-foreground">—</span> },
    { accessorKey: "lab_name", header: "Lab", cell: ({ row }) => row.original.lab_name ?? <span className="text-muted-foreground">—</span> },
    { accessorKey: "thc_total_pct", header: "THC", cell: ({ row }) => row.original.thc_total_pct != null ? <span className="font-mono text-[12px] font-semibold text-emerald-500">{Number(row.original.thc_total_pct).toFixed(2)}%</span> : <span className="text-muted-foreground">—</span> },
    { accessorKey: "cbd_total_pct", header: "CBD", cell: ({ row }) => row.original.cbd_total_pct != null ? <span className="font-mono text-[12px] font-semibold text-blue-500">{Number(row.original.cbd_total_pct).toFixed(2)}%</span> : <span className="text-muted-foreground">—</span> },
    { accessorKey: "total_terpenes_pct", header: "Terps", cell: ({ row }) => row.original.total_terpenes_pct != null ? <span className="font-mono text-[12px] font-semibold text-purple-500">{Number(row.original.total_terpenes_pct).toFixed(2)}%</span> : <span className="text-muted-foreground">—</span> },
    { accessorKey: "lab_test_status", header: "CCRS", cell: ({ row }) => row.original.lab_test_status ? <StatusPill label={row.original.lab_test_status} variant={CCRS_STATUS_VARIANT[row.original.lab_test_status] ?? "muted"} /> : <span className="text-muted-foreground">—</span> },
    { id: "coa", header: "COA", cell: ({ row }) => (row.original.coa_urls?.length ?? 0) > 0 ? <a href={row.original.coa_urls![0]} target="_blank" rel="noreferrer" className="text-primary hover:underline text-[11px]"><FileText className="w-3.5 h-3.5 inline" /></a> : <span className="text-muted-foreground">—</span> },
    { accessorKey: "source_type", header: "Source", cell: ({ row }) => {
      const s = row.original.source_type ?? "manual";
      const label = s === "wcia_json" ? "WCIA JSON" : s === "api" ? "API" : "Manual";
      return <span className="inline-flex items-center h-5 px-2 rounded-full text-[10px] font-medium bg-muted text-muted-foreground uppercase tracking-wider">{label}</span>;
    } },
  ], [navigate]);

  return (
    <div className="p-6 md:p-8 max-w-[1700px] mx-auto">
      <PageHeader
        title="QA & Lab Testing"
        description="Track lab testing from sample to COA"
        breadcrumbs={[{ label: "Inventory" }, { label: "QA & Lab Testing" }]}
        actions={
          <div className="flex items-center gap-2">
            {tab === "results" && (
              <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-1.5">
                <Upload className="w-3.5 h-3.5" /> Import from JSON
              </Button>
            )}
            <Button
              onClick={() => {
                if (tab === "lots") setCreateLotOpen(true);
                else if (tab === "samples") setCreateSampleOpen(true);
                else setAddResultsOpen(true);
              }}
              className="gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              {tab === "lots" ? "Create QA Lot" : tab === "samples" ? "Pull Sample" : "Add Results"}
            </Button>
          </div>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="lots">QA Lots ({lots.length})</TabsTrigger>
          <TabsTrigger value="samples">Samples ({samples.length})</TabsTrigger>
          <TabsTrigger value="results">Results ({results.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="lots">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard label="Total Lots" value={lotStats.total} accentClass="stat-accent-blue" />
            <StatCard label="In Testing" value={lotStats.in_testing + lotStats.sampled} accentClass="stat-accent-amber" delay={0.05} />
            <StatCard label="Passed" value={lotStats.passed} accentClass="stat-accent-emerald" delay={0.1} />
            <StatCard label="Failed" value={lotStats.failed} accentClass="stat-accent-blue" delay={0.15} />
          </div>
          <FiltersBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search lot #, batch barcode, product…"
          />
          <DataTable
            columns={lotColumns}
            data={filteredLots}
            loading={lotsLoading}
            empty={{
              icon: FlaskConical,
              title: lots.length === 0 ? "No QA lots yet" : "No matches",
              description: lots.length === 0 ? "Create a QA lot from a batch to begin lab testing." : "Clear filters or adjust the search.",
              action: lots.length === 0 ? <Button onClick={() => setCreateLotOpen(true)} className="gap-1.5"><Plus className="w-3.5 h-3.5" /> Create QA Lot</Button> : undefined,
            }}
          />
        </TabsContent>

        <TabsContent value="samples">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard label="Total Samples" value={sampleStats.total} accentClass="stat-accent-blue" />
            <StatCard label="Shipped to Lab" value={sampleStats.shipped} accentClass="stat-accent-amber" delay={0.05} />
            <StatCard label="At Lab" value={sampleStats.at_lab} accentClass="stat-accent-teal" delay={0.1} />
            <StatCard label="Complete" value={sampleStats.complete} accentClass="stat-accent-emerald" delay={0.15} />
          </div>
          <FiltersBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search sample, lab name, license, lot…"
          />
          <DataTable
            columns={sampleColumns}
            data={filteredSamples}
            loading={samplesLoading}
            empty={{
              icon: Beaker,
              title: samples.length === 0 ? "No samples yet" : "No matches",
              description: samples.length === 0 ? "Pull a sample from a QA lot to ship to a lab." : "Clear filters or adjust the search.",
              action: samples.length === 0 ? <Button onClick={() => setCreateSampleOpen(true)} className="gap-1.5"><Plus className="w-3.5 h-3.5" /> Pull Sample</Button> : undefined,
            }}
          />
        </TabsContent>

        <TabsContent value="results">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <StatCard label="Total Results" value={resultStats.total} accentClass="stat-accent-blue" />
            <StatCard label="Pass" value={resultStats.pass} accentClass="stat-accent-emerald" delay={0.05} />
            <StatCard label="Fail" value={resultStats.fail} accentClass="stat-accent-amber" delay={0.1} />
            <StatCard label="Avg THC" value={resultStats.avg_thc != null ? `${resultStats.avg_thc.toFixed(1)}%` : "—"} accentClass="stat-accent-teal" delay={0.15} />
            <StatCard label="Avg Terpenes" value={resultStats.avg_terpenes != null ? `${resultStats.avg_terpenes.toFixed(2)}%` : "—"} accentClass="stat-accent-teal" delay={0.2} />
          </div>
          <FiltersBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search lot, batch, product, lab…"
          />
          <DataTable
            columns={resultColumns}
            data={filteredResults}
            loading={resultsLoading}
            empty={{
              icon: ClipboardCheck,
              title: results.length === 0 ? "No lab results yet" : "No matches",
              description: results.length === 0 ? "Add results manually or import a WCIA JSON file." : "Clear filters or adjust the search.",
              action: results.length === 0 ? (
                <div className="flex items-center gap-2">
                  <Button onClick={() => setAddResultsOpen(true)} className="gap-1.5"><Plus className="w-3.5 h-3.5" /> Add Results</Button>
                  <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-1.5"><Upload className="w-3.5 h-3.5" /> Import JSON</Button>
                </div>
              ) : undefined,
            }}
          />
        </TabsContent>
      </Tabs>

      <CreateQALotModal open={createLotOpen} onClose={() => setCreateLotOpen(false)} onSuccess={() => refreshLots()} />
      <CreateSampleModal open={createSampleOpen} onClose={() => setCreateSampleOpen(false)} onSuccess={() => { refreshSamples(); refreshLots(); }} />
      <AddResultsModal open={addResultsOpen} onClose={() => setAddResultsOpen(false)} onSuccess={() => { refreshResults(); refreshLots(); refreshSamples(); }} />
      <ImportJSONModal open={importOpen} onClose={() => setImportOpen(false)} onSuccess={() => { refreshResults(); refreshLots(); }} />
    </div>
  );
}

void Clock; void CheckCircle; void XCircle; void Building; void Leaf; void Percent;
void cn;
