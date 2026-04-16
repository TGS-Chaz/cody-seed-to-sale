import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpCircle, Loader2, Info, Sparkles, Users, CheckCircle2,
  AlertTriangle, Tag,
} from "lucide-react";
import { toast } from "sonner";
import ScrollableModal, { ModalHeader } from "@/components/ui/scrollable-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { useOrg } from "@/lib/org";
import { Source, usePromoteSource, PromoteResult } from "@/hooks/useSources";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  source: Source;
  onSuccess?: (result: PromoteResult) => void;
}

interface AreaOption { id: string; name: string }
interface CycleOption { id: string; name: string; phase: string; start_date: string | null }

export default function PromoteToCycleModal({ open, onClose, source, onSuccess }: Props) {
  const { orgId } = useOrg();
  const promote = usePromoteSource();

  const [quantity, setQuantity] = useState<number>(1);
  const [mode, setMode] = useState<"new_cycle" | "existing_cycle">("new_cycle");
  const [cycleName, setCycleName] = useState("");
  const [targetAreaId, setTargetAreaId] = useState<string>("");
  const [targetHarvestDate, setTargetHarvestDate] = useState<string>("");
  const [existingCycleId, setExistingCycleId] = useState<string>("");
  const [plantMode, setPlantMode] = useState<"individual" | "bulk">("individual");
  const [saving, setSaving] = useState(false);

  const [areas, setAreas] = useState<AreaOption[]>([]);
  const [existingCycles, setExistingCycles] = useState<CycleOption[]>([]);
  const [strainName, setStrainName] = useState<string>("");
  const [strainAvgFlowerDays, setStrainAvgFlowerDays] = useState<number | null>(null);

  const remaining = source.current_quantity ?? 0;

  // Load form dependencies when modal opens
  useEffect(() => {
    if (!open || !orgId) return;
    (async () => {
      const [aRes, cRes, sRes] = await Promise.all([
        supabase.from("grow_areas").select("id, name").eq("org_id", orgId).eq("is_active", true).order("name"),
        source.strain_id
          ? supabase.from("grow_cycles").select("id, name, phase, start_date").eq("org_id", orgId).eq("strain_id", source.strain_id).not("phase", "in", "(completed,cancelled)").order("start_date", { ascending: false })
          : Promise.resolve({ data: [] }),
        source.strain_id
          ? supabase.from("grow_strains").select("name, average_flower_days").eq("id", source.strain_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      setAreas((aRes.data ?? []) as AreaOption[]);
      setExistingCycles((cRes.data ?? []) as CycleOption[]);
      const strain: any = (sRes as any).data ?? null;
      setStrainName(strain?.name ?? "");
      setStrainAvgFlowerDays(strain?.average_flower_days ?? null);
    })();
  }, [open, orgId, source.strain_id]);

  // Reset form when the modal opens
  useEffect(() => {
    if (!open) return;
    setQuantity(Math.min(remaining, remaining));
    setMode("new_cycle");
    setExistingCycleId("");
    setPlantMode("individual");
    const today = new Date().toISOString().slice(0, 10);
    const suggestion = strainName && source.area_id
      ? `${strainName} - ${new Date().toISOString().slice(0, 10)}`
      : "";
    setCycleName(suggestion);
    setTargetAreaId(source.area_id ?? areas[0]?.id ?? "");
    // Auto-compute target harvest date = today + avg flower days (fallback 65d)
    const flowerDays = strainAvgFlowerDays ?? 65;
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + flowerDays);
    setTargetHarvestDate(d.toISOString().slice(0, 10));
    void today;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, strainName, strainAvgFlowerDays, remaining, source.area_id, areas.length]);

  const cycleNameSuggestion = useMemo(() => {
    if (strainName) return `${strainName} - ${new Date().toISOString().slice(0, 10)}`;
    return "";
  }, [strainName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (quantity <= 0 || quantity > remaining) {
      toast.error(`Quantity must be between 1 and ${remaining}`);
      return;
    }
    if (mode === "new_cycle" && !targetAreaId) {
      toast.error("Pick a target area");
      return;
    }
    if (mode === "existing_cycle" && !existingCycleId) {
      toast.error("Pick a cycle");
      return;
    }

    setSaving(true);
    try {
      const result = await promote({
        source_id: source.id,
        quantity,
        mode,
        cycle_name: mode === "new_cycle" ? (cycleName.trim() || cycleNameSuggestion) : undefined,
        target_area_id: mode === "new_cycle" ? targetAreaId : undefined,
        target_harvest_date: mode === "new_cycle" ? (targetHarvestDate || null) : null,
        existing_cycle_id: mode === "existing_cycle" ? existingCycleId : undefined,
        plant_mode: plantMode,
      });
      toast.success(
        `${result.plants_created || quantity} plants promoted to ${result.cycle_name}`,
        {
          description: result.board_card_created ? "Added to Grow Board" : undefined,
          action: { label: "Go to Grow Board →", onClick: () => window.location.assign("/cultivation/board") },
        },
      );
      onSuccess?.(result);
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Promotion failed");
    } finally {
      setSaving(false);
    }
  };

  const sourceTypeLabel = source.source_type === "seed" ? "seeds" : source.source_type === "clone" ? "clones" : "tissue samples";

  return (
    <ScrollableModal
      open={open}
      onClose={onClose}
      size="md"
      onSubmit={handleSubmit}
      header={
        <ModalHeader
          icon={<ArrowUpCircle className="w-4 h-4 text-primary" />}
          title="Promote to Grow Cycle"
          subtitle={`${source.strain?.name ?? "Source"} — ${remaining} ${sourceTypeLabel} available`}
        />
      }
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving || remaining === 0} className="min-w-[140px] gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowUpCircle className="w-3.5 h-3.5" />}
            Promote
          </Button>
        </>
      }
    >
      <div className="p-6 space-y-6">
        {/* Step 1: Quantity */}
        <StepCard step={1} title={`How many ${sourceTypeLabel} are you promoting?`}>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Input
                type="number" min="1" max={remaining}
                value={quantity}
                onChange={(e) => setQuantity(Math.min(remaining, Math.max(1, Number(e.target.value) || 0)))}
                className="font-mono text-lg w-28"
                autoFocus
              />
              <div className="flex-1 text-[13px] text-muted-foreground">
                <span className="font-semibold text-foreground">{quantity}</span> of <span className="font-semibold">{remaining}</span> will move to a new cycle
              </div>
              <div className="flex gap-1">
                <Button type="button" size="sm" variant="outline" onClick={() => setQuantity(Math.max(1, Math.floor(remaining / 2)))}>Half</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setQuantity(remaining)}>All</Button>
              </div>
            </div>
            {/* Progress visual */}
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-primary/70 transition-all"
                style={{ width: `${remaining > 0 ? (quantity / remaining) * 100 : 0}%` }}
              />
            </div>
          </div>
        </StepCard>

        {/* Step 2: Cycle assignment */}
        <StepCard step={2} title="Cycle assignment">
          <div className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5 mb-3">
            <button
              type="button"
              onClick={() => setMode("new_cycle")}
              className={cn("px-3 h-8 text-[12px] font-medium rounded-md", mode === "new_cycle" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              Create New Cycle
            </button>
            <button
              type="button"
              onClick={() => setMode("existing_cycle")}
              disabled={existingCycles.length === 0}
              className={cn(
                "px-3 h-8 text-[12px] font-medium rounded-md",
                mode === "existing_cycle" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                existingCycles.length === 0 && "opacity-50 cursor-not-allowed",
              )}
            >
              Add to Existing
            </button>
          </div>

          {mode === "new_cycle" ? (
            <div className="space-y-3">
              <Field label="Cycle Name" helper={cycleNameSuggestion ? `Suggestion: ${cycleNameSuggestion}` : undefined}>
                <Input value={cycleName} onChange={(e) => setCycleName(e.target.value)} placeholder={cycleNameSuggestion || "e.g. Blue Dream - Veg Room A"} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Target Area" required>
                  {areas.length === 0 ? (
                    <div className="h-10 px-3 flex items-center text-[12px] text-muted-foreground border border-dashed border-border rounded-lg italic">
                      Add an area first
                    </div>
                  ) : (
                    <select
                      value={targetAreaId}
                      onChange={(e) => setTargetAreaId(e.target.value)}
                      className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="">— Select area —</option>
                      {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  )}
                </Field>
                <Field label="Target Harvest Date" helper={strainAvgFlowerDays ? `Auto-filled from ${strainAvgFlowerDays}d avg flower` : undefined}>
                  <Input type="date" value={targetHarvestDate} onChange={(e) => setTargetHarvestDate(e.target.value)} />
                </Field>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2 text-[11px] text-foreground">
                <Info className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                Plants will start at <span className="font-mono font-semibold mx-0.5">vegetative</span> phase. CCRS Growth Stage = <span className="font-mono font-semibold">Vegetative</span>.
              </div>
            </div>
          ) : (
            <Field label="Existing Cycle">
              <select
                value={existingCycleId}
                onChange={(e) => setExistingCycleId(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">— Select cycle —</option>
                {existingCycles.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} · {c.phase}{c.start_date ? ` (started ${new Date(c.start_date).toLocaleDateString()})` : ""}</option>
                ))}
              </select>
            </Field>
          )}
        </StepCard>

        {/* Step 3: Plant creation */}
        <StepCard step={3} title="Plant creation">
          <div className="space-y-2">
            <ModeOption
              icon={Users}
              title="Individual plant records"
              recommended
              description="One grow_plants row per unit, each with a unique identifier. Required for CCRS plant-level compliance and label printing."
              selected={plantMode === "individual"}
              onClick={() => setPlantMode("individual")}
            />
            <ModeOption
              icon={Tag}
              title="Bulk batch"
              description="Single batch record with quantity. Simpler for large seed batches that you'll split later."
              selected={plantMode === "bulk"}
              onClick={() => setPlantMode("bulk")}
            />
          </div>

          {plantMode === "individual" && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-muted/30 border border-border p-3 text-[11px] text-muted-foreground">
              <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" />
              <div>
                {quantity} plant{quantity === 1 ? "" : "s"} will be created with sequential identifiers
                (e.g. <span className="font-mono text-foreground">{strainAbbrevLocal(strainName)}-001</span>).
                Plant tag printing is stubbed — will wire up to your Zebra printer once the label pipeline ships.
              </div>
            </div>
          )}
        </StepCard>

        {remaining === 0 && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-[12px] text-foreground flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
            This source is depleted. There's nothing left to promote.
          </div>
        )}
      </div>
    </ScrollableModal>
  );
}

function strainAbbrevLocal(name: string): string {
  if (!name) return "PLT";
  const parts = name.replace(/[^A-Za-z\s]/g, "").trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1].slice(0, 2)).toUpperCase();
  return (parts[0] ?? "PLT").slice(0, 3).toUpperCase();
}

function StepCard({ step, title, children }: { step: number; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/15 text-primary text-[11px] font-semibold">
          {step}
        </span>
        <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function ModeOption({
  icon: Icon, title, description, recommended, selected, onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  recommended?: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
        selected ? "bg-primary/5 border-primary/40 ring-1 ring-primary/20" : "bg-background border-border hover:bg-accent/30",
      )}
    >
      <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0", selected ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-foreground">{title}</span>
          {recommended && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 uppercase tracking-wider">
              Recommended
            </span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>
      </div>
      {selected && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
    </button>
  );
}

function Field({ label, required, helper, children }: { label: string; required?: boolean; helper?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
      {helper && <p className="text-[11px] text-muted-foreground/70">{helper}</p>}
    </div>
  );
}
