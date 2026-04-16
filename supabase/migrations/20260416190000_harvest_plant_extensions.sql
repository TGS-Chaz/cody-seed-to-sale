-- Per-plant dry weight + notes for the Harvest detail page's Plants tab.
-- Existing grow_harvest_plants only tracks individual wet_weight_grams;
-- some workflows (manicure especially) record dry weight per plant too.

BEGIN;

ALTER TABLE grow_harvest_plants ADD COLUMN IF NOT EXISTS dry_weight_grams NUMERIC;
ALTER TABLE grow_harvest_plants ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE grow_harvest_plants ADD COLUMN IF NOT EXISTS phase_at_harvest TEXT;

COMMIT;
