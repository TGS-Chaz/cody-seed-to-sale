import { useEffect, useMemo, useState } from "react";
import { Loader2, Package, ArrowRight, Barcode, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import ScrollableModal, { ModalHeader } from "@/components/ui/scrollable-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { useOrg } from "@/lib/org";
import { Harvest, useFinishHarvest } from "@/hooks/useHarvests";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  harvest: Harvest;
  onSuccess?: (result: { batch_id: string; barcode: string | null }) => void;
}

interface ProductOption { id: string; name: string; ccrs_inventory_category: string | null; ccrs_inventory_type: string | null }
interface AreaOption { id: string; name: string }

/** Detail-page variant of the Grow Board's FinishHarvestModal. Same
 * semantics, but works directly from a Harvest record rather than a
 * HydratedBoardCard. */
export default function FinishHarvestPageModal({ open, onClose, harvest, onSuccess }: Props) {
  const finish = useFinishHarvest();
  const { orgId } = useOrg();

  const [dryWeight, setDryWeight] = useState<string>(harvest.dry_weight_grams != null ? String(harvest.dry_weight_grams) : "");
  const [wasteWeight, setWasteWeight] = useState<string>(harvest.waste_weight_grams != null ? String(harvest.waste_weight_grams) : "");
  const [productId, setProductId] = useState<string>("");
  const [areaId, setAreaId] = useState<string>(harvest.area_id ?? "");
  const [barcode, setBarcode] = useState<string>(`B-${Date.now()}`);
  const [isMedical, setIsMedical] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const [products, setProducts] = useState<ProductOption[]>([]);
  const [areas, setAreas] = useState<AreaOption[]>([]);

  useEffect(() => {
    if (!open || !orgId) return;
    (async () => {
      const [pRes, aRes] = await Promise.all([
        supabase
          .from("grow_products")
          .select("id, name, ccrs_inventory_category, ccrs_inventory_type")
          .eq("org_id", orgId)
          .eq("is_active", true)
          .order("ccrs_inventory_category")
          .order("name"),
        supabase.from("grow_areas").select("id, name").eq("org_id", orgId).eq("is_active", true).order("name"),
      ]);
      setProducts((pRes.data ?? []) as ProductOption[]);
      setAreas((aRes.data ?? []) as AreaOption[]);
    })();
  }, [open, orgId]);

  useEffect(() => {
    if (!open) return;
    setDryWeight(harvest.dry_weight_grams != null ? String(harvest.dry_weight_grams) : "");
    setWasteWeight(harvest.waste_weight_grams != null ? String(harvest.waste_weight_grams) : "");
    setProductId("");
    setAreaId(harvest.area_id ?? "");
    setBarcode(`B-${Date.now()}`);
    setIsMedical(false);
    setNotes("");
  }, [open, harvest.area_id, harvest.dry_weight_grams, harvest.waste_weight_grams]);

  const harvestedProducts = useMemo(() => products.filter((p) => p.ccrs_inventory_category === "HarvestedMaterial"), [products]);
  const otherProducts = useMemo(() => products.filter((p) => p.ccrs_inventory_category !== "HarvestedMaterial"), [products]);

  const wet = harvest.wet_weight_grams != null ? Number(harvest.wet_weight_grams) : null;
  const yieldPct = useMemo(() => {
    const dry = Number(dryWeight) || 0;
    return wet && dry > 0 ? (dry / wet) * 100 : null;
  }, [dryWeight, wet]);

  const isCured = harvest.status === "cured";
  const hasDry = harvest.dry_weight_grams != null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dryWeight || Number(dryWeight) <= 0) { toast.error("Dry weight is required"); return; }
    if (!productId) { toast.error("Pick a product"); return; }
    setSaving(true);
    try {
      const result = await finish(harvest.id, {
        dry_weight_grams: Number(dryWeight),
        waste_weight_grams: wasteWeight ? Number(wasteWeight) : null,
        product_id: productId,
        area_id: areaId || null,
        barcode: barcode.trim() || null,
        is_medical: isMedical,
        notes: notes.trim() || null,
      });
      toast.success(`Batch ${result.barcode ?? "created"}`, {
        description: `${Number(dryWeight).toFixed(0)}g added to Inventory`,
        action: { label: "View Batch →", onClick: () => { if (result.batch_id) window.location.assign(`/inventory/batches/${result.batch_id}`); } },
      });
      onSuccess?.(result);
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Finalize failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollableModal
      open={open}
      onClose={onClose}
      size="md"
      onSubmit={handleSubmit}
      header={<ModalHeader icon={<Package className="w-4 h-4 text-teal-500" />} title="Finish harvest → create inventory" subtitle={harvest.name} />}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving || !hasDry} className="min-w-[140px] gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
            Create Batch
          </Button>
        </>
      }
    >
      <div className="p-6 space-y-4">
        {!hasDry && (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 flex items-start gap-2 text-[12px]">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500" />
            <span>Record the final dry weight first — "Record dry weight" button on the detail page.</span>
          </div>
        )}
        {hasDry && !isCured && (
          <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-3 flex items-start gap-2 text-[12px]">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-blue-500" />
            <span>Status is <span className="font-mono font-semibold">{harvest.status}</span>. You can still finalize, but most growers wait until the harvest is fully cured.</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Final dry weight" required>
            <WeightInput value={dryWeight} onChange={setDryWeight} />
          </Field>
          <Field label="Waste weight">
            <WeightInput value={wasteWeight} onChange={setWasteWeight} />
          </Field>
        </div>

        {wet != null && (
          <div className="rounded-lg bg-muted/30 border border-border p-3 grid grid-cols-3 gap-3">
            <Stat label="Wet" value={`${wet.toFixed(0)}g`} />
            <Stat label="Dry" value={dryWeight ? `${Number(dryWeight).toFixed(0)}g` : "—"} />
            <Stat
              label="Yield"
              value={yieldPct != null ? `${yieldPct.toFixed(1)}%` : "—"}
              color={yieldPct != null && yieldPct > 28 ? "text-emerald-500" : yieldPct != null && yieldPct < 20 ? "text-amber-500" : "text-foreground"}
            />
          </div>
        )}

        <Field label="Product" required>
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">— Select product —</option>
            {harvestedProducts.length > 0 && (
              <optgroup label="Harvested Material">
                {harvestedProducts.map((p) => <option key={p.id} value={p.id}>{p.name}{p.ccrs_inventory_type ? ` (${p.ccrs_inventory_type})` : ""}</option>)}
              </optgroup>
            )}
            {otherProducts.length > 0 && (
              <optgroup label="Other">
                {otherProducts.map((p) => <option key={p.id} value={p.id}>{p.name}{p.ccrs_inventory_type ? ` (${p.ccrs_inventory_type})` : ""}</option>)}
              </optgroup>
            )}
          </select>
          {products.length === 0 && <p className="text-[11px] text-muted-foreground/70">Add a product in Cultivation → Products first.</p>}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Storage area">
            <select
              value={areaId}
              onChange={(e) => setAreaId(e.target.value)}
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">— None —</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Field label="Batch barcode">
            <div className="relative">
              <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input value={barcode} onChange={(e) => setBarcode(e.target.value)} className="font-mono pl-9" />
            </div>
          </Field>
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={isMedical} onChange={(e) => setIsMedical(e.target.checked)} className="w-4 h-4 rounded border-border accent-primary" />
          <span className="text-[13px] text-foreground">Medical batch</span>
          <span className="text-[11px] text-muted-foreground ml-1">(CCRS IsMedical flag)</span>
        </label>

        <Field label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Batch characteristics, aroma, terpene notes…"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
        </Field>

        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-[12px] text-foreground flex items-center gap-2">
          <Package className="w-3.5 h-3.5 text-emerald-500" />
          <span>
            This will create a batch with <span className="font-mono font-semibold">{dryWeight || "0"}g</span>{" "}
            of <span className="font-semibold">{products.find((p) => p.id === productId)?.name ?? "—"}</span>
          </span>
        </div>
      </div>
    </ScrollableModal>
  );
}

function WeightInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <Input type="number" step="0.1" min="0" value={value} onChange={(e) => onChange(e.target.value)} className="font-mono pr-12" placeholder="0.0" />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">g</span>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function Stat({ label, value, color = "text-foreground" }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{label}</p>
      <p className={cn("font-mono font-bold text-[16px] tabular-nums mt-0.5", color)}>{value}</p>
    </div>
  );
}
