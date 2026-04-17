import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useOrg } from "@/lib/org";

export interface LabelTemplate {
  id: string;
  org_id: string;
  name: string;
  type: string | null;
  layout_config: any;
  is_default: boolean | null;
  is_active: boolean | null;
  preview_url: string | null;
  created_at: string | null;
}

export interface LabelFields {
  include_ubi: boolean;
  include_lot_number: boolean;
  include_net_weight: boolean;
  include_potency: boolean;
  include_universal_symbol: boolean;
  include_not_for_kids: boolean;
  include_warning_text: boolean;
  include_harvest_date: boolean;
  include_qr_code: boolean;
  barcode_format: "Code128" | "QR" | "DataMatrix";
  warning_text?: string;
}

export const DEFAULT_LABEL_CONFIG: LabelFields = {
  include_ubi: true,
  include_lot_number: true,
  include_net_weight: true,
  include_potency: true,
  include_universal_symbol: true,
  include_not_for_kids: false,
  include_warning_text: true,
  include_harvest_date: true,
  include_qr_code: false,
  barcode_format: "Code128",
  warning_text: "For use only by adults 21 and older. Keep out of the reach of children.",
};

export function useLabelTemplates() {
  const { user } = useAuth();
  const { orgId } = useOrg();
  const [data, setData] = useState<LabelTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!user || !orgId) { setData([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data: rows } = await supabase.from("grow_label_templates").select("*").eq("org_id", orgId).order("name");
      if (cancelled) return;
      setData((rows ?? []) as LabelTemplate[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id, orgId, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, refresh };
}

export function useCreateTemplate() {
  const { user } = useAuth();
  const { orgId } = useOrg();
  return useCallback(async (input: { name: string; type: string; config: LabelFields; is_default?: boolean }) => {
    if (!orgId) throw new Error("No active org");
    const { data, error } = await supabase.from("grow_label_templates").insert({
      org_id: orgId,
      name: input.name,
      type: input.type,
      layout_config: input.config,
      is_default: input.is_default ?? false,
      is_active: true,
      created_by: user?.id ?? null,
    }).select("*").single();
    if (error) throw error;
    return data;
  }, [orgId, user?.id]);
}

export function useUpdateTemplate() {
  return useCallback(async (id: string, patch: { name?: string; type?: string; config?: LabelFields; is_default?: boolean; is_active?: boolean }) => {
    const update: any = { ...patch };
    if (patch.config) { update.layout_config = patch.config; delete update.config; }
    const { error } = await supabase.from("grow_label_templates").update(update).eq("id", id);
    if (error) throw error;
  }, []);
}

export interface LabelData {
  ubi_number: string;
  lot_number: string;
  net_weight_grams: number;
  thc_total_pct: number | null;
  cbd_total_pct: number | null;
  product_name: string;
  strain_name: string | null;
  harvest_date: string | null;
  warning_text: string;
  qr_url?: string;
}

export function useGenerateLabel() {
  const { orgId } = useOrg();
  return useCallback(async (batchId: string, templateId: string): Promise<{ template: LabelTemplate; data: LabelData } | null> => {
    if (!orgId) return null;
    const [batchRes, templateRes, facilityRes] = await Promise.all([
      supabase.from("grow_batches").select("*").eq("id", batchId).maybeSingle(),
      supabase.from("grow_label_templates").select("*").eq("id", templateId).maybeSingle(),
      supabase.from("grow_facilities").select("license_number, is_primary").eq("org_id", orgId),
    ]);
    const batch = (batchRes as any).data;
    const template = (templateRes as any).data;
    if (!batch || !template) return null;
    const facilities = ((facilityRes as any).data ?? []) as any[];
    const primary = facilities.find((f) => f.is_primary) ?? facilities[0];
    const [productRes, strainRes, qaLotsRes, harvestRes] = await Promise.all([
      batch.product_id ? supabase.from("grow_products").select("name").eq("id", batch.product_id).maybeSingle() : Promise.resolve({ data: null }),
      batch.strain_id ? supabase.from("grow_strains").select("name").eq("id", batch.strain_id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from("grow_qa_lots").select("id").eq("parent_batch_id", batch.id),
      batch.harvest_id ? supabase.from("grow_harvests").select("harvest_started_at").eq("id", batch.harvest_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const lotIds = ((qaLotsRes as any).data ?? []).map((l: any) => l.id);
    const { data: results } = lotIds.length > 0
      ? await supabase.from("grow_qa_results").select("thc_total_pct, cbd_total_pct").in("qa_lot_id", lotIds).order("test_date", { ascending: false }).limit(1)
      : { data: [] };
    const qa = ((results ?? []) as any[])[0] ?? null;
    const config = template.layout_config as LabelFields;
    const data: LabelData = {
      ubi_number: primary?.license_number ?? "—",
      lot_number: batch.barcode,
      net_weight_grams: Number(batch.current_weight_grams ?? batch.current_quantity ?? 0),
      thc_total_pct: qa?.thc_total_pct ?? null,
      cbd_total_pct: qa?.cbd_total_pct ?? null,
      product_name: (productRes as any).data?.name ?? "—",
      strain_name: (strainRes as any).data?.name ?? null,
      harvest_date: (harvestRes as any).data?.harvest_started_at ?? null,
      warning_text: config.warning_text ?? "For use only by adults 21 and older. Keep out of the reach of children.",
      qr_url: config.include_qr_code
        ? `${window.location.origin}/public/trace/${batch.external_id ?? batch.id}`
        : undefined,
    };
    return { template, data };
  }, [orgId]);
}
