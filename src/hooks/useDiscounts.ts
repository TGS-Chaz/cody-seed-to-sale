import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useOrg } from "@/lib/org";
import type { DiscountType } from "@/lib/schema-enums";

// Re-export for backwards-compat callers that already imported DiscountType from this module.
export type { DiscountType };

export interface Discount {
  id: string;
  org_id: string;
  name: string;
  discount_type: DiscountType | null;
  discount_value: number;
  valid_from: string | null;
  valid_until: string | null;
  applies_to_account_groups: string[] | null;
  applies_to_accounts: string[] | null;
  applies_to_products: string[] | null;
  applies_to_categories: string[] | null;
  minimum_order_amount: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DiscountInput {
  name: string;
  discount_type?: DiscountType | null;
  discount_value: number;
  valid_from?: string | null;
  valid_until?: string | null;
  applies_to_account_groups?: string[] | null;
  applies_to_accounts?: string[] | null;
  applies_to_products?: string[] | null;
  applies_to_categories?: string[] | null;
  minimum_order_amount?: number | null;
  is_active?: boolean;
}

export function useDiscounts() {
  const { user } = useAuth();
  const { orgId } = useOrg();
  const [data, setData] = useState<Discount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!user || !orgId) { setData([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data: rows, error: err } = await supabase
        .from("grow_discounts")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (err) { setError(err.message); setLoading(false); return; }
      setError(null);
      setData((rows ?? []) as Discount[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id, orgId, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const createDiscount = useCallback(async (input: DiscountInput) => {
    if (!orgId) throw new Error("No active org");
    const payload = { ...input, org_id: orgId };
    const { data: row, error: err } = await supabase.from("grow_discounts").insert(payload).select("*").single();
    if (err) throw err;
    refresh();
    return row as Discount;
  }, [orgId, refresh]);

  const updateDiscount = useCallback(async (id: string, patch: Partial<DiscountInput>) => {
    const { data: row, error: err } = await supabase.from("grow_discounts").update(patch).eq("id", id).select("*").single();
    if (err) throw err;
    refresh();
    return row as Discount;
  }, [refresh]);

  const archiveDiscount = useCallback(async (id: string) => {
    const { error: err } = await supabase.from("grow_discounts").update({ is_active: false }).eq("id", id);
    if (err) throw err;
    refresh();
  }, [refresh]);

  const deleteDiscount = useCallback(async (id: string) => {
    const { error: err } = await supabase.from("grow_discounts").delete().eq("id", id);
    if (err) throw err;
    refresh();
  }, [refresh]);

  return { data, loading, error, refresh, createDiscount, updateDiscount, archiveDiscount, deleteDiscount };
}

export function useDiscountStats(discounts: Discount[]) {
  return useMemo(() => {
    const now = Date.now();
    return {
      total: discounts.length,
      active: discounts.filter((d) => {
        if (!d.is_active) return false;
        if (d.valid_from && new Date(d.valid_from).getTime() > now) return false;
        if (d.valid_until && new Date(d.valid_until).getTime() < now) return false;
        return true;
      }).length,
      expiringSoon: discounts.filter((d) => {
        if (!d.is_active || !d.valid_until) return false;
        const exp = new Date(d.valid_until).getTime();
        return exp > now && exp - now < 14 * 24 * 60 * 60 * 1000;
      }).length,
      expired: discounts.filter((d) => d.valid_until && new Date(d.valid_until).getTime() < now).length,
    };
  }, [discounts]);
}
