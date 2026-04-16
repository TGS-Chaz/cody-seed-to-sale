import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useOrg } from "@/lib/org";

export interface Disposal {
  id: string;
  org_id: string;
  external_id: string;
  disposal_type: "plant" | "inventory" | string | null;
  batch_id: string | null;
  harvest_id: string | null;
  plant_ids: string[] | null;
  reason: string;
  destruction_method: string | null;
  destruction_mixture: string | null;
  ccrs_destruction_reason: string | null;
  ccrs_destruction_method: string | null;
  pre_disposal_weight_grams: number;
  post_disposal_weight_grams: number | null;
  quarantine_started_at: string;
  quarantine_ends_at: string;
  destroyed_at: string | null;
  destroyer_employee_id: string | null;
  witness_employee_id: string | null;
  status: string | null;
  notes: string | null;
  photo_urls: string[] | null;
  ccrs_reported: boolean | null;
  ccrs_reported_at: string | null;
  created_at: string | null;
  batch?: { id: string; barcode: string } | null;
}

export function useDisposals() {
  const { user } = useAuth();
  const { orgId } = useOrg();
  const [data, setData] = useState<Disposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!user || !orgId) { setData([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data: rows } = await supabase.from("grow_disposals").select("*").eq("org_id", orgId).order("created_at", { ascending: false });
      const batchIds = Array.from(new Set(((rows ?? []) as any[]).map((r) => r.batch_id).filter(Boolean)));
      const { data: batches } = batchIds.length > 0
        ? await supabase.from("grow_batches").select("id, barcode").in("id", batchIds)
        : { data: [] };
      const bById = new Map<string, any>((batches ?? []).map((b: any) => [b.id, b]));
      if (cancelled) return;
      setData(((rows ?? []) as any[]).map((r) => ({ ...r, batch: r.batch_id ? bById.get(r.batch_id) ?? null : null })));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id, orgId, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, refresh };
}

export function useDisposalStats(disposals: Disposal[]) {
  return useMemo(() => {
    const plantCount = disposals.filter((d) => d.disposal_type === "plant").reduce((s, d) => s + (d.plant_ids?.length ?? 0), 0);
    const inventoryCount = disposals.filter((d) => d.disposal_type === "inventory").length;
    const totalWeight = disposals.reduce((s, d) => s + Number(d.pre_disposal_weight_grams ?? 0), 0);
    return {
      total: disposals.length,
      plantCount,
      inventoryCount,
      totalWeight,
    };
  }, [disposals]);
}
