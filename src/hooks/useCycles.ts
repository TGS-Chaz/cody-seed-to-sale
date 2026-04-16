import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useOrg } from "@/lib/org";
import type { CyclePhase, CcrsGrowthStage, StrainType } from "@/lib/schema-enums";

export interface Cycle {
  id: string;
  org_id: string;
  name: string;
  strain_id: string | null;
  area_id: string | null;
  phase: CyclePhase | null;
  start_date: string | null;
  target_harvest_date: string | null;
  actual_harvest_date: string | null;
  plant_count: number | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  /** Joined strain */
  strain?: { id: string; name: string; type: StrainType | null; average_flower_days: number | null } | null;
  /** Joined area */
  area?: { id: string; name: string; canopy_sqft: number | null; facility_id: string | null } | null;
  /** Derived counts (live-queried for list view) */
  active_plant_count?: number;
  harvest_count?: number;
  has_board_card?: boolean;
}

export interface CycleInput {
  name: string;
  strain_id: string;
  area_id: string;
  phase?: CyclePhase;
  start_date?: string | null;
  target_harvest_date?: string | null;
  plant_count?: number | null;
  notes?: string | null;
}

export interface CycleFilters {
  strain_id?: string;
  area_id?: string;
  phase?: CyclePhase;
  /** 'active' = not completed/cancelled; 'completed' only; or 'all'. */
  status?: "active" | "completed" | "all";
}

/** List cycles with strain + area joined, plus active plant count and
 * harvest count — everything the list page and detail cards need. */
export function useCycles(filters: CycleFilters = {}) {
  const { user } = useAuth();
  const { orgId } = useOrg();
  const [data, setData] = useState<Cycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // Primitive signature so the effect only re-runs on actual filter changes
  const sig = `${filters.strain_id ?? ""}:${filters.area_id ?? ""}:${filters.phase ?? ""}:${filters.status ?? ""}`;

  useEffect(() => {
    if (!user || !orgId) { setData([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      let q = supabase.from("grow_cycles").select("*").eq("org_id", orgId);
      if (filters.strain_id) q = q.eq("strain_id", filters.strain_id);
      if (filters.area_id) q = q.eq("area_id", filters.area_id);
      if (filters.phase) q = q.eq("phase", filters.phase);
      if (filters.status === "active") q = q.not("phase", "in", "(completed,cancelled)");
      if (filters.status === "completed") q = q.eq("phase", "completed");
      const { data: cycles, error: err } = await q.order("start_date", { ascending: false });
      if (cancelled) return;
      if (err) { setError(err.message); setLoading(false); return; }

      const cycleIds = (cycles ?? []).map((c: any) => c.id);
      const strainIds = new Set<string>();
      const areaIds = new Set<string>();
      (cycles ?? []).forEach((c: any) => {
        if (c.strain_id) strainIds.add(c.strain_id);
        if (c.area_id) areaIds.add(c.area_id);
      });

      const [strainRes, areaRes, plantRes, harvestRes, boardRes] = await Promise.all([
        strainIds.size > 0 ? supabase.from("grow_strains").select("id, name, type, average_flower_days").in("id", Array.from(strainIds)) : Promise.resolve({ data: [] }),
        areaIds.size > 0 ? supabase.from("grow_areas").select("id, name, canopy_sqft, facility_id").in("id", Array.from(areaIds)) : Promise.resolve({ data: [] }),
        cycleIds.length > 0 ? supabase.from("grow_plants").select("grow_cycle_id").in("grow_cycle_id", cycleIds).not("phase", "in", "(destroyed,harvested)") : Promise.resolve({ data: [] }),
        cycleIds.length > 0 ? supabase.from("grow_harvests").select("grow_cycle_id").in("grow_cycle_id", cycleIds) : Promise.resolve({ data: [] }),
        cycleIds.length > 0 ? supabase.from("grow_board_cards").select("entity_id").eq("entity_type", "grow_cycle").in("entity_id", cycleIds) : Promise.resolve({ data: [] }),
      ]);
      if (cancelled) return;

      const strainById = new Map<string, any>(); (strainRes.data ?? []).forEach((s: any) => strainById.set(s.id, s));
      const areaById = new Map<string, any>(); (areaRes.data ?? []).forEach((a: any) => areaById.set(a.id, a));
      const plantCount = new Map<string, number>();
      (plantRes.data ?? []).forEach((p: any) => {
        plantCount.set(p.grow_cycle_id, (plantCount.get(p.grow_cycle_id) ?? 0) + 1);
      });
      const harvestCount = new Map<string, number>();
      (harvestRes.data ?? []).forEach((h: any) => {
        harvestCount.set(h.grow_cycle_id, (harvestCount.get(h.grow_cycle_id) ?? 0) + 1);
      });
      const boardSet = new Set<string>();
      (boardRes.data ?? []).forEach((b: any) => boardSet.add(b.entity_id));

      const merged = (cycles ?? []).map((c: any) => ({
        ...c,
        strain: c.strain_id ? strainById.get(c.strain_id) ?? null : null,
        area: c.area_id ? areaById.get(c.area_id) ?? null : null,
        active_plant_count: plantCount.get(c.id) ?? 0,
        harvest_count: harvestCount.get(c.id) ?? 0,
        has_board_card: boardSet.has(c.id),
      })) as Cycle[];

      setData(merged);
      setError(null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, orgId, tick, sig]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const createCycle = useCallback(async (input: CycleInput): Promise<Cycle> => {
    if (!orgId) throw new Error("No active org");
    const payload = {
      org_id: orgId,
      name: input.name.trim(),
      strain_id: input.strain_id,
      area_id: input.area_id,
      phase: input.phase ?? "vegetative",
      start_date: input.start_date ?? new Date().toISOString().slice(0, 10),
      target_harvest_date: input.target_harvest_date ?? null,
      plant_count: input.plant_count ?? 0,
      notes: input.notes ?? null,
    };
    const { data: row, error: err } = await supabase.from("grow_cycles").insert(payload).select("*").single();
    if (err) throw err;
    // Auto-create the board card so manually-created cycles show up on the
    // Grow Board immediately (same behavior as promote-from-source)
    const col = input.phase === "flowering" ? "flowering" : "vegetative";
    await supabase.from("grow_board_cards").upsert({
      org_id: orgId,
      column_name: col,
      entity_type: "grow_cycle",
      entity_id: row.id,
      sort_order: 0,
    }, { onConflict: "column_name,entity_type,entity_id" });
    refresh();
    return row as Cycle;
  }, [orgId, refresh]);

  const updateCycle = useCallback(async (id: string, patch: Partial<CycleInput>) => {
    const { data: row, error: err } = await supabase.from("grow_cycles").update(patch).eq("id", id).select("*").single();
    if (err) throw err;
    refresh();
    return row as Cycle;
  }, [refresh]);

  const archiveCycle = useCallback(async (id: string) => {
    const { error: err } = await supabase.from("grow_cycles").update({ phase: "completed" }).eq("id", id);
    if (err) throw err;
    // Remove the board card so the cycle disappears from the Board
    await supabase.from("grow_board_cards").delete().eq("entity_type", "grow_cycle").eq("entity_id", id);
    refresh();
  }, [refresh]);

  return { data, loading, error, refresh, createCycle, updateCycle, archiveCycle };
}

export function useCycleStats(cycles: Cycle[]) {
  return useMemo(() => ({
    total: cycles.length,
    vegetative: cycles.filter((c) => c.phase === "vegetative").length,
    flowering: cycles.filter((c) => c.phase === "flowering").length,
    harvesting: cycles.filter((c) => c.phase === "harvesting" || c.phase === "ready_for_harvest").length,
    completed: cycles.filter((c) => c.phase === "completed").length,
  }), [cycles]);
}

export function useCycle(id: string | undefined) {
  const { user } = useAuth();
  const { orgId } = useOrg();
  const [data, setData] = useState<Cycle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!user || !orgId || !id) { setData(null); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data: row, error: err } = await supabase
        .from("grow_cycles").select("*").eq("id", id).eq("org_id", orgId).maybeSingle();
      if (cancelled) return;
      if (err) { setError(err.message); setLoading(false); return; }
      if (!row) { setData(null); setLoading(false); return; }

      const [strainRes, areaRes, plantCountRes, harvestCountRes, boardRes] = await Promise.all([
        row.strain_id ? supabase.from("grow_strains").select("id, name, type, average_flower_days").eq("id", row.strain_id).maybeSingle() : Promise.resolve({ data: null }),
        row.area_id ? supabase.from("grow_areas").select("id, name, canopy_sqft, facility_id").eq("id", row.area_id).maybeSingle() : Promise.resolve({ data: null }),
        supabase.from("grow_plants").select("id", { count: "exact", head: true }).eq("grow_cycle_id", id).not("phase", "in", "(destroyed,harvested)"),
        supabase.from("grow_harvests").select("id", { count: "exact", head: true }).eq("grow_cycle_id", id),
        supabase.from("grow_board_cards").select("id").eq("entity_type", "grow_cycle").eq("entity_id", id).maybeSingle(),
      ]);
      if (cancelled) return;

      setData({
        ...(row as any),
        strain: (strainRes as any).data ?? null,
        area: (areaRes as any).data ?? null,
        active_plant_count: plantCountRes.count ?? 0,
        harvest_count: harvestCountRes.count ?? 0,
        has_board_card: !!(boardRes as any).data,
      } as Cycle);
      setError(null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id, orgId, id, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, refresh };
}

/** Plants assigned to a cycle — enriched with strain + phenotype for the detail page. */
export function useCyclePlants(cycleId: string | undefined) {
  const { orgId } = useOrg();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId || !cycleId) { setData([]); setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const { data: plants } = await supabase
        .from("grow_plants").select("*").eq("org_id", orgId).eq("grow_cycle_id", cycleId)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      const phenoIds = Array.from(new Set((plants ?? []).map((p: any) => p.phenotype_id).filter(Boolean))) as string[];
      const motherIds = Array.from(new Set((plants ?? []).map((p: any) => p.mother_plant_id).filter(Boolean))) as string[];
      const [phenoRes, motherRes] = await Promise.all([
        phenoIds.length > 0 ? supabase.from("grow_phenotypes").select("id, pheno_number, pheno_name").in("id", phenoIds) : Promise.resolve({ data: [] }),
        motherIds.length > 0 ? supabase.from("grow_plants").select("id, plant_identifier").in("id", motherIds) : Promise.resolve({ data: [] }),
      ]);
      const phenoById = new Map<string, any>(); (phenoRes.data ?? []).forEach((p: any) => phenoById.set(p.id, p));
      const motherById = new Map<string, any>(); (motherRes.data ?? []).forEach((p: any) => motherById.set(p.id, p));
      setData(((plants ?? []) as any[]).map((p) => ({
        ...p,
        phenotype: p.phenotype_id ? phenoById.get(p.phenotype_id) ?? null : null,
        mother_plant: p.mother_plant_id ? motherById.get(p.mother_plant_id) ?? null : null,
      })));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [orgId, cycleId]);

  return { data, loading };
}

/** Harvests tied to a cycle. */
export function useCycleHarvests(cycleId: string | undefined) {
  const { orgId } = useOrg();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId || !cycleId) { setData([]); setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const { data: rows } = await supabase
        .from("grow_harvests").select("*").eq("org_id", orgId).eq("grow_cycle_id", cycleId)
        .order("harvest_started_at", { ascending: false });
      if (cancelled) return;
      setData(rows ?? []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [orgId, cycleId]);

  return { data, loading };
}

/**
 * Environmental readings for the cycle's area, scoped to the cycle's date
 * range so growers can see what conditions actually happened during this
 * run (vs. the all-time view on the Areas page).
 */
export function useCycleEnvironment(cycle: Cycle | null) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!cycle?.area_id || !cycle.start_date) { setData([]); setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const from = new Date(cycle.start_date as string).toISOString();
      const to = cycle.actual_harvest_date
        ? new Date(cycle.actual_harvest_date).toISOString()
        : new Date().toISOString();
      const { data: readings } = await supabase
        .from("grow_environmental_readings").select("*")
        .eq("area_id", cycle.area_id)
        .gte("recorded_at", from)
        .lte("recorded_at", to)
        .order("recorded_at", { ascending: true });
      if (cancelled) return;
      setData(readings ?? []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [cycle?.area_id, cycle?.start_date, cycle?.actual_harvest_date]);

  return { data, loading };
}

/**
 * Computed yield metrics for a cycle. Uses harvest weights + canopy sqft
 * + plant count to derive g/sqft, g/plant, and g/day. Returns null fields
 * when inputs are missing so the UI can show "—" gracefully.
 */
export function useCycleYield(cycle: Cycle | null, harvests: any[]) {
  return useMemo(() => {
    if (!cycle || harvests.length === 0) {
      return {
        total_dry_g: null as number | null,
        total_wet_g: null as number | null,
        total_waste_g: null as number | null,
        dry_wet_ratio: null as number | null,
        g_per_sqft: null as number | null,
        g_per_plant: null as number | null,
        g_per_day: null as number | null,
        days_total: null as number | null,
      };
    }
    const dry = harvests.reduce((s, h) => s + Number(h.dry_weight_grams ?? 0), 0);
    const wet = harvests.reduce((s, h) => s + Number(h.wet_weight_grams ?? 0), 0);
    const waste = harvests.reduce((s, h) => s + Number(h.waste_weight_grams ?? 0), 0);
    const sqft = cycle.area?.canopy_sqft ?? null;
    const plantCount = cycle.plant_count ?? null;
    const start = cycle.start_date ? new Date(cycle.start_date).getTime() : null;
    const end = cycle.actual_harvest_date
      ? new Date(cycle.actual_harvest_date).getTime()
      : harvests[0]?.harvest_started_at ? new Date(harvests[0].harvest_started_at).getTime() : null;
    const days = start && end ? Math.max(1, Math.round((end - start) / 86400000)) : null;
    return {
      total_dry_g: dry > 0 ? dry : null,
      total_wet_g: wet > 0 ? wet : null,
      total_waste_g: waste > 0 ? waste : null,
      dry_wet_ratio: wet > 0 && dry > 0 ? (dry / wet) * 100 : null,
      g_per_sqft: sqft && dry > 0 ? dry / sqft : null,
      g_per_plant: plantCount && plantCount > 0 && dry > 0 ? dry / plantCount : null,
      g_per_day: days && dry > 0 ? dry / days : null,
      days_total: days,
    };
  }, [cycle, harvests]);
}

/**
 * Flip every active plant in a cycle to the new growth stage and update the
 * cycle's phase + board card in sync. Used by the cycle detail page's
 * Phase Change action.
 */
export function usePhaseChangeCycle() {
  return useCallback(async (cycleId: string, newPhase: CyclePhase) => {
    // Map cycle phase → plant growth stage
    const stage: CcrsGrowthStage | null = (() => {
      if (newPhase === "vegetative") return "Vegetative";
      if (newPhase === "flowering") return "Flowering";
      return null;
    })();

    await supabase.from("grow_cycles").update({ phase: newPhase }).eq("id", cycleId);

    if (stage) {
      await supabase.from("grow_plants")
        .update({
          phase: newPhase === "flowering" ? "flowering" : "vegetative",
          ccrs_growth_stage: stage,
          phase_changed_at: new Date().toISOString(),
        })
        .eq("grow_cycle_id", cycleId)
        .not("phase", "in", "(destroyed,harvested)");
    }

    // Sync board card column
    const col = newPhase === "flowering" ? "flowering" : newPhase === "vegetative" ? "vegetative" : null;
    if (col) {
      await supabase.from("grow_board_cards")
        .update({ column_name: col })
        .eq("entity_type", "grow_cycle").eq("entity_id", cycleId);
    }
  }, []);
}
