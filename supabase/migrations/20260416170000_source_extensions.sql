-- Grow Sources page alignment: expands source_type to include tissue culture,
-- adds vendor/clone/compliance metadata, introduces an explicit status enum
-- so we can distinguish "Available" (promotable) from "In Cycle" / "Depleted"
-- / "Destroyed" — and adds a source_id FK on grow_plants so the promotion
-- flow can trace plants back to their originating source for CCRS.

BEGIN;

-- ─── grow_sources: broaden source_type to include tissue culture ──────────
ALTER TABLE grow_sources DROP CONSTRAINT IF EXISTS grow_sources_source_type_check;
ALTER TABLE grow_sources ADD CONSTRAINT grow_sources_source_type_check
  CHECK (source_type = ANY (ARRAY['seed','clone','tissue_culture']));

-- ─── grow_sources: new columns ────────────────────────────────────────────
ALTER TABLE grow_sources ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'available';
ALTER TABLE grow_sources ADD COLUMN IF NOT EXISTS vendor_lot_number TEXT;
ALTER TABLE grow_sources ADD COLUMN IF NOT EXISTS cost_per_unit NUMERIC;
ALTER TABLE grow_sources ADD COLUMN IF NOT EXISTS is_feminized BOOLEAN;
ALTER TABLE grow_sources ADD COLUMN IF NOT EXISTS is_autoflower BOOLEAN;
ALTER TABLE grow_sources ADD COLUMN IF NOT EXISTS germination_rate_expected NUMERIC;
ALTER TABLE grow_sources ADD COLUMN IF NOT EXISTS cut_date DATE;
ALTER TABLE grow_sources ADD COLUMN IF NOT EXISTS is_rooted BOOLEAN DEFAULT false;
ALTER TABLE grow_sources ADD COLUMN IF NOT EXISTS root_date DATE;
ALTER TABLE grow_sources ADD COLUMN IF NOT EXISTS rooting_medium TEXT;
ALTER TABLE grow_sources ADD COLUMN IF NOT EXISTS rooting_hormone TEXT;
ALTER TABLE grow_sources ADD COLUMN IF NOT EXISTS health_rating TEXT;
ALTER TABLE grow_sources ADD COLUMN IF NOT EXISTS phenotype_id UUID;
ALTER TABLE grow_sources ADD COLUMN IF NOT EXISTS ccrs_notes TEXT;

DO $mig$ BEGIN
  ALTER TABLE grow_sources
    ADD CONSTRAINT grow_sources_status_check
    CHECK (status = ANY (ARRAY['available','in_cycle','depleted','destroyed','quarantine']));
EXCEPTION WHEN duplicate_object THEN NULL; END $mig$;

DO $mig$ BEGIN
  ALTER TABLE grow_sources
    ADD CONSTRAINT grow_sources_rooting_medium_check
    CHECK (rooting_medium IS NULL OR rooting_medium = ANY (ARRAY[
      'rockwool','rapid_rooter','peat_pellet','aero_cloner','water','soil','other'
    ]));
EXCEPTION WHEN duplicate_object THEN NULL; END $mig$;

DO $mig$ BEGIN
  ALTER TABLE grow_sources
    ADD CONSTRAINT grow_sources_health_rating_check
    CHECK (health_rating IS NULL OR health_rating = ANY (ARRAY['excellent','good','fair','poor']));
EXCEPTION WHEN duplicate_object THEN NULL; END $mig$;

DO $mig$ BEGIN
  ALTER TABLE grow_sources
    ADD CONSTRAINT grow_sources_phenotype_id_fkey
    FOREIGN KEY (phenotype_id) REFERENCES grow_phenotypes(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $mig$;

-- Backfill status for any pre-existing rows
UPDATE grow_sources SET status = 'available' WHERE status IS NULL;

-- ─── grow_plants: add source_id FK so promotion traces plants back to source ─
ALTER TABLE grow_plants ADD COLUMN IF NOT EXISTS source_id UUID;

DO $mig$ BEGIN
  ALTER TABLE grow_plants
    ADD CONSTRAINT grow_plants_source_id_fkey
    FOREIGN KEY (source_id) REFERENCES grow_sources(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $mig$;

CREATE INDEX IF NOT EXISTS idx_grow_plants_source_id ON grow_plants(source_id);

COMMIT;
