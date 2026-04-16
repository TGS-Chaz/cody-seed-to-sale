import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import * as Icons from "lucide-react";
import {
  Tag, StickyNote, DollarSign, Percent,
  Plus, MoreHorizontal, Edit, Trash2, Star, ArrowUp, ArrowDown,
  Check,
} from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import PageHeader from "@/components/shared/PageHeader";
import StatCard from "@/components/shared/StatCard";
import DataTable, { RowActionsCell } from "@/components/shared/DataTable";
import FiltersBar from "@/components/shared/FiltersBar";
import StatusPill from "@/components/shared/StatusPill";
import DateTime from "@/components/shared/DateTime";
import { useShortcut } from "@/components/shared/KeyboardShortcuts";
import { useCodyContext } from "@/hooks/useCodyContext";
import {
  useAccountStatuses,
  useAccountStatusStats,
  AccountStatus,
  AccountStatusInput,
} from "@/hooks/useAccountStatuses";
import {
  useNoteAttributes,
  useNoteAttributeStats,
  NoteAttribute,
  NoteAttributeInput,
} from "@/hooks/useNoteAttributes";
import {
  usePriceLists,
  usePriceListStats,
  PriceList,
  PriceListInput,
} from "@/hooks/usePriceLists";
import {
  useDiscounts,
  useDiscountStats,
  Discount,
  DiscountInput,
} from "@/hooks/useDiscounts";
import AccountStatusFormModal from "./AccountStatusFormModal";
import NoteAttributeFormModal from "./NoteAttributeFormModal";
import PriceListFormModal from "./PriceListFormModal";
import DiscountFormModal from "./DiscountFormModal";

type TabKey = "statuses" | "note-attributes" | "price-lists" | "discounts";

export default function CustomerSetupPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = ((searchParams.get("tab") as TabKey) ?? "statuses");
  const setActiveTab = (t: TabKey) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", t);
    setSearchParams(next, { replace: true });
  };

  useShortcut(["1"], () => setActiveTab("statuses"), { description: "Switch to Account Statuses", scope: "Customer Setup" });
  useShortcut(["2"], () => setActiveTab("note-attributes"), { description: "Switch to Note Attributes", scope: "Customer Setup" });
  useShortcut(["3"], () => setActiveTab("price-lists"), { description: "Switch to Price Lists", scope: "Customer Setup" });
  useShortcut(["4"], () => setActiveTab("discounts"), { description: "Switch to Discounts", scope: "Customer Setup" });

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <PageHeader
        title="Customer Setup"
        description="Configure account statuses, note types, pricing tiers, and discounts"
        breadcrumbs={[{ label: "Settings", to: "/settings" }, { label: "Customer Setup" }]}
      />
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)} className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="statuses">Account Statuses</TabsTrigger>
          <TabsTrigger value="note-attributes">Note Attributes</TabsTrigger>
          <TabsTrigger value="price-lists">Price Lists</TabsTrigger>
          <TabsTrigger value="discounts">Discounts</TabsTrigger>
        </TabsList>
        <TabsContent value="statuses"><StatusesTab active={activeTab === "statuses"} /></TabsContent>
        <TabsContent value="note-attributes"><NoteAttributesTab active={activeTab === "note-attributes"} /></TabsContent>
        <TabsContent value="price-lists"><PriceListsTab active={activeTab === "price-lists"} /></TabsContent>
        <TabsContent value="discounts"><DiscountsTab active={activeTab === "discounts"} /></TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Tab 1: Account Statuses ──────────────────────────────────────────────────

function StatusesTab({ active }: { active: boolean }) {
  const { data, loading, createStatus, updateStatus, deleteStatus, reorderStatuses, setDefault } = useAccountStatuses();
  const stats = useAccountStatusStats(data);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AccountStatus | null>(null);
  const [searchValue, setSearchValue] = useState("");
  const { setContext, clearContext } = useCodyContext();

  const signature = useMemo(() => data.map((s) => `${s.id}:${s.sort_order}:${s.is_default ? 1 : 0}`).join(","), [data]);
  const payload = useMemo(() => ({
    counts: stats,
    statuses: data.map((s) => ({ name: s.name, color: s.color, is_default: s.is_default, is_active: s.is_active })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [signature, stats.total, stats.active, stats.hasDefault]);

  useEffect(() => {
    if (!active) return;
    setContext({ context_type: "account_statuses_list", page_data: payload });
    return () => clearContext();
  }, [active, setContext, clearContext, payload]);

  useShortcut(["n"], () => { setEditing(null); setModalOpen(true); }, { description: "Add status", scope: "Account Statuses", enabled: active && !modalOpen });

  const filtered = useMemo(() => {
    const q = searchValue.trim().toLowerCase();
    if (!q) return data;
    return data.filter((s) => s.name.toLowerCase().includes(q));
  }, [data, searchValue]);

  const move = async (id: string, dir: -1 | 1) => {
    const idx = data.findIndex((s) => s.id === id);
    if (idx === -1) return;
    const target = idx + dir;
    if (target < 0 || target >= data.length) return;
    const next = [...data];
    const [item] = next.splice(idx, 1);
    next.splice(target, 0, item);
    await reorderStatuses(next.map((s) => s.id));
  };

  const handleSave = async (input: AccountStatusInput) => {
    if (editing) await updateStatus(editing.id, input);
    else await createStatus(input);
  };

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <StatCard label="Total Statuses" value={stats.total} accentClass="stat-accent-blue" />
        <StatCard label="Active" value={stats.active} accentClass="stat-accent-emerald" delay={0.05} />
        <StatCard label="Default Set" value={stats.hasDefault ? 1 : 0} accentClass={stats.hasDefault ? "stat-accent-emerald" : "stat-accent-amber"} delay={0.1} />
      </div>

      <FiltersBar
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        searchPlaceholder="Search statuses…"
        actions={
          <Button onClick={() => { setEditing(null); setModalOpen(true); }} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Add Status
          </Button>
        }
      />

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-[13px] text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Tag className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-[14px] font-semibold text-foreground mb-1">No statuses yet</p>
            <p className="text-[12px] text-muted-foreground mb-4">Statuses tag accounts (active, prospect, on-hold, etc).</p>
            <Button onClick={() => { setEditing(null); setModalOpen(true); }} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Add First Status
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((s, i) => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-3 hover:bg-accent/40 group">
                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => move(s.id, -1)}
                    disabled={i === 0}
                    className="p-0.5 rounded hover:bg-accent disabled:opacity-30 disabled:hover:bg-transparent"
                    aria-label="Move up"
                  >
                    <ArrowUp className="w-3 h-3 text-muted-foreground" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(s.id, 1)}
                    disabled={i === filtered.length - 1}
                    className="p-0.5 rounded hover:bg-accent disabled:opacity-30 disabled:hover:bg-transparent"
                    aria-label="Move down"
                  >
                    <ArrowDown className="w-3 h-3 text-muted-foreground" />
                  </button>
                </div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium" style={{ background: `${s.color}20`, color: s.color ?? undefined }}>
                  <span className="w-2 h-2 rounded-full" style={{ background: s.color ?? "#6B7280" }} />
                  {s.name}
                </div>
                <div className="flex-1 flex items-center gap-2">
                  {s.is_default && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 uppercase tracking-wider">
                      <Star className="w-2.5 h-2.5" /> Default
                    </span>
                  )}
                  {!s.is_active && <StatusPill label="Inactive" variant="muted" />}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="p-1 rounded hover:bg-accent opacity-0 group-hover:opacity-100 transition-opacity"><MoreHorizontal className="w-4 h-4 text-muted-foreground" /></button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => { setEditing(s); setModalOpen(true); }}>
                      <Edit className="w-3.5 h-3.5" /> Edit
                    </DropdownMenuItem>
                    {!s.is_default && (
                      <DropdownMenuItem onClick={() => setDefault(s.id)}>
                        <Star className="w-3.5 h-3.5" /> Set as default
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={async () => { if (confirm(`Delete "${s.name}"? Accounts using this status won't be affected.`)) await deleteStatus(s.id); }}
                      className="text-destructive"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        )}
      </div>

      <AccountStatusFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        editing={editing}
        onSave={handleSave}
      />
    </div>
  );
}

// ─── Tab 2: Note Attributes ───────────────────────────────────────────────────

function renderLucide(name: string | null | undefined, className: string) {
  const Ic = (Icons as any)[name ?? "FileText"] ?? Icons.FileText;
  return <Ic className={className} />;
}

function NoteAttributesTab({ active }: { active: boolean }) {
  const { data, loading, createAttribute, updateAttribute, deleteAttribute, reorderAttributes } = useNoteAttributes();
  const stats = useNoteAttributeStats(data);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<NoteAttribute | null>(null);
  const [searchValue, setSearchValue] = useState("");
  const { setContext, clearContext } = useCodyContext();

  const signature = useMemo(() => data.map((a) => `${a.id}:${a.sort_order}:${a.is_active ? 1 : 0}`).join(","), [data]);
  const payload = useMemo(() => ({
    counts: stats,
    attributes: data.map((a) => ({ name: a.name, icon: a.icon, color: a.color, is_active: a.is_active })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [signature, stats.total, stats.active]);

  useEffect(() => {
    if (!active) return;
    setContext({ context_type: "note_attributes_list", page_data: payload });
    return () => clearContext();
  }, [active, setContext, clearContext, payload]);

  useShortcut(["n"], () => { setEditing(null); setModalOpen(true); }, { description: "Add note attribute", scope: "Note Attributes", enabled: active && !modalOpen });

  const filtered = useMemo(() => {
    const q = searchValue.trim().toLowerCase();
    if (!q) return data;
    return data.filter((a) => a.name.toLowerCase().includes(q));
  }, [data, searchValue]);

  const move = async (id: string, dir: -1 | 1) => {
    const idx = data.findIndex((a) => a.id === id);
    if (idx === -1) return;
    const target = idx + dir;
    if (target < 0 || target >= data.length) return;
    const next = [...data];
    const [item] = next.splice(idx, 1);
    next.splice(target, 0, item);
    await reorderAttributes(next.map((a) => a.id));
  };

  const handleSave = async (input: NoteAttributeInput) => {
    if (editing) await updateAttribute(editing.id, input);
    else await createAttribute(input);
  };

  return (
    <div>
      <div className="grid grid-cols-2 gap-4 mb-6">
        <StatCard label="Total Attributes" value={stats.total} accentClass="stat-accent-blue" />
        <StatCard label="Active" value={stats.active} accentClass="stat-accent-emerald" delay={0.05} />
      </div>

      <FiltersBar
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        searchPlaceholder="Search note attributes…"
        actions={
          <Button onClick={() => { setEditing(null); setModalOpen(true); }} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Add Attribute
          </Button>
        }
      />

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-[13px] text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <StickyNote className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-[14px] font-semibold text-foreground mb-1">No note attributes yet</p>
            <p className="text-[12px] text-muted-foreground mb-4">Tag notes with types like "Complaint", "Follow-up", etc.</p>
            <Button onClick={() => { setEditing(null); setModalOpen(true); }} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Add First Attribute
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((a, i) => (
              <div key={a.id} className="flex items-center gap-3 px-4 py-3 hover:bg-accent/40 group">
                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => move(a.id, -1)}
                    disabled={i === 0}
                    className="p-0.5 rounded hover:bg-accent disabled:opacity-30 disabled:hover:bg-transparent"
                    aria-label="Move up"
                  >
                    <ArrowUp className="w-3 h-3 text-muted-foreground" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(a.id, 1)}
                    disabled={i === filtered.length - 1}
                    className="p-0.5 rounded hover:bg-accent disabled:opacity-30 disabled:hover:bg-transparent"
                    aria-label="Move down"
                  >
                    <ArrowDown className="w-3 h-3 text-muted-foreground" />
                  </button>
                </div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium" style={{ background: `${a.color ?? "#6B7280"}20`, color: a.color ?? undefined }}>
                  {renderLucide(a.icon, "w-3 h-3")}
                  {a.name}
                </div>
                <div className="flex-1 flex items-center gap-2">
                  {!a.is_active && <StatusPill label="Inactive" variant="muted" />}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="p-1 rounded hover:bg-accent opacity-0 group-hover:opacity-100 transition-opacity"><MoreHorizontal className="w-4 h-4 text-muted-foreground" /></button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => { setEditing(a); setModalOpen(true); }}>
                      <Edit className="w-3.5 h-3.5" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={async () => { if (confirm(`Delete "${a.name}"?`)) await deleteAttribute(a.id); }}
                      className="text-destructive"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        )}
      </div>

      <NoteAttributeFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        editing={editing}
        onSave={handleSave}
      />
    </div>
  );
}

// ─── Tab 3: Price Lists ───────────────────────────────────────────────────────

function PriceListsTab({ active }: { active: boolean }) {
  const navigate = useNavigate();
  const { data, loading, createPriceList, updatePriceList, archivePriceList, setDefaultPriceList } = usePriceLists();
  const stats = usePriceListStats(data);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PriceList | null>(null);
  const [searchValue, setSearchValue] = useState("");
  const { setContext, clearContext } = useCodyContext();

  const signature = useMemo(() => data.map((l) => `${l.id}:${l.is_active ? 1 : 0}:${l.item_count ?? 0}`).join(","), [data]);
  const payload = useMemo(() => ({
    counts: stats,
    lists: data.map((l) => ({ name: l.name, is_default: l.is_default, is_active: l.is_active, items: l.item_count, accounts: l.account_count })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [signature, stats.total, stats.active, stats.totalItems, stats.totalAssignments]);

  useEffect(() => {
    if (!active) return;
    setContext({ context_type: "price_lists_list", page_data: payload });
    return () => clearContext();
  }, [active, setContext, clearContext, payload]);

  useShortcut(["n"], () => { setEditing(null); setModalOpen(true); }, { description: "Create price list", scope: "Price Lists", enabled: active && !modalOpen });

  const filtered = useMemo(() => {
    const q = searchValue.trim().toLowerCase();
    if (!q) return data;
    return data.filter((l) => `${l.name} ${l.description ?? ""}`.toLowerCase().includes(q));
  }, [data, searchValue]);

  const columns: ColumnDef<PriceList>[] = useMemo(() => [
    {
      id: "name",
      header: "Name",
      cell: ({ row }) => {
        const l = row.original;
        return (
          <button
            onClick={(e) => { e.stopPropagation(); navigate(`/settings/customer-setup/price-lists/${l.id}`); }}
            className="flex items-center gap-2 text-left"
          >
            <DollarSign className="w-3.5 h-3.5 text-primary" />
            <span className="text-[13px] font-medium text-primary hover:underline">{l.name}</span>
            {l.is_default && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 uppercase tracking-wider">
                <Star className="w-2.5 h-2.5" /> Default
              </span>
            )}
          </button>
        );
      },
    },
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row }) => <span className="text-[12px] text-muted-foreground line-clamp-1">{row.original.description?.slice(0, 60) ?? "—"}</span>,
    },
    {
      id: "items",
      header: "Products",
      cell: ({ row }) => {
        const n = row.original.item_count ?? 0;
        if (n === 0) return <span className="text-muted-foreground text-[12px]">0</span>;
        return (
          <button
            onClick={(e) => { e.stopPropagation(); navigate(`/settings/customer-setup/price-lists/${row.original.id}`); }}
            className="text-[12px] text-primary hover:underline tabular-nums"
          >
            {n}
          </button>
        );
      },
    },
    {
      id: "accounts",
      header: "Accounts",
      cell: ({ row }) => {
        const n = row.original.account_count ?? 0;
        if (n === 0) return <span className="text-muted-foreground text-[12px]">0</span>;
        return <span className="text-[12px] tabular-nums">{n}</span>;
      },
    },
    {
      id: "validity",
      header: "Validity",
      cell: ({ row }) => {
        const l = row.original;
        if (!l.valid_from && !l.valid_until) return <span className="text-muted-foreground text-[12px]">Always</span>;
        const fragments: string[] = [];
        if (l.valid_from) fragments.push(new Date(l.valid_from).toLocaleDateString());
        fragments.push("→");
        if (l.valid_until) fragments.push(new Date(l.valid_until).toLocaleDateString()); else fragments.push("∞");
        return <span className="text-[11px] text-muted-foreground font-mono">{fragments.join(" ")}</span>;
      },
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => row.original.is_active ? <StatusPill label="Active" variant="success" /> : <StatusPill label="Archived" variant="muted" />,
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
              <DropdownMenuItem onClick={() => navigate(`/settings/customer-setup/price-lists/${row.original.id}`)}>
                <DollarSign className="w-3.5 h-3.5" /> Manage items
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setEditing(row.original); setModalOpen(true); }}>
                <Edit className="w-3.5 h-3.5" /> Edit
              </DropdownMenuItem>
              {!row.original.is_default && (
                <DropdownMenuItem onClick={() => setDefaultPriceList(row.original.id)}>
                  <Star className="w-3.5 h-3.5" /> Set as default
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={async () => { if (confirm(`Archive "${row.original.name}"?`)) await archivePriceList(row.original.id); }}
                className="text-destructive"
              >
                <Trash2 className="w-3.5 h-3.5" /> Archive
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </RowActionsCell>
      ),
    },
  ], [navigate, archivePriceList, setDefaultPriceList]);

  const handleSave = async (input: PriceListInput) => {
    if (editing) await updatePriceList(editing.id, input);
    else await createPriceList(input);
  };

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Lists" value={stats.total} accentClass="stat-accent-blue" />
        <StatCard label="Active" value={stats.active} accentClass="stat-accent-emerald" delay={0.05} />
        <StatCard label="Products Priced" value={stats.totalItems} accentClass="stat-accent-teal" delay={0.1} />
        <StatCard label="Assignments" value={stats.totalAssignments} accentClass="stat-accent-amber" delay={0.15} />
      </div>

      <FiltersBar
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        searchPlaceholder="Search price lists…"
        actions={
          <Button onClick={() => { setEditing(null); setModalOpen(true); }} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> New Price List
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={filtered}
        loading={loading}
        empty={{
          icon: DollarSign,
          title: "Create your first price list",
          description: "Price lists let you offer different pricing tiers (wholesale, retail, bulk) to different accounts. Add a price list, then assign products and accounts to it.",
          action: (
            <Button onClick={() => { setEditing(null); setModalOpen(true); }} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" /> New Price List
            </Button>
          ),
        }}
      />

      <PriceListFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        editing={editing}
        onSave={handleSave}
      />
    </div>
  );
}

// ─── Tab 4: Discounts ─────────────────────────────────────────────────────────

function DiscountsTab({ active }: { active: boolean }) {
  const { data, loading, createDiscount, updateDiscount, archiveDiscount, deleteDiscount } = useDiscounts();
  const stats = useDiscountStats(data);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Discount | null>(null);
  const [searchValue, setSearchValue] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "archived" | "">("");
  const { setContext, clearContext } = useCodyContext();

  const signature = useMemo(() => data.map((d) => `${d.id}:${d.is_active ? 1 : 0}:${d.discount_value}`).join(","), [data]);
  const payload = useMemo(() => ({
    counts: stats,
    discounts: data.map((d) => ({ name: d.name, type: d.discount_type, value: d.discount_value, is_active: d.is_active, valid_until: d.valid_until })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [signature, stats.total, stats.active, stats.expiringSoon, stats.expired]);

  useEffect(() => {
    if (!active) return;
    setContext({ context_type: "discounts_list", page_data: payload });
    return () => clearContext();
  }, [active, setContext, clearContext, payload]);

  useShortcut(["n"], () => { setEditing(null); setModalOpen(true); }, { description: "Create discount", scope: "Discounts", enabled: active && !modalOpen });

  const filtered = useMemo(() => {
    const q = searchValue.trim().toLowerCase();
    return data.filter((d) => {
      if (q && !d.name.toLowerCase().includes(q)) return false;
      if (statusFilter === "active" && !d.is_active) return false;
      if (statusFilter === "archived" && d.is_active) return false;
      return true;
    });
  }, [data, searchValue, statusFilter]);

  const formatDiscountValue = (d: Discount) => {
    if (d.discount_type === "percent") return `${d.discount_value}%`;
    return `$${Number(d.discount_value).toFixed(2)}`;
  };

  const columns: ColumnDef<Discount>[] = useMemo(() => [
    {
      id: "name",
      header: "Name",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Percent className="w-3.5 h-3.5 text-primary" />
          </div>
          <div className="text-[13px] font-medium text-foreground">{row.original.name}</div>
        </div>
      ),
    },
    {
      id: "discount",
      header: "Discount",
      cell: ({ row }) => (
        <span className="font-mono text-[13px] font-semibold text-primary tabular-nums">{formatDiscountValue(row.original)}</span>
      ),
    },
    {
      accessorKey: "minimum_order_amount",
      header: "Min Order",
      cell: ({ row }) => {
        const m = row.original.minimum_order_amount;
        if (m == null) return <span className="text-muted-foreground text-[12px]">—</span>;
        return <span className="font-mono text-[12px] tabular-nums">${Number(m).toFixed(2)}</span>;
      },
    },
    {
      id: "validity",
      header: "Validity",
      cell: ({ row }) => {
        const d = row.original;
        const now = Date.now();
        if (!d.valid_from && !d.valid_until) return <span className="text-muted-foreground text-[12px]">Always</span>;
        const until = d.valid_until ? new Date(d.valid_until).getTime() : null;
        if (until && until < now) return <StatusPill label="Expired" variant="critical" />;
        if (until && until - now < 14 * 24 * 60 * 60 * 1000) {
          return (
            <span className="text-[11px] text-amber-500 font-medium">
              Expires <DateTime value={d.valid_until!} format="date-only" />
            </span>
          );
        }
        if (d.valid_until) return <DateTime value={d.valid_until} format="date-only" className="text-[11px] text-muted-foreground" />;
        return <span className="text-[12px] text-muted-foreground">Open-ended</span>;
      },
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => row.original.is_active ? <StatusPill label="Active" variant="success" /> : <StatusPill label="Archived" variant="muted" />,
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
              <DropdownMenuItem onClick={() => { setEditing(row.original); setModalOpen(true); }}>
                <Edit className="w-3.5 h-3.5" /> Edit
              </DropdownMenuItem>
              {row.original.is_active ? (
                <DropdownMenuItem onClick={async () => { if (confirm(`Archive "${row.original.name}"?`)) await archiveDiscount(row.original.id); }}>
                  <Check className="w-3.5 h-3.5" /> Archive
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={async () => { await updateDiscount(row.original.id, { is_active: true }); }}>
                  <Check className="w-3.5 h-3.5" /> Reactivate
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={async () => { if (confirm(`Permanently delete "${row.original.name}"? This cannot be undone.`)) await deleteDiscount(row.original.id); }}
                className="text-destructive"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </RowActionsCell>
      ),
    },
  ], [archiveDiscount, updateDiscount, deleteDiscount]);

  const handleSave = async (input: DiscountInput) => {
    if (editing) await updateDiscount(editing.id, input);
    else await createDiscount(input);
  };

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Discounts" value={stats.total} accentClass="stat-accent-blue" />
        <StatCard label="Active" value={stats.active} accentClass="stat-accent-emerald" delay={0.05} />
        <StatCard label="Expiring Soon" value={stats.expiringSoon} accentClass={stats.expiringSoon > 0 ? "stat-accent-amber" : "stat-accent-emerald"} delay={0.1} />
        <StatCard label="Expired" value={stats.expired} accentClass={stats.expired > 0 ? "stat-accent-rose" : "stat-accent-emerald"} delay={0.15} />
      </div>

      <FiltersBar
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        searchPlaceholder="Search discounts…"
        actions={
          <div className="flex items-center gap-1.5">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="h-9 px-3 text-[12px] rounded-md bg-background border border-border">
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
            <Button onClick={() => { setEditing(null); setModalOpen(true); }} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" /> New Discount
            </Button>
          </div>
        }
      />

      <DataTable
        columns={columns}
        data={filtered}
        loading={loading}
        empty={{
          icon: Percent,
          title: "No discounts yet",
          description: "Create promotional discounts — percentage off or flat amount — with optional validity windows and minimum order amounts.",
          action: (
            <Button onClick={() => { setEditing(null); setModalOpen(true); }} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Create Discount
            </Button>
          ),
        }}
      />

      <DiscountFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        editing={editing}
        onSave={handleSave}
      />
    </div>
  );
}
