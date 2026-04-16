import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronUp, Loader2, CalendarDays, Sparkles } from "lucide-react";
import { toast } from "sonner";
import ScrollableModal, { ModalHeader } from "@/components/ui/scrollable-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { useOrg } from "@/lib/org";
import { CYCLE_PHASES, CyclePhase } from "@/lib/schema-enums";
import { Cycle, CycleInput } from "@/hooks/useCycles";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (input: CycleInput) => Promise<Cycle>;
  editing?: Cycle | null;
}

interface StrainOption { id: string; name: string; average_flower_days: number | null }
interface AreaOption { id: string; name: string }

const CYCLE_PHASE_LABELS: Record<CyclePhase, string> = {
  immature: "Immature",
  vegetative: "Vegetative",
  flowering: "Flowering",
  ready_for_harvest: "Ready for Harvest",
  harvesting: "Harvesting",
  completed: "Completed",
};

/** Only let users pick phases that make sense to create in. Cycles usually
 * start at vegetative; immature is for plants still germinating; others are
 * reached via the board's forward flow. */
const CREATE_PHASES: CyclePhase[] = ["vegetative", "immature"];

export default function CycleFormModal({ open, onClose, onSave, editing }: Props) {
  const isEdit = !!editing;
  const { orgId } = useOrg();

  const [form, setForm] = useState<CycleInput>({
    name: "",
    strain_id: "",
    area_id: "",
    phase: "vegetative",
    start_date: new Date().toISOString().slice(0, 10),
    plant_count: 0,
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});

  const [strains, setStrains] = useState<StrainOption[]>([]);
  const [areas, setAreas] = useState<AreaOption[]>([]);
  const [nameTouched, setNameTouched] = useState(false);

  useEffect(() => {
    if (!open || !orgId) return;
    (async () => {
      const [sRes, aRes] = await Promise.all([
        supabase.from("grow_strains").select("id, name, average_flower_days").eq("org_id", orgId).eq("is_active", true).order("name"),
        supabase.from("grow_areas").select("id, name").eq("org_id", orgId).eq("is_active", true).order("name"),
      ]);
      setStrains((sRes.data ?? []) as StrainOption[]);
      setAreas((aRes.data ?? []) as AreaOption[]);
    })();
  }, [open, orgId]);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setNameTouched(false);
    if (editing) {
      setForm({
        name: editing.name,
        strain_id: editing.strain_id ?? "",
        area_id: editing.area_id ?? "",
        phase: (editing.phase ?? "vegetative") as CyclePhase,
        start_date: editing.start_date,
        target_harvest_date: editing.target_harvest_date,
        plant_count: editing.plant_count ?? 0,
        notes: editing.notes,
      });
      setShowAdvanced(true);
    } else {
      setForm({
        name: "",
        strain_id: "",
        area_id: "",
        phase: "vegetative",
        start_date: new Date().toISOString().slice(0, 10),
        plant_count: 0,
      });
      setShowAdvanced(false);
    }
  }, [open, editing]);

  const selectedStrain = strains.find((s) => s.id === form.strain_id);
  const selectedArea = areas.find((a) => a.id === form.area_id);

  // Auto-suggest cycle name until the user types their own
  const nameSuggestion = useMemo(() => {
    if (!selectedStrain || !selectedArea) return "";
    const date = form.start_date ?? new Date().toISOString().slice(0, 10);
    return `${selectedStrain.name} - ${selectedArea.name} - ${date}`;
  }, [selectedStrain, selectedArea, form.start_date]);

  useEffect(() => {
    if (isEdit) return;
    if (nameTouched) return;
    if (!nameSuggestion) return;
    setForm((f) => ({ ...f, name: nameSuggestion }));
  }, [nameSuggestion, isEdit, nameTouched]);

  // Auto-compute target harvest date from strain's average flower days
  // (assumes ~30d veg before flower + strain's avg flower days).
  const harvestSuggestion = useMemo(() => {
    if (!selectedStrain?.average_flower_days || !form.start_date) return null;
    const d = new Date(form.start_date);
    // Rough: 30d veg + flower days. Users can override.
    d.setUTCDate(d.getUTCDate() + 30 + selectedStrain.average_flower_days);
    return d.toISOString().slice(0, 10);
  }, [selectedStrain, form.start_date]);

  useEffect(() => {
    if (isEdit) return;
    if (form.target_harvest_date) return;
    if (harvestSuggestion) setForm((f) => ({ ...f, target_harvest_date: harvestSuggestion }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [harvestSuggestion]);

  const set = <K extends keyof CycleInput>(field: K, value: CycleInput[K]) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const validate = (): boolean => {
    const next: typeof errors = {};
    if (!form.name?.trim()) next.name = "Name is required";
    if (!form.strain_id) next.strain_id = "Strain is required";
    if (!form.area_id) next.area_id = "Area is required";
    if (!form.start_date) next.start_date = "Start date is required";
    if (form.target_harvest_date && form.start_date && form.target_harvest_date < form.start_date) {
      next.target_harvest_date = "Harvest date must be after start date";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      await onSave({ ...form, name: form.name.trim() });
      toast.success(isEdit ? "Cycle updated" : "Cycle created", {
        description: !isEdit ? "Added to the Grow Board" : undefined,
      });
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
      size="md"
      onSubmit={handleSubmit}
      header={
        <ModalHeader
          icon={<CalendarDays className="w-4 h-4 text-primary" />}
          title={isEdit ? "Edit grow cycle" : "New grow cycle"}
          subtitle={isEdit ? "Cycle details" : "A batch of plants moving through veg → flower → harvest together"}
        />
      }
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving} className="min-w-[100px]">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : isEdit ? "Save" : "Create"}
          </Button>
        </>
      }
    >
      <div className="p-6 space-y-4">
        <Field label="Name" required error={errors.name} helper={!isEdit && nameSuggestion && !nameTouched ? `Suggestion: ${nameSuggestion}` : undefined}>
          <Input
            value={form.name}
            onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); setNameTouched(true); setErrors((er) => ({ ...er, name: undefined })); }}
            placeholder={nameSuggestion || "e.g. Blue Dream - Flower Room 1 - 2026-04-16"}
            autoFocus
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Strain" required error={errors.strain_id}>
            {strains.length === 0 ? (
              <div className="h-10 px-3 flex items-center text-[12px] text-muted-foreground border border-dashed border-border rounded-lg">
                Add a strain first
              </div>
            ) : (
              <select
                value={form.strain_id}
                onChange={(e) => set("strain_id", e.target.value)}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">— Select —</option>
                {strains.map((s) => <option key={s.id} value={s.id}>{s.name}{s.average_flower_days ? ` (~${s.average_flower_days}d flower)` : ""}</option>)}
              </select>
            )}
          </Field>
          <Field label="Area" required error={errors.area_id}>
            {areas.length === 0 ? (
              <div className="h-10 px-3 flex items-center text-[12px] text-muted-foreground border border-dashed border-border rounded-lg">
                Add an area first
              </div>
            ) : (
              <select
                value={form.area_id}
                onChange={(e) => set("area_id", e.target.value)}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">— Select —</option>
                {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            )}
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Phase" required>
            <select
              value={form.phase ?? "vegetative"}
              onChange={(e) => set("phase", e.target.value as CyclePhase)}
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {(isEdit ? CYCLE_PHASES : CREATE_PHASES).map((p) => (
                <option key={p} value={p}>{CYCLE_PHASE_LABELS[p]}</option>
              ))}
            </select>
          </Field>
          <Field label="Start Date" required error={errors.start_date}>
            <Input type="date" value={form.start_date ?? ""} onChange={(e) => set("start_date", e.target.value)} />
          </Field>
        </div>

        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex items-center gap-1.5 text-[12px] font-medium text-primary hover:text-primary/80 pt-2"
        >
          {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {showAdvanced ? "Hide all fields" : "Show all fields"}
        </button>

        <AnimatePresence initial={false}>
          {showAdvanced && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-4 overflow-hidden"
            >
              <div className="grid grid-cols-2 gap-3">
                <Field label="Plant Count">
                  <Input
                    type="number" min="0"
                    value={form.plant_count ?? 0}
                    onChange={(e) => set("plant_count", e.target.value ? Number(e.target.value) : 0)}
                    className="font-mono"
                  />
                </Field>
                <Field label="Target Harvest Date" error={errors.target_harvest_date} helper={harvestSuggestion && !form.target_harvest_date ? `Auto: ${harvestSuggestion}` : undefined}>
                  <Input
                    type="date"
                    value={form.target_harvest_date ?? ""}
                    onChange={(e) => set("target_harvest_date", e.target.value || null)}
                  />
                </Field>
              </div>

              {selectedStrain?.average_flower_days && harvestSuggestion && (
                <div className="flex items-start gap-2 rounded-lg bg-primary/5 border border-primary/20 p-3 text-[11px] text-foreground">
                  <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" />
                  <div>
                    <span className="font-medium">Harvest projection:</span>{" "}
                    Based on <span className="font-mono">{selectedStrain.name}</span>'s avg flower
                    time of {selectedStrain.average_flower_days}d + ~30d veg assumption, this cycle
                    should finish around <span className="font-mono font-semibold">{harvestSuggestion}</span>.
                  </div>
                </div>
              )}

              <Field label="Notes">
                <textarea
                  value={form.notes ?? ""}
                  onChange={(e) => set("notes", e.target.value)}
                  rows={3}
                  placeholder="Feed schedule, IPM plan, anything specific to this run…"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </Field>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ScrollableModal>
  );
}

function Field({ label, required, error, helper, children }: { label: string; required?: boolean; error?: string; helper?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-[11px] text-destructive">{error}</p>}
      {!error && helper && <p className="text-[11px] text-muted-foreground/70">{helper}</p>}
    </div>
  );
}
