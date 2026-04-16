/**
 * Pre-flight validation for CCRS submissions.
 *
 * Catches common issues before CSV generation so we don't waste an upload
 * round-trip — CCRS rejects entire files on single record errors.
 */

import type { CCRSCategory } from "./generators";

export interface ValidationIssue {
  severity: "error" | "warning";
  recordIndex?: number;
  field?: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

/** A light-weight record shape covering the union of fields we check. */
export interface RecordLike {
  external_id?: string | null;
  license_number?: string | null;
  current_quantity?: number | null;
  initial_quantity?: number | null;
  quantity_on_hand?: number | null;
  strain_external_identifier?: string | null;
  area_external_identifier?: string | null;
  product_external_identifier?: string | null;
  plant_state?: string | null;
  [key: string]: any;
}

const VALID_PLANT_STATES = ["Growing", "Drying", "PartiallyHarvested", "Harvested", "Quarantined", "Destroyed", "Inventory", "Sold"];

/**
 * Validate records for a given CCRS category.
 * Rule set is intentionally conservative — covers the errors CCRS most often rejects.
 */
export function validateCCRS(category: CCRSCategory, records: RecordLike[], knownStrainIds?: Set<string>, knownAreaIds?: Set<string>, knownProductIds?: Set<string>): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  records.forEach((r, idx) => {
    // Every record needs an external identifier + license
    if (!r.external_id) errors.push({ severity: "error", recordIndex: idx, field: "ExternalIdentifier", message: "Missing ExternalIdentifier" });
    if (!r.license_number) errors.push({ severity: "error", recordIndex: idx, field: "LicenseNumber", message: "Missing LicenseNumber" });

    if (category === "inventory") {
      const initial = Number(r.initial_quantity ?? 0);
      const onHand = Number(r.quantity_on_hand ?? r.current_quantity ?? 0);
      if (onHand > initial) errors.push({ severity: "error", recordIndex: idx, message: `QuantityOnHand (${onHand}) exceeds InitialQuantity (${initial}) — CCRS will reject` });
      if (r.strain_external_identifier && knownStrainIds && !knownStrainIds.has(r.strain_external_identifier)) {
        errors.push({ severity: "error", recordIndex: idx, field: "StrainExternalIdentifier", message: `Referenced strain ${r.strain_external_identifier} not found — upload Strain file first` });
      }
      if (r.area_external_identifier && knownAreaIds && !knownAreaIds.has(r.area_external_identifier)) {
        errors.push({ severity: "error", recordIndex: idx, field: "AreaExternalIdentifier", message: `Referenced area ${r.area_external_identifier} not found — upload Area file first` });
      }
      if (r.product_external_identifier && knownProductIds && !knownProductIds.has(r.product_external_identifier)) {
        errors.push({ severity: "error", recordIndex: idx, field: "ProductExternalIdentifier", message: `Referenced product ${r.product_external_identifier} not found — upload Product file first` });
      }
    }

    if (category === "plant") {
      if (r.plant_state && !VALID_PLANT_STATES.includes(r.plant_state)) {
        errors.push({ severity: "error", recordIndex: idx, field: "PlantState", message: `Invalid PlantState "${r.plant_state}" — must be one of ${VALID_PLANT_STATES.join(", ")}` });
      }
      if (r.strain_external_identifier && knownStrainIds && !knownStrainIds.has(r.strain_external_identifier)) {
        errors.push({ severity: "error", recordIndex: idx, message: `Plant references strain ${r.strain_external_identifier} not on CCRS` });
      }
    }

    // General: external ID format check (17 numeric digits)
    if (r.external_id && !/^\d{17}$/.test(r.external_id)) {
      warnings.push({ severity: "warning", recordIndex: idx, field: "ExternalIdentifier", message: `ExternalIdentifier "${r.external_id}" isn't 17 digits — CCRS may normalize or reject` });
    }
  });

  return { valid: errors.length === 0, errors, warnings };
}
