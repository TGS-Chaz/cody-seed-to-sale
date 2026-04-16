import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useOrg } from "@/lib/org";
import { generateExternalId } from "@/lib/ccrs-id";
import type {
  HarvestType, HarvestStatus, StrainType,
} from "@/lib/schema-enums";

export interface Harvest {
  id: string;
  org_id: string;
  name: string;
  strain_id: string | null;
  grow_cycle_id: string | null;
  area_id: string | null;
  harvest_type: HarvestType | null;
  status: HarvestStatus | null;
  wet_weight_grams: number | null;
  dry_weight_grams: number | null;
  waste_weight_grams: number | null;
  harvest_started_at: string | null;
  cure_started_at: string | null;
  cured_at: string | null;
  completed_at: string | null;
  ccrs_external_identifier: string | null;
  flower_lot_external_id: string | null;
  other_material_lot_external_id: string | null;
  flower_lot_weight_grams: number | null;
  other_material_weight_grams: number | null;
  total_plants_harvested: number | null;
  ccrs_reported: boolean | null;
  ccrs_reported_at: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  /** Joined */
  strain?: { id: string; name: string; type: StrainType | null } | null;
  cycle?: { id: string; name: string; phase: string | null } | null;
  area?: { id: string; name: string; canopy_type: string | null } | null;
  /** Derived: batch created from this harvest (finalized) */
  resulting_batch?: { id: string; barcode: string | null; external_id: string } | null;
}

export interface HarvestInput {
  name: string;
  grow_cycle_id: string;
  strain_id?: string | null;
  area_id?: string | null;
  harvest_type: HarvestType;
  harvest_date: string; // → harvest_started_at
  wet_weight_grams?: number | null;
  waste_weight_grams?: number | null;
  flower_lot_external_id?: string | null;
  other_material_lot_external_id?: string | null;
  notes?: string | null;
  /** For partial/manicure: which plants this harvest covers. */
  plant_ids?: string[];
}

export interface HarvestFilters {
  strain_id?: string;
  cycle_id?: string;
  status?: HarvestStatus | "active";
  harvest_type?: HarvestType;
  area_id?: string;
}

export function useHarvests(filters: HarvestFilters = {}) {
  const { user } = useAuth();
  const { orgId } = useOrg();
  const [data, setData] = useState<Harvest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const sig = `${filters.strain_id ?? ""}:${filters.cycle_id ?? ""}:${filters.status ?? ""}:${filters.harvest_type ?? ""}:${filters.area_id ?? ""}`;

  useEffect(() => {
    if (!user || !orgId) { setData([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      let q = supabase.from("grow_harvests").select("*").eq("org_id", orgId);
      if (filters.strain_id) q = q.eq("strain_id", filters.strain_id);
      if (filters.cycle_id) q = q.eq("grow_cycle_id", filters.cycle_id);
      if (filters.harvest_type) q = q.eq("harvest_type", filters.harvest_type);
      if (filters.area_id) q = q.eq("area_id", filters.area_id);
      if (filters.status === "active") q = q.neq("status", "completed");
      else if (filters.status) q = q.eq("status", filters.status);
      const { data: harvests, error: err } = await q.order("harvest_started_at", { ascending: false, nullsFirst: false });
      if (cancelled) return;
      if (err) { setError(err.message); setLoading(false); return; }

      const strainIds = new Set<string>();
      const cycleIds = new Set<string>();
      const areaIds = new Set<string>();
      (harvests ?? []).forEach((h: any) => {
        if (h.strain_id) strainIds.add(h.strain_id);
        if (h.grow_cycle_id) cycleIds.add(h.grow_cycle_id);
        if (h.area_id) areaIds.add(h.area_id);
      });

      const [strainRes, cycleRes, areaRes, batchRes] = await Promise.all([
        strainIds.size > 0 ? supabase.from("grow_strains").select("id, name, type").in("id", Array.from(strainIds)) : Promise.resolve({ data: [] }),
        cycleIds.size > 0 ? supabase.from("grow_cycles").select("id, name, phase").in("id", Array.from(cycleIds)) : Promise.resolve({ data: [] }),
        areaIds.size > 0 ? supabase.from("grow_areas").select("id, name, canopy_type").in("id", Array.from(areaIds)) : Promise.resolve({ data: [] }),
        (harvests ?? []).length > 0
          ? supabase.from("grow_batches").select("id, barcode, external_id, harvest_id").in("harvest_id", (harvests ?? []).map((h: any) => h.id))
          : Promise.resolve({ data: [] }),
      ]);
      if (cancelled) return;

      const strainById = new Map<string, any>(); (strainRes.data ?? []).forEach((s: any) => strainById.set(s.id, s));
      const cycleById = new Map<string, any>(); (cycleRes.data ?? []).forEach((c: any) => cycleById.set(c.id, c));
      const areaById = new Map<string, any>(); (areaRes.data ?? []).forEach((a: any) => areaById.set(a.id, a));
      const batchByHarvest = new Map<string, any>(); (batchRes.data ?? []).forEach((b: any) => batchByHarvest.set(b.harvest_id, b));

      const merged = (harvests ?? []).map((h: any) => ({
        ...h,
        strain: h.strain_id ? strainById.get(h.strain_id) ?? null : null,
        cycle: h.grow_cycle_id ? cycleById.get(h.grow_cycle_id) ?? null : null,
        area: h.area_id ? areaById.get(h.area_id) ?? null : null,
        resulting_batch: batchByHarvest.get(h.id) ?? null,
      })) as Harvest[];

      setData(merged);
      setError(null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, orgId, tick, sig]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  /**
   * Create a harvest from a cycle + optional subset of plants (for partial
   * or manicure harvests). Full harvests leave plant_ids blank — all active
   * plants in the cycle get swept up.
   *
   * Side effects depend on harvest_type:
   *   - Full:     plants → ccrs_plant_state='Harvested', phase='harvested';
   *               cycle.phase → 'harvesting', board card → 'drying'
   *   - Partial:  selected plants → ccrs_plant_state='PartiallyHarvested'
   *               (cycle + board card unchanged — it's still flowering)
   *   - Manicure: plants stay in their current phase (trim-only)
   */
  const createHarvest = useCallback(async (input: HarvestInput): Promise<Harvest> => {
    if (!orgId) throw new Error("No active org");

    // Resolve strain + area from the cycle if not provided
    let strain_id = input.strain_id ?? null;
    let area_id = input.area_id ?? null;
    if (!strain_id || !area_id) {
      const { data: cycle } = await supabase
        .from("grow_cycles").select("strain_id, area_id").eq("id", input.grow_cycle_id).maybeSingle();
      if (cycle) {
        strain_id = strain_id ?? cycle.strain_id ?? null;
        area_id = area_id ?? cycle.area_id ?? null;
      }
    }

    // Determine which plants get included
    let plantIds: string[] = input.plant_ids ?? [];
    if (input.harvest_type === "full" && plantIds.length === 0) {
      const { data: cyclePlants } = await supabase
        .from("grow_plants").select("id").eq("org_id", orgId).eq("grow_cycle_id", input.grow_cycle_id)
        .not("phase", "in", "(destroyed,harvested)");
      plantIds = (cyclePlants ?? []).map((p: any) => p.id);
    }

    const { data: harvest, error: hErr } = await supabase
      .from("grow_harvests")
      .insert({
        org_id: orgId,
        name: input.name.trim(),
        strain_id,
        grow_cycle_id: input.grow_cycle_id,
        area_id,
        harvest_type: input.harvest_type,
        status: "drying",
        harvest_started_at: new Date(input.harvest_date).toISOString(),
        wet_weight_grams: input.wet_weight_grams ?? null,
        waste_weight_grams: input.waste_weight_grams ?? null,
        total_plants_harvested: plantIds.length,
        ccrs_external_identifier: generateExternalId(),
        flower_lot_external_id: input.flower_lot_external_id ?? null,
        other_material_lot_external_id: input.other_material_lot_external_id ?? null,
        notes: input.notes ?? null,
      })
      .select("*").single();
    if (hErr) throw hErr;

    // Join table — one grow_harvest_plants per plant
    if (plantIds.length > 0) {
      await supabase.from("grow_harvest_plants").insert(
        plantIds.map((pid) => ({ harvest_id: harvest!.id, plant_id: pid })),
      );
    }

    // Plant state updates depending on harvest_type
    if (input.harvest_type === "full") {
      await supabase
        .from("grow_plants")
        .update({
          phase: "harvested",
          phase_changed_at: new Date().toISOString(),
          ccrs_plant_state: "Harvested",
          harvest_date: input.harvest_date,
        })
        .in("id", plantIds);
      // Flip cycle to harvesting + move its board card to drying column
      await supabase.from("grow_cycles").update({ phase: "harvesting", actual_harvest_date: input.harvest_date }).eq("id", input.grow_cycle_id);
      await supabase
        .from("grow_board_cards")
        .update({ column_name: "drying", entity_type: "harvest", entity_id: harvest!.id })
        .eq("entity_type", "grow_cycle").eq("entity_id", input.grow_cycle_id);
    } else if (input.harvest_type === "partial") {
      await supabase
        .from("grow_plants")
        .update({
          ccrs_plant_state: "PartiallyHarvested",
          harvest_date: input.harvest_date,
        })
        .in("id", plantIds);
      // Cycle and board card unchanged — the rest of the cycle keeps flowering
    } // manicure: no plant state change

    refresh();
    return harvest as Harvest;
  }, [orgId, refresh]);

  const updateHarvest = useCallback(async (id: string, patch: Partial<Harvest>) => {
    const { data: row, error: err } = await supabase.from("grow_harvests").update(patch).eq("id", id).select("*").single();
    if (err) throw err;
    refresh();
    return row as Harvest;
  }, [refresh]);

  return { data, loading, error, refresh, createHarvest, updateHarvest };
}

export function useHarvestStats(harvests: Harvest[]) {
  return useMemo(() => ({
    total: harvests.length,
    drying: harvests.filter((h) => h.status === "drying").length,
    curing: harvests.filter((h) => h.status === "curing").length,
    cured: harvests.filter((h) => h.status === "cured").length,
    finalized: harvests.filter((h) => h.status === "completed").length,
  }), [harvests]);
}

export function useHarvest(id: string | undefined) {
  const { user } = useAuth();
  const { orgId } = useOrg();
  const [data, setData] = useState<Harvest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!user || !orgId || !id) { setData(null); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data: row, error: err } = await supabase
        .from("grow_harvests").select("*").eq("id", id).eq("org_id", orgId).maybeSingle();
      if (cancelled) return;
      if (err) { setError(err.message); setLoading(false); return; }
      if (!row) { setData(null); setLoading(false); return; }

      const [strainRes, cycleRes, areaRes, batchRes] = await Promise.all([
        row.strain_id ? supabase.from("grow_strains").select("id, name, type").eq("id", row.strain_id).maybeSingle() : Promise.resolve({ data: null }),
        row.grow_cycle_id ? supabase.from("grow_cycles").select("id, name, phase").eq("id", row.grow_cycle_id).maybeSingle() : Promise.resolve({ data: null }),
        row.area_id ? supabase.from("grow_areas").select("id, name, canopy_type").eq("id", row.area_id).maybeSingle() : Promise.resolve({ data: null }),
        supabase.from("grow_batches").select("id, barcode, external_id").eq("harvest_id", id).maybeSingle(),
      ]);
      if (cancelled) return;

      setData({
        ...(row as any),
        strain: (strainRes as any).data ?? null,
        cycle: (cycleRes as any).data ?? null,
        area: (areaRes as any).data ?? null,
        resulting_batch: (batchRes as any).data ?? null,
      } as Harvest);
      setError(null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id, orgId, id, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, refresh };
}

// ─── Weight / status recording ───────────────────────────────────────────────

export function useRecordWetWeight() {
  return useCallback(async (harvestId: string, weight: number, perPlantWeights?: Array<{ plant_id: string; weight: number }>) => {
    const { error: err } = await supabase.from("grow_harvests").update({ wet_weight_grams: weight }).eq("id", harvestId);
    if (err) throw err;
    if (perPlantWeights && perPlantWeights.length > 0) {
      await Promise.all(perPlantWeights.map((p) =>
        supabase.from("grow_harvest_plants").update({ wet_weight_grams: p.weight }).eq("harvest_id", harvestId).eq("plant_id", p.plant_id),
      ));
    }
  }, []);
}

export function useRecordDryWeight() {
  return useCallback(async (harvestId: string, weight: number, wasteWeight?: number | null, perPlantDryWeights?: Array<{ plant_id: string; weight: number }>) => {
    const patch: any = { dry_weight_grams: weight };
    if (wasteWeight != null) patch.waste_weight_grams = wasteWeight;
    const { error: err } = await supabase.from("grow_harvests").update(patch).eq("id", harvestId);
    if (err) throw err;
    if (perPlantDryWeights && perPlantDryWeights.length > 0) {
      await Promise.all(perPlantDryWeights.map((p) =>
        supabase.from("grow_harvest_plants").update({ dry_weight_grams: p.weight }).eq("harvest_id", harvestId).eq("plant_id", p.plant_id),
      ));
    }
  }, []);
}

export function useRecordWaste() {
  return useCallback(async (harvestId: string, weight: number) => {
    const { error: err } = await supabase.from("grow_harvests").update({ waste_weight_grams: weight }).eq("id", harvestId);
    if (err) throw err;
  }, []);
}

export interface StartCureInput {
  cure_date?: string;
  area_id?: string | null;
  target_duration_days?: number;
  notes?: string | null;
}

export function useStartCure() {
  return useCallback(async (harvestId: string, input: StartCureInput = {}) => {
    const cureAt = input.cure_date ? new Date(input.cure_date).toISOString() : new Date().toISOString();
    const patch: any = {
      status: "curing",
      cure_started_at: cureAt,
    };
    if (input.area_id) patch.area_id = input.area_id;
    if (input.notes?.trim()) patch.notes = input.notes.trim();
    const { error: err } = await supabase.from("grow_harvests").update(patch).eq("id", harvestId);
    if (err) throw err;
  }, []);
}

/** Mark a curing harvest as cured (user flipped from Curing → Cured).
 * Separate from Finish Harvest — Cured is a status the grower can hold for
 * days while deciding when to create inventory. */
export function useMarkCured() {
  return useCallback(async (harvestId: string) => {
    const { error: err } = await supabase
      .from("grow_harvests")
      .update({ status: "cured", cured_at: new Date().toISOString() })
      .eq("id", harvestId);
    if (err) throw err;
  }, []);
}

// ─── Finish harvest → batch creation ────────────────────────────────────────

export interface FinishHarvestInput {
  dry_weight_grams: number;
  waste_weight_grams?: number | null;
  product_id: string;
  area_id?: string | null;
  barcode?: string | null;
  is_medical?: boolean;
  notes?: string | null;
}

export function useFinishHarvest() {
  const { user } = useAuth();
  const { orgId } = useOrg();
  return useCallback(async (harvestId: string, input: FinishHarvestInput) => {
    if (!orgId) throw new Error("No active org");

    const { data: harvest, error: hErr } = await supabase
      .from("grow_harvests").select("id, name, strain_id, grow_cycle_id, area_id").eq("id", harvestId).maybeSingle();
    if (hErr) throw hErr;
    if (!harvest) throw new Error("Harvest not found");

    // 1. Record final weights + flip harvest to completed
    const { error: uErr } = await supabase
      .from("grow_harvests")
      .update({
        dry_weight_grams: input.dry_weight_grams,
        waste_weight_grams: input.waste_weight_grams ?? null,
        flower_lot_weight_grams: input.dry_weight_grams,
        total_plants_harvested: undefined,
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", harvestId);
    if (uErr) throw uErr;

    // 2. Complete the originating cycle
    if (harvest.grow_cycle_id) {
      await supabase.from("grow_cycles").update({ phase: "completed" }).eq("id", harvest.grow_cycle_id);
    }

    // 3. Create the inventory batch
    const barcode = input.barcode?.trim() || `B-${Date.now()}`;
    const { data: batch, error: bErr } = await supabase
      .from("grow_batches")
      .insert({
        org_id: orgId,
        external_id: generateExternalId(),
        barcode,
        product_id: input.product_id,
        strain_id: harvest.strain_id,
        area_id: input.area_id ?? harvest.area_id,
        harvest_id: harvest.id,
        source_type: "harvest",
        initial_weight_grams: input.dry_weight_grams,
        current_weight_grams: input.dry_weight_grams,
        initial_quantity: input.dry_weight_grams,
        current_quantity: input.dry_weight_grams,
        is_available: true,
        is_medical: input.is_medical ?? false,
        status: "active",
        notes: input.notes ?? null,
        created_by: user?.id ?? null,
      })
      .select("id, barcode").single();
    if (bErr) throw bErr;

    // 4. Move any board card from "drying" (entity=harvest) to "inventory"
    //    (entity=batch). Upsert handles the case where no card exists.
    const { data: existingCard } = await supabase
      .from("grow_board_cards")
      .select("id")
      .eq("entity_type", "harvest")
      .eq("entity_id", harvest.id)
      .maybeSingle();
    if (existingCard) {
      await supabase
        .from("grow_board_cards")
        .update({ column_name: "inventory", entity_type: "batch", entity_id: batch!.id })
        .eq("id", existingCard.id);
    } else {
      await supabase.from("grow_board_cards").upsert({
        org_id: orgId,
        column_name: "inventory",
        entity_type: "batch",
        entity_id: batch!.id,
        sort_order: 0,
      }, { onConflict: "column_name,entity_type,entity_id" });
    }

    return { batch_id: batch!.id, barcode: batch!.barcode };
  }, [orgId, user?.id]);
}

// ─── Harvest plants + weight log ────────────────────────────────────────────

export function useHarvestPlants(harvestId: string | undefined) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!harvestId) { setData([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data: rows } = await supabase
        .from("grow_harvest_plants").select("*").eq("harvest_id", harvestId);
      if (cancelled) return;
      const plantIds = (rows ?? []).map((r: any) => r.plant_id);
      const plantById = new Map<string, any>();
      if (plantIds.length > 0) {
        const { data: plants } = await supabase
          .from("grow_plants").select("id, plant_identifier, phase, ccrs_plant_state, created_at").in("id", plantIds);
        (plants ?? []).forEach((p: any) => plantById.set(p.id, p));
      }
      setData(((rows ?? []) as any[]).map((hp) => ({
        ...hp,
        plant: plantById.get(hp.plant_id) ?? null,
      })));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [harvestId, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  const updatePlantWeights = useCallback(async (rowId: string, patch: { wet_weight_grams?: number | null; dry_weight_grams?: number | null; notes?: string | null }) => {
    const { error: err } = await supabase.from("grow_harvest_plants").update(patch).eq("id", rowId);
    if (err) throw err;
    refresh();
  }, [refresh]);

  return { data, loading, refresh, updatePlantWeights };
}

/** Timeline of status transitions (weight recordings, cure events) derived
 * from the harvest's timestamp columns. */
export function useHarvestWeightLog(harvest: Harvest | null) {
  return useMemo(() => {
    if (!harvest) return [];
    const events: Array<{ key: string; label: string; at: string; value?: string; detail?: string }> = [];
    if (harvest.harvest_started_at) events.push({
      key: "harvested", label: "Harvested", at: harvest.harvest_started_at,
      detail: harvest.total_plants_harvested ? `${harvest.total_plants_harvested} plant${harvest.total_plants_harvested === 1 ? "" : "s"}` : undefined,
    });
    if (harvest.wet_weight_grams != null) events.push({
      key: "wet", label: "Wet weight recorded", at: harvest.updated_at,
      value: `${Number(harvest.wet_weight_grams).toFixed(0)}g`,
    });
    if (harvest.cure_started_at) events.push({
      key: "cure_start", label: "Cure started", at: harvest.cure_started_at,
    });
    if (harvest.dry_weight_grams != null) {
      const wet = harvest.wet_weight_grams ? Number(harvest.wet_weight_grams) : null;
      const dry = Number(harvest.dry_weight_grams);
      const ratio = wet && wet > 0 ? (dry / wet) * 100 : null;
      events.push({
        key: "dry", label: "Dry weight recorded", at: harvest.updated_at,
        value: `${dry.toFixed(0)}g`,
        detail: ratio != null ? `${ratio.toFixed(1)}% yield` : undefined,
      });
    }
    if (harvest.waste_weight_grams != null) events.push({
      key: "waste", label: "Waste recorded", at: harvest.updated_at,
      value: `${Number(harvest.waste_weight_grams).toFixed(0)}g`,
    });
    if (harvest.cured_at) events.push({
      key: "cured", label: "Cure complete", at: harvest.cured_at,
    });
    if (harvest.completed_at) events.push({
      key: "finalized", label: "Finalized to inventory", at: harvest.completed_at,
    });
    // Sort by timestamp
    return events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  }, [harvest]);
}
