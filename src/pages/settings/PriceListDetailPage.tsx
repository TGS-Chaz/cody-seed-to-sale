import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  DollarSign, Package, Users, Plus, Trash2, Loader2, Edit,
  Search, Check, X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import PageHeader from "@/components/shared/PageHeader";
import StatCard from "@/components/shared/StatCard";
import StatusPill from "@/components/shared/StatusPill";
import EmptyState from "@/components/shared/EmptyState";
import DateTime from "@/components/shared/DateTime";
import { useCodyContext } from "@/hooks/useCodyContext";
import { usePriceListDetail, usePriceLists } from "@/hooks/usePriceLists";
import { supabase } from "@/lib/supabase";
import { useOrg } from "@/lib/org";
import PriceListFormModal from "./PriceListFormModal";
import { cn } from "@/lib/utils";

interface ProductOption {
  id: string;
  name: string;
  category: string | null;
  package_size: string | null;
}

interface AccountOption {
  id: string;
  company_name: string;
}

export default function PriceListDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { orgId } = useOrg();
  const { priceList, items, assignedAccounts, loading, upsertItem, removeItem, assignAccount, unassignAccount } = usePriceListDetail(id);
  const { updatePriceList } = usePriceLists();
  const [editOpen, setEditOpen] = useState(false);
  const { setContext, clearContext } = useCodyContext();

  // Load all products + accounts in this org for the add pickers
  const [allProducts, setAllProducts] = useState<ProductOption[]>([]);
  const [allAccounts, setAllAccounts] = useState<AccountOption[]>([]);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    (async () => {
      const [prodRes, accRes] = await Promise.all([
        supabase.from("grow_products").select("id, name, category, package_size").eq("org_id", orgId).order("name"),
        supabase.from("grow_accounts").select("id, company_name").eq("org_id", orgId).order("company_name"),
      ]);
      if (cancelled) return;
      setAllProducts((prodRes.data ?? []) as ProductOption[]);
      setAllAccounts((accRes.data ?? []) as AccountOption[]);
    })();
    return () => { cancelled = true; };
  }, [orgId]);

  const priceListSig = priceList ? `${priceList.id}:${priceList.name}:${items.length}:${assignedAccounts.length}` : "";
  const codyPayload = useMemo(() => {
    if (!priceList) return null;
    return {
      price_list: {
        name: priceList.name,
        description: priceList.description,
        is_default: priceList.is_default,
        is_active: priceList.is_active,
        valid_from: priceList.valid_from,
        valid_until: priceList.valid_until,
        items_count: items.length,
        accounts_count: assignedAccounts.length,
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceListSig]);

  useEffect(() => {
    if (!priceList || !codyPayload) return;
    setContext({ context_type: "price_list_detail", context_id: priceList.id, page_data: codyPayload });
    return () => clearContext();
  }, [setContext, clearContext, codyPayload, priceList?.id]);

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!priceList) {
    return (
      <div className="p-6 md:p-8 max-w-7xl mx-auto">
        <EmptyState
          icon={DollarSign}
          title="Price list not found"
          description="This price list may have been archived or does not exist."
          primaryAction={
            <Button onClick={() => navigate("/settings/customer-setup?tab=price-lists")}>← Back to price lists</Button>
          }
        />
      </div>
    );
  }

  const pricedProductIds = new Set(items.map((i) => i.product_id));
  const assignedAccountIds = new Set(assignedAccounts.map((a) => a.account_id));

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <PageHeader
        title={priceList.name}
        description={priceList.description ?? "Price list"}
        breadcrumbs={[
          { label: "Settings", to: "/settings" },
          { label: "Customer Setup", to: "/settings/customer-setup" },
          { label: "Price Lists", to: "/settings/customer-setup?tab=price-lists" },
          { label: priceList.name },
        ]}
        actions={
          <div className="flex items-center gap-2">
            {priceList.is_default && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded bg-amber-500/10 text-amber-500 uppercase tracking-wider">
                Default
              </span>
            )}
            {!priceList.is_active && <StatusPill label="Archived" variant="muted" />}
            <Button variant="outline" onClick={() => setEditOpen(true)} className="gap-1.5">
              <Edit className="w-3.5 h-3.5" /> Edit
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Products" value={items.length} accentClass="stat-accent-blue" />
        <StatCard label="Assigned Accounts" value={assignedAccounts.length} accentClass="stat-accent-emerald" delay={0.05} />
        <StatCard
          label="Valid From"
          value={priceList.valid_from ? new Date(priceList.valid_from).toLocaleDateString() : "Anytime"}
          accentClass="stat-accent-teal"
          delay={0.1}
        />
        <StatCard
          label="Valid Until"
          value={priceList.valid_until ? new Date(priceList.valid_until).toLocaleDateString() : "Open"}
          accentClass="stat-accent-amber"
          delay={0.15}
        />
      </div>

      <Tabs defaultValue="products" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="products">Products ({items.length})</TabsTrigger>
          <TabsTrigger value="accounts">Assigned Accounts ({assignedAccounts.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="products">
          <ProductsPanel
            items={items}
            allProducts={allProducts}
            pricedProductIds={pricedProductIds}
            onUpsert={upsertItem}
            onRemove={removeItem}
          />
        </TabsContent>
        <TabsContent value="accounts">
          <AccountsPanel
            assignments={assignedAccounts}
            allAccounts={allAccounts}
            assignedAccountIds={assignedAccountIds}
            onAssign={assignAccount}
            onUnassign={unassignAccount}
          />
        </TabsContent>
      </Tabs>

      <PriceListFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        editing={priceList}
        onSave={async (input) => { await updatePriceList(priceList.id, input); }}
      />
    </div>
  );
}

// ─── Products panel ───────────────────────────────────────────────────────────

function ProductsPanel({
  items,
  allProducts,
  pricedProductIds,
  onUpsert,
  onRemove,
}: {
  items: ReturnType<typeof usePriceListDetail>["items"];
  allProducts: ProductOption[];
  pricedProductIds: Set<string>;
  onUpsert: (product_id: string, unit_price: number) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerProduct, setPickerProduct] = useState<ProductOption | null>(null);
  const [pickerPrice, setPickerPrice] = useState<string>("");
  const [pickerSaving, setPickerSaving] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingPrice, setEditingPrice] = useState<string>("");

  const availableProducts = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    return allProducts.filter((p) => {
      if (pricedProductIds.has(p.id)) return false;
      if (!q) return true;
      return `${p.name} ${p.category ?? ""} ${p.package_size ?? ""}`.toLowerCase().includes(q);
    }).slice(0, 30);
  }, [allProducts, pickerQuery, pricedProductIds]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => `${i.product?.name ?? ""} ${i.product?.category ?? ""}`.toLowerCase().includes(q));
  }, [items, search]);

  const handleAdd = async () => {
    if (!pickerProduct) return;
    const price = Number(pickerPrice);
    if (!pickerPrice || Number.isNaN(price) || price < 0) { toast.error("Enter a valid price"); return; }
    setPickerSaving(true);
    try {
      await onUpsert(pickerProduct.id, price);
      toast.success(`Added ${pickerProduct.name}`);
      setPickerProduct(null);
      setPickerPrice("");
      setPickerQuery("");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to add");
    } finally {
      setPickerSaving(false);
    }
  };

  const handleSaveEdit = async (productId: string) => {
    const price = Number(editingPrice);
    if (!editingPrice || Number.isNaN(price) || price < 0) { toast.error("Enter a valid price"); return; }
    try {
      await onUpsert(productId, price);
      toast.success("Price updated");
      setEditingItemId(null);
      setEditingPrice("");
    } catch (e: any) {
      toast.error(e?.message ?? "Update failed");
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products in this list…"
            className="pl-9"
          />
        </div>
        <Button onClick={() => setPickerOpen(!pickerOpen)} className="gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Add Product
        </Button>
      </div>

      {pickerOpen && (
        <div className="mb-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[12px] font-semibold text-foreground uppercase tracking-wider">Add product to price list</p>
            <button onClick={() => { setPickerOpen(false); setPickerProduct(null); setPickerQuery(""); setPickerPrice(""); }} className="p-1 rounded hover:bg-accent">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
          {pickerProduct ? (
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-md bg-background border border-border">
                <Package className="w-3.5 h-3.5 text-primary shrink-0" />
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-foreground truncate">{pickerProduct.name}</div>
                  {pickerProduct.category && <div className="text-[11px] text-muted-foreground">{pickerProduct.category}</div>}
                </div>
              </div>
              <div className="relative w-32">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">$</span>
                <Input
                  autoFocus
                  type="number"
                  step="0.01"
                  min="0"
                  value={pickerPrice}
                  onChange={(e) => setPickerPrice(e.target.value)}
                  placeholder="0.00"
                  className="font-mono pl-6"
                  onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                />
              </div>
              <Button onClick={handleAdd} disabled={pickerSaving} className="min-w-[80px]">
                {pickerSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Add"}
              </Button>
              <Button variant="ghost" onClick={() => { setPickerProduct(null); setPickerPrice(""); }}>Change</Button>
            </div>
          ) : (
            <>
              <Input
                autoFocus
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
                placeholder="Search a product to add…"
                className="mb-2"
              />
              <div className="max-h-[240px] overflow-y-auto rounded-md border border-border bg-background">
                {availableProducts.length === 0 ? (
                  <div className="p-6 text-center text-[12px] text-muted-foreground">
                    {pricedProductIds.size > 0 && allProducts.length === pricedProductIds.size
                      ? "All products are already on this price list."
                      : "No matching products."}
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {availableProducts.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPickerProduct(p)}
                        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent text-left"
                      >
                        <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-medium text-foreground truncate">{p.name}</div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {[p.category, p.package_size].filter(Boolean).join(" · ") || "—"}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {filteredItems.length === 0 ? (
          <div className="p-12 text-center">
            <Package className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-[14px] font-semibold text-foreground mb-1">
              {items.length === 0 ? "No products priced yet" : "No matches"}
            </p>
            <p className="text-[12px] text-muted-foreground mb-4">
              {items.length === 0 ? "Add products with custom pricing for this list." : "Try a different search."}
            </p>
            {items.length === 0 && (
              <Button onClick={() => setPickerOpen(true)} className="gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Add Product
              </Button>
            )}
          </div>
        ) : (
          <table className="w-full">
            <thead className="border-b border-border bg-muted/30">
              <tr>
                <th className="text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground px-4 py-2.5">Product</th>
                <th className="text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground px-4 py-2.5">Category</th>
                <th className="text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground px-4 py-2.5">Package</th>
                <th className="text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground px-4 py-2.5">Unit Price</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredItems.map((i) => (
                <tr key={i.id} className="group hover:bg-accent/40">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="text-[13px] font-medium text-foreground">{i.product?.name ?? "(unknown)"}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-[12px] text-muted-foreground">{i.product?.category ?? "—"}</td>
                  <td className="px-4 py-2.5 text-[12px] text-muted-foreground font-mono">{i.product?.package_size ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right">
                    {editingItemId === i.id ? (
                      <div className="flex items-center gap-1 justify-end">
                        <div className="relative w-28">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">$</span>
                          <Input
                            autoFocus
                            type="number"
                            step="0.01"
                            value={editingPrice}
                            onChange={(e) => setEditingPrice(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") handleSaveEdit(i.product_id); if (e.key === "Escape") { setEditingItemId(null); setEditingPrice(""); } }}
                            className="h-8 text-[12px] pl-5 font-mono text-right"
                          />
                        </div>
                        <button onClick={() => handleSaveEdit(i.product_id)} className="p-1 rounded hover:bg-primary/10 text-primary">
                          <Check className="w-4 h-4" />
                        </button>
                        <button onClick={() => { setEditingItemId(null); setEditingPrice(""); }} className="p-1 rounded hover:bg-accent text-muted-foreground">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditingItemId(i.id); setEditingPrice(String(i.unit_price)); }}
                        className="font-mono text-[13px] font-semibold text-foreground tabular-nums hover:text-primary"
                      >
                        ${Number(i.unit_price).toFixed(2)}
                      </button>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    <button
                      onClick={async () => { if (confirm(`Remove ${i.product?.name ?? "product"} from this price list?`)) await onRemove(i.id); }}
                      className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="Remove"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Accounts panel ───────────────────────────────────────────────────────────

function AccountsPanel({
  assignments,
  allAccounts,
  assignedAccountIds,
  onAssign,
  onUnassign,
}: {
  assignments: ReturnType<typeof usePriceListDetail>["assignedAccounts"];
  allAccounts: AccountOption[];
  assignedAccountIds: Set<string>;
  onAssign: (account_id: string, priority?: number) => Promise<void>;
  onUnassign: (assignmentId: string) => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [assigning, setAssigning] = useState<string | null>(null);

  const availableAccounts = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    return allAccounts.filter((a) => {
      if (assignedAccountIds.has(a.id)) return false;
      if (!q) return true;
      return a.company_name.toLowerCase().includes(q);
    }).slice(0, 30);
  }, [allAccounts, pickerQuery, assignedAccountIds]);

  const filteredAssignments = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return assignments;
    return assignments.filter((a) => (a.account?.company_name ?? "").toLowerCase().includes(q));
  }, [assignments, search]);

  const handleAssign = async (accountId: string) => {
    setAssigning(accountId);
    try {
      await onAssign(accountId);
      toast.success("Account assigned");
      setPickerQuery("");
    } catch (e: any) {
      toast.error(e?.message ?? "Assignment failed");
    } finally {
      setAssigning(null);
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search assigned accounts…"
            className="pl-9"
          />
        </div>
        <Button onClick={() => setPickerOpen(!pickerOpen)} className="gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Assign Account
        </Button>
      </div>

      {pickerOpen && (
        <div className="mb-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[12px] font-semibold text-foreground uppercase tracking-wider">Assign account to price list</p>
            <button onClick={() => { setPickerOpen(false); setPickerQuery(""); }} className="p-1 rounded hover:bg-accent">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
          <Input
            autoFocus
            value={pickerQuery}
            onChange={(e) => setPickerQuery(e.target.value)}
            placeholder="Search an account to assign…"
            className="mb-2"
          />
          <div className="max-h-[240px] overflow-y-auto rounded-md border border-border bg-background">
            {availableAccounts.length === 0 ? (
              <div className="p-6 text-center text-[12px] text-muted-foreground">
                {assignedAccountIds.size > 0 && allAccounts.length === assignedAccountIds.size
                  ? "All accounts are already assigned to this price list."
                  : allAccounts.length === 0 ? "No customer accounts yet." : "No matching accounts."}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {availableAccounts.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => handleAssign(a.id)}
                    disabled={assigning === a.id}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 hover:bg-accent text-left disabled:opacity-50",
                    )}
                  >
                    <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-[13px] font-medium text-foreground flex-1">{a.company_name}</span>
                    {assigning === a.id ? <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" /> : <Plus className="w-3.5 h-3.5 text-primary" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {filteredAssignments.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-[14px] font-semibold text-foreground mb-1">
              {assignments.length === 0 ? "No accounts assigned" : "No matches"}
            </p>
            <p className="text-[12px] text-muted-foreground mb-4">
              {assignments.length === 0 ? "Assign customer accounts to this price list." : "Try a different search."}
            </p>
            {assignments.length === 0 && (
              <Button onClick={() => setPickerOpen(true)} className="gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Assign Account
              </Button>
            )}
          </div>
        ) : (
          <table className="w-full">
            <thead className="border-b border-border bg-muted/30">
              <tr>
                <th className="text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground px-4 py-2.5">Account</th>
                <th className="text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground px-4 py-2.5">Priority</th>
                <th className="text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground px-4 py-2.5">Assigned</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredAssignments.map((a) => (
                <tr key={a.id} className="group hover:bg-accent/40">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="text-[13px] font-medium text-foreground">{a.account?.company_name ?? "(unknown)"}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-[12px] text-muted-foreground font-mono tabular-nums">{a.priority}</td>
                  <td className="px-4 py-2.5 text-[12px] text-muted-foreground">
                    <DateTime value={a.assigned_at} format="date-only" />
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    <button
                      onClick={async () => { if (confirm(`Unassign ${a.account?.company_name ?? "account"} from this price list?`)) await onUnassign(a.id); }}
                      className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="Unassign"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
