-- Equipment page alignment migration
-- Brings grow_equipment + grow_calibration_log in line with the Equipment spec:
--   - Named equipment (was type+make+model)
--   - Status enum + maintenance tracking
--   - Optional link to grow_hardware_devices for integrated equipment
--   - Purchase/warranty fields for asset tracking
--   - Full calibration audit trail (readings, tolerance, external technicians)

BEGIN;

-- ─── grow_equipment extensions ──────────────────────────────────────────────
ALTER TABLE grow_equipment ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE grow_equipment ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
ALTER TABLE grow_equipment ADD COLUMN IF NOT EXISTS requires_calibration boolean DEFAULT false;
ALTER TABLE grow_equipment ADD COLUMN IF NOT EXISTS purchase_date date;
ALTER TABLE grow_equipment ADD COLUMN IF NOT EXISTS purchase_price numeric;
ALTER TABLE grow_equipment ADD COLUMN IF NOT EXISTS warranty_expires date;
ALTER TABLE grow_equipment ADD COLUMN IF NOT EXISTS vendor text;
ALTER TABLE grow_equipment ADD COLUMN IF NOT EXISTS hardware_device_id uuid;

-- Add FK to grow_hardware_devices (idempotent)
DO $mig$
BEGIN
  ALTER TABLE grow_equipment
    ADD CONSTRAINT grow_equipment_hardware_device_id_fkey
    FOREIGN KEY (hardware_device_id)
    REFERENCES grow_hardware_devices(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $mig$;

-- Status CHECK
DO $mig$
BEGIN
  ALTER TABLE grow_equipment
    ADD CONSTRAINT grow_equipment_status_check
    CHECK (status = ANY (ARRAY['active','maintenance','out_of_service','decommissioned']));
EXCEPTION WHEN duplicate_object THEN NULL; END $mig$;

-- Expand equipment_type to cover the full asset register
ALTER TABLE grow_equipment DROP CONSTRAINT IF EXISTS grow_equipment_equipment_type_check;
ALTER TABLE grow_equipment ADD CONSTRAINT grow_equipment_equipment_type_check
  CHECK (equipment_type = ANY (ARRAY[
    'scale','thermometer','hygrometer','co2_meter','ph_meter','scanner','printer',
    'barcode_scanner','rfid_reader','label_printer','environmental_sensor','camera','tablet_kiosk',
    'hvac','lighting','irrigation','dehumidifier','tool','other'
  ]));

-- ─── grow_calibration_log extensions ────────────────────────────────────────
ALTER TABLE grow_calibration_log ADD COLUMN IF NOT EXISTS technician_name text;
ALTER TABLE grow_calibration_log ADD COLUMN IF NOT EXISTS reference_standard text;
ALTER TABLE grow_calibration_log ADD COLUMN IF NOT EXISTS before_reading text;
ALTER TABLE grow_calibration_log ADD COLUMN IF NOT EXISTS after_reading text;
ALTER TABLE grow_calibration_log ADD COLUMN IF NOT EXISTS tolerance text;
ALTER TABLE grow_calibration_log ADD COLUMN IF NOT EXISTS deviation text;
ALTER TABLE grow_calibration_log ADD COLUMN IF NOT EXISTS next_calibration_due date;

COMMIT;
