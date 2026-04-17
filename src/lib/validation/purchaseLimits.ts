/**
 * WA retail purchase limit validation per RCW 69.50.360.
 *
 * Limits are per-consumer, per-transaction. Wholesale transactions are exempt,
 * but we surface warnings on RecreationalRetail orders so operators using our
 * platform for in-store POS get real-time feedback.
 *
 * Classification maps CCRS InventoryType → purchase-limit bucket.
 */

import { WA_PURCHASE_LIMITS, WaPurchaseLimitKey } from "@/lib/schema-enums";

export interface OrderItemForValidation {
  quantity: number;
  unit_weight_grams: number | null;
  servings_per_unit?: number | null;
  ccrs_inventory_type: string | null;
  product_category: string | null;
}

export interface PurchaseLimitViolation {
  bucket: WaPurchaseLimitKey;
  bucketLabel: string;
  ordered: number;
  limit: number;
  unit: string;
}

/**
 * Bucket CCRS inventory types into purchase-limit categories.
 * Returns null for items that don't fall under a limit (flower lots for
 * processors, seeds, etc.).
 */
function classifyItem(item: OrderItemForValidation): WaPurchaseLimitKey | null {
  const type = (item.ccrs_inventory_type ?? "").toLowerCase();
  const cat = (item.product_category ?? "").toLowerCase();

  if (type.includes("tincture") || cat.includes("tincture")) return "cannabis_tinctures";
  if (type.includes("topical") || cat.includes("topical") || cat.includes("transdermal")) return "cannabis_topicals";
  if (cat.includes("liquid edible") || type.includes("liquid edible")) return "cannabis_infused_liquid";
  if (cat.includes("edible") || type.includes("solid edible") || type.includes("capsule")) return "cannabis_infused_solid";
  if (cat.includes("concentrate") || type.includes("concentrate") || type.includes("infused pre-roll")) return "cannabis_concentrates";
  if (
    type.includes("flower lot") || type.includes("usable marijuana") ||
    type.includes("marijuana mix") || cat.includes("flower") || cat.includes("pre-roll")
  ) return "cannabis_usable".replace("cannabis_usable", "usable_cannabis") as WaPurchaseLimitKey;
  return null;
}

const LABELS: Record<WaPurchaseLimitKey, string> = {
  usable_cannabis: "Usable cannabis (flower)",
  cannabis_concentrates: "Concentrates",
  cannabis_infused_liquid: "Infused liquid edibles",
  cannabis_infused_solid: "Infused solid edibles",
  cannabis_topicals: "Topicals",
  cannabis_tinctures: "Tinctures",
};

export function validatePurchaseLimits(items: OrderItemForValidation[]): {
  valid: boolean;
  violations: PurchaseLimitViolation[];
  totalsByBucket: Record<string, number>;
} {
  const totals: Record<string, number> = {};
  for (const item of items) {
    const bucket = classifyItem(item);
    if (!bucket) continue;
    const limit = WA_PURCHASE_LIMITS[bucket];
    const qty = Number(item.quantity ?? 0);
    const unitWeight = Number(item.unit_weight_grams ?? 0);
    // For gram-based limits, sum total grams. For unit-based, sum compounds.
    const contribution = limit.grams != null
      ? (unitWeight > 0 ? qty * unitWeight : qty)
      : qty;
    totals[bucket] = (totals[bucket] ?? 0) + contribution;
  }

  const violations: PurchaseLimitViolation[] = [];
  for (const [bucket, ordered] of Object.entries(totals)) {
    const limit = WA_PURCHASE_LIMITS[bucket as WaPurchaseLimitKey];
    const limitValue = limit.grams ?? limit.amount;
    if (ordered > limitValue) {
      violations.push({
        bucket: bucket as WaPurchaseLimitKey,
        bucketLabel: LABELS[bucket as WaPurchaseLimitKey],
        ordered,
        limit: limitValue,
        unit: limit.grams != null ? "g" : limit.unit,
      });
    }
  }

  return { valid: violations.length === 0, violations, totalsByBucket: totals };
}
