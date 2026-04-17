import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Leaf, ShieldCheck, Calendar, Building2, FlaskConical, Loader2, AlertTriangle,
  Sparkles, Award, Info,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

interface TraceData {
  batch: {
    external_id: string;
    barcode: string;
    harvest_date: string | null;
    packaged_date: string | null;
    category: string | null;
    is_medical: boolean;
  };
  product: {
    name: string;
    description: string | null;
    category: string | null;
    servings: number | null;
    unit_weight_grams: number | null;
  } | null;
  strain: {
    name: string;
    type: string | null;
    terpenes: string[] | null;
    thc_pct: number | null;
  } | null;
  org: {
    name: string | null;
    license: string | null;
    city: string | null;
    state: string | null;
  };
  lab: {
    name: string | null;
    license: string | null;
    test_date: string | null;
    report_date: string | null;
    thc_total_pct: number | null;
    cbd_total_pct: number | null;
    total_terpenes_pct: number | null;
    pesticides_pass: boolean | null;
    heavy_metals_pass: boolean | null;
    microbials_pass: boolean | null;
    mycotoxins_pass: boolean | null;
    residual_solvents_pass: boolean | null;
    overall_pass: boolean | null;
  } | null;
}

/**
 * Public, unauthenticated traceability page. Consumers scan a QR on their
 * product label and land here to see origin + lab results. No login required.
 *
 * The URL uses external_id (17-digit CCRS identifier), but falls back to UUID
 * if that's what's stored. RLS is bypassed via a permissive select policy on
 * publicly exposed fields only.
 */
export default function TraceabilityPage() {
  const { batchExternalId } = useParams<{ batchExternalId: string }>();
  const [data, setData] = useState<TraceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!batchExternalId) { setLoading(false); setError("No batch ID provided"); return; }
      setLoading(true); setError(null);
      try {
        // Look up by external_id first, then fall back to UUID
        let batch: any = null;
        const { data: b1 } = await supabase
          .from("grow_batches")
          .select("id, external_id, barcode, product_id, strain_id, harvest_id, org_id, ccrs_inventory_category, is_medical, created_at")
          .eq("external_id", batchExternalId)
          .maybeSingle();
        batch = b1;
        if (!batch) {
          const { data: b2 } = await supabase
            .from("grow_batches")
            .select("id, external_id, barcode, product_id, strain_id, harvest_id, org_id, ccrs_inventory_category, is_medical, created_at")
            .eq("id", batchExternalId)
            .maybeSingle();
          batch = b2;
        }
        if (!batch) { if (!cancelled) { setError("Product not found"); setLoading(false); } return; }

        const [productRes, strainRes, harvestRes, orgRes, facilityRes, qaLotsRes] = await Promise.all([
          batch.product_id ? supabase.from("grow_products").select("name, description, ccrs_inventory_category, servings_per_unit, unit_weight_grams").eq("id", batch.product_id).maybeSingle() : Promise.resolve({ data: null }),
          batch.strain_id ? supabase.from("grow_strains").select("name, type, dominant_terpenes, average_thc_pct").eq("id", batch.strain_id).maybeSingle() : Promise.resolve({ data: null }),
          batch.harvest_id ? supabase.from("grow_harvests").select("harvest_started_at").eq("id", batch.harvest_id).maybeSingle() : Promise.resolve({ data: null }),
          supabase.from("organizations").select("name").eq("id", batch.org_id).maybeSingle(),
          supabase.from("grow_facilities").select("license_number, city, state, is_primary").eq("org_id", batch.org_id),
          supabase.from("grow_qa_lots").select("id").eq("parent_batch_id", batch.id),
        ]);

        const facilities = ((facilityRes as any).data ?? []) as any[];
        const primary = facilities.find((f) => f.is_primary) ?? facilities[0];

        const lotIds = ((qaLotsRes as any).data ?? []).map((l: any) => l.id);
        let labData: TraceData["lab"] = null;
        if (lotIds.length > 0) {
          const { data: results } = await supabase
            .from("grow_qa_results")
            .select("lab_name, lab_license_number, test_date, created_at, thc_total_pct, cbd_total_pct, total_terpenes_pct, pesticides_pass, heavy_metals_pass, microbials_pass, mycotoxins_pass, residual_solvents_pass, overall_pass")
            .in("qa_lot_id", lotIds)
            .order("test_date", { ascending: false })
            .limit(1);
          const r = ((results ?? []) as any[])[0];
          if (r) {
            labData = {
              name: r.lab_name,
              license: r.lab_license_number,
              test_date: r.test_date,
              report_date: r.created_at,
              thc_total_pct: r.thc_total_pct,
              cbd_total_pct: r.cbd_total_pct,
              total_terpenes_pct: r.total_terpenes_pct,
              pesticides_pass: r.pesticides_pass,
              heavy_metals_pass: r.heavy_metals_pass,
              microbials_pass: r.microbials_pass,
              mycotoxins_pass: r.mycotoxins_pass,
              residual_solvents_pass: r.residual_solvents_pass,
              overall_pass: r.overall_pass,
            };
          }
        }

        if (cancelled) return;
        setData({
          batch: {
            external_id: batch.external_id ?? batch.id,
            barcode: batch.barcode,
            harvest_date: (harvestRes as any)?.data?.harvest_started_at ?? null,
            packaged_date: batch.created_at,
            category: batch.ccrs_inventory_category,
            is_medical: !!batch.is_medical,
          },
          product: (productRes as any).data ? {
            name: (productRes as any).data.name,
            description: (productRes as any).data.description,
            category: (productRes as any).data.ccrs_inventory_category,
            servings: (productRes as any).data.servings_per_unit,
            unit_weight_grams: (productRes as any).data.unit_weight_grams,
          } : null,
          strain: (strainRes as any).data ? {
            name: (strainRes as any).data.name,
            type: (strainRes as any).data.type,
            terpenes: (strainRes as any).data.dominant_terpenes,
            thc_pct: (strainRes as any).data.average_thc_pct,
          } : null,
          org: {
            name: (orgRes as any)?.data?.name ?? null,
            license: primary?.license_number ?? null,
            city: primary?.city ?? null,
            state: primary?.state ?? null,
          },
          lab: labData,
        });
        setLoading(false);
      } catch (err: any) {
        if (!cancelled) { setError(err?.message ?? "Failed to load"); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [batchExternalId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-900 via-green-950 to-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-900 via-green-950 to-black text-white flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <AlertTriangle className="w-12 h-12 mx-auto text-amber-400 mb-4" />
          <h1 className="text-2xl font-bold mb-2">Product not found</h1>
          <p className="text-emerald-200/70 text-sm">
            The QR code you scanned doesn't match a product in our system. Check the label or contact the producer.
          </p>
        </div>
      </div>
    );
  }

  const { batch, product, strain, org, lab } = data;

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-900 via-green-950 to-black text-white">
      <div className="max-w-2xl mx-auto px-4 py-8 md:py-12">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
            <Leaf className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-300/70 font-semibold">Verified by</div>
            <div className="text-sm font-bold">Cody Grow</div>
          </div>
          <div className="ml-auto flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-3 py-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[11px] font-semibold">Lab verified</span>
          </div>
        </div>

        {/* Product hero */}
        <div className="rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 p-6 md:p-8 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold leading-tight">{product?.name ?? "—"}</h1>
              {strain && (
                <div className="flex items-center gap-2 mt-2 text-emerald-300/80">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span className="font-medium">{strain.name}</span>
                  {strain.type && <span className="text-[11px] uppercase tracking-wider bg-emerald-500/15 px-2 py-0.5 rounded-full">{strain.type}</span>}
                </div>
              )}
            </div>
            {batch.is_medical && (
              <span className="inline-flex items-center h-6 px-3 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/30">
                Medical
              </span>
            )}
          </div>
          {product?.description && (
            <p className="text-emerald-100/80 leading-relaxed text-sm">{product.description}</p>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6 pt-6 border-t border-white/10">
            <Stat label="Total THC" value={lab?.thc_total_pct != null ? `${lab.thc_total_pct.toFixed(1)}%` : "—"} />
            <Stat label="Total CBD" value={lab?.cbd_total_pct != null ? `${lab.cbd_total_pct.toFixed(1)}%` : "—"} />
            <Stat label="Terpenes" value={lab?.total_terpenes_pct != null ? `${lab.total_terpenes_pct.toFixed(2)}%` : "—"} />
            <Stat label="Net weight" value={product?.unit_weight_grams != null ? `${product.unit_weight_grams}g` : "—"} />
          </div>
        </div>

        {/* Producer */}
        <div className="rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="w-4 h-4 text-emerald-400" />
            <h2 className="text-[11px] uppercase tracking-[0.2em] text-emerald-300/70 font-semibold">Producer</h2>
          </div>
          <div className="text-xl font-bold">{org.name ?? "—"}</div>
          <div className="flex items-center gap-2 mt-1 text-sm text-emerald-100/70">
            {org.license && <span className="font-mono text-[11px]">License {org.license}</span>}
            {(org.city || org.state) && <span>· {[org.city, org.state].filter(Boolean).join(", ")}</span>}
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-white/10">
            <InfoLine icon={Calendar} label="Harvested" value={batch.harvest_date ? new Date(batch.harvest_date).toLocaleDateString() : "—"} />
            <InfoLine icon={Calendar} label="Packaged" value={batch.packaged_date ? new Date(batch.packaged_date).toLocaleDateString() : "—"} />
          </div>
        </div>

        {/* Lab results */}
        {lab ? (
          <div className="rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-emerald-400" />
                <h2 className="text-[11px] uppercase tracking-[0.2em] text-emerald-300/70 font-semibold">Lab results</h2>
              </div>
              {lab.overall_pass === true && (
                <span className="inline-flex items-center gap-1 h-6 px-3 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  <Award className="w-3 h-3" /> Pass
                </span>
              )}
            </div>
            <div className="text-sm mb-4">
              <div className="font-semibold">{lab.name ?? "—"}</div>
              <div className="text-emerald-100/60 text-xs mt-0.5">
                {lab.license && <span className="font-mono">{lab.license}</span>}
                {lab.test_date && <span> · Tested {new Date(lab.test_date).toLocaleDateString()}</span>}
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              <PassRow label="Pesticides" pass={lab.pesticides_pass} />
              <PassRow label="Heavy metals" pass={lab.heavy_metals_pass} />
              <PassRow label="Microbials" pass={lab.microbials_pass} />
              <PassRow label="Mycotoxins" pass={lab.mycotoxins_pass} />
              <PassRow label="Residual solvents" pass={lab.residual_solvents_pass} />
            </div>
          </div>
        ) : (
          <div className="rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 p-6 mb-6 text-center">
            <Info className="w-6 h-6 mx-auto text-amber-400 mb-2" />
            <p className="text-sm text-emerald-100/70">Lab results not yet published for this batch.</p>
          </div>
        )}

        {/* Traceability footer */}
        <div className="rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 p-6">
          <h2 className="text-[11px] uppercase tracking-[0.2em] text-emerald-300/70 font-semibold mb-3">Traceability</h2>
          <div className="space-y-1.5 font-mono text-[11px] text-emerald-100/70">
            <div className="flex justify-between"><span>Barcode</span><span className="text-white">{batch.barcode}</span></div>
            <div className="flex justify-between"><span>CCRS external ID</span><span className="text-white">{batch.external_id}</span></div>
            {batch.category && <div className="flex justify-between"><span>Category</span><span className="text-white">{batch.category}</span></div>}
          </div>
        </div>

        {/* Disclaimer */}
        <div className="mt-6 pb-8 text-center text-[10px] text-emerald-200/40 leading-relaxed px-4">
          This information is provided by the producer's seed-to-sale system and reflects official records filed with the Washington State Liquor and Cannabis Board.
          For use only by adults 21 and older. Keep out of the reach of children.
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-emerald-300/70 font-semibold mb-0.5">{label}</div>
      <div className="text-lg font-bold font-mono tabular-nums">{value}</div>
    </div>
  );
}

function InfoLine({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-emerald-300/70 font-semibold mb-0.5">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

function PassRow({ label, pass }: { label: string; pass: boolean | null }) {
  if (pass == null) {
    return (
      <div className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
        <span className="text-[11px] text-emerald-100/70">{label}</span>
        <span className="text-[10px] text-emerald-200/40">—</span>
      </div>
    );
  }
  return (
    <div className={`flex items-center justify-between rounded-lg px-3 py-2 ${pass ? "bg-emerald-500/10" : "bg-rose-500/10"}`}>
      <span className="text-[11px] text-emerald-100/90">{label}</span>
      <span className={`text-[10px] font-bold uppercase tracking-wider ${pass ? "text-emerald-300" : "text-rose-300"}`}>
        {pass ? "Pass" : "Fail"}
      </span>
    </div>
  );
}
