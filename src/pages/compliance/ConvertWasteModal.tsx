import { useEffect, useMemo, useState } from "react";
import { Recycle, Loader2, Info } from "lucide-react";
import { toast } from "sonner";
import ScrollableModal, { ModalHeader } from "@/components/ui/scrollable-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useOrg } from "@/lib/org";
import { generateExternalId } from "@/lib/ccrs-id";
import { Disposal } from "@/hooks/useDisposals";

/**
 * Convert a disposal (or inventory adjustment with salvageable waste) into a
 * sellable "Waste Usable Marijuana" batch. Allowed by WA wholesale rules.
 */
export function ConvertWasteModal({ open, onClose, disposal, onSuccess }: {
  open: boolean; onClose: () => void; disposal: Disposal | null; onSuccess?: (batch: any) => void;
}) {
  const { user } = useAuth();
  const { orgId } = useOrg();
  const [weight, setWeight] = useState("");
  const [barcode, setBarcode] = useState("");
  const [areaId, setAreaId] = useState("");
  const [productId, setProductId] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [areas, setAreas] = useState<Array<{ id: string; name: string }>>([]);
  const [products, setProducts] = useState<Array<{ id: string; name: string; ccrs_inventory_type: string | null }>>([]);

  useEffect(() => {
    if (!open || !orgId || !disposal) return;
    // Default weight = post-disposal weight (what remains after destruction that can still be sold)
    // Fall back to pre-disposal if post isn't set.
    const w = disposal.post_disposal_weight_grams ?? disposal.pre_disposal_weight_grams ?? 0;
    setWeight(String(w));
    setBarcode(`WASTE-${Date.now().toString().slice(-8)}`);
    setAreaId("");
    setProductId("");
    setNotes(`Salvaged waste from disposal ${disposal.external_id}`);
    (async () => {
      const [aRes, pRes] = await Promise.all([
        supabase.from("grow_areas").select("id, name").eq("org_id", orgId).eq("is_active", true).order("name"),
        supabase.from("grow_products").select("id, name, ccrs_inventory_type, ccrs_inventory_category").eq("org_id", orgId).eq("is_active", true),
      ]);
      setAreas((aRes.data ?? []) as any);
      // Filter to waste-compatible products — HarvestedMaterial/Waste or products with waste type
      const wasteProducts = ((pRes.data ?? []) as any[]).filter((p) =>
        p.ccrs_inventory_type === "Waste Usable Marijuana" || p.ccrs_inventory_type === "Waste"
        || (p.ccrs_inventory_category === "HarvestedMaterial" && String(p.name).toLowerCase().includes("waste")),
      );
      setProducts(wasteProducts.length > 0 ? wasteProducts : ((pRes.data ?? []) as any[]));
    })();
  }, [open, orgId, disposal]);

  const weightNum = Number(weight || 0);
  const maxWeight = Number(disposal?.pre_disposal_weight_grams ?? 0);
  const valid = disposal && weightNum > 0 && weightNum <= maxWeight && !!barcode.trim() && !!areaId && !!productId;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disposal || !orgId || !valid) { toast.error("Check inputs"); return; }
    setSaving(true);
    try {
      const { data: batch, error } = await supabase.from("grow_batches").insert({
        org_id: orgId,
        external_id: generateExternalId(),
        barcode: barcode.trim(),
        product_id: productId,
        area_id: areaId,
        source_type: "manual",
        initial_quantity: weightNum,
        current_quantity: weightNum,
        initial_weight_grams: weightNum,
        current_weight_grams: weightNum,
        is_available: false,
        is_non_cannabis: false,
        notes: `${notes.trim()}\n\nConverted from disposal ${disposal.external_id}`,
        created_by: user?.id ?? null,
      }).select("id, barcode").single();
      if (error) throw error;
      toast.success(`Waste converted to batch ${batch!.barcode}`, {
        description: "Batch is quarantined until QA passes.",
      });
      onSuccess?.(batch);
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Conversion failed");
    } finally { setSaving(false); }
  };

  const sourceMsg = useMemo(() => {
    if (!disposal) return "";
    const pre = Number(disposal.pre_disposal_weight_grams ?? 0);
    const post = Number(disposal.post_disposal_weight_grams ?? 0);
    return post > 0 ? `${pre.toFixed(1)}g disposed → ${post.toFixed(1)}g remaining` : `${pre.toFixed(1)}g disposed`;
  }, [disposal]);

  return (
    <ScrollableModal
      open={open} onClose={onClose} size="md" onSubmit={handleSubmit}
      header={<ModalHeader icon={<Recycle className="w-4 h-4 text-amber-500" />} title="Convert to sellable waste" subtitle="Create a quarantined batch from salvageable waste material" />}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={!valid || saving} className="min-w-[120px] gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Recycle className="w-3.5 h-3.5" />}
            Create Waste Batch
          </Button>
        </>
      }
    >
      <div className="p-6 space-y-4">
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-[12px] space-y-1">
          <div><span className="text-muted-foreground">Source disposal:</span> <span className="font-mono font-semibold">{disposal?.external_id.slice(-8)}</span></div>
          <div><span className="text-muted-foreground">Reason:</span> {disposal?.ccrs_destruction_reason ?? disposal?.reason}</div>
          <div><span className="text-muted-foreground">Disposal weights:</span> <span className="font-mono">{sourceMsg}</span></div>
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-[11px]">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500" />
          <span>Waste sold as wholesale must map to CCRS <span className="font-mono">HarvestedMaterial:Waste Usable Marijuana</span>. Batch is quarantined until QA passes.</span>
        </div>

        <Field label="Weight to salvage (g)" required>
          <div className="relative">
            <Input type="number" step="0.1" min="0" max={maxWeight} value={weight} onChange={(e) => setWeight(e.target.value)} className="font-mono pr-12" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">g</span>
          </div>
          <p className="text-[10px] text-muted-foreground">Max: {maxWeight.toFixed(1)}g</p>
        </Field>

        <Field label="Product" required>
          <select value={productId} onChange={(e) => setProductId(e.target.value)} className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="">— Select waste-compatible product —</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}{p.ccrs_inventory_type ? ` · ${p.ccrs_inventory_type}` : ""}</option>)}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Barcode" required><Input value={barcode} onChange={(e) => setBarcode(e.target.value)} className="font-mono" /></Field>
          <Field label="Storage area" required>
            <select value={areaId} onChange={(e) => setAreaId(e.target.value)} className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="">— Select —</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Notes"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" /></Field>
      </div>
    </ScrollableModal>
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
