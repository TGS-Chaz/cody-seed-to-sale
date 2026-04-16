import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useOrg } from "@/lib/org";
import { generateExternalId } from "@/lib/ccrs-id";
import type {
  StrainType, StrainDifficulty, StrainEnvironment, StrainGrowthPattern,
  LineageParentType,
} from "@/lib/schema-enums";

export interface Strain {
  id: string;
  org_id: string;
  external_id: string;
  name: string;
  type: StrainType | null;
  breeder: string | null;
  genetics: string | null;
  description: string | null;
  ccrs_notes: string | null;
  image_url: string | null;
  dominant_terpenes: string[] | null;
  flavor_profile: string[] | null;
  effects: string[] | null;
  difficulty: StrainDifficulty | null;
  preferred_environment: StrainEnvironment | null;
  growth_pattern: StrainGrowthPattern | null;
  average_flower_days: number | null;
  average_thc_pct: number | null;
  average_cbd_pct: number | null;
  is_active: boolean;
  ccrs_created_by_username: string | null;
  ccrs_updated_by_username: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  /** Joined count: active plants of this strain (phase NOT destroyed/harvested) */
  active_plant_count?: number;
  /** Joined count: phenotypes defined for this strain */
  phenotype_count?: number;
}

export interface StrainInput {
  name: string;
  type: StrainType;
  breeder?: string | null;
  genetics?: string | null;
  description?: string | null;
  ccrs_notes?: string | null;
  image_url?: string | null;
  dominant_terpenes?: string[] | null;
  flavor_profile?: string[] | null;
  effects?: string[] | null;
  difficulty?: StrainDifficulty | null;
  preferred_environment?: StrainEnvironment | null;
  growth_pattern?: StrainGrowthPattern | null;
  average_flower_days?: number | null;
  average_thc_pct?: number | null;
  average_cbd_pct?: number | null;
  is_active?: boolean;
}

export interface StrainLineageInput {
  parent_strain_id?: string | null;
  parent_name_external?: string | null;
  parent_type: LineageParentType;
  generation?: string | null;
  breeder_name?: string | null;
}

export interface StrainLineage {
  id: string;
  strain_id: string;
  parent_strain_id: string | null;
  parent_name_external: string | null;
  parent_type: LineageParentType;
  percentage: number | null;
  generation: string | null;
  breeder_name: string | null;
  notes: string | null;
  created_at: string;
  /** Joined parent strain info, if parent_strain_id is set */
  parent_strain?: { id: string; name: string; type: StrainType | null } | null;
}

/** List all active strains in the org with derived counts merged client-side. */
export function useStrains() {
  const { user } = useAuth();
  const { orgId } = useOrg();
  const [data, setData] = useState<Strain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!user || !orgId) { setData([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      // Two-query pattern: strains + counts from plants/phenotypes, merged
      const [strainRes, plantRes, phenoRes] = await Promise.all([
        supabase.from("grow_strains").select("*").eq("org_id", orgId).order("name"),
        supabase
          .from("grow_plants")
          .select("strain_id, phase")
          .eq("org_id", orgId)
          .not("phase", "in", "(destroyed,harvested)"),
        supabase.from("grow_phenotypes").select("strain_id").eq("org_id", orgId).eq("is_retired", false),
      ]);
      if (cancelled) return;
      if (strainRes.error) { setError(strainRes.error.message); setLoading(false); return; }

      const plantCountById = new Map<string, number>();
      (plantRes.data ?? []).forEach((p: any) => {
        if (!p.strain_id) return;
        plantCountById.set(p.strain_id, (plantCountById.get(p.strain_id) ?? 0) + 1);
      });
      const phenoCountById = new Map<string, number>();
      (phenoRes.data ?? []).forEach((p: any) => {
        phenoCountById.set(p.strain_id, (phenoCountById.get(p.strain_id) ?? 0) + 1);
      });

      const merged = (strainRes.data ?? []).map((s: any) => ({
        ...s,
        active_plant_count: plantCountById.get(s.id) ?? 0,
        phenotype_count: phenoCountById.get(s.id) ?? 0,
      })) as Strain[];

      setData(merged);
      setError(null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id, orgId, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const createStrain = useCallback(async (input: StrainInput) => {
    if (!orgId) throw new Error("No active org");
    const payload = {
      ...input,
      org_id: orgId,
      external_id: generateExternalId(),
      is_active: input.is_active ?? true,
    };
    const { data: row, error: err } = await supabase.from("grow_strains").insert(payload).select("*").single();
    if (err) throw err;
    refresh();
    return row as Strain;
  }, [orgId, refresh]);

  const updateStrain = useCallback(async (id: string, patch: Partial<StrainInput>) => {
    const { data: row, error: err } = await supabase.from("grow_strains").update(patch).eq("id", id).select("*").single();
    if (err) throw err;
    refresh();
    return row as Strain;
  }, [refresh]);

  const archiveStrain = useCallback(async (id: string) => {
    const { error: err } = await supabase.from("grow_strains").update({ is_active: false }).eq("id", id);
    if (err) throw err;
    refresh();
  }, [refresh]);

  const duplicateStrain = useCallback(async (strain: Strain): Promise<Strain> => {
    if (!orgId) throw new Error("No active org");
    // Find an available name
    let name = `${strain.name} (copy)`;
    let suffix = 1;
    while (true) {
      const { data: existing } = await supabase
        .from("grow_strains")
        .select("id")
        .eq("org_id", orgId)
        .eq("name", name)
        .maybeSingle();
      if (!existing) break;
      suffix++;
      name = `${strain.name} (copy ${suffix})`;
    }
    const { id: _id, created_at: _c, updated_at: _u, external_id: _e, active_plant_count: _a, phenotype_count: _p, ...rest } = strain;
    const { data: row, error: err } = await supabase
      .from("grow_strains")
      .insert({ ...rest, name, external_id: generateExternalId() })
      .select("*")
      .single();
    if (err) throw err;
    refresh();
    return row as Strain;
  }, [orgId, refresh]);

  return { data, loading, error, refresh, createStrain, updateStrain, archiveStrain, duplicateStrain };
}

export function useStrainStats(strains: Strain[]) {
  return useMemo(() => ({
    total: strains.length,
    indica: strains.filter((s) => s.type === "Indica").length,
    sativa: strains.filter((s) => s.type === "Sativa").length,
    hybrid: strains.filter((s) => s.type === "Hybrid").length,
    cbd: strains.filter((s) => s.type === "CBD" || s.type === "High CBD").length,
  }), [strains]);
}

/** Single-strain detail with counts + lineage-aware data. */
export function useStrain(id: string | undefined) {
  const { user } = useAuth();
  const { orgId } = useOrg();
  const [data, setData] = useState<Strain | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!user || !orgId || !id) { setData(null); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data: row, error: err } = await supabase
        .from("grow_strains")
        .select("*")
        .eq("id", id)
        .eq("org_id", orgId)
        .maybeSingle();
      if (cancelled) return;
      if (err) { setError(err.message); setLoading(false); return; }
      if (!row) { setData(null); setLoading(false); return; }

      const [plantCountRes, phenoCountRes] = await Promise.all([
        supabase
          .from("grow_plants")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId)
          .eq("strain_id", id)
          .not("phase", "in", "(destroyed,harvested)"),
        supabase
          .from("grow_phenotypes")
          .select("id", { count: "exact", head: true })
          .eq("strain_id", id)
          .eq("is_retired", false),
      ]);
      if (cancelled) return;

      setData({
        ...(row as any),
        active_plant_count: plantCountRes.count ?? 0,
        phenotype_count: phenoCountRes.count ?? 0,
      } as Strain);
      setError(null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id, orgId, id, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, refresh };
}

/** Parents of a strain from grow_strain_lineage, with the named parent strain merged in. */
export function useStrainLineage(strainId: string | undefined) {
  const { orgId } = useOrg();
  const [data, setData] = useState<StrainLineage[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!orgId || !strainId) { setData([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data: rows } = await supabase
        .from("grow_strain_lineage")
        .select("*")
        .eq("strain_id", strainId);
      if (cancelled) return;

      const parentIds = Array.from(new Set((rows ?? []).map((r: any) => r.parent_strain_id).filter(Boolean))) as string[];
      const parentById = new Map<string, any>();
      if (parentIds.length > 0) {
        const { data: parents } = await supabase
          .from("grow_strains")
          .select("id, name, type")
          .in("id", parentIds);
        (parents ?? []).forEach((p: any) => parentById.set(p.id, p));
      }

      setData(((rows ?? []) as any[]).map((r) => ({
        ...r,
        parent_strain: r.parent_strain_id ? parentById.get(r.parent_strain_id) ?? null : null,
      })) as StrainLineage[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [orgId, strainId, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const addLineage = useCallback(async (input: StrainLineageInput) => {
    if (!strainId) throw new Error("No strain");
    const { error: err } = await supabase.from("grow_strain_lineage").insert({
      strain_id: strainId,
      parent_strain_id: input.parent_strain_id ?? null,
      parent_name_external: input.parent_name_external ?? null,
      parent_type: input.parent_type,
      generation: input.generation ?? null,
      breeder_name: input.breeder_name ?? null,
    });
    if (err) throw err;
    refresh();
  }, [strainId, refresh]);

  const removeLineage = useCallback(async (id: string) => {
    const { error: err } = await supabase.from("grow_strain_lineage").delete().eq("id", id);
    if (err) throw err;
    refresh();
  }, [refresh]);

  /** Replace all lineage rows for this strain with the given set. Useful
   * from the strain form where we treat the Mother/Father selects as a
   * small authoritative set rather than individual rows. */
  const replaceLineage = useCallback(async (rows: StrainLineageInput[]) => {
    if (!strainId) throw new Error("No strain");
    await supabase.from("grow_strain_lineage").delete().eq("strain_id", strainId);
    if (rows.length > 0) {
      const payload = rows.map((r) => ({
        strain_id: strainId,
        parent_strain_id: r.parent_strain_id ?? null,
        parent_name_external: r.parent_name_external ?? null,
        parent_type: r.parent_type,
        generation: r.generation ?? null,
        breeder_name: r.breeder_name ?? null,
      }));
      const { error: err } = await supabase.from("grow_strain_lineage").insert(payload);
      if (err) throw err;
    }
    refresh();
  }, [strainId, refresh]);

  return { data, loading, refresh, addLineage, removeLineage, replaceLineage };
}

// ─── Phenotypes ────────────────────────────────────────────────────────────────

export interface Phenotype {
  id: string;
  org_id: string;
  strain_id: string;
  pheno_number: string;
  pheno_name: string | null;
  mother_plant_id: string | null;
  thc_avg: number | null;
  cbd_avg: number | null;
  total_terpenes_avg: number | null;
  yield_avg_grams: number | null;
  flower_days_avg: number | null;
  is_keeper: boolean;
  is_retired: boolean;
  notes: string | null;
  photo_urls: string[] | null;
  observations: Record<string, any> | null;
  created_at: string;
  updated_at: string;
  mother_plant?: { id: string; plant_tag: string | null } | null;
}

export interface PhenotypeInput {
  strain_id: string;
  pheno_number: string;
  pheno_name?: string | null;
  mother_plant_id?: string | null;
  thc_avg?: number | null;
  cbd_avg?: number | null;
  total_terpenes_avg?: number | null;
  yield_avg_grams?: number | null;
  flower_days_avg?: number | null;
  is_keeper?: boolean;
  is_retired?: boolean;
  notes?: string | null;
  photo_urls?: string[] | null;
}

export function useStrainPhenotypes(strainId: string | undefined) {
  const { orgId } = useOrg();
  const [data, setData] = useState<Phenotype[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!orgId || !strainId) { setData([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data: rows } = await supabase
        .from("grow_phenotypes")
        .select("*")
        .eq("strain_id", strainId)
        .order("pheno_number");
      if (cancelled) return;

      const motherIds = Array.from(new Set((rows ?? []).map((r: any) => r.mother_plant_id).filter(Boolean))) as string[];
      const motherById = new Map<string, any>();
      if (motherIds.length > 0) {
        const { data: plants } = await supabase
          .from("grow_plants")
          .select("id, plant_tag")
          .in("id", motherIds);
        (plants ?? []).forEach((p: any) => motherById.set(p.id, p));
      }

      setData(((rows ?? []) as any[]).map((p) => ({
        ...p,
        mother_plant: p.mother_plant_id ? motherById.get(p.mother_plant_id) ?? null : null,
      })) as Phenotype[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [orgId, strainId, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  /** Suggest the next available pheno_number (#1, #2, …) for this strain. */
  const nextPhenoNumber = useMemo(() => {
    const nums = data.map((p) => Number(p.pheno_number.replace(/^#?/, ""))).filter((n) => Number.isFinite(n));
    const max = nums.length > 0 ? Math.max(...nums) : 0;
    return `#${max + 1}`;
  }, [data]);

  const createPhenotype = useCallback(async (input: PhenotypeInput) => {
    if (!orgId) throw new Error("No active org");
    const payload = { ...input, org_id: orgId };
    const { data: row, error: err } = await supabase.from("grow_phenotypes").insert(payload).select("*").single();
    if (err) throw err;
    refresh();
    return row as Phenotype;
  }, [orgId, refresh]);

  const updatePhenotype = useCallback(async (id: string, patch: Partial<PhenotypeInput>) => {
    const { data: row, error: err } = await supabase.from("grow_phenotypes").update(patch).eq("id", id).select("*").single();
    if (err) throw err;
    refresh();
    return row as Phenotype;
  }, [refresh]);

  const retirePhenotype = useCallback(async (id: string) => {
    const { error: err } = await supabase.from("grow_phenotypes").update({ is_retired: true }).eq("id", id);
    if (err) throw err;
    refresh();
  }, [refresh]);

  const setKeeper = useCallback(async (id: string, keeper: boolean) => {
    const { error: err } = await supabase.from("grow_phenotypes").update({ is_keeper: keeper }).eq("id", id);
    if (err) throw err;
    refresh();
  }, [refresh]);

  return { data, loading, refresh, createPhenotype, updatePhenotype, retirePhenotype, setKeeper, nextPhenoNumber };
}

// ─── Related records for detail page ───────────────────────────────────────────

/** Grow cycles for a strain, with yield summary from harvests. */
export function useStrainCycles(strainId: string | undefined) {
  const { orgId } = useOrg();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId || !strainId) { setData([]); setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const { data: cycles } = await supabase
        .from("grow_cycles")
        .select("*")
        .eq("org_id", orgId)
        .eq("strain_id", strainId)
        .order("start_date", { ascending: false });
      if (cancelled) return;
      const ids = (cycles ?? []).map((c: any) => c.id);
      let yieldByCycle = new Map<string, number>();
      if (ids.length > 0) {
        const { data: harvests } = await supabase
          .from("grow_harvests")
          .select("cycle_id, total_wet_weight_grams, total_dry_weight_grams")
          .in("cycle_id", ids);
        (harvests ?? []).forEach((h: any) => {
          const w = Number(h.total_dry_weight_grams ?? h.total_wet_weight_grams ?? 0);
          yieldByCycle.set(h.cycle_id, (yieldByCycle.get(h.cycle_id) ?? 0) + w);
        });
      }
      const merged = (cycles ?? []).map((c: any) => ({
        ...c,
        total_yield_grams: yieldByCycle.get(c.id) ?? 0,
      }));
      setData(merged);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [orgId, strainId]);

  return { data, loading };
}

/** Lab results for any batch that traces back to this strain. */
export function useStrainLabResults(strainId: string | undefined) {
  const { orgId } = useOrg();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId || !strainId) { setData([]); setLoading(false); return; }
    let cancelled = false;
    (async () => {
      // Find all harvests for this strain, then batches from those harvests,
      // then QA results on those batches. Three queries, merged client-side.
      const { data: cycles } = await supabase
        .from("grow_cycles")
        .select("id")
        .eq("org_id", orgId)
        .eq("strain_id", strainId);
      const cycleIds = (cycles ?? []).map((c: any) => c.id);
      if (cycleIds.length === 0) { if (!cancelled) { setData([]); setLoading(false); } return; }

      const { data: harvests } = await supabase
        .from("grow_harvests")
        .select("id")
        .in("cycle_id", cycleIds);
      const harvestIds = (harvests ?? []).map((h: any) => h.id);
      if (harvestIds.length === 0) { if (!cancelled) { setData([]); setLoading(false); } return; }

      const { data: batches } = await supabase
        .from("grow_batches")
        .select("id, external_id, source_type, source_harvest_id")
        .eq("org_id", orgId)
        .in("source_harvest_id", harvestIds);
      const batchIds = (batches ?? []).map((b: any) => b.id);
      if (batchIds.length === 0) { if (!cancelled) { setData([]); setLoading(false); } return; }

      const { data: results } = await supabase
        .from("grow_qa_results")
        .select("*")
        .eq("org_id", orgId)
        .in("batch_id", batchIds)
        .order("test_completed_at", { ascending: false });
      if (cancelled) return;

      const batchById = new Map<string, any>();
      (batches ?? []).forEach((b: any) => batchById.set(b.id, b));
      const merged = (results ?? []).map((r: any) => ({
        ...r,
        batch: batchById.get(r.batch_id) ?? null,
      }));
      setData(merged);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [orgId, strainId]);

  return { data, loading };
}

/** Active plants of this strain (phase NOT destroyed/harvested/sold). */
export function useStrainActivePlants(strainId: string | undefined) {
  const { orgId } = useOrg();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId || !strainId) { setData([]); setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const { data: plants } = await supabase
        .from("grow_plants")
        .select("*")
        .eq("org_id", orgId)
        .eq("strain_id", strainId)
        .not("phase", "in", "(destroyed,harvested)")
        .order("created_at", { ascending: false });
      if (cancelled) return;
      const areaIds = Array.from(new Set((plants ?? []).map((p: any) => p.area_id).filter(Boolean))) as string[];
      const areaById = new Map<string, any>();
      if (areaIds.length > 0) {
        const { data: areas } = await supabase.from("grow_areas").select("id, name").in("id", areaIds);
        (areas ?? []).forEach((a: any) => areaById.set(a.id, a));
      }
      setData(((plants ?? []) as any[]).map((p) => ({ ...p, area: p.area_id ? areaById.get(p.area_id) ?? null : null })));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [orgId, strainId]);

  return { data, loading };
}
