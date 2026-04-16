-- Extends grow_org_settings to back the three remaining settings pages:
-- CCRS & Compliance, AI Preferences, and Integrations. Everything is
-- nullable / defaulted so existing rows don't need a backfill.

BEGIN;

-- ─── CCRS integrator config ─────────────────────────────────────────────────
ALTER TABLE grow_org_settings ADD COLUMN IF NOT EXISTS ccrs_integrator_id TEXT;
ALTER TABLE grow_org_settings ADD COLUMN IF NOT EXISTS ccrs_integrator_status TEXT DEFAULT 'not_applied';
ALTER TABLE grow_org_settings ADD COLUMN IF NOT EXISTS ccrs_secondary_reporting_email TEXT;
ALTER TABLE grow_org_settings ADD COLUMN IF NOT EXISTS ccrs_saw_username TEXT;
ALTER TABLE grow_org_settings ADD COLUMN IF NOT EXISTS ccrs_saw_password_encrypted TEXT;
ALTER TABLE grow_org_settings ADD COLUMN IF NOT EXISTS ccrs_auto_upload_frequency TEXT DEFAULT 'manual';
ALTER TABLE grow_org_settings ADD COLUMN IF NOT EXISTS ccrs_upload_days TEXT[];
ALTER TABLE grow_org_settings ADD COLUMN IF NOT EXISTS ccrs_upload_time TIME DEFAULT '02:00';
ALTER TABLE grow_org_settings ADD COLUMN IF NOT EXISTS ccrs_upload_file_types TEXT[] DEFAULT ARRAY[
  'strain','area','product','plant','plantdestruction','planttransfer',
  'inventory','inventoryadjustment','inventorytransfer','labtest','sale','manifest'
];
ALTER TABLE grow_org_settings ADD COLUMN IF NOT EXISTS ccrs_notification_preference TEXT DEFAULT 'both';
ALTER TABLE grow_org_settings ADD COLUMN IF NOT EXISTS ccrs_notification_recipients TEXT[];
ALTER TABLE grow_org_settings ADD COLUMN IF NOT EXISTS ccrs_submitted_by_username TEXT;

DO $mig$ BEGIN
  ALTER TABLE grow_org_settings
    ADD CONSTRAINT grow_org_settings_ccrs_integrator_status_check
    CHECK (ccrs_integrator_status = ANY (ARRAY['not_applied','pending','approved','suspended']));
EXCEPTION WHEN duplicate_object THEN NULL; END $mig$;

DO $mig$ BEGIN
  ALTER TABLE grow_org_settings
    ADD CONSTRAINT grow_org_settings_ccrs_auto_upload_frequency_check
    CHECK (ccrs_auto_upload_frequency = ANY (ARRAY['manual','daily','twice_weekly','weekly']));
EXCEPTION WHEN duplicate_object THEN NULL; END $mig$;

DO $mig$ BEGIN
  ALTER TABLE grow_org_settings
    ADD CONSTRAINT grow_org_settings_ccrs_notification_preference_check
    CHECK (ccrs_notification_preference = ANY (ARRAY['email','in_app','both','none']));
EXCEPTION WHEN duplicate_object THEN NULL; END $mig$;

-- ─── WCIA (Washington Cannabis Integrators Alliance) ───────────────────────
ALTER TABLE grow_org_settings ADD COLUMN IF NOT EXISTS wcia_enabled BOOLEAN DEFAULT true;
ALTER TABLE grow_org_settings ADD COLUMN IF NOT EXISTS wcia_hosting_type TEXT DEFAULT 'cody_hosted';
ALTER TABLE grow_org_settings ADD COLUMN IF NOT EXISTS wcia_self_hosted_url TEXT;
ALTER TABLE grow_org_settings ADD COLUMN IF NOT EXISTS wcia_link_expiry_days INT DEFAULT 30;

DO $mig$ BEGIN
  ALTER TABLE grow_org_settings
    ADD CONSTRAINT grow_org_settings_wcia_hosting_type_check
    CHECK (wcia_hosting_type = ANY (ARRAY['cody_hosted','self_hosted']));
EXCEPTION WHEN duplicate_object THEN NULL; END $mig$;

-- ─── AI preference toggles (one bool per feature) ──────────────────────────
-- Existing: enable_ai_insights, enable_ai_yield_predictions, enable_ai_harvest_timing
ALTER TABLE grow_org_settings ADD COLUMN IF NOT EXISTS enable_ai_anomaly_detection BOOLEAN DEFAULT true;
ALTER TABLE grow_org_settings ADD COLUMN IF NOT EXISTS enable_ai_crop_steering BOOLEAN DEFAULT true;
ALTER TABLE grow_org_settings ADD COLUMN IF NOT EXISTS enable_ai_task_assignment BOOLEAN DEFAULT true;
ALTER TABLE grow_org_settings ADD COLUMN IF NOT EXISTS enable_ai_smart_scheduling BOOLEAN DEFAULT true;
ALTER TABLE grow_org_settings ADD COLUMN IF NOT EXISTS enable_ai_compliance_reminders BOOLEAN DEFAULT true;
ALTER TABLE grow_org_settings ADD COLUMN IF NOT EXISTS enable_ai_customer_insights BOOLEAN DEFAULT true;
ALTER TABLE grow_org_settings ADD COLUMN IF NOT EXISTS enable_ai_price_optimization BOOLEAN DEFAULT true;
ALTER TABLE grow_org_settings ADD COLUMN IF NOT EXISTS enable_ai_demand_forecasting BOOLEAN DEFAULT true;
ALTER TABLE grow_org_settings ADD COLUMN IF NOT EXISTS enable_ai_smart_replies BOOLEAN DEFAULT true;
ALTER TABLE grow_org_settings ADD COLUMN IF NOT EXISTS enable_ai_note_summarization BOOLEAN DEFAULT true;
ALTER TABLE grow_org_settings ADD COLUMN IF NOT EXISTS enable_ai_report_narratives BOOLEAN DEFAULT true;
ALTER TABLE grow_org_settings ADD COLUMN IF NOT EXISTS enable_cross_product_intel BOOLEAN DEFAULT true;
ALTER TABLE grow_org_settings ADD COLUMN IF NOT EXISTS enable_cross_product_crm BOOLEAN DEFAULT true;

ALTER TABLE grow_org_settings ADD COLUMN IF NOT EXISTS cody_personality JSONB
  DEFAULT '{"style":"balanced","tone":"professional","emojis":false,"language":"en"}'::jsonb;

-- ─── Integrations (all third-party wiring stored as a JSONB blob) ──────────
ALTER TABLE grow_org_settings ADD COLUMN IF NOT EXISTS integrations JSONB DEFAULT '{}'::jsonb;
ALTER TABLE grow_org_settings ADD COLUMN IF NOT EXISTS api_key TEXT;
ALTER TABLE grow_org_settings ADD COLUMN IF NOT EXISTS api_key_generated_at TIMESTAMPTZ;

COMMIT;
