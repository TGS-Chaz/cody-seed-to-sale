import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trash2, Leaf, Package, Scale, CheckCircle, CloudUpload, AlertTriangle, Recycle, MoreHorizontal } from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import PageHeader from "@/components/shared/PageHeader";
import StatCard from "@/components/shared/StatCard";
import DataTable, { RowActionsCell } from "@/components/shared/DataTable";
import FiltersBar from "@/components/shared/FiltersBar";
import DateTime from "@/components/shared/DateTime";
import { useCodyContext } from "@/hooks/useCodyContext";
import { useDisposals, useDisposalStats, Disposal } from "@/hooks/useDisposals";
import { ConvertWasteModal } from "./ConvertWasteModal";

export default function DisposalsPage() {
  const navigate = useNavigate();
  const { data: disposals, loading, refresh } = useDisposals();
  const stats = useDisposalStats(disposals);
  const [search, setSearch] = useState("");
  const [convertDisposal, setConvertDisposal] = useState<Disposal | null>(null);

  const { setContext, clearContext } = useCodyContext();
  useEffect(() => {
    setContext({ context_type: "disposals_list", page_data: { stats } });
    return () => clearContext();
  }, [setContext, clearContext, stats]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return disposals;
    return disposals.filter((d) => `${d.external_id} ${d.reason} ${d.batch?.barcode ?? ""}`.toLowerCase().includes(q));
  }, [disposals, search]);

  const columns: ColumnDef<Disposal>[] = useMemo(() => [
    { accessorKey: "created_at", header: "Date", cell: ({ row }) => row.original.created_at ? <DateTime value={row.original.created_at} format="date-only" className="text-[12px]" /> : "—" },
    {
      id: "type", header: "Type",
      cell: ({ row }) => row.original.disposal_type === "plant"
        ? <span className="inline-flex items-center gap-1 h-5 px-2 rounded-full text-[10px] font-medium bg-green-500/15 text-green-500 uppercase tracking-wider"><Leaf className="w-3 h-3" />Plant</span>
        : <span className="inline-flex items-center gap-1 h-5 px-2 rounded-full text-[10px] font-medium bg-amber-500/15 text-amber-500 uppercase tracking-wider"><Package className="w-3 h-3" />Inventory</span>,
    },
    {
      id: "entity", header: "Entity",
      cell: ({ row }) => {
        if (row.original.disposal_type === "plant") {
          const count = row.original.plant_ids?.length ?? 0;
          return <span className="text-[12px]">{count} plant{count === 1 ? "" : "s"}</span>;
        }
        return row.original.batch
          ? <button onClick={() => navigate(`/inventory/batches/${row.original.batch!.id}`)} className="font-mono text-[12px] text-primary hover:underline">{row.original.batch.barcode}</button>
          : <span className="text-muted-foreground">—</span>;
      },
    },
    {
      accessorKey: "ccrs_destruction_reason", header: "Reason",
      cell: ({ row }) => <span className="inline-flex items-center h-5 px-2 rounded-full text-[10px] font-medium bg-muted text-muted-foreground uppercase tracking-wider">{row.original.ccrs_destruction_reason ?? row.original.reason}</span>,
    },
    { accessorKey: "ccrs_destruction_method", header: "Method", cell: ({ row }) => <span className="text-[12px]">{row.original.ccrs_destruction_method ?? row.original.destruction_method ?? "—"}</span> },
    { accessorKey: "pre_disposal_weight_grams", header: "Weight", cell: ({ row }) => <span className="font-mono text-[12px]">{Number(row.original.pre_disposal_weight_grams ?? 0).toFixed(0)}g</span> },
    {
      id: "quarantine", header: "Quarantine",
      cell: ({ row }) => {
        if (!row.original.quarantine_ends_at) return <span className="text-muted-foreground">—</span>;
        const ends = new Date(row.original.quarantine_ends_at).getTime();
        const now = Date.now();
        const daysLeft = Math.ceil((ends - now) / 86400000);
        if (daysLeft <= 0) return <span className="text-[11px] text-emerald-500 font-semibold">Complete</span>;
        return <span className="text-[11px] text-amber-500">{daysLeft} day{daysLeft === 1 ? "" : "s"} left</span>;
      },
    },
    {
      accessorKey: "ccrs_reported", header: "CCRS",
      cell: ({ row }) => row.original.ccrs_reported
        ? <CloudUpload className="w-3.5 h-3.5 text-emerald-500" aria-label="Reported" />
        : <AlertTriangle className="w-3.5 h-3.5 text-muted-foreground/40" aria-label="Pending" />,
    },
    { accessorKey: "notes", header: "Notes", cell: ({ row }) => row.original.notes ? <span className="text-[11px] text-muted-foreground truncate max-w-[280px] inline-block">{row.original.notes}</span> : <span className="text-muted-foreground">—</span> },
    {
      id: "actions", enableSorting: false, header: "",
      cell: ({ row }) => (
        <RowActionsCell>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><button className="p-1 rounded hover:bg-accent"><MoreHorizontal className="w-4 h-4 text-muted-foreground" /></button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setConvertDisposal(row.original)}><Recycle className="w-3.5 h-3.5" /> Convert to Sellable Waste</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </RowActionsCell>
      ),
    },
  ], [navigate]);

  return (
    <div className="p-6 md:p-8 max-w-[1700px] mx-auto">
      <PageHeader
        title="Disposals"
        description="Plant destructions and inventory disposals for compliance"
        breadcrumbs={[{ label: "Compliance" }, { label: "Disposals" }]}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Disposals" value={stats.total} accentClass="stat-accent-blue" />
        <StatCard label="Plants Destroyed" value={stats.plantCount} accentClass="stat-accent-amber" delay={0.05} />
        <StatCard label="Inventory Destroyed" value={stats.inventoryCount} accentClass="stat-accent-amber" delay={0.1} />
        <StatCard label="Total Weight" value={`${(stats.totalWeight / 1000).toFixed(1)}kg`} accentClass="stat-accent-blue" delay={0.15} />
      </div>

      <FiltersBar
        searchValue={search} onSearchChange={setSearch} searchPlaceholder="Search ID, reason, batch…"
        pageKey="disposals"
        currentFilters={{ search }}
        onApplyView={(f) => setSearch(f.search ?? "")}
      />

      <DataTable
        columns={columns} data={filtered} loading={loading}
        empty={{
          icon: Trash2,
          title: disposals.length === 0 ? "No disposals yet" : "No matches",
          description: disposals.length === 0 ? "Plant destructions and inventory disposals will appear here for compliance reporting." : "Clear search or adjust filters.",
        }}
      />

      <ConvertWasteModal open={!!convertDisposal} onClose={() => setConvertDisposal(null)} disposal={convertDisposal} onSuccess={() => { refresh(); }} />
    </div>
  );
}

void Scale; void CheckCircle; void Button;
