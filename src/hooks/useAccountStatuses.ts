import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useOrg } from "@/lib/org";

export interface AccountStatus {
  id: string;
  org_id: string;
  name: string;
  color: string | null;
  sort_order: number;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
}

export interface AccountStatusInput {
  name: string;
  color?: string | null;
  sort_order?: number;
  is_active?: boolean;
  is_default?: boolean;
}

/** Default colors offered in the picker for statuses and note attributes. */
export const STATUS_COLORS = [
  "#10B981", // emerald
  "#3B82F6", // blue
  "#8B5CF6", // purple
  "#F97316", // orange
  "#F59E0B", // amber
  "#EF4444", // red
  "#EC4899", // pink
  "#00D4AA", // teal
  "#6B7280", // gray
  "#14B8A6", // cyan
  "#A855F7", // violet
  "#84CC16", // lime
];

export function useAccountStatuses() {
  const { user } = useAuth();
  const { orgId } = useOrg();
  const [data, setData] = useState<AccountStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!user || !orgId) { setData([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data: rows, error: err } = await supabase
        .from("grow_account_statuses")
        .select("*")
        .eq("org_id", orgId)
        .order("sort_order");
      if (cancelled) return;
      if (err) { setError(err.message); setLoading(false); return; }
      setError(null);
      setData((rows ?? []) as AccountStatus[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id, orgId, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const createStatus = useCallback(async (input: AccountStatusInput) => {
    if (!orgId) throw new Error("No active org");
    const next_sort = (data.at(-1)?.sort_order ?? 0) + 1;
    const payload = { ...input, org_id: orgId, sort_order: input.sort_order ?? next_sort };
    const { data: row, error: err } = await supabase.from("grow_account_statuses").insert(payload).select("*").single();
    if (err) throw err;
    refresh();
    return row as AccountStatus;
  }, [orgId, data, refresh]);

  const updateStatus = useCallback(async (id: string, patch: Partial<AccountStatusInput>) => {
    const { data: row, error: err } = await supabase.from("grow_account_statuses").update(patch).eq("id", id).select("*").single();
    if (err) throw err;
    refresh();
    return row as AccountStatus;
  }, [refresh]);

  const deleteStatus = useCallback(async (id: string) => {
    const { error: err } = await supabase.from("grow_account_statuses").delete().eq("id", id);
    if (err) throw err;
    refresh();
  }, [refresh]);

  const reorderStatuses = useCallback(async (orderedIds: string[]) => {
    // Update each status's sort_order to match the new order
    await Promise.all(
      orderedIds.map((id, idx) =>
        supabase.from("grow_account_statuses").update({ sort_order: idx + 1 }).eq("id", id),
      ),
    );
    refresh();
  }, [refresh]);

  const setDefault = useCallback(async (id: string) => {
    if (!orgId) throw new Error("No active org");
    // Clear current defaults in this org, set new one
    await supabase.from("grow_account_statuses").update({ is_default: false }).eq("org_id", orgId);
    const { error: err } = await supabase.from("grow_account_statuses").update({ is_default: true }).eq("id", id);
    if (err) throw err;
    refresh();
  }, [orgId, refresh]);

  return { data, loading, error, refresh, createStatus, updateStatus, deleteStatus, reorderStatuses, setDefault };
}

export function useAccountStatusStats(statuses: AccountStatus[]) {
  return useMemo(() => ({
    total: statuses.length,
    active: statuses.filter((s) => s.is_active).length,
    hasDefault: statuses.some((s) => s.is_default),
  }), [statuses]);
}
