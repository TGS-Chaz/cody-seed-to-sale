/**
 * Schema-enum single source of truth.
 *
 * Every CHECK-constrained text column in the Postgres schema gets its allowed
 * values mirrored here as a `readonly` tuple, along with a derived TS type and
 * a label map for UI display.
 *
 * Rules:
 *  - UI code and DB writes import the tuple values FROM HERE. Never hardcode
 *    the string in a form or hook — if the CHECK constraint changes in a
 *    migration, regenerate these constants and the compiler catches every
 *    callsite that needs updating.
 *  - The `*_LABELS` maps are for display only. Never send a label to the DB.
 *  - Keep alphabetized by table name. Values are listed in the order that
 *    makes the best default for a typical form (not DB order).
 *
 * Regenerated from the output of:
 *   SELECT cl.relname, con.conname, pg_get_constraintdef(con.oid)
 *   FROM pg_constraint con JOIN pg_class cl ON cl.oid = con.conrelid
 *   WHERE cl.relname LIKE 'grow_%' AND con.contype = 'c';
 */

// ─── grow_accounts.license_type ────────────────────────────────────────────────
export const ACCOUNT_LICENSE_TYPES = [
  "retailer", "producer", "processor", "producer_processor",
  "transporter", "lab", "other",
] as const;
export type AccountLicenseType = typeof ACCOUNT_LICENSE_TYPES[number];
export const ACCOUNT_LICENSE_TYPE_LABELS: Record<AccountLicenseType, string> = {
  retailer: "Retailer",
  producer: "Producer",
  processor: "Processor",
  producer_processor: "Producer / Processor",
  transporter: "Transporter",
  lab: "Lab",
  other: "Other",
};

// ─── grow_areas.type / canopy_type ────────────────────────────────────────────
export const AREA_TYPES = ["grow", "storage", "processing", "quarantine", "drying", "curing"] as const;
export type AreaType = typeof AREA_TYPES[number];
export const AREA_CANOPY_TYPES = ["flower", "veg", "mother", "clone", "drying", "storage"] as const;
export type AreaCanopyType = typeof AREA_CANOPY_TYPES[number];

// ─── grow_batches.source_type ─────────────────────────────────────────────────
export const BATCH_SOURCE_TYPES = [
  "harvest", "production", "sublot", "inbound_transfer", "manual", "conversion",
] as const;
export type BatchSourceType = typeof BATCH_SOURCE_TYPES[number];

// ─── grow_ccrs_uploads.file_type / status ─────────────────────────────────────
export const CCRS_UPLOAD_FILE_TYPES = [
  "Strain", "Area", "Product", "Plant", "Inventory",
  "InventoryAdjustment", "LabTest", "Sale", "Manifest",
] as const;
export type CcrsUploadFileType = typeof CCRS_UPLOAD_FILE_TYPES[number];
export const CCRS_UPLOAD_STATUSES = ["pending", "generated", "uploaded", "confirmed", "error"] as const;
export type CcrsUploadStatus = typeof CCRS_UPLOAD_STATUSES[number];

// ─── grow_credit_accounts.payment_terms ───────────────────────────────────────
export const PAYMENT_TERMS = ["COD", "prepaid", "net_7", "net_14", "net_30", "net_60", "net_90", "custom"] as const;
export type PaymentTerms = typeof PAYMENT_TERMS[number];
export const PAYMENT_TERMS_LABELS: Record<PaymentTerms, string> = {
  COD: "COD (Cash on Delivery)",
  prepaid: "Prepaid",
  net_7: "Net 7",
  net_14: "Net 14",
  net_30: "Net 30",
  net_60: "Net 60",
  net_90: "Net 90",
  custom: "Custom",
};

// ─── grow_cycles.phase ────────────────────────────────────────────────────────
export const CYCLE_PHASES = [
  "immature", "vegetative", "flowering", "ready_for_harvest", "harvesting", "completed",
] as const;
export type CyclePhase = typeof CYCLE_PHASES[number];

// ─── grow_discounts.discount_type ─────────────────────────────────────────────
export const DISCOUNT_TYPES = ["percentage", "fixed_amount", "unit_price_override"] as const;
export type DiscountType = typeof DISCOUNT_TYPES[number];
export const DISCOUNT_TYPE_LABELS: Record<DiscountType, string> = {
  percentage: "Percentage",
  fixed_amount: "Fixed Amount",
  unit_price_override: "Unit Price Override",
};
/** Short labels for compact UI (buttons, chips). */
export const DISCOUNT_TYPE_SHORT_LABELS: Record<DiscountType, string> = {
  percentage: "Percent (%)",
  fixed_amount: "Fixed ($)",
  unit_price_override: "Override",
};
/** Not stored on grow_discounts — no CHECK constraint exists for applies_to because
 * the schema uses four separate nullable array columns (applies_to_accounts, applies_to_products,
 * applies_to_categories, applies_to_account_groups). This enum is UI-only — it maps the
 * radio-button selection to which array gets populated. Never write this to the DB. */
export const DISCOUNT_APPLIES_TO = [
  "all_products", "specific_products", "specific_categories", "specific_accounts",
] as const;
export type DiscountAppliesTo = typeof DISCOUNT_APPLIES_TO[number];
export const DISCOUNT_APPLIES_TO_LABELS: Record<DiscountAppliesTo, string> = {
  all_products: "All Products",
  specific_products: "Specific Products",
  specific_categories: "Specific Categories",
  specific_accounts: "Specific Accounts",
};

// ─── grow_disposals ───────────────────────────────────────────────────────────
export const DISPOSAL_TYPES = [
  "plant", "inventory", "harvest_waste", "production_waste",
  "expired_product", "failed_qa", "recall", "other",
] as const;
export type DisposalType = typeof DISPOSAL_TYPES[number];
export const DISPOSAL_STATUSES = [
  "in_quarantine", "ready_to_destroy", "destroyed", "ccrs_reported", "voided",
] as const;
export type DisposalStatus = typeof DISPOSAL_STATUSES[number];
export const DISPOSAL_DESTRUCTION_METHODS = [
  "grinding_mixing", "composting", "incineration", "rendering", "burial", "other",
] as const;
export type DisposalDestructionMethod = typeof DISPOSAL_DESTRUCTION_METHODS[number];
/** CCRS-exact casing. Required for CCRS submission file output. */
export const CCRS_DESTRUCTION_METHODS = ["Compost", "Grind", "Other"] as const;
export type CcrsDestructionMethod = typeof CCRS_DESTRUCTION_METHODS[number];
export const CCRS_DESTRUCTION_REASONS = [
  "PlantDied", "Contamination", "TooMuchWater", "TooLittleWater",
  "MalePlant", "Mites", "Other",
] as const;
export type CcrsDestructionReason = typeof CCRS_DESTRUCTION_REASONS[number];

// ─── grow_drivers.driver_type ─────────────────────────────────────────────────
export const DRIVER_TYPES = ["delivery", "pickup"] as const;
export type DriverType = typeof DRIVER_TYPES[number];

// ─── grow_employees ───────────────────────────────────────────────────────────
export const EMPLOYEE_DEPARTMENTS = [
  "cultivation", "processing", "packaging", "quality",
  "sales", "fulfillment", "delivery", "admin", "management", "other",
] as const;
export type EmployeeDepartment = typeof EMPLOYEE_DEPARTMENTS[number];
export const EMPLOYMENT_STATUSES = [
  "active", "on_leave", "terminated", "seasonal", "contractor",
] as const;
export type EmploymentStatus = typeof EMPLOYMENT_STATUSES[number];

// ─── grow_facilities.license_type ─────────────────────────────────────────────
export const FACILITY_LICENSE_TYPES = [
  "producer_tier_1", "producer_tier_2", "producer_tier_3",
  "processor", "producer_processor", "transporter",
] as const;
export type FacilityLicenseType = typeof FACILITY_LICENSE_TYPES[number];
export const FACILITY_LICENSE_TYPE_LABELS: Record<FacilityLicenseType, string> = {
  producer_tier_1: "Producer Tier 1",
  producer_tier_2: "Producer Tier 2",
  producer_tier_3: "Producer Tier 3",
  processor: "Processor",
  producer_processor: "Producer / Processor",
  transporter: "Transporter",
};

// ─── grow_harvests ────────────────────────────────────────────────────────────
export const HARVEST_TYPES = ["standard", "manicure"] as const;
export type HarvestType = typeof HARVEST_TYPES[number];
export const HARVEST_STATUSES = ["active", "drying", "curing", "cured", "processing", "completed"] as const;
export type HarvestStatus = typeof HARVEST_STATUSES[number];

// ─── grow_inventory_adjustments.adjustment_reason (CCRS-exact) ────────────────
export const CCRS_ADJUSTMENT_REASONS = [
  "Destruction", "Reconciliation", "Lost", "Seizure",
  "Theft", "ReturnedLabSample", "Other",
] as const;
export type CcrsAdjustmentReason = typeof CCRS_ADJUSTMENT_REASONS[number];

// ─── grow_invoices.status ─────────────────────────────────────────────────────
export const INVOICE_STATUSES = [
  "draft", "unpaid", "partial", "paid", "overdue", "voided", "written_off",
] as const;
export type InvoiceStatus = typeof INVOICE_STATUSES[number];

// ─── grow_manifests ───────────────────────────────────────────────────────────
export const MANIFEST_TYPES = ["outbound", "inbound", "return", "qa_sample", "trade_sample"] as const;
export type ManifestType = typeof MANIFEST_TYPES[number];
export const MANIFEST_STATUSES = [
  "draft", "generated", "uploaded_to_ccrs", "ccrs_confirmed",
  "in_transit", "accepted", "rejected", "cancelled",
] as const;
export type ManifestStatus = typeof MANIFEST_STATUSES[number];
export const MANIFEST_TRANSPORTATION_TYPES = [
  "origin_licensee", "destination_licensee", "transporter_licensee",
] as const;
export type ManifestTransportationType = typeof MANIFEST_TRANSPORTATION_TYPES[number];

// ─── grow_orders ──────────────────────────────────────────────────────────────
export const ORDER_SALE_TYPES = ["RecreationalRetail", "RecreationalMedical", "Wholesale"] as const;
export type OrderSaleType = typeof ORDER_SALE_TYPES[number];
export const ORDER_SALE_TYPE_LABELS: Record<OrderSaleType, string> = {
  RecreationalRetail: "Recreational Retail",
  RecreationalMedical: "Recreational Medical",
  Wholesale: "Wholesale",
};
export const ORDER_STATUSES = [
  "draft", "cart", "submitted", "allocated", "packaged",
  "manifested", "invoiced", "released", "completed", "cancelled",
] as const;
export type OrderStatus = typeof ORDER_STATUSES[number];

// ─── grow_payments.payment_method ─────────────────────────────────────────────
export const PAYMENT_METHODS = [
  "cash", "check", "ach", "wire", "credit_card", "cryptocurrency", "cash_app", "other",
] as const;
export type PaymentMethod = typeof PAYMENT_METHODS[number];

// ─── grow_plants ──────────────────────────────────────────────────────────────
export const PLANT_PHASES = [
  "immature", "vegetative", "flowering", "ready_for_harvest", "harvested", "destroyed",
] as const;
export type PlantPhase = typeof PLANT_PHASES[number];
export const PLANT_SOURCE_TYPES = ["seed", "clone", "tissue_culture"] as const;
export type PlantSourceType = typeof PLANT_SOURCE_TYPES[number];
/** CCRS-exact casing — required for CCRS submission file. */
export const CCRS_PLANT_STATES = [
  "Growing", "Drying", "PartiallyHarvested", "Harvested",
  "Quarantined", "Destroyed", "Inventory", "Sold",
] as const;
export type CcrsPlantState = typeof CCRS_PLANT_STATES[number];
export const CCRS_GROWTH_STAGES = ["Immature", "Vegetative", "Flowering"] as const;
export type CcrsGrowthStage = typeof CCRS_GROWTH_STAGES[number];
export const HARVEST_CYCLE_MONTHS = [3, 6, 9, 12] as const;
export type HarvestCycleMonths = typeof HARVEST_CYCLE_MONTHS[number];

// ─── grow_products ────────────────────────────────────────────────────────────
export const PRODUCT_CATEGORIES = [
  "Flower", "Flower Lot", "Concentrate", "Concentrate For Inhalation",
  "Edible", "Topical", "Pre-Roll", "Infused Pre-Roll", "Capsule",
  "Tincture", "Suppository", "Transdermal Patch", "Clone", "Seed",
  "Plant Tissue", "Propagation Material", "Usable Marijuana",
  "Non-Cannabis", "Packaging", "Sample",
] as const;
export type ProductCategory = typeof PRODUCT_CATEGORIES[number];
export const CCRS_INVENTORY_CATEGORIES = [
  "PropagationMaterial", "HarvestedMaterial", "IntermediateProduct", "EndProduct",
] as const;
export type CcrsInventoryCategory = typeof CCRS_INVENTORY_CATEGORIES[number];

// ─── grow_qa_* ────────────────────────────────────────────────────────────────
export const QA_LOT_STATUSES = ["created", "sampled", "in_testing", "passed", "failed", "voided"] as const;
export type QaLotStatus = typeof QA_LOT_STATUSES[number];
export const QA_RESULT_LAB_TEST_STATUSES = [
  "Required", "NotRequired", "Pass", "Fail",
  "FailExtractableOnly", "FailRetestAllowed", "FailRetestAllowedExtractableOnly",
  "InProcess", "SampleCreated",
] as const;
export type QaResultLabTestStatus = typeof QA_RESULT_LAB_TEST_STATUSES[number];
export const QA_SAMPLE_STATUSES = [
  "created", "shipped", "received_at_lab", "testing", "complete", "voided",
] as const;
export type QaSampleStatus = typeof QA_SAMPLE_STATUSES[number];

// ─── grow_recalls ─────────────────────────────────────────────────────────────
export const RECALL_TYPES = ["voluntary", "mandatory", "precautionary"] as const;
export type RecallType = typeof RECALL_TYPES[number];
export const RECALL_SEVERITIES = ["class_i", "class_ii", "class_iii"] as const;
export type RecallSeverity = typeof RECALL_SEVERITIES[number];
export const RECALL_STATUSES = ["open", "in_progress", "resolved", "cancelled"] as const;
export type RecallStatus = typeof RECALL_STATUSES[number];

// ─── grow_routes ──────────────────────────────────────────────────────────────
export const ROUTE_DAYS_OF_WEEK = [
  "sunday", "monday", "tuesday", "wednesday",
  "thursday", "friday", "saturday", "various",
] as const;
export type RouteDayOfWeek = typeof ROUTE_DAYS_OF_WEEK[number];

// ─── grow_sops.category ───────────────────────────────────────────────────────
export const SOP_CATEGORIES = [
  "cultivation", "processing", "packaging", "quality",
  "safety", "compliance", "sanitation", "emergency", "other",
] as const;
export type SopCategory = typeof SOP_CATEGORIES[number];

// ─── grow_strains.type ────────────────────────────────────────────────────────
export const STRAIN_TYPES = ["Indica", "Sativa", "Hybrid", "CBD", "High CBD"] as const;
export type StrainType = typeof STRAIN_TYPES[number];

// ─── grow_tasks ───────────────────────────────────────────────────────────────
export const TASK_STATUSES = ["pending", "in_progress", "completed", "cancelled", "overdue"] as const;
export type TaskStatus = typeof TASK_STATUSES[number];
export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type TaskPriority = typeof TASK_PRIORITIES[number];

// ─── grow_task_templates ──────────────────────────────────────────────────────
export const TASK_TEMPLATE_TYPES = [
  "cultivation", "harvest", "processing", "packaging", "cleaning",
  "maintenance", "compliance", "administrative", "other",
] as const;
export type TaskTemplateType = typeof TASK_TEMPLATE_TYPES[number];
export const TASK_RECURRENCE_TYPES = [
  "once", "daily", "weekly", "biweekly", "monthly", "phase_triggered", "custom_cron",
] as const;
export type TaskRecurrenceType = typeof TASK_RECURRENCE_TYPES[number];

// ─── grow_time_clock_punches ──────────────────────────────────────────────────
export const TIME_PUNCH_TYPES = ["clock_in", "clock_out", "break_start", "break_end"] as const;
export type TimePunchType = typeof TIME_PUNCH_TYPES[number];

// ─── grow_vehicles.vehicle_type ───────────────────────────────────────────────
export const VEHICLE_TYPES = ["delivery", "pickup"] as const;
export type VehicleType = typeof VEHICLE_TYPES[number];

// ─── grow_waste_log.waste_type ────────────────────────────────────────────────
export const WASTE_TYPES = [
  "defoliation", "trim", "male_plant", "pest_damage", "disease",
  "hermaphrodite", "failed_clone", "other",
] as const;
export type WasteType = typeof WASTE_TYPES[number];
