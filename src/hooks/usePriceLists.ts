import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useOrg } from "@/lib/org";

export interface PriceList {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  valid_from: string | null;
  valid_until: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  /** Joined: number of products in this price list */
  item_count?: number;
  /** Joined: number of accounts assigned to this price list */
  account_count?: number;
}

export interface PriceListInput {
  name: string;
  description?: string | null;
  valid_from?: string | null;
  valid_until?: string | null;
  is_default?: boolean;
  is_active?: boolean;
}

export interface PriceListItem {
  id: string;
  price_list_id: string;
  product_id: string;
  unit_price: number;
  created_at: string;
  /** Joined product info */
  product?: {
    id: string;
    name: string;
    category: string | null;
    package_size: string | null;
  } | null;
}

export interface AccountPriceList {
  id: string;
  account_id: string;
  price_list_id: string;
  priority: number;
  assigned_at: string;
  account?: { id: string; company_name: string } | null;
}

export function usePriceLists() {
  const { user } = useAuth();
  const { orgId } = useOrg();
  const [data, setData] = useState<PriceList[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!user || !orgId) { setData([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data: lists, error: err } = await supabase
        .from("grow_price_lists")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (err) { setError(err.message); setLoading(false); return; }

      const listIds = (lists ?? []).map((l: any) => l.id);
      let itemCounts = new Map<string, number>();
      let accountCounts = new Map<string, number>();

      if (listIds.length > 0) {
        const [itemRes, accRes] = await Promise.all([
          supabase.from("grow_price_list_items").select("price_list_id").in("price_list_id", listIds),
          supabase.from("grow_account_price_lists").select("price_list_id").in("price_list_id", listIds),
        ]);
        (itemRes.data ?? []).forEach((r: any) => {
          itemCounts.set(r.price_list_id, (itemCounts.get(r.price_list_id) ?? 0) + 1);
        });
        (accRes.data ?? []).forEach((r: any) => {
          accountCounts.set(r.price_list_id, (accountCounts.get(r.price_list_id) ?? 0) + 1);
        });
      }

      const merged = (lists ?? []).map((l: any) => ({
        ...l,
        item_count: itemCounts.get(l.id) ?? 0,
        account_count: accountCounts.get(l.id) ?? 0,
      })) as PriceList[];

      if (cancelled) return;
      setError(null);
      setData(merged);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id, orgId, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const createPriceList = useCallback(async (input: PriceListInput) => {
    if (!orgId) throw new Error("No active org");
    const payload = { ...input, org_id: orgId };
    const { data: row, error: err } = await supabase.from("grow_price_lists").insert(payload).select("*").single();
    if (err) throw err;
    refresh();
    return row as PriceList;
  }, [orgId, refresh]);

  const updatePriceList = useCallback(async (id: string, patch: Partial<PriceListInput>) => {
    const { data: row, error: err } = await supabase.from("grow_price_lists").update(patch).eq("id", id).select("*").single();
    if (err) throw err;
    refresh();
    return row as PriceList;
  }, [refresh]);

  const archivePriceList = useCallback(async (id: string) => {
    const { error: err } = await supabase.from("grow_price_lists").update({ is_active: false }).eq("id", id);
    if (err) throw err;
    refresh();
  }, [refresh]);

  const setDefaultPriceList = useCallback(async (id: string) => {
    if (!orgId) throw new Error("No active org");
    await supabase.from("grow_price_lists").update({ is_default: false }).eq("org_id", orgId);
    const { error: err } = await supabase.from("grow_price_lists").update({ is_default: true }).eq("id", id);
    if (err) throw err;
    refresh();
  }, [orgId, refresh]);

  return { data, loading, error, refresh, createPriceList, updatePriceList, archivePriceList, setDefaultPriceList };
}

/** Load a single price list + its items + assigned accounts. */
export function usePriceListDetail(priceListId: string | undefined) {
  const { user } = useAuth();
  const { orgId } = useOrg();
  const [priceList, setPriceList] = useState<PriceList | null>(null);
  const [items, setItems] = useState<PriceListItem[]>([]);
  const [assignedAccounts, setAssignedAccounts] = useState<AccountPriceList[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!user || !orgId || !priceListId) { setPriceList(null); setItems([]); setAssignedAccounts([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [listRes, itemRes, accRes, productRes, accountRes] = await Promise.all([
        supabase.from("grow_price_lists").select("*").eq("id", priceListId).eq("org_id", orgId).maybeSingle(),
        supabase.from("grow_price_list_items").select("*").eq("price_list_id", priceListId),
        supabase.from("grow_account_price_lists").select("*").eq("price_list_id", priceListId),
        supabase.from("grow_products").select("id, name, category, package_size").eq("org_id", orgId),
        supabase.from("grow_accounts").select("id, company_name").eq("org_id", orgId),
      ]);
      if (cancelled) return;
      if (listRes.error) { setError(listRes.error.message); setLoading(false); return; }
      const prodById = new Map<string, any>();
      (productRes.data ?? []).forEach((p: any) => prodById.set(p.id, p));
      const accById = new Map<string, any>();
      (accountRes.data ?? []).forEach((a: any) => accById.set(a.id, a));

      const mergedItems = (itemRes.data ?? []).map((i: any) => ({
        ...i,
        product: prodById.get(i.product_id) ?? null,
      })) as PriceListItem[];
      const mergedAccounts = (accRes.data ?? []).map((a: any) => ({
        ...a,
        account: accById.get(a.account_id) ?? null,
      })) as AccountPriceList[];

      setPriceList((listRes.data ?? null) as PriceList | null);
      setItems(mergedItems);
      setAssignedAccounts(mergedAccounts);
      setError(null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id, orgId, priceListId, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const upsertItem = useCallback(async (product_id: string, unit_price: number) => {
    if (!priceListId) throw new Error("No price list");
    // Check if exists
    const existing = items.find((i) => i.product_id === product_id);
    if (existing) {
      const { error: err } = await supabase.from("grow_price_list_items").update({ unit_price }).eq("id", existing.id);
      if (err) throw err;
    } else {
      const { error: err } = await supabase.from("grow_price_list_items").insert({ price_list_id: priceListId, product_id, unit_price });
      if (err) throw err;
    }
    refresh();
  }, [priceListId, items, refresh]);

  const removeItem = useCallback(async (id: string) => {
    const { error: err } = await supabase.from("grow_price_list_items").delete().eq("id", id);
    if (err) throw err;
    refresh();
  }, [refresh]);

  const assignAccount = useCallback(async (account_id: string, priority = 0) => {
    if (!priceListId) throw new Error("No price list");
    const { error: err } = await supabase.from("grow_account_price_lists").insert({ account_id, price_list_id: priceListId, priority });
    if (err) throw err;
    refresh();
  }, [priceListId, refresh]);

  const unassignAccount = useCallback(async (assignmentId: string) => {
    const { error: err } = await supabase.from("grow_account_price_lists").delete().eq("id", assignmentId);
    if (err) throw err;
    refresh();
  }, [refresh]);

  return {
    priceList, items, assignedAccounts, loading, error, refresh,
    upsertItem, removeItem, assignAccount, unassignAccount,
  };
}

export function usePriceListStats(lists: PriceList[]) {
  return useMemo(() => ({
    total: lists.length,
    active: lists.filter((l) => l.is_active).length,
    totalItems: lists.reduce((sum, l) => sum + (l.item_count ?? 0), 0),
    totalAssignments: lists.reduce((sum, l) => sum + (l.account_count ?? 0), 0),
  }), [lists]);
}
