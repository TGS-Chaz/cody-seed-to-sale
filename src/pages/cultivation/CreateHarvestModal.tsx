import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronUp, Loader2, Scissors, Info, Send, Gauge } from "lucide-react";
import { toast } from "sonner";
import ScrollableModal, { ModalHeader } from "@/components/ui/scrollable-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { useOrg } from "@/lib/org";
import { HARVEST_TYPES, HARVEST_TYPE_LABELS, HarvestType } from "@/lib/schema-enums";
import { Harvest, HarvestInput, useHarvests } from "@/hooks/useHarvests";
import { generateExternalId } from "@/lib/ccrs-id";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess?: (harvest: Harvest) => void;
  /** Pre-select a cycle when opened from the cycle detail page. */
  initialCycleId?: string;
}

interface CycleOption {
  id: string;
  name: string;
  strain_id: string | null;
  area_id: string | null;
  phase: string | null;
  plant_count: number | null;
  /** Joined for display */
  strain?: { id: string; name: string } | null;
}
interface PlantOption { id: string; plant_identifier: string | null; ccrs_plant_state: string | null }
interface AreaOption { id: string; name: string; canopy_type: string | null }

const TYPE_HELP_TEXT: Record<HarvestType, string> = {
  full: "Full harvest — the entire cycle is harvested. Plants flip to 'Harvested' and the cycle completes.",
  partial: "Partial harvest — a subset of plants is harvested. Selected plants flip to 'PartiallyHarvested'; the rest stay flowering.",
  manicure: "Manicure — buds removed from plants that keep growing. Plants stay in their current phase.",
};

export default function CreateHarvestModal({ open, onClose, onSuccess, initialCycleId }: Props) {
  const { orgId } = useOrg();
  const { createHarvest } = useHarvests({ status: "active" });

  const [cycleId, setCycleId] = useState<string>("");
  const [name, setName] = useState("");
  const [harvestDate, setHarvestDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [harvestType, setHarvestType] = useState<HarvestType>("full");
  const [selectedPlants, setSelectedPlants] = useState<string[]>([]);
  const [wetWeight, setWetWeight] = useState<string>("");
  const [wasteWeight, setWasteWeight] = useState<string>("");
  const [dryingAreaId, setDryingAreaId] = useState<string>("");
  const [externalId, setExternalId] = useState<string>("");
  const [flowerLotId, setFlowerLotId] = useState<string>("");
  const [otherLotId, setOtherLotId] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);

  const [cycles, setCycles] = useState<CycleOption[]>([]);
  const [areas, setAreas] = useState<AreaOption[]>([]);
  const [plants, setPlants] = useState<PlantOption[]>([]);

  useEffect(() => {
    if (!open || !orgId) return;
    (async () => {
      const [cRes, aRes] = await Promise.all([
        supabase
          .from("grow_cycles")
          .select("id, name, strain_id, area_id, phase, plant_count")
          .eq("org_id", orgId)
          .in("phase", ["vegetative", "flowering", "ready_for_harvest", "harvesting"])
          .order("start_date", { ascending: false }),
        supabase
          .from("grow_areas")
          .select("id, name, canopy_type")
          .eq("org_id", orgId)
          .eq("is_active", true)
          .order("name"),
      ]);
      const cyclesData = (cRes.data ?? []) as any[];
      const strainIds = Array.from(new Set(cyclesData.map((c) => c.strain_id).filter(Boolean)));
      const strainById = new Map<string, any>();
      if (strainIds.length > 0) {
        const { data: strains } = await supabase.from("grow_strains").select("id, name").in("id", strainIds);
        (strains ?? []).forEach((s: any) => strainById.set(s.id, s));
      }
      setCycles(cyclesData.map((c) => ({ ...c, strain: c.strain_id ? strainById.get(c.strain_id) ?? null : null })) as CycleOption[]);
      setAreas((aRes.data ?? []) as AreaOption[]);
    })();
  }, [open, orgId]);

  // Hydrate on open + reset when it closes
  useEffect(() => {
    if (!open) return;
    setCycleId(initialCycleId ?? "");
    setHarvestType("full");
    setSelectedPlants([]);
    setWetWeight("");
    setWasteWeight("");
    setDryingAreaId("");
    setExternalId(generateExternalId());
    setFlowerLotId("");
    setOtherLotId("");
    setNotes("");
    setHarvestDate(new Date().toISOString().slice(0, 10));
    setShowAdvanced(false);
  }, [open, initialCycleId]);

  // When user picks a cycle, auto-fill name + default drying area + load plants
  const selectedCycle = useMemo(() => cycles.find((c) => c.id === cycleId) ?? null, [cycles, cycleId]);

  useEffect(() => {
    if (!selectedCycle) { setPlants([]); return; }
    // Auto-suggest name
    const strainName = selectedCycle.strain?.name ?? "Harvest";
    const today = harvestDate || new Date().toISOString().slice(0, 10);
    setName(`${strainName} Harvest - ${today}`);
    // Default drying area — first drying-type area, or cycle's current area
    const dryingArea = areas.find((a) => a.canopy_type === "drying");
    setDryingAreaId(dryingArea?.id ?? selectedCycle.area_id ?? "");
    // Load plants for this cycle
    (async () => {
      const { data: cyclePlants } = await supabase
        .from("grow_plants")
        .select("id, plant_identifier, ccrs_plant_state")
        .eq("grow_cycle_id", selectedCycle.id)
        .not("phase", "in", "(destroyed,harvested)")
        .order("plant_identifier", { nullsFirst: false });
      setPlants((cyclePlants ?? []) as PlantOption[]);
    })();
  }, [selectedCycle, harvestDate, areas]);

  // When harvest type is 'full', auto-select all plants; when switching to
  // partial/manicure, clear for user to pick.
  useEffect(() => {
    if (harvestType === "full") {
      setSelectedPlants(plants.map((p) => p.id));
    } else {
      setSelectedPlants([]);
    }
  }, [harvestType, plants]);

  const togglePlant = (id: string) => {
    setSelectedPlants((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cycleId) { toast.error("Pick a cycle"); return; }
    if (!name.trim()) { toast.error("Name is required"); return; }
    if (harvestType !== "full" && selectedPlants.length === 0) {
      toast.error(`Pick at least one plant for a ${harvestType} harvest`);
      return;
    }
    setSaving(true);
    try {
      const input: HarvestInput = {
        name: name.trim(),
        grow_cycle_id: cycleId,
        harvest_type: harvestType,
        harvest_date: harvestDate,
        wet_weight_grams: wetWeight ? Number(wetWeight) : null,
        waste_weight_grams: wasteWeight ? Number(wasteWeight) : null,
        area_id: dryingAreaId || null,
        flower_lot_external_id: flowerLotId.trim() || null,
        other_material_lot_external_id: otherLotId.trim() || null,
        notes: notes.trim() || null,
        plant_ids: harvestType === "full" ? undefined : selectedPlants,
      };
      const harvest = await createHarvest(input);
      const verb = harvestType === "full" ? "created" : `${harvestType} harvest recorded`;
      toast.success(`Harvest ${verb}`, {
        description: wetWeight ? undefined : "Record wet weight next from the detail page",
      });
      onSuccess?.(harvest);
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Harvest failed");
    } finally {
      setSaving(false);
    }
  };

  const plantCount = harvestType === "full" ? plants.length : selectedPlants.length;

  return (
    <ScrollableModal
      open={open}
      onClose={onClose}
      size="md"
      onSubmit={handleSubmit}
      header={
        <ModalHeader
          icon={<Scissors className="w-4 h-4 text-orange-500" />}
          title="Create harvest"
          subtitle="Full, partial, or manicure — determines how plant state changes"
        />
      }
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving} className="min-w-[120px] gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Scissors className="w-3.5 h-3.5" />}
            Create Harvest
          </Button>
        </>
      }
    >
      <div className="p-6 space-y-4">
        <Field label="Cycle" required>
          {cycles.length === 0 ? (
            <div className="h-10 px-3 flex items-center text-[12px] text-muted-foreground border border-dashed border-border rounded-lg">
              No active cycles — create one first
            </div>
          ) : (
            <select
              value={cycleId}
              onChange={(e) => setCycleId(e.target.value)}
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">— Select cycle —</option>
              {cycles.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.strain?.name ?? "—"} · {c.phase}</option>)}
            </select>
          )}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Harvest Name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Blue Dream Harvest - 2026-04-16" />
          </Field>
          <Field label="Harvest Date" required>
            <Input type="date" value={harvestDate} onChange={(e) => setHarvestDate(e.target.value)} />
          </Field>
        </div>

        <div className="space-y-1.5">
          <label className="block text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Harvest Type</label>
          <div className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5 w-full">
            {HARVEST_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setHarvestType(t)}
                className={cn(
                  "flex-1 h-9 text-[12px] font-medium rounded-md transition-colors",
                  harvestType === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {HARVEST_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
          <div className="flex items-start gap-2 rounded-lg bg-muted/30 border border-border p-3 text-[11px] text-foreground">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" />
            <span>{TYPE_HELP_TEXT[harvestType]}</span>
          </div>
        </div>

        {selectedCycle && harvestType !== "full" && (
          <div className="space-y-2">
            <label className="block text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
              Plants to include <span className="text-destructive">*</span>
              <span className="normal-case text-muted-foreground/70 ml-2">({selectedPlants.length} of {plants.length} selected)</span>
            </label>
            {plants.length === 0 ? (
              <div className="text-[12px] text-muted-foreground italic">No harvestable plants in this cycle.</div>
            ) : (
              <>
                <div className="flex items-center gap-2 text-[11px]">
                  <button type="button" onClick={() => setSelectedPlants(plants.map((p) => p.id))} className="text-primary hover:underline">Select all</button>
                  <span className="text-muted-foreground/50">·</span>
                  <button type="button" onClick={() => setSelectedPlants([])} className="text-primary hover:underline">Clear</button>
                </div>
                <div className="max-h-[180px] overflow-y-auto rounded-lg border border-border divide-y divide-border">
                  {plants.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 px-3 py-2 hover:bg-accent/40 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedPlants.includes(p.id)}
                        onChange={() => togglePlant(p.id)}
                        className="w-4 h-4 rounded border-border accent-primary"
                      />
                      <span className="text-[12px] font-mono text-foreground">{p.plant_identifier ?? p.id.slice(0, 8)}</span>
                      {p.ccrs_plant_state === "PartiallyHarvested" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500 uppercase tracking-wider font-semibold ml-auto">
                          Already partial
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex items-center gap-1.5 text-[12px] font-medium text-primary hover:text-primary/80 pt-1"
        >
          {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {showAdvanced ? "Hide all fields" : "Show weights + CCRS fields"}
        </button>

        <AnimatePresence initial={false}>
          {showAdvanced && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-5 overflow-hidden"
            >
              <Section title="Weights">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Wet Weight" helper="Optional — you can record it from the detail page later">
                    <div className="relative">
                      <Input
                        type="number" step="0.1" min="0"
                        value={wetWeight}
                        onChange={(e) => setWetWeight(e.target.value)}
                        className="font-mono pr-12"
                        placeholder="0.0"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">g</span>
                    </div>
                  </Field>
                  <Field label="Waste Weight">
                    <div className="relative">
                      <Input
                        type="number" step="0.1" min="0"
                        value={wasteWeight}
                        onChange={(e) => setWasteWeight(e.target.value)}
                        className="font-mono pr-12"
                        placeholder="0.0"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">g</span>
                    </div>
                  </Field>
                </div>
                <button type="button" disabled className="inline-flex items-center gap-1.5 text-[11px] text-primary/60 cursor-not-allowed" title="Bluetooth scale integration — coming soon">
                  <Gauge className="w-3 h-3" /> Read from Scale (coming soon)
                </button>
              </Section>

              <Section title="Drying Area">
                <Field label="Where will this harvest dry?" helper="Drying-type areas are listed first">
                  <select
                    value={dryingAreaId}
                    onChange={(e) => setDryingAreaId(e.target.value)}
                    className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">— Keep in current area —</option>
                    <optgroup label="Drying areas">
                      {areas.filter((a) => a.canopy_type === "drying").map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </optgroup>
                    <optgroup label="Other areas">
                      {areas.filter((a) => a.canopy_type !== "drying").map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </optgroup>
                  </select>
                </Field>
              </Section>

              <Section title="CCRS">
                <Field label="External Identifier" helper="Auto-generated — used on Harvest.CSV submissions">
                  <Input value={externalId} onChange={(e) => setExternalId(e.target.value)} className="font-mono" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Flower Lot External ID">
                    <Input value={flowerLotId} onChange={(e) => setFlowerLotId(e.target.value)} className="font-mono" placeholder="Optional" />
                  </Field>
                  <Field label="Other Material Lot ID">
                    <Input value={otherLotId} onChange={(e) => setOtherLotId(e.target.value)} className="font-mono" placeholder="Optional" />
                  </Field>
                </div>
              </Section>

              <Field label="Notes">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Harvest conditions, trim team, observations…"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </Field>
            </motion.div>
          )}
        </AnimatePresence>

        {plantCount > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-[12px] text-foreground">
            <div className="flex items-center gap-2">
              <Send className="w-3.5 h-3.5 text-amber-500" />
              <span className="font-medium">
                This {harvestType} harvest will include <span className="font-mono font-semibold">{plantCount}</span> plant{plantCount === 1 ? "" : "s"}
              </span>
            </div>
          </div>
        )}
      </div>
    </ScrollableModal>
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
