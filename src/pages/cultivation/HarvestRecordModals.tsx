import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Gauge, Beaker, Timer, Loader2, ArrowRight, Info,
} from "lucide-react";
import { toast } from "sonner";
import ScrollableModal, { ModalHeader } from "@/components/ui/scrollable-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { useOrg } from "@/lib/org";
import {
  Harvest, useRecordWetWeight, useRecordDryWeight, useStartCure, useMarkCured,
  useHarvestPlants,
} from "@/hooks/useHarvests";
import { cn } from "@/lib/utils";

// ─── RecordWetWeightModal ────────────────────────────────────────────────────

export function RecordWetWeightModal({
  open, onClose, harvest, onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  harvest: Harvest;
  onSuccess?: () => void;
}) {
  const recordWet = useRecordWetWeight();
  const { data: harvestPlants } = useHarvestPlants(open ? harvest.id : undefined);
  const [total, setTotal] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [perPlant, setPerPlant] = useState(false);
  const [perPlantWeights, setPerPlantWeights] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTotal(harvest.wet_weight_grams != null ? String(harvest.wet_weight_grams) : "");
    setPerPlant(false);
    setPerPlantWeights({});
    setNotes("");
  }, [open, harvest.wet_weight_grams]);

  // Auto-sum per-plant weights when mode is enabled
  const computedTotal = useMemo(() => {
    if (!perPlant) return null;
    return Object.values(perPlantWeights).reduce((sum, v) => sum + (Number(v) || 0), 0);
  }, [perPlant, perPlantWeights]);

  useEffect(() => {
    if (perPlant && computedTotal != null) setTotal(String(computedTotal.toFixed(1)));
  }, [perPlant, computedTotal]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const weight = Number(total);
    if (!weight || weight <= 0) { toast.error("Enter a wet weight"); return; }
    setSaving(true);
    try {
      const perPlantArr = perPlant
        ? Object.entries(perPlantWeights)
          .filter(([, v]) => Number(v) > 0)
          .map(([plant_id, v]) => ({ plant_id, weight: Number(v) }))
        : undefined;
      await recordWet(harvest.id, weight, perPlantArr);
      toast.success(`Wet weight recorded: ${weight.toFixed(0)}g`);
      onSuccess?.();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollableModal
      open={open}
      onClose={onClose}
      size="sm"
      onSubmit={handleSubmit}
      header={<ModalHeader icon={<Gauge className="w-4 h-4 text-orange-500" />} title="Record wet weight" subtitle={harvest.name} />}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving} className="min-w-[100px]">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Record"}
          </Button>
        </>
      }
    >
      <div className="p-6 space-y-4">
        <Field label="Total wet weight" required>
          <WeightInput value={total} onChange={setTotal} disabled={perPlant} />
        </Field>
        <button type="button" disabled className="inline-flex items-center gap-1.5 text-[11px] text-primary/60 cursor-not-allowed" title="Bluetooth scale — coming soon">
          <Gauge className="w-3 h-3" /> Read from Scale
        </button>

        {harvestPlants.length > 0 && (
          <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={perPlant}
                onChange={(e) => setPerPlant(e.target.checked)}
                className="w-4 h-4 rounded border-border accent-primary"
              />
              <span className="text-[12px] font-medium text-foreground">Record per-plant weights</span>
            </label>
            <AnimatePresence initial={false}>
              {perPlant && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-1.5 overflow-hidden"
                >
                  {harvestPlants.map((hp) => (
                    <div key={hp.id} className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-muted-foreground w-20 truncate">{hp.plant?.plant_identifier ?? hp.plant_id.slice(0, 6)}</span>
                      <div className="relative flex-1">
                        <Input
                          type="number" step="0.1" min="0"
                          value={perPlantWeights[hp.plant_id] ?? ""}
                          onChange={(e) => setPerPlantWeights((prev) => ({ ...prev, [hp.plant_id]: e.target.value }))}
                          className="h-8 font-mono text-[12px] pr-8"
                          placeholder="0.0"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">g</span>
                      </div>
                    </div>
                  ))}
                  {computedTotal != null && (
                    <p className="text-[11px] text-muted-foreground pt-1">
                      Sum: <span className="font-mono font-semibold text-foreground">{computedTotal.toFixed(1)}g</span>
                    </p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        <Field label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Weighing conditions, observations…"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
        </Field>
      </div>
    </ScrollableModal>
  );
}

// ─── RecordDryWeightModal ───────────────────────────────────────────────────

export function RecordDryWeightModal({
  open, onClose, harvest, onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  harvest: Harvest;
  onSuccess?: () => void;
}) {
  const recordDry = useRecordDryWeight();
  const { data: harvestPlants } = useHarvestPlants(open ? harvest.id : undefined);
  const [dry, setDry] = useState<string>("");
  const [waste, setWaste] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [perPlant, setPerPlant] = useState(false);
  const [perPlantWeights, setPerPlantWeights] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDry(harvest.dry_weight_grams != null ? String(harvest.dry_weight_grams) : "");
    setWaste(harvest.waste_weight_grams != null ? String(harvest.waste_weight_grams) : "");
    setPerPlant(false);
    setPerPlantWeights({});
    setNotes("");
  }, [open, harvest.dry_weight_grams, harvest.waste_weight_grams]);

  const computedTotal = useMemo(() => {
    if (!perPlant) return null;
    return Object.values(perPlantWeights).reduce((sum, v) => sum + (Number(v) || 0), 0);
  }, [perPlant, perPlantWeights]);

  useEffect(() => {
    if (perPlant && computedTotal != null) setDry(String(computedTotal.toFixed(1)));
  }, [perPlant, computedTotal]);

  // Live conversion ratio
  const wet = harvest.wet_weight_grams != null ? Number(harvest.wet_weight_grams) : null;
  const dryN = Number(dry);
  const ratio = wet && wet > 0 && dryN > 0 ? (dryN / wet) * 100 : null;
  const ratioColor = ratio == null ? "text-muted-foreground" : ratio > 28 ? "text-emerald-500" : ratio < 20 ? "text-amber-500" : "text-foreground";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const weight = Number(dry);
    if (!weight || weight <= 0) { toast.error("Enter a dry weight"); return; }
    setSaving(true);
    try {
      const perPlantArr = perPlant
        ? Object.entries(perPlantWeights)
          .filter(([, v]) => Number(v) > 0)
          .map(([plant_id, v]) => ({ plant_id, weight: Number(v) }))
        : undefined;
      await recordDry(harvest.id, weight, waste ? Number(waste) : null, perPlantArr);
      toast.success(`Dry weight recorded: ${weight.toFixed(0)}g${ratio ? ` (${ratio.toFixed(1)}% yield)` : ""}`);
      onSuccess?.();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollableModal
      open={open}
      onClose={onClose}
      size="sm"
      onSubmit={handleSubmit}
      header={<ModalHeader icon={<Gauge className="w-4 h-4 text-orange-600" />} title="Record dry weight" subtitle={harvest.name} />}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving} className="min-w-[100px]">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Record"}
          </Button>
        </>
      }
    >
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Dry weight" required>
            <WeightInput value={dry} onChange={setDry} disabled={perPlant} />
          </Field>
          <Field label="Waste weight" helper="Trim, stems, larf">
            <WeightInput value={waste} onChange={setWaste} />
          </Field>
        </div>

        {wet != null && (
          <div className={cn("rounded-lg border p-3 flex items-center justify-between text-[12px]", ratio == null ? "border-border bg-muted/20" : ratio > 28 ? "border-emerald-500/30 bg-emerald-500/5" : ratio < 20 ? "border-amber-500/30 bg-amber-500/5" : "border-border bg-muted/20")}>
            <div>
              <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Yield conversion</p>
              <p className="font-mono text-[13px] mt-0.5">
                <span className="text-foreground">{wet.toFixed(0)}g</span>
                <span className="text-muted-foreground"> wet → </span>
                <span className={ratioColor}>{dry ? `${Number(dry).toFixed(0)}g` : "—"} dry</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Ratio</p>
              <p className={cn("font-mono text-[18px] font-bold tabular-nums", ratioColor)}>
                {ratio != null ? `${ratio.toFixed(1)}%` : "—"}
              </p>
            </div>
          </div>
        )}

        {harvestPlants.length > 0 && (
          <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={perPlant} onChange={(e) => setPerPlant(e.target.checked)} className="w-4 h-4 rounded border-border accent-primary" />
              <span className="text-[12px] font-medium text-foreground">Record per-plant dry weights</span>
            </label>
            <AnimatePresence initial={false}>
              {perPlant && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-1.5 overflow-hidden"
                >
                  {harvestPlants.map((hp) => (
                    <div key={hp.id} className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-muted-foreground w-20 truncate">{hp.plant?.plant_identifier ?? hp.plant_id.slice(0, 6)}</span>
                      <div className="relative flex-1">
                        <Input
                          type="number" step="0.1" min="0"
                          value={perPlantWeights[hp.plant_id] ?? ""}
                          onChange={(e) => setPerPlantWeights((prev) => ({ ...prev, [hp.plant_id]: e.target.value }))}
                          className="h-8 font-mono text-[12px] pr-8"
                          placeholder="0.0"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">g</span>
                      </div>
                      {hp.wet_weight_grams && (
                        <span className="text-[10px] text-muted-foreground/70 font-mono w-12 text-right">
                          {Number(hp.wet_weight_grams).toFixed(0)}g wet
                        </span>
                      )}
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        <Field label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Dry time, technique, observations…"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
        </Field>
      </div>
    </ScrollableModal>
  );
}

// ─── StartCureModal ──────────────────────────────────────────────────────────

export function StartCureModal({
  open, onClose, harvest, onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  harvest: Harvest;
  onSuccess?: () => void;
}) {
  const { orgId } = useOrg();
  const startCure = useStartCure();
  const [cureDate, setCureDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [duration, setDuration] = useState<string>("14");
  const [areaId, setAreaId] = useState<string>(harvest.area_id ?? "");
  const [notes, setNotes] = useState("");
  const [areas, setAreas] = useState<Array<{ id: string; name: string; canopy_type: string | null }>>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !orgId) return;
    (async () => {
      const { data } = await supabase
        .from("grow_areas").select("id, name, canopy_type").eq("org_id", orgId).eq("is_active", true).order("name");
      setAreas((data ?? []) as any);
    })();
  }, [open, orgId]);

  useEffect(() => {
    if (!open) return;
    setCureDate(new Date().toISOString().slice(0, 10));
    setDuration("14");
    setAreaId(harvest.area_id ?? "");
    setNotes("");
  }, [open, harvest.area_id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await startCure(harvest.id, {
        cure_date: cureDate,
        area_id: areaId || null,
        target_duration_days: duration ? Number(duration) : undefined,
        notes: notes.trim() || null,
      });
      toast.success(`Cure started — targeting ${duration || "14"} days`);
      onSuccess?.();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollableModal
      open={open}
      onClose={onClose}
      size="sm"
      onSubmit={handleSubmit}
      header={<ModalHeader icon={<Beaker className="w-4 h-4 text-orange-600" />} title="Start cure" subtitle={harvest.name} />}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving} className="min-w-[100px] gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Beaker className="w-3.5 h-3.5" />}
            Start Cure
          </Button>
        </>
      }
    >
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cure start date" required>
            <Input type="date" value={cureDate} onChange={(e) => setCureDate(e.target.value)} />
          </Field>
          <Field label="Target duration" helper="Typical: 14 days">
            <div className="relative">
              <Input type="number" min="1" max="90" value={duration} onChange={(e) => setDuration(e.target.value)} className="font-mono pr-12" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">days</span>
            </div>
          </Field>
        </div>

        <Field label="Cure area">
          <select
            value={areaId}
            onChange={(e) => setAreaId(e.target.value)}
            className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">— Stay in current area —</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.name}{a.canopy_type ? ` (${a.canopy_type})` : ""}</option>)}
          </select>
        </Field>

        <div className="flex items-start gap-2 rounded-lg bg-primary/5 border border-primary/20 p-3 text-[11px] text-foreground">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" />
          <span>Target environmental conditions during cure: <span className="font-mono font-semibold">60°F / 60% humidity</span>. Monitor on the Environmental tab.</span>
        </div>

        <Field label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Jar cure, burp schedule, target aroma…"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
        </Field>
      </div>
    </ScrollableModal>
  );
}

// ─── MarkCuredModal (lightweight confirmation) ──────────────────────────────

export function MarkCuredModal({
  open, onClose, harvest, onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  harvest: Harvest;
  onSuccess?: () => void;
}) {
  const markCured = useMarkCured();
  const [saving, setSaving] = useState(false);

  const cureStarted = harvest.cure_started_at;
  const daysInCure = cureStarted ? Math.floor((Date.now() - new Date(cureStarted).getTime()) / 86400000) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await markCured(harvest.id);
      toast.success("Harvest marked as cured", { description: "Ready to finalize into inventory" });
      onSuccess?.();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollableModal
      open={open}
      onClose={onClose}
      size="sm"
      onSubmit={handleSubmit}
      header={<ModalHeader icon={<Timer className="w-4 h-4 text-teal-500" />} title="Mark as cured" subtitle={harvest.name} />}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving} className="min-w-[100px] gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
            Mark Cured
          </Button>
        </>
      }
    >
      <div className="p-6 space-y-4">
        <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2 text-[12px] text-foreground">
          <p>This harvest will flip from <span className="font-mono text-orange-600 font-semibold">Curing</span> to <span className="font-mono text-teal-500 font-semibold">Cured</span>.</p>
          {daysInCure != null && (
            <p className="text-muted-foreground">Cured for <span className="font-mono font-semibold text-foreground">{daysInCure}</span> days.</p>
          )}
          <p className="text-muted-foreground">Once cured, you can finalize it into a batch from the detail page.</p>
        </div>
      </div>
    </ScrollableModal>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function WeightInput({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div className="relative">
      <Input
        type="number" step="0.1" min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="font-mono pr-12"
        placeholder="0.0"
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">g</span>
    </div>
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
