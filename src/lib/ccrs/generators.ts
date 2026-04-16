/**
 * CCRS CSV generators for all 13 categories.
 *
 * Each generator is a pure function: takes a submitter + record list, returns CSV string.
 * Fields follow the CCRS Data Model File Spec. Hooks handle the DB queries +
 * map each row into the generator's input shape.
 */

import { buildCSV, csvEscape, commonRecordCols, formatDate, CCRSHeader, CommonRecordFields } from "./csvHelpers";

// ─── Strain (no Operation field per spec) ───────────────────────────────────
export interface StrainRecord {
  externalIdentifier: string;
  licenseNumber: string;
  name: string;
  strainType: string; // Indica / Sativa / Hybrid / CBD / High CBD
  createdBy: string;
  createdDate: Date;
  updatedBy?: string;
  updatedDate?: Date;
}

const STRAIN_COLS = ["ExternalIdentifier", "LicenseNumber", "StrainType", "Name", "CreatedBy", "CreatedDate", "UpdatedBy", "UpdatedDate"] as const;

export function generateStrainCSV(header: CCRSHeader, records: StrainRecord[]): string {
  const rows = records.map((r) => [
    csvEscape(r.externalIdentifier), csvEscape(r.licenseNumber),
    csvEscape(r.strainType), csvEscape(r.name),
    csvEscape(r.createdBy), csvEscape(formatDate(r.createdDate)),
    csvEscape(r.updatedBy ?? r.createdBy), csvEscape(formatDate(r.updatedDate ?? r.createdDate)),
  ]);
  return buildCSV({ ...header, numberRecords: records.length }, STRAIN_COLS, rows);
}

// ─── Area ───────────────────────────────────────────────────────────────────
export interface AreaRecord extends CommonRecordFields {
  externalIdentifier: string;
  licenseNumber: string;
  name: string;
  isQuarantine: boolean | null;
}

const AREA_COLS = ["ExternalIdentifier", "LicenseNumber", "Name", "IsQuarantine", "CreatedBy", "CreatedDate", "UpdatedBy", "UpdatedDate", "Operation"] as const;

export function generateAreaCSV(header: CCRSHeader, records: AreaRecord[]): string {
  const rows = records.map((r) => [
    csvEscape(r.externalIdentifier), csvEscape(r.licenseNumber),
    csvEscape(r.name), csvEscape(r.isQuarantine ? "TRUE" : "FALSE"),
    ...commonRecordCols(r),
  ]);
  return buildCSV({ ...header, numberRecords: records.length }, AREA_COLS, rows);
}

// ─── Product ────────────────────────────────────────────────────────────────
export interface ProductRecord extends CommonRecordFields {
  externalIdentifier: string;
  licenseNumber: string;
  name: string;
  description: string | null;
  inventoryCategory: string; // PropagationMaterial / HarvestedMaterial / IntermediateProduct / EndProduct
  inventoryType: string;
  unitWeightGrams: number | null;
}

const PRODUCT_COLS = ["ExternalIdentifier", "LicenseNumber", "InventoryCategory", "InventoryType", "Name", "Description", "UnitWeightGrams", "CreatedBy", "CreatedDate", "UpdatedBy", "UpdatedDate", "Operation"] as const;

export function generateProductCSV(header: CCRSHeader, records: ProductRecord[]): string {
  const rows = records.map((r) => [
    csvEscape(r.externalIdentifier), csvEscape(r.licenseNumber),
    csvEscape(r.inventoryCategory), csvEscape(r.inventoryType),
    csvEscape(r.name), csvEscape(r.description),
    csvEscape(r.unitWeightGrams),
    ...commonRecordCols(r),
  ]);
  return buildCSV({ ...header, numberRecords: records.length }, PRODUCT_COLS, rows);
}

// ─── Plant ──────────────────────────────────────────────────────────────────
export interface PlantRecord extends CommonRecordFields {
  externalIdentifier: string;
  licenseNumber: string;
  areaExternalIdentifier: string | null;
  strainExternalIdentifier: string | null;
  plantSource: string | null; // Seed / Clone / TissueCulture
  plantState: string;         // Growing / Drying / PartiallyHarvested / Harvested / Quarantined / Destroyed / Inventory / Sold
  growthStage: string | null; // Immature / Vegetative / Flowering
  harvestCycle: number | null; // 3/6/9/12
  motherPlant: string | null;
  plantIdentifier: string | null;
  harvestDate: string | null;
  isMotherPlant: boolean | null;
}

const PLANT_COLS = ["ExternalIdentifier", "LicenseNumber", "AreaExternalIdentifier", "StrainExternalIdentifier", "PlantSource", "PlantState", "GrowthStage", "HarvestCycle", "MotherPlant", "PlantIdentifier", "HarvestDate", "IsMotherPlant", "CreatedBy", "CreatedDate", "UpdatedBy", "UpdatedDate", "Operation"] as const;

export function generatePlantCSV(header: CCRSHeader, records: PlantRecord[]): string {
  const rows = records.map((r) => [
    csvEscape(r.externalIdentifier), csvEscape(r.licenseNumber),
    csvEscape(r.areaExternalIdentifier), csvEscape(r.strainExternalIdentifier),
    csvEscape(r.plantSource), csvEscape(r.plantState),
    csvEscape(r.growthStage), csvEscape(r.harvestCycle),
    csvEscape(r.motherPlant), csvEscape(r.plantIdentifier),
    csvEscape(formatDate(r.harvestDate)),
    csvEscape(r.isMotherPlant ? "TRUE" : "FALSE"),
    ...commonRecordCols(r),
  ]);
  return buildCSV({ ...header, numberRecords: records.length }, PLANT_COLS, rows);
}

// ─── PlantDestruction ───────────────────────────────────────────────────────
export interface PlantDestructionRecord extends CommonRecordFields {
  externalIdentifier: string;
  licenseNumber: string;
  plantExternalIdentifier: string;
  destructionReason: string;
  destructionMethod: string | null;
  destructionDate: Date | string;
}

const PLANT_DESTRUCTION_COLS = ["ExternalIdentifier", "LicenseNumber", "PlantExternalIdentifier", "DestructionReason", "DestructionMethod", "DestructionDate", "CreatedBy", "CreatedDate", "UpdatedBy", "UpdatedDate", "Operation"] as const;

export function generatePlantDestructionCSV(header: CCRSHeader, records: PlantDestructionRecord[]): string {
  const rows = records.map((r) => [
    csvEscape(r.externalIdentifier), csvEscape(r.licenseNumber),
    csvEscape(r.plantExternalIdentifier),
    csvEscape(r.destructionReason), csvEscape(r.destructionMethod),
    csvEscape(formatDate(r.destructionDate)),
    ...commonRecordCols(r),
  ]);
  return buildCSV({ ...header, numberRecords: records.length }, PLANT_DESTRUCTION_COLS, rows);
}

// ─── PlantTransfer ──────────────────────────────────────────────────────────
export interface PlantTransferRecord extends CommonRecordFields {
  externalIdentifier: string;
  fromLicenseNumber: string;
  toLicenseNumber: string;
  fromPlantExternalIdentifier: string;
  toPlantExternalIdentifier: string | null;
  transferDate: Date | string;
}

const PLANT_TRANSFER_COLS = ["ExternalIdentifier", "FromLicenseNumber", "ToLicenseNumber", "FromPlantExternalIdentifier", "ToPlantExternalIdentifier", "TransferDate", "CreatedBy", "CreatedDate", "UpdatedBy", "UpdatedDate", "Operation"] as const;

export function generatePlantTransferCSV(header: CCRSHeader, records: PlantTransferRecord[]): string {
  const rows = records.map((r) => [
    csvEscape(r.externalIdentifier),
    csvEscape(r.fromLicenseNumber), csvEscape(r.toLicenseNumber),
    csvEscape(r.fromPlantExternalIdentifier), csvEscape(r.toPlantExternalIdentifier),
    csvEscape(formatDate(r.transferDate)),
    ...commonRecordCols(r),
  ]);
  return buildCSV({ ...header, numberRecords: records.length }, PLANT_TRANSFER_COLS, rows);
}

// ─── Inventory ──────────────────────────────────────────────────────────────
export interface InventoryRecord extends CommonRecordFields {
  externalIdentifier: string;
  licenseNumber: string;
  strainExternalIdentifier: string | null;
  areaExternalIdentifier: string | null;
  productExternalIdentifier: string | null;
  initialQuantity: number;
  quantityOnHand: number;
  totalCost: number | null;
  isMedical: boolean | null;
}

const INVENTORY_COLS = ["ExternalIdentifier", "LicenseNumber", "StrainExternalIdentifier", "AreaExternalIdentifier", "ProductExternalIdentifier", "InitialQuantity", "QuantityOnHand", "TotalCost", "IsMedical", "CreatedBy", "CreatedDate", "UpdatedBy", "UpdatedDate", "Operation"] as const;

export function generateInventoryCSV(header: CCRSHeader, records: InventoryRecord[]): string {
  const rows = records.map((r) => [
    csvEscape(r.externalIdentifier), csvEscape(r.licenseNumber),
    csvEscape(r.strainExternalIdentifier), csvEscape(r.areaExternalIdentifier), csvEscape(r.productExternalIdentifier),
    csvEscape(r.initialQuantity), csvEscape(r.quantityOnHand), csvEscape(r.totalCost),
    csvEscape(r.isMedical ? "TRUE" : "FALSE"),
    ...commonRecordCols(r),
  ]);
  return buildCSV({ ...header, numberRecords: records.length }, INVENTORY_COLS, rows);
}

// ─── InventoryAdjustment ────────────────────────────────────────────────────
export interface InventoryAdjustmentRecord extends CommonRecordFields {
  externalIdentifier: string;
  licenseNumber: string;
  inventoryExternalIdentifier: string;
  adjustmentReason: string;
  adjustmentDetail: string | null;
  quantity: number;
  adjustmentDate: Date | string;
}

const INVENTORY_ADJUSTMENT_COLS = ["ExternalIdentifier", "LicenseNumber", "InventoryExternalIdentifier", "AdjustmentReason", "AdjustmentDetail", "Quantity", "AdjustmentDate", "CreatedBy", "CreatedDate", "UpdatedBy", "UpdatedDate", "Operation"] as const;

export function generateInventoryAdjustmentCSV(header: CCRSHeader, records: InventoryAdjustmentRecord[]): string {
  const rows = records.map((r) => [
    csvEscape(r.externalIdentifier), csvEscape(r.licenseNumber),
    csvEscape(r.inventoryExternalIdentifier),
    csvEscape(r.adjustmentReason), csvEscape(r.adjustmentDetail),
    csvEscape(r.quantity),
    csvEscape(formatDate(r.adjustmentDate)),
    ...commonRecordCols(r),
  ]);
  return buildCSV({ ...header, numberRecords: records.length }, INVENTORY_ADJUSTMENT_COLS, rows);
}

// ─── InventoryTransfer ──────────────────────────────────────────────────────
export interface InventoryTransferRecord extends CommonRecordFields {
  externalIdentifier: string;
  fromLicenseNumber: string;
  toLicenseNumber: string;
  fromInventoryExternalIdentifier: string;
  toInventoryExternalIdentifier: string | null;
  quantity: number;
  transferDate: Date | string;
}

const INVENTORY_TRANSFER_COLS = ["ExternalIdentifier", "FromLicenseNumber", "ToLicenseNumber", "FromInventoryExternalIdentifier", "ToInventoryExternalIdentifier", "Quantity", "TransferDate", "CreatedBy", "CreatedDate", "UpdatedBy", "UpdatedDate", "Operation"] as const;

export function generateInventoryTransferCSV(header: CCRSHeader, records: InventoryTransferRecord[]): string {
  const rows = records.map((r) => [
    csvEscape(r.externalIdentifier),
    csvEscape(r.fromLicenseNumber), csvEscape(r.toLicenseNumber),
    csvEscape(r.fromInventoryExternalIdentifier), csvEscape(r.toInventoryExternalIdentifier),
    csvEscape(r.quantity),
    csvEscape(formatDate(r.transferDate)),
    ...commonRecordCols(r),
  ]);
  return buildCSV({ ...header, numberRecords: records.length }, INVENTORY_TRANSFER_COLS, rows);
}

// ─── LabTest ────────────────────────────────────────────────────────────────
export interface LabTestRecord extends CommonRecordFields {
  externalIdentifier: string;
  licenseNumber: string;
  labLicenseNumber: string | null;
  labTestStatus: string;
  inventoryExternalIdentifier: string | null;
  testName: string | null;
  testDate: Date | string;
  testValue: string | null;
}

const LAB_TEST_COLS = ["ExternalIdentifier", "LicenseNumber", "LabLicenseNumber", "LabTestStatus", "InventoryExternalIdentifier", "TestName", "TestDate", "TestValue", "CreatedBy", "CreatedDate", "UpdatedBy", "UpdatedDate", "Operation"] as const;

export function generateLabTestCSV(header: CCRSHeader, records: LabTestRecord[]): string {
  const rows = records.map((r) => [
    csvEscape(r.externalIdentifier), csvEscape(r.licenseNumber),
    csvEscape(r.labLicenseNumber), csvEscape(r.labTestStatus),
    csvEscape(r.inventoryExternalIdentifier),
    csvEscape(r.testName), csvEscape(formatDate(r.testDate)), csvEscape(r.testValue),
    ...commonRecordCols(r),
  ]);
  return buildCSV({ ...header, numberRecords: records.length }, LAB_TEST_COLS, rows);
}

// ─── Sale ───────────────────────────────────────────────────────────────────
export interface SaleRecord extends CommonRecordFields {
  saleExternalIdentifier: string;
  saleDetailExternalIdentifier: string;
  licenseNumber: string;
  soldToLicenseNumber: string;
  saleType: string;
  saleDate: Date | string;
  inventoryExternalIdentifier: string | null;
  plantExternalIdentifier: string | null;
  quantity: number;
  unitPrice: number;
  discount: number | null;
  salesTax: number | null;
  otherTax: number | null;
}

const SALE_COLS = ["SaleExternalIdentifier", "SaleDetailExternalIdentifier", "LicenseNumber", "SoldToLicenseNumber", "SaleType", "SaleDate", "InventoryExternalIdentifier", "PlantExternalIdentifier", "Quantity", "UnitPrice", "Discount", "SalesTax", "OtherTax", "CreatedBy", "CreatedDate", "UpdatedBy", "UpdatedDate", "Operation"] as const;

export function generateSaleCSV(header: CCRSHeader, records: SaleRecord[]): string {
  const rows = records.map((r) => [
    csvEscape(r.saleExternalIdentifier), csvEscape(r.saleDetailExternalIdentifier),
    csvEscape(r.licenseNumber), csvEscape(r.soldToLicenseNumber),
    csvEscape(r.saleType), csvEscape(formatDate(r.saleDate)),
    csvEscape(r.inventoryExternalIdentifier), csvEscape(r.plantExternalIdentifier),
    csvEscape(r.quantity), csvEscape(r.unitPrice),
    csvEscape(r.discount), csvEscape(r.salesTax), csvEscape(r.otherTax),
    ...commonRecordCols(r),
  ]);
  return buildCSV({ ...header, numberRecords: records.length }, SALE_COLS, rows);
}

// ─── Harvest (added Oct 2025) ───────────────────────────────────────────────
export interface HarvestRecord extends CommonRecordFields {
  externalIdentifier: string;
  licenseNumber: string;
  areaExternalIdentifier: string | null;
  strainExternalIdentifier: string | null;
  flowerLotExternalIdentifier: string | null;
  otherMaterialLotExternalIdentifier: string | null;
  flowerLotWeightGrams: number | null;
  otherMaterialWeightGrams: number | null;
  wasteWeightGrams: number | null;
  totalPlantsHarvested: number | null;
  harvestDate: Date | string | null;
}

const HARVEST_COLS = ["ExternalIdentifier", "LicenseNumber", "AreaExternalIdentifier", "StrainExternalIdentifier", "FlowerLotExternalIdentifier", "OtherMaterialLotExternalIdentifier", "FlowerLotWeightGrams", "OtherMaterialWeightGrams", "WasteWeightGrams", "TotalPlantsHarvested", "HarvestDate", "CreatedBy", "CreatedDate", "UpdatedBy", "UpdatedDate", "Operation"] as const;

export function generateHarvestCSV(header: CCRSHeader, records: HarvestRecord[]): string {
  const rows = records.map((r) => [
    csvEscape(r.externalIdentifier), csvEscape(r.licenseNumber),
    csvEscape(r.areaExternalIdentifier), csvEscape(r.strainExternalIdentifier),
    csvEscape(r.flowerLotExternalIdentifier), csvEscape(r.otherMaterialLotExternalIdentifier),
    csvEscape(r.flowerLotWeightGrams), csvEscape(r.otherMaterialWeightGrams),
    csvEscape(r.wasteWeightGrams), csvEscape(r.totalPlantsHarvested),
    csvEscape(formatDate(r.harvestDate)),
    ...commonRecordCols(r),
  ]);
  return buildCSV({ ...header, numberRecords: records.length }, HARVEST_COLS, rows);
}

// Manifest is already built in generateManifestCSV.ts

// ─── Category registry ──────────────────────────────────────────────────────
export const CCRS_CATEGORIES = [
  "strain", "area", "product", "plant", "plantdestruction", "planttransfer",
  "inventory", "inventoryadjustment", "inventorytransfer", "labtest",
  "sale", "harvest", "manifest",
] as const;
export type CCRSCategory = typeof CCRS_CATEGORIES[number];

export const CCRS_CATEGORY_LABELS: Record<CCRSCategory, string> = {
  strain: "Strain",
  area: "Area",
  product: "Product",
  plant: "Plant",
  plantdestruction: "Plant Destruction",
  planttransfer: "Plant Transfer",
  inventory: "Inventory",
  inventoryadjustment: "Inventory Adjustment",
  inventorytransfer: "Inventory Transfer",
  labtest: "Lab Test",
  sale: "Sale",
  harvest: "Harvest",
  manifest: "Manifest",
};
