import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useOrg } from "@/lib/org";
import type {
  CcrsIntegratorStatus,
  CcrsAutoUploadFrequency,
  CcrsNotificationPreference,
  WciaHostingType,
  CodyResponseStyle,
  CodyTone,
} from "@/lib/schema-enums";

/** Full shape of grow_org_settings. Every field is optional because the row
 * may not exist yet (new orgs) and because Supabase-generated types treat
 * everything as nullable. */
export interface OrgSettings {
  org_id: string;
  // Facility / labels
  ccrs_location_code: string | null;
  default_inventory_label_template_id: string | null;
  default_product_label_template_id: string | null;
  default_manifest_template_id: string | null;
  default_route_id: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  use_pack_to_order: boolean | null;
  require_qa_before_availability: boolean | null;
  auto_generate_barcodes: boolean | null;
  // CCRS
  ccrs_integrator_approved: boolean | null;
  ccrs_integrator_id: string | null;
  ccrs_integrator_status: CcrsIntegratorStatus | null;
  ccrs_reporting_email: string | null;
  ccrs_secondary_reporting_email: string | null;
  ccrs_saw_username: string | null;
  ccrs_saw_password_encrypted: string | null;
  ccrs_auto_upload: boolean | null;
  ccrs_auto_upload_frequency: CcrsAutoUploadFrequency | null;
  ccrs_upload_days: string[] | null;
  ccrs_upload_time: string | null;
  ccrs_upload_file_types: string[] | null;
  ccrs_notification_preference: CcrsNotificationPreference | null;
  ccrs_notification_recipients: string[] | null;
  ccrs_submitted_by_username: string | null;
  // WCIA
  wcia_enabled: boolean | null;
  wcia_hosting_type: WciaHostingType | null;
  wcia_self_hosted_url: string | null;
  wcia_link_expiry_days: number | null;
  // AI
  enable_ai_insights: boolean | null;
  enable_ai_yield_predictions: boolean | null;
  enable_ai_harvest_timing: boolean | null;
  enable_ai_anomaly_detection: boolean | null;
  enable_ai_crop_steering: boolean | null;
  enable_ai_task_assignment: boolean | null;
  enable_ai_smart_scheduling: boolean | null;
  enable_ai_compliance_reminders: boolean | null;
  enable_ai_customer_insights: boolean | null;
  enable_ai_price_optimization: boolean | null;
  enable_ai_demand_forecasting: boolean | null;
  enable_ai_smart_replies: boolean | null;
  enable_ai_note_summarization: boolean | null;
  enable_ai_report_narratives: boolean | null;
  enable_cross_product_intel: boolean | null;
  enable_cross_product_crm: boolean | null;
  cody_personality: CodyPersonality | null;
  // Integrations
  integrations: Record<string, IntegrationConfig> | null;
  api_key: string | null;
  api_key_generated_at: string | null;
  quickbooks_connected: boolean | null;
  quickbooks_company_id: string | null;
  quickbooks_last_sync_at: string | null;
  // Misc
  environmental_thresholds: Record<string, any> | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface CodyPersonality {
  style: CodyResponseStyle;
  tone: CodyTone;
  emojis: boolean;
  language: string;
}

export interface IntegrationConfig {
  connected?: boolean;
  config?: Record<string, any>;
  connected_at?: string;
  [k: string]: any;
}

export type OrgSettingsPatch = Partial<Omit<OrgSettings, "org_id" | "created_at" | "updated_at">>;

/** Load (and auto-create) the grow_org_settings row for the active org. */
export function useOrgSettings() {
  const { user } = useAuth();
  const { orgId } = useOrg();
  const [data, setData] = useState<OrgSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!user || !orgId) { setData(null); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      // Try to read; if no row, insert a defaulted one so the UI can bind.
      let { data: row, error: err } = await supabase
        .from("grow_org_settings")
        .select("*")
        .eq("org_id", orgId)
        .maybeSingle();
      if (cancelled) return;
      if (err) { setError(err.message); setLoading(false); return; }

      if (!row) {
        const insertRes = await supabase
          .from("grow_org_settings")
          .insert({ org_id: orgId })
          .select("*")
          .single();
        if (cancelled) return;
        if (insertRes.error) { setError(insertRes.error.message); setLoading(false); return; }
        row = insertRes.data;
      }

      setError(null);
      setData(row as any as OrgSettings);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id, orgId, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  /**
   * Patch the settings row. Scalar fields are replaced; the caller is
   * responsible for merging JSONB fields (cody_personality, integrations)
   * before passing them in — that way we don't silently clobber nested keys.
   */
  const update = useCallback(async (patch: OrgSettingsPatch) => {
    if (!orgId) throw new Error("No active org");
    const { data: row, error: err } = await supabase
      .from("grow_org_settings")
      .update(patch)
      .eq("org_id", orgId)
      .select("*")
      .single();
    if (err) throw err;
    setData(row as any as OrgSettings);
    return row as any as OrgSettings;
  }, [orgId]);

  /** Shallow-merge an integration's config into the existing integrations JSONB. */
  const updateIntegration = useCallback(async (key: string, patch: IntegrationConfig) => {
    if (!data) throw new Error("Settings not loaded");
    const current = data.integrations ?? {};
    const prev = current[key] ?? {};
    const merged: Record<string, IntegrationConfig> = {
      ...current,
      [key]: { ...prev, ...patch, config: { ...(prev.config ?? {}), ...(patch.config ?? {}) } },
    };
    return update({ integrations: merged });
  }, [data, update]);

  /** Shallow-merge into cody_personality JSONB. */
  const updateCodyPersonality = useCallback(async (patch: Partial<CodyPersonality>) => {
    if (!data) throw new Error("Settings not loaded");
    const current = data.cody_personality ?? {
      style: "balanced" as CodyResponseStyle,
      tone: "professional" as CodyTone,
      emojis: false,
      language: "en",
    };
    const merged: CodyPersonality = { ...current, ...patch };
    return update({ cody_personality: merged });
  }, [data, update]);

  return { data, loading, error, refresh, update, updateIntegration, updateCodyPersonality };
}
