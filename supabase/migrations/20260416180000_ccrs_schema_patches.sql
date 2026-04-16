-- CCRS schema patches — 6 gaps closed per the Oct 2025 CCRS File Spec update.
-- Most notably: the new Harvest.CSV file type, and the
-- LabtestExternalIdentifier column manifest generators now require.

BEGIN;

-- A1: CCRS added Harvest.CSV — add 'harvest' to the submission file category CHECK
ALTER TABLE grow_ccrs_submission_files
  DROP CONSTRAINT IF EXISTS grow_ccrs_submission_files_file_category_check;
ALTER TABLE grow_ccrs_submission_files
  ADD CONSTRAINT grow_ccrs_submission_files_file_category_check
  CHECK (file_category = ANY (ARRAY[
    'strain','area','product','plant','plantdestruction','planttransfer',
    'inventory','inventoryadjustment','inventorytransfer','labtest','sale','manifest','harvest'
  ]));

-- A2: Manifest CSV now requires LabtestExternalIdentifier
ALTER TABLE grow_manifest_items ADD COLUMN IF NOT EXISTS labtest_external_identifier TEXT;

-- A3: Manifest spec requires ServingsPerUnit
ALTER TABLE grow_manifest_items ADD COLUMN IF NOT EXISTS servings_per_unit INT DEFAULT 1;

-- A4: Product spec requires UnitWeightGrams (already exists on grow_products but
-- IF NOT EXISTS makes this a no-op if it's there). Keep the column nullable
-- because tisuue cultures / clones don't have a meaningful unit weight.
ALTER TABLE grow_products ADD COLUMN IF NOT EXISTS unit_weight_grams NUMERIC;

-- A5: Inventory requires IsMedical boolean (different semantics from
-- is_doh_compliant which tracks DOH-compliant production conditions)
ALTER TABLE grow_batches ADD COLUMN IF NOT EXISTS is_medical BOOLEAN DEFAULT false;

-- A6: Harvest.CSV fields — replace the existing harvest_type CHECK
-- ('standard','manicure') with the spec-mandated ('full','partial','manicure')
ALTER TABLE grow_harvests DROP CONSTRAINT IF EXISTS grow_harvests_harvest_type_check;
-- Migrate existing 'standard' rows to 'full' (the closest equivalent)
UPDATE grow_harvests SET harvest_type = 'full' WHERE harvest_type = 'standard';
ALTER TABLE grow_harvests
  ADD CONSTRAINT grow_harvests_harvest_type_check
  CHECK (harvest_type IS NULL OR harvest_type = ANY (ARRAY['full','partial','manicure']));

-- Additional Harvest.CSV tracking fields
ALTER TABLE grow_harvests ADD COLUMN IF NOT EXISTS ccrs_external_identifier TEXT;
ALTER TABLE grow_harvests ADD COLUMN IF NOT EXISTS flower_lot_external_id TEXT;
ALTER TABLE grow_harvests ADD COLUMN IF NOT EXISTS other_material_lot_external_id TEXT;
ALTER TABLE grow_harvests ADD COLUMN IF NOT EXISTS flower_lot_weight_grams NUMERIC;
ALTER TABLE grow_harvests ADD COLUMN IF NOT EXISTS other_material_weight_grams NUMERIC;
ALTER TABLE grow_harvests ADD COLUMN IF NOT EXISTS total_plants_harvested INT;
ALTER TABLE grow_harvests ADD COLUMN IF NOT EXISTS ccrs_reported BOOLEAN DEFAULT false;
ALTER TABLE grow_harvests ADD COLUMN IF NOT EXISTS ccrs_reported_at TIMESTAMPTZ;

COMMIT;
