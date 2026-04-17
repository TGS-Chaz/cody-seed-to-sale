import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Upload, Dna, MapPin, Package, Leaf, Barcode, Building2, ShieldCheck, Download, ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/shared/PageHeader";
import CSVImporter, { ImporterColumn } from "@/components/shared/CSVImporter";
import { supabase } from "@/lib/supabase";
import { useOrg } from "@/lib/org";
import { generateExternalId } from "@/lib/ccrs-id";
import { cn } from "@/lib/utils";

type ImportKind = "strain" | "area" | "product" | "plant" | "inventory" | "account" | "ccrs" | "wcia";

interface ImportCard {
  kind: ImportKind;
  icon: any;
  color: string;
  title: string;
  description: string;
  columns: ImporterColumn[];
}

const IMPORT_CARDS: ImportCard[] = [
  {
    kind: "strain", icon: Dna, color: "bg-purple-500/10 text-purple-500",
    title: "Import Strains", description: "Names, types, lineage",
    columns: [
      { field: "name", label: "Name", required: true },
      { field: "type", label: "Type", hint: "Indica / Sativa / Hybrid / CBD / High CBD" },
      { field: "external_id", label: "External ID", hint: "Auto-gen if missing" },
    ],
  },
  {
    kind: "area", icon: MapPin, color: "bg-emerald-500/10 text-emerald-500",
    title: "Import Areas", description: "Rooms, zones, benches",
    columns: [
      { field: "name", label: "Name", required: true },
      { field: "is_quarantine", label: "Is Quarantine", hint: "TRUE / FALSE" },
      { field: "external_id", label: "External ID" },
    ],
  },
  {
    kind: "product", icon: Package, color: "bg-teal-500/10 text-teal-500",
    title: "Import Products", description: "Flower, concentrates, edibles",
    columns: [
      { field: "name", label: "Name", required: true },
      { field: "ccrs_inventory_category", label: "CCRS Category", hint: "PropagationMaterial / HarvestedMaterial / IntermediateProduct / EndProduct" },
      { field: "ccrs_inventory_type", label: "CCRS Type" },
      { field: "description", label: "Description" },
      { field: "unit_weight_grams", label: "Unit Weight (g)" },
      { field: "external_id", label: "External ID" },
    ],
  },
  {
    kind: "plant", icon: Leaf, color: "bg-green-500/10 text-green-500",
    title: "Import Plants", description: "Individual plants with identifiers",
    columns: [
      { field: "plant_identifier", label: "Plant ID", required: true },
      { field: "strain_external_id", label: "Strain External ID" },
      { field: "area_external_id", label: "Area External ID" },
      { field: "phase", label: "Phase", hint: "immature / vegetative / flowering / ready_for_harvest / harvested / destroyed" },
      { field: "ccrs_plant_state", label: "CCRS State" },
      { field: "source_type", label: "Source", hint: "seed / clone / tissue_culture" },
      { field: "harvest_date", label: "Harvest Date" },
      { field: "external_id", label: "External ID" },
    ],
  },
  {
    kind: "inventory", icon: Barcode, color: "bg-cyan-500/10 text-cyan-500",
    title: "Import Inventory", description: "Existing batches",
    columns: [
      { field: "barcode", label: "Barcode", required: true },
      { field: "product_external_id", label: "Product External ID" },
      { field: "strain_external_id", label: "Strain External ID" },
      { field: "area_external_id", label: "Area External ID" },
      { field: "initial_quantity", label: "Initial Qty", required: true },
      { field: "current_quantity", label: "On-Hand Qty", required: true },
      { field: "total_cost", label: "Total Cost" },
      { field: "is_medical", label: "Is Medical" },
      { field: "external_id", label: "External ID" },
    ],
  },
  {
    kind: "account", icon: Building2, color: "bg-blue-500/10 text-blue-500",
    title: "Import Accounts", description: "Wholesale customers",
    columns: [
      { field: "company_name", label: "Company Name", required: true },
      { field: "license_number", label: "License #" },
      { field: "license_type", label: "License Type" },
      { field: "primary_contact_name", label: "Primary Contact" },
      { field: "primary_contact_email", label: "Email" },
      { field: "primary_contact_phone", label: "Phone" },
      { field: "city", label: "City" },
      { field: "state", label: "State" },
    ],
  },
];

export default function ImportPage() {
  const navigate = useNavigate();
  const { orgId } = useOrg();
  const [active, setActive] = useState<ImportKind | null>(null);

  const card = active ? IMPORT_CARDS.find((c) => c.kind === active) : null;

  const importRow = async (kind: ImportKind, row: Record<string, any>): Promise<{ success: boolean; error?: string }> => {
    if (!orgId) return { success: false, error: "No active org" };
    try {
      switch (kind) {
        case "strain":
          await supabase.from("grow_strains").insert({
            org_id: orgId,
            name: row.name,
            type: row.type ?? "Hybrid",
            external_id: row.external_id?.trim() || generateExternalId(),
          }).throwOnError();
          return { success: true };
        case "area":
          await supabase.from("grow_areas").insert({
            org_id: orgId,
            name: row.name,
            is_quarantine: String(row.is_quarantine ?? "").toLowerCase() === "true",
            external_id: row.external_id?.trim() || generateExternalId(),
            is_active: true,
          }).throwOnError();
          return { success: true };
        case "product":
          await supabase.from("grow_products").insert({
            org_id: orgId,
            name: row.name,
            category: row.ccrs_inventory_category ?? "EndProduct",
            ccrs_inventory_category: row.ccrs_inventory_category,
            ccrs_inventory_type: row.ccrs_inventory_type,
            description: row.description,
            unit_weight_grams: row.unit_weight_grams ? Number(row.unit_weight_grams) : null,
            external_id: row.external_id?.trim() || generateExternalId(),
            is_active: true,
          }).throwOnError();
          return { success: true };
        case "plant": {
          const strain = row.strain_external_id ? await supabase.from("grow_strains").select("id").eq("org_id", orgId).eq("external_id", row.strain_external_id).maybeSingle() : { data: null };
          const area = row.area_external_id ? await supabase.from("grow_areas").select("id").eq("org_id", orgId).eq("external_id", row.area_external_id).maybeSingle() : { data: null };
          await supabase.from("grow_plants").insert({
            org_id: orgId,
            plant_identifier: row.plant_identifier,
            strain_id: (strain as any).data?.id ?? null,
            area_id: (area as any).data?.id ?? null,
            phase: row.phase ?? "vegetative",
            ccrs_plant_state: row.ccrs_plant_state ?? "Growing",
            source_type: row.source_type ?? "clone",
            harvest_date: row.harvest_date || null,
            external_id: row.external_id?.trim() || generateExternalId(),
          }).throwOnError();
          return { success: true };
        }
        case "inventory": {
          const product = row.product_external_id ? await supabase.from("grow_products").select("id").eq("org_id", orgId).eq("external_id", row.product_external_id).maybeSingle() : { data: null };
          const strain = row.strain_external_id ? await supabase.from("grow_strains").select("id").eq("org_id", orgId).eq("external_id", row.strain_external_id).maybeSingle() : { data: null };
          const area = row.area_external_id ? await supabase.from("grow_areas").select("id").eq("org_id", orgId).eq("external_id", row.area_external_id).maybeSingle() : { data: null };
          const init = Number(row.initial_quantity);
          const curr = Number(row.current_quantity);
          await supabase.from("grow_batches").insert({
            org_id: orgId,
            barcode: row.barcode,
            product_id: (product as any).data?.id ?? null,
            strain_id: (strain as any).data?.id ?? null,
            area_id: (area as any).data?.id ?? null,
            initial_quantity: init,
            current_quantity: curr,
            initial_weight_grams: init,
            current_weight_grams: curr,
            unit_cost: row.total_cost && init > 0 ? Number(row.total_cost) / init : null,
            is_medical: String(row.is_medical ?? "").toLowerCase() === "true",
            source_type: "manual",
            external_id: row.external_id?.trim() || generateExternalId(),
          }).throwOnError();
          return { success: true };
        }
        case "account":
          await supabase.from("grow_accounts").insert({
            org_id: orgId,
            company_name: row.company_name,
            license_number: row.license_number ?? null,
            license_type: row.license_type ?? null,
            primary_contact_name: row.primary_contact_name ?? null,
            primary_contact_email: row.primary_contact_email ?? null,
            primary_contact_phone: row.primary_contact_phone ?? null,
            city: row.city ?? null,
            state: row.state ?? null,
            is_active: true,
          }).throwOnError();
          return { success: true };
      }
      return { success: false, error: "Unknown entity" };
    } catch (err: any) {
      return { success: false, error: err?.message ?? "Insert failed" };
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-[1400px] mx-auto">
      <PageHeader
        title="Import Data"
        description="Bring in data from Cultivera, CCRS exports, or spreadsheets"
        breadcrumbs={[{ label: "Settings", to: "/settings" }, { label: "Import Data" }]}
      />

      {active ? (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => setActive(null)} className="gap-1.5"><ArrowLeft className="w-3.5 h-3.5" /> Back</Button>
            {card && (
              <div className="flex items-center gap-2">
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", card.color)}>
                  <card.icon className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[14px] font-semibold">{card.title}</div>
                  <div className="text-[11px] text-muted-foreground">{card.description}</div>
                </div>
              </div>
            )}
          </div>
          {card && (
            <CSVImporter
              entityKey={card.kind}
              columns={card.columns}
              onImport={(row) => importRow(card.kind, row)}
              onDone={(s) => toast.success(`${s.imported} imported · ${s.failed} failed`)}
            />
          )}
        </div>
      ) : (
        <>
          <h3 className="text-[13px] font-semibold mb-3">Spreadsheet imports</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
            {IMPORT_CARDS.map((c) => (
              <button key={c.kind} onClick={() => setActive(c.kind)} className="text-left rounded-xl border border-border bg-card p-4 hover:border-primary/40 transition-colors flex items-start gap-3">
                <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", c.color)}>
                  <c.icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-[13px] font-semibold">{c.title}</h4>
                  <p className="text-[11px] text-muted-foreground mt-1">{c.description}</p>
                </div>
              </button>
            ))}
          </div>

          <h3 className="text-[13px] font-semibold mb-3">Migration helpers</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <button onClick={() => setActive("strain")} className="text-left rounded-xl border border-border bg-card p-4 hover:border-primary/40 transition-colors flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-[13px] font-semibold">Import from CCRS</h4>
                <p className="text-[11px] text-muted-foreground mt-1">Upload a CCRS-format CSV — Strain/Area/Product/Plant/Inventory. The parser auto-detects the 3-row header block and maps fields.</p>
              </div>
            </button>
            <button onClick={() => navigate("/sales/transfers")} className="text-left rounded-xl border border-border bg-card p-4 hover:border-primary/40 transition-colors flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 text-purple-500 flex items-center justify-center shrink-0">
                <Download className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-[13px] font-semibold">Import from WCIA JSON</h4>
                <p className="text-[11px] text-muted-foreground mt-1">Paste WCIA JSON to create an inbound transfer. Goes to /sales/transfers.</p>
              </div>
            </button>
          </div>
        </>
      )}
      <span className="hidden"><Upload /></span>
    </div>
  );
}
