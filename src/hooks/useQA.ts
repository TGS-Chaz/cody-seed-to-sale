import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useOrg } from "@/lib/org";
import { generateExternalId } from "@/lib/ccrs-id";
import type {
  QaLotStatus, QaSampleStatus, QaResultLabTestStatus, StrainType,
} from "@/lib/schema-enums";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface QALot {
  id: string;
  org_id: string;
  external_id: string;
  lot_number: string;
  parent_batch_id: string;
  lot_weight_grams: number | null;
  status: QaLotStatus | null;
  notes: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  batch?: { id: string; barcode: string; product_id: string | null; strain_id: string | null; current_quantity: number; current_weight_grams: number | null } | null;
  product?: { id: string; name: string; category: string | null } | null;
  strain?: { id: string; name: string; type: StrainType | null } | null;
  sample_count?: number;
  result_count?: number;
}

export interface QASample {
  id: string;
  org_id: string;
  qa_lot_id: string;
  lab_name: string | null;
  lab_license_number: string | null;
  sample_weight_grams: number;
  status: QaSampleStatus | null;
  manifest_id: string | null;
  sent_at: string | null;
  received_at_lab_at: string | null;
  completed_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  lot?: { id: string; lot_number: string; parent_batch_id: string } | null;
}

export interface QAResult {
  id: string;
  org_id: string;
  qa_lot_id: string;
  qa_sample_id: string | null;
  lab_name: string | null;
  lab_license_number: string | null;
  test_date: string;
  test_name: string | null;
  test_value: string | null;
  lab_test_status: QaResultLabTestStatus | null;
  overall_pass: boolean | null;
  source_type: string | null;
  wcia_json_source: string | null;
  ai_extracted_confidence: number | null;
  thc_total_pct: number | null;
  thc_a_pct: number | null;
  thc_delta9_pct: number | null;
  cbd_total_pct: number | null;
  cbd_a_pct: number | null;
  cbg_pct: number | null;
  cbn_pct: number | null;
  total_terpenes_pct: number | null;
  terpene_data: Record<string, number> | null;
  pesticides_pass: boolean | null;
  heavy_metals_pass: boolean | null;
  microbials_pass: boolean | null;
  mycotoxins_pass: boolean | null;
  residual_solvents_pass: boolean | null;
  foreign_matter_pass: boolean | null;
  moisture_pct: number | null;
  water_activity: number | null;
  full_results_json: any | null;
  coa_urls: string[] | null;
  expiration_date: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
  lot?: { id: string; lot_number: string; parent_batch_id: string } | null;
  batch?: { id: string; barcode: string } | null;
  product?: { id: string; name: string } | null;
}

// ─── QA Lots ────────────────────────────────────────────────────────────────

export function useQALots(options: { batch_id?: string; status?: QaLotStatus } = {}) {
  const { user } = useAuth();
  const { orgId } = useOrg();
  const [data, setData] = useState<QALot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const sig = `${options.batch_id ?? ""}:${options.status ?? ""}`;

  useEffect(() => {
    if (!user || !orgId) { setData([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      let q = supabase.from("grow_qa_lots").select("*").eq("org_id", orgId);
      if (options.batch_id) q = q.eq("parent_batch_id", options.batch_id);
      if (options.status) q = q.eq("status", options.status);
      const { data: rows, error: err } = await q.order("created_at", { ascending: false, nullsFirst: false });
      if (cancelled) return;
      if (err) { setError(err.message); setLoading(false); return; }

      const batchIds = Array.from(new Set((rows ?? []).map((r: any) => r.parent_batch_id)));
      const lotIds = (rows ?? []).map((r: any) => r.id);
      const [batchesRes, samplesRes, resultsRes] = await Promise.all([
        batchIds.length > 0 ? supabase.from("grow_batches").select("id, barcode, product_id, strain_id, current_quantity, current_weight_grams").in("id", batchIds) : Promise.resolve({ data: [] }),
        lotIds.length > 0 ? supabase.from("grow_qa_samples").select("id, qa_lot_id").in("qa_lot_id", lotIds) : Promise.resolve({ data: [] }),
        lotIds.length > 0 ? supabase.from("grow_qa_results").select("id, qa_lot_id").in("qa_lot_id", lotIds) : Promise.resolve({ data: [] }),
      ]);

      const batchById = new Map<string, any>((batchesRes.data ?? []).map((b: any) => [b.id, b]));
      const productIds = Array.from(new Set(((batchesRes.data ?? []) as any[]).map((b) => b.product_id).filter(Boolean)));
      const strainIds = Array.from(new Set(((batchesRes.data ?? []) as any[]).map((b) => b.strain_id).filter(Boolean)));
      const [productsRes, strainsRes] = await Promise.all([
        productIds.length > 0 ? supabase.from("grow_products").select("id, name, category").in("id", productIds) : Promise.resolve({ data: [] }),
        strainIds.length > 0 ? supabase.from("grow_strains").select("id, name, type").in("id", strainIds) : Promise.resolve({ data: [] }),
      ]);
      const productById = new Map<string, any>((productsRes.data ?? []).map((p: any) => [p.id, p]));
      const strainById = new Map<string, any>((strainsRes.data ?? []).map((s: any) => [s.id, s]));
      const sampleCountByLot = new Map<string, number>();
      (samplesRes.data ?? []).forEach((s: any) => sampleCountByLot.set(s.qa_lot_id, (sampleCountByLot.get(s.qa_lot_id) ?? 0) + 1));
      const resultCountByLot = new Map<string, number>();
      (resultsRes.data ?? []).forEach((r: any) => resultCountByLot.set(r.qa_lot_id, (resultCountByLot.get(r.qa_lot_id) ?? 0) + 1));

      if (cancelled) return;
      setData(((rows ?? []) as any[]).map((r) => {
        const batch = batchById.get(r.parent_batch_id) ?? null;
        return {
          ...r,
          batch,
          product: batch?.product_id ? productById.get(batch.product_id) ?? null : null,
          strain: batch?.strain_id ? strainById.get(batch.strain_id) ?? null : null,
          sample_count: sampleCountByLot.get(r.id) ?? 0,
          result_count: resultCountByLot.get(r.id) ?? 0,
        };
      }));
      setError(null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, orgId, tick, sig]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, refresh };
}

export function useQALot(id: string | undefined) {
  const { user } = useAuth();
  const { orgId } = useOrg();
  const [data, setData] = useState<QALot | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!user || !orgId || !id) { setData(null); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data: row } = await supabase.from("grow_qa_lots").select("*").eq("id", id).eq("org_id", orgId).maybeSingle();
      if (cancelled) return;
      if (!row) { setData(null); setLoading(false); return; }
      const { data: batch } = await supabase.from("grow_batches").select("id, barcode, product_id, strain_id, current_quantity, current_weight_grams").eq("id", row.parent_batch_id).maybeSingle();
      const [productRes, strainRes] = await Promise.all([
        batch?.product_id ? supabase.from("grow_products").select("id, name, category").eq("id", batch.product_id).maybeSingle() : Promise.resolve({ data: null }),
        batch?.strain_id ? supabase.from("grow_strains").select("id, name, type").eq("id", batch.strain_id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      if (cancelled) return;
      setData({
        ...(row as any),
        batch: batch ?? null,
        product: (productRes as any).data ?? null,
        strain: (strainRes as any).data ?? null,
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id, orgId, id, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, refresh };
}

export interface CreateQALotInput {
  batch_id: string;
  lot_number?: string;
  lot_weight_grams?: number | null;
  notes?: string | null;
}

export function useCreateQALot() {
  const { user } = useAuth();
  const { orgId } = useOrg();
  return useCallback(async (input: CreateQALotInput): Promise<QALot> => {
    if (!orgId) throw new Error("No active org");
    const lotNumber = input.lot_number?.trim() || `QA-${Date.now().toString().slice(-8)}`;
    const { data, error } = await supabase.from("grow_qa_lots").insert({
      org_id: orgId,
      external_id: generateExternalId(),
      parent_batch_id: input.batch_id,
      lot_number: lotNumber,
      lot_weight_grams: input.lot_weight_grams ?? null,
      status: "created",
      notes: input.notes ?? null,
      created_by: user?.id ?? null,
    }).select("*").single();
    if (error) throw error;
    return data as unknown as QALot;
  }, [orgId, user?.id]);
}

export function useUpdateQALot() {
  return useCallback(async (id: string, patch: Partial<QALot>) => {
    const { data, error } = await supabase.from("grow_qa_lots").update(patch as any).eq("id", id).select("*").single();
    if (error) throw error;
    return data;
  }, []);
}

export function useVoidQALot() {
  return useCallback(async (id: string) => {
    const { error } = await supabase.from("grow_qa_lots").update({ status: "voided" }).eq("id", id);
    if (error) throw error;
  }, []);
}

export function useQALotStats(lots: QALot[]) {
  return useMemo(() => ({
    total: lots.length,
    created: lots.filter((l) => l.status === "created").length,
    sampled: lots.filter((l) => l.status === "sampled").length,
    in_testing: lots.filter((l) => l.status === "in_testing").length,
    passed: lots.filter((l) => l.status === "passed").length,
    failed: lots.filter((l) => l.status === "failed").length,
    voided: lots.filter((l) => l.status === "voided").length,
  }), [lots]);
}

// ─── QA Samples ─────────────────────────────────────────────────────────────

export function useQASamples(lotId?: string) {
  const { user } = useAuth();
  const { orgId } = useOrg();
  const [data, setData] = useState<QASample[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!user || !orgId) { setData([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      let q = supabase.from("grow_qa_samples").select("*").eq("org_id", orgId);
      if (lotId) q = q.eq("qa_lot_id", lotId);
      const { data: rows } = await q.order("created_at", { ascending: false, nullsFirst: false });
      const lotIds = Array.from(new Set(((rows ?? []) as any[]).map((r) => r.qa_lot_id)));
      const { data: lots } = lotIds.length > 0
        ? await supabase.from("grow_qa_lots").select("id, lot_number, parent_batch_id").in("id", lotIds)
        : { data: [] };
      const lotById = new Map<string, any>((lots ?? []).map((l: any) => [l.id, l]));
      if (cancelled) return;
      setData(((rows ?? []) as any[]).map((r) => ({ ...r, lot: lotById.get(r.qa_lot_id) ?? null })));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id, orgId, lotId, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, refresh };
}

export interface CreateQASampleInput {
  qa_lot_id: string;
  lab_license_number?: string | null;
  lab_name?: string | null;
  sample_weight_grams: number;
  notes?: string | null;
}

export function useCreateQASample() {
  const { user } = useAuth();
  const { orgId } = useOrg();
  return useCallback(async (input: CreateQASampleInput): Promise<QASample> => {
    if (!orgId) throw new Error("No active org");
    const { data, error } = await supabase.from("grow_qa_samples").insert({
      org_id: orgId,
      qa_lot_id: input.qa_lot_id,
      lab_name: input.lab_name ?? null,
      lab_license_number: input.lab_license_number ?? null,
      sample_weight_grams: input.sample_weight_grams,
      status: "created",
      created_by: user?.id ?? null,
    }).select("*").single();
    if (error) throw error;
    await supabase.from("grow_qa_lots").update({ status: "sampled" }).eq("id", input.qa_lot_id);
    return data as unknown as QASample;
  }, [orgId, user?.id]);
}

export function useUpdateQASample() {
  return useCallback(async (id: string, patch: Partial<QASample>) => {
    const { data, error } = await supabase.from("grow_qa_samples").update(patch as any).eq("id", id).select("*").single();
    if (error) throw error;
    return data;
  }, []);
}

export function useVoidQASample() {
  return useCallback(async (id: string, reason?: string) => {
    const { error } = await supabase.from("grow_qa_samples").update({
      status: "voided",
      voided_at: new Date().toISOString(),
      void_reason: reason ?? null,
    }).eq("id", id);
    if (error) throw error;
  }, []);
}

export function useShipSample() {
  return useCallback(async (sampleId: string, opts: { manifestId?: string | null; shippedAt?: string } = {}) => {
    const { error } = await supabase.from("grow_qa_samples").update({
      status: "shipped",
      sent_at: opts.shippedAt ?? new Date().toISOString(),
      manifest_id: opts.manifestId ?? null,
    }).eq("id", sampleId);
    if (error) throw error;
    const { data: sample } = await supabase.from("grow_qa_samples").select("qa_lot_id").eq("id", sampleId).maybeSingle();
    if (sample) {
      await supabase.from("grow_qa_lots").update({ status: "in_testing" }).eq("id", sample.qa_lot_id);
    }
  }, []);
}

export function useReceiveAtLab() {
  return useCallback(async (sampleId: string) => {
    const { error } = await supabase.from("grow_qa_samples").update({
      status: "received_at_lab",
      received_at_lab_at: new Date().toISOString(),
    }).eq("id", sampleId);
    if (error) throw error;
  }, []);
}

export function useQASampleStats(samples: QASample[]) {
  return useMemo(() => ({
    total: samples.length,
    shipped: samples.filter((s) => s.status === "shipped").length,
    at_lab: samples.filter((s) => s.status === "received_at_lab" || s.status === "testing").length,
    complete: samples.filter((s) => s.status === "complete").length,
    voided: samples.filter((s) => s.status === "voided").length,
  }), [samples]);
}

// ─── QA Results ─────────────────────────────────────────────────────────────

export function useQAResults(options: { lot_id?: string; sample_id?: string; batch_id?: string; status?: QaResultLabTestStatus } = {}) {
  const { user } = useAuth();
  const { orgId } = useOrg();
  const [data, setData] = useState<QAResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const sig = `${options.lot_id ?? ""}:${options.sample_id ?? ""}:${options.batch_id ?? ""}:${options.status ?? ""}`;

  useEffect(() => {
    if (!user || !orgId) { setData([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      let q = supabase.from("grow_qa_results").select("*").eq("org_id", orgId);
      if (options.lot_id) q = q.eq("qa_lot_id", options.lot_id);
      if (options.sample_id) q = q.eq("qa_sample_id", options.sample_id);
      if (options.status) q = q.eq("lab_test_status", options.status);
      const { data: rows } = await q.order("test_date", { ascending: false, nullsFirst: false });

      // Filter by batch_id if provided
      let filtered = (rows ?? []) as any[];
      if (options.batch_id) {
        const lotIds = Array.from(new Set(filtered.map((r) => r.qa_lot_id)));
        const { data: lotsForBatch } = lotIds.length > 0
          ? await supabase.from("grow_qa_lots").select("id").eq("parent_batch_id", options.batch_id).in("id", lotIds)
          : { data: [] };
        const allowed = new Set(((lotsForBatch ?? []) as any[]).map((l) => l.id));
        filtered = filtered.filter((r) => allowed.has(r.qa_lot_id));
      }

      const lotIds = Array.from(new Set(filtered.map((r) => r.qa_lot_id)));
      const { data: lots } = lotIds.length > 0
        ? await supabase.from("grow_qa_lots").select("id, lot_number, parent_batch_id").in("id", lotIds)
        : { data: [] };
      const lotById = new Map<string, any>((lots ?? []).map((l: any) => [l.id, l]));
      const batchIds = Array.from(new Set(((lots ?? []) as any[]).map((l) => l.parent_batch_id).filter(Boolean)));
      const { data: batches } = batchIds.length > 0
        ? await supabase.from("grow_batches").select("id, barcode, product_id").in("id", batchIds)
        : { data: [] };
      const batchById = new Map<string, any>((batches ?? []).map((b: any) => [b.id, b]));
      const productIds = Array.from(new Set(((batches ?? []) as any[]).map((b) => b.product_id).filter(Boolean)));
      const { data: products } = productIds.length > 0
        ? await supabase.from("grow_products").select("id, name").in("id", productIds)
        : { data: [] };
      const productById = new Map<string, any>((products ?? []).map((p: any) => [p.id, p]));

      if (cancelled) return;
      setData(filtered.map((r) => {
        const lot = lotById.get(r.qa_lot_id) ?? null;
        const batch = lot ? batchById.get(lot.parent_batch_id) ?? null : null;
        return {
          ...r,
          lot,
          batch,
          product: batch?.product_id ? productById.get(batch.product_id) ?? null : null,
        };
      }));
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, orgId, tick, sig]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, refresh };
}

export interface CreateQAResultInput {
  qa_lot_id: string;
  qa_sample_id?: string | null;
  lab_name?: string | null;
  lab_license_number?: string | null;
  test_date: string;
  test_name?: string | null;
  test_value?: string | null;
  lab_test_status: QaResultLabTestStatus;
  overall_pass?: boolean | null;
  source_type?: string;
  wcia_json_source?: string | null;
  thc_total_pct?: number | null;
  thc_a_pct?: number | null;
  thc_delta9_pct?: number | null;
  cbd_total_pct?: number | null;
  cbd_a_pct?: number | null;
  cbg_pct?: number | null;
  cbn_pct?: number | null;
  total_terpenes_pct?: number | null;
  terpene_data?: Record<string, number> | null;
  pesticides_pass?: boolean | null;
  heavy_metals_pass?: boolean | null;
  microbials_pass?: boolean | null;
  mycotoxins_pass?: boolean | null;
  residual_solvents_pass?: boolean | null;
  foreign_matter_pass?: boolean | null;
  moisture_pct?: number | null;
  water_activity?: number | null;
  full_results_json?: any;
  coa_urls?: string[] | null;
  expiration_date?: string | null;
  notes?: string | null;
}

export function useCreateQAResult() {
  const { user } = useAuth();
  const { orgId } = useOrg();
  return useCallback(async (input: CreateQAResultInput): Promise<QAResult> => {
    if (!orgId) throw new Error("No active org");

    // Auto-derive overall_pass if not provided
    let overallPass = input.overall_pass;
    if (overallPass == null) {
      const flags = [
        input.pesticides_pass, input.heavy_metals_pass, input.microbials_pass,
        input.mycotoxins_pass, input.residual_solvents_pass, input.foreign_matter_pass,
      ].filter((v) => v !== undefined && v !== null);
      if (flags.length > 0) overallPass = flags.every((v) => v === true);
      else if (input.lab_test_status === "Pass") overallPass = true;
      else if (input.lab_test_status?.startsWith("Fail")) overallPass = false;
    }

    const { data, error } = await supabase.from("grow_qa_results").insert({
      org_id: orgId,
      qa_lot_id: input.qa_lot_id,
      qa_sample_id: input.qa_sample_id ?? null,
      lab_name: input.lab_name ?? null,
      lab_license_number: input.lab_license_number ?? null,
      test_date: input.test_date,
      test_name: input.test_name ?? null,
      test_value: input.test_value ?? null,
      lab_test_status: input.lab_test_status,
      overall_pass: overallPass ?? null,
      source_type: input.source_type ?? "manual",
      wcia_json_source: input.wcia_json_source ?? null,
      thc_total_pct: input.thc_total_pct ?? null,
      thc_a_pct: input.thc_a_pct ?? null,
      thc_delta9_pct: input.thc_delta9_pct ?? null,
      cbd_total_pct: input.cbd_total_pct ?? null,
      cbd_a_pct: input.cbd_a_pct ?? null,
      cbg_pct: input.cbg_pct ?? null,
      cbn_pct: input.cbn_pct ?? null,
      total_terpenes_pct: input.total_terpenes_pct ?? null,
      terpene_data: input.terpene_data as any ?? null,
      pesticides_pass: input.pesticides_pass ?? null,
      heavy_metals_pass: input.heavy_metals_pass ?? null,
      microbials_pass: input.microbials_pass ?? null,
      mycotoxins_pass: input.mycotoxins_pass ?? null,
      residual_solvents_pass: input.residual_solvents_pass ?? null,
      foreign_matter_pass: input.foreign_matter_pass ?? null,
      moisture_pct: input.moisture_pct ?? null,
      water_activity: input.water_activity ?? null,
      full_results_json: input.full_results_json ?? null,
      coa_urls: input.coa_urls ?? null,
      expiration_date: input.expiration_date ?? null,
      notes: input.notes ?? null,
      created_by: user?.id ?? null,
    }).select("*").single();
    if (error) throw error;

    // Update lot + sample statuses
    if (overallPass === true) {
      await supabase.from("grow_qa_lots").update({ status: "passed" }).eq("id", input.qa_lot_id);
    } else if (overallPass === false) {
      await supabase.from("grow_qa_lots").update({ status: "failed" }).eq("id", input.qa_lot_id);
    }
    if (input.qa_sample_id) {
      await supabase.from("grow_qa_samples").update({
        status: "complete",
        completed_at: new Date().toISOString(),
      }).eq("id", input.qa_sample_id);
    }

    return data as unknown as QAResult;
  }, [orgId, user?.id]);
}

export function useQAResultStats(results: QAResult[]) {
  return useMemo(() => {
    const total = results.length;
    const pass = results.filter((r) => r.overall_pass === true).length;
    const fail = results.filter((r) => r.overall_pass === false).length;
    const pending = results.filter((r) => r.overall_pass == null).length;
    const thcValues = results.map((r) => r.thc_total_pct).filter((v): v is number => v != null);
    const terpValues = results.map((r) => r.total_terpenes_pct).filter((v): v is number => v != null);
    const cbdValues = results.map((r) => r.cbd_total_pct).filter((v): v is number => v != null);
    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + Number(b), 0) / arr.length : null;
    return {
      total, pass, fail, pending,
      avg_thc: avg(thcValues),
      avg_cbd: avg(cbdValues),
      avg_terpenes: avg(terpValues),
    };
  }, [results]);
}

/** Parse WCIA JSON lab result format — returns an input ready for useCreateQAResult. */
export function parseWCIAJSON(json: any, lotId: string): CreateQAResultInput | null {
  if (!json || typeof json !== "object") return null;
  const today = new Date().toISOString().slice(0, 10);
  const lab = json.lab ?? json.Lab ?? {};
  const results = json.results ?? json.Results ?? json.analyses ?? [];
  const byName = (name: string): number | null => {
    const hit = Array.isArray(results)
      ? results.find((r: any) => String(r.name ?? r.TestName ?? "").toLowerCase().includes(name.toLowerCase()))
      : null;
    if (!hit) return null;
    const v = hit.value ?? hit.TestValue ?? hit.percent;
    return v == null ? null : Number(v);
  };
  const contaminantPass = (name: string): boolean | null => {
    const hit = Array.isArray(results)
      ? results.find((r: any) => String(r.name ?? r.TestName ?? "").toLowerCase().includes(name.toLowerCase()))
      : null;
    if (!hit) return null;
    const status = String(hit.status ?? hit.Status ?? hit.pass ?? "").toLowerCase();
    if (status === "pass" || status === "true") return true;
    if (status === "fail" || status === "false") return false;
    return null;
  };
  const terpeneData: Record<string, number> = {};
  if (Array.isArray(json.terpenes ?? json.Terpenes)) {
    for (const t of (json.terpenes ?? json.Terpenes)) {
      const name = t.name ?? t.Name;
      const value = t.value ?? t.percent;
      if (name && value != null) terpeneData[name] = Number(value);
    }
  }
  return {
    qa_lot_id: lotId,
    test_date: json.test_date ?? json.TestDate ?? today,
    lab_name: lab.name ?? lab.Name ?? json.lab_name ?? null,
    lab_license_number: lab.license ?? lab.License ?? json.lab_license_number ?? null,
    lab_test_status: (json.overall_status ?? "Pass") as QaResultLabTestStatus,
    source_type: "wcia_json",
    wcia_json_source: typeof json === "string" ? json : JSON.stringify(json),
    thc_total_pct: byName("THC Total") ?? byName("Total THC"),
    thc_a_pct: byName("THCA") ?? byName("THC-A"),
    thc_delta9_pct: byName("Delta-9") ?? byName("Delta9"),
    cbd_total_pct: byName("CBD Total") ?? byName("Total CBD"),
    cbd_a_pct: byName("CBDA") ?? byName("CBD-A"),
    cbg_pct: byName("CBG"),
    cbn_pct: byName("CBN"),
    total_terpenes_pct: byName("Total Terpenes"),
    terpene_data: Object.keys(terpeneData).length > 0 ? terpeneData : null,
    pesticides_pass: contaminantPass("pesticide"),
    heavy_metals_pass: contaminantPass("heavy metal"),
    microbials_pass: contaminantPass("microbial"),
    mycotoxins_pass: contaminantPass("mycotoxin"),
    residual_solvents_pass: contaminantPass("residual solvent"),
    foreign_matter_pass: contaminantPass("foreign matter"),
    moisture_pct: byName("moisture"),
    water_activity: byName("water activity"),
    full_results_json: json,
  };
}
