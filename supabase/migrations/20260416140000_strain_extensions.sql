-- Strain page alignment: adds 4 cultivation metadata columns that didn't exist
-- on grow_strains yet. All nullable/defaulted so existing rows need no backfill.

BEGIN;

ALTER TABLE grow_strains ADD COLUMN IF NOT EXISTS difficulty TEXT;
ALTER TABLE grow_strains ADD COLUMN IF NOT EXISTS preferred_environment TEXT;
ALTER TABLE grow_strains ADD COLUMN IF NOT EXISTS growth_pattern TEXT;
ALTER TABLE grow_strains ADD COLUMN IF NOT EXISTS ccrs_notes TEXT;

DO $mig$ BEGIN
  ALTER TABLE grow_strains
    ADD CONSTRAINT grow_strains_difficulty_check
    CHECK (difficulty IS NULL OR difficulty = ANY (ARRAY['easy','moderate','advanced','expert']));
EXCEPTION WHEN duplicate_object THEN NULL; END $mig$;

DO $mig$ BEGIN
  ALTER TABLE grow_strains
    ADD CONSTRAINT grow_strains_preferred_environment_check
    CHECK (preferred_environment IS NULL OR preferred_environment = ANY (ARRAY['indoor','outdoor','greenhouse','any']));
EXCEPTION WHEN duplicate_object THEN NULL; END $mig$;

DO $mig$ BEGIN
  ALTER TABLE grow_strains
    ADD CONSTRAINT grow_strains_growth_pattern_check
    CHECK (growth_pattern IS NULL OR growth_pattern = ANY (ARRAY['short_bushy','tall_stretchy','medium','columnar']));
EXCEPTION WHEN duplicate_object THEN NULL; END $mig$;

COMMIT;
