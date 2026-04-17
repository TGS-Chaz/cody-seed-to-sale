/**
 * Parse a CCRS-format CSV.
 *
 * CCRS files have a 3-row header block:
 *   Row 1: "SubmittedBy,SubmittedDate,NumberRecords"
 *   Row 2: values for the above
 *   Row 3: the item column headers
 *   Row 4+: item records
 *
 * This parser detects that header shape, strips it, and returns the inner table.
 */

import Papa from "papaparse";

export interface CCRSFileDetection {
  isCCRS: boolean;
  submittedBy?: string;
  submittedDate?: string;
  numberRecords?: number;
  columns: string[];
  rows: Record<string, string>[];
}

export function parseCCRS(csvText: string): CCRSFileDetection {
  // Try to parse first three rows as header block
  const lines = csvText.split(/\r?\n/);
  if (lines.length < 3) return { isCCRS: false, columns: [], rows: [] };

  const firstHeader = Papa.parse(lines[0], { header: false }).data[0] as string[] | undefined;
  const firstValues = Papa.parse(lines[1], { header: false }).data[0] as string[] | undefined;

  const isCCRSHeader = firstHeader?.length === 3
    && firstHeader[0] === "SubmittedBy"
    && firstHeader[1] === "SubmittedDate"
    && firstHeader[2] === "NumberRecords";

  if (!isCCRSHeader) {
    // Fall back to plain CSV parse
    const parsed = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true });
    return {
      isCCRS: false,
      columns: (parsed.meta.fields ?? []) as string[],
      rows: (parsed.data ?? []) as Record<string, string>[],
    };
  }

  // Strip header block
  const bodyText = lines.slice(2).join("\n");
  const parsed = Papa.parse<Record<string, string>>(bodyText, { header: true, skipEmptyLines: true });
  return {
    isCCRS: true,
    submittedBy: firstValues?.[0],
    submittedDate: firstValues?.[1],
    numberRecords: firstValues?.[2] ? Number(firstValues[2]) : undefined,
    columns: (parsed.meta.fields ?? []) as string[],
    rows: (parsed.data ?? []) as Record<string, string>[],
  };
}

/**
 * Map CCRS field names to our schema field names for a given entity.
 * Returns a mapping object that CSVImporter can use to auto-populate the column map.
 */
export const CCRS_FIELD_MAP: Record<string, Record<string, string>> = {
  strain: {
    ExternalIdentifier: "external_id",
    Name: "name",
    StrainType: "type",
  },
  area: {
    ExternalIdentifier: "external_id",
    Name: "name",
    IsQuarantine: "is_quarantine",
  },
  product: {
    ExternalIdentifier: "external_id",
    Name: "name",
    Description: "description",
    InventoryCategory: "ccrs_inventory_category",
    InventoryType: "ccrs_inventory_type",
    UnitWeightGrams: "unit_weight_grams",
  },
  plant: {
    ExternalIdentifier: "external_id",
    PlantIdentifier: "plant_identifier",
    AreaExternalIdentifier: "area_external_id",
    StrainExternalIdentifier: "strain_external_id",
    PlantSource: "source_type",
    PlantState: "ccrs_plant_state",
    GrowthStage: "phase",
    HarvestCycle: "harvest_cycle_months",
    HarvestDate: "harvest_date",
  },
  inventory: {
    ExternalIdentifier: "external_id",
    StrainExternalIdentifier: "strain_external_id",
    AreaExternalIdentifier: "area_external_id",
    ProductExternalIdentifier: "product_external_id",
    InitialQuantity: "initial_quantity",
    QuantityOnHand: "current_quantity",
    TotalCost: "total_cost",
    IsMedical: "is_medical",
  },
};
