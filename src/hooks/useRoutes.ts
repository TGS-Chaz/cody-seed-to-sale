import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useOrg } from "@/lib/org";
import type { RouteDayOfWeek } from "@/lib/schema-enums";

/** Re-export with the local name for backward compat with existing callers. */
export type DayOfWeek = RouteDayOfWeek;

export interface Route {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  minimum_order_amount: number;
  typical_day_of_week: DayOfWeek | null;
  assigned_driver_id: string | null;
  color: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  driver?: { id: string; first_name: string; last_name: string } | null;
  /** Number of accounts on this route */
  account_count?: number;
}

export interface RouteInput {
  name: string;
  description?: string | null;
  minimum_order_amount?: number;
  typical_day_of_week?: DayOfWeek | null;
  assigned_driver_id?: string | null;
  color?: string | null;
  is_active?: boolean;
}

export const ROUTE_COLORS = [
  "#00D4AA", "#3B82F6", "#A855F7", "#F59E0B", "#F97316", "#F472B6",
  "#10B981", "#6366F1", "#F43F5E", "#06B6D4", "#84CC16", "#D946EF",
];

export const DAY_LABELS: Record<DayOfWeek, string> = {
  sunday: "Sunday", monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday",
  thursday: "Thursday", friday: "Friday", saturday: "Saturday", various: "Various",
};

export function useRoutes() {
  const { user } = useAuth();
  const { orgId } = useOrg();
  const [data, setData] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!user || !orgId) { setData([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [routeRes, driverRes, accRes] = await Promise.all([
        supabase.from("grow_routes").select("*").eq("org_id", orgId).order("name"),
        supabase.from("grow_drivers").select("id, first_name, last_name").eq("org_id", orgId).eq("driver_type", "delivery"),
        supabase.from("grow_accounts").select("id, route_id").eq("org_id", orgId),
      ]);
      if (cancelled) return;
      if (routeRes.error) { setError(routeRes.error.message); setLoading(false); return; }
      const driverById = new Map<string, any>();
      (driverRes.data ?? []).forEach((d: any) => driverById.set(d.id, d));
      const accountCountByRoute = new Map<string, number>();
      (accRes.data ?? []).forEach((a: any) => {
        if (a.route_id) accountCountByRoute.set(a.route_id, (accountCountByRoute.get(a.route_id) ?? 0) + 1);
      });
      const merged = (routeRes.data ?? []).map((r: any) => ({
        ...r,
        driver: r.assigned_driver_id ? driverById.get(r.assigned_driver_id) ?? null : null,
        account_count: accountCountByRoute.get(r.id) ?? 0,
      })) as Route[];
      setError(null);
      setData(merged);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id, orgId, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const createRoute = useCallback(async (input: RouteInput): Promise<Route> => {
    if (!orgId) throw new Error("No active org");
    const { data: row, error: err } = await supabase
      .from("grow_routes")
      .insert({ ...input, org_id: orgId, minimum_order_amount: input.minimum_order_amount ?? 0 })
      .select("*").single();
    if (err) throw err;
    refresh();
    return row as any as Route;
  }, [orgId, refresh]);

  const updateRoute = useCallback(async (id: string, patch: Partial<RouteInput>) => {
    const { data: row, error: err } = await supabase.from("grow_routes").update(patch).eq("id", id).select("*").single();
    if (err) throw err;
    refresh();
    return row as any as Route;
  }, [refresh]);

  const archiveRoute = useCallback(async (id: string) => {
    const { error: err } = await supabase.from("grow_routes").update({ is_active: false }).eq("id", id);
    if (err) throw err;
    refresh();
  }, [refresh]);

  return { data, loading, error, refresh, createRoute, updateRoute, archiveRoute };
}

export function useRouteStats(routes: Route[]) {
  return useMemo(() => ({
    total: routes.length,
    active: routes.filter((r) => r.is_active).length,
    accountsAssigned: routes.reduce((sum, r) => sum + (r.account_count ?? 0), 0),
  }), [routes]);
}
