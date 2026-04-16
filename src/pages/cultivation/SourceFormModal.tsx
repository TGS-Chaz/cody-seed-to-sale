import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown, ChevronUp, Loader2, Sprout, Flower, GitBranch, FlaskConical,
  Info, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import ScrollableModal, { ModalHeader } from "@/components/ui/scrollable-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { useOrg } from "@/lib/org";
import {
  SOURCE_TYPES, SOURCE_TYPE_LABELS, SOURCE_TYPE_COLORS, SourceType,
  SOURCE_STATUSES, SOURCE_STATUS_LABELS, SourceStatus,
  ROOTING_MEDIUMS, ROOTING_MEDIUM_LABELS, RootingMedium,
  HEALTH_RATINGS, HEALTH_RATING_LABELS, HealthRating,
} from "@/lib/schema-enums";
import { Source, SourceInput } from "@/hooks/useSources";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (input: SourceInput) => Promise<Source>;
  editing?: Source | null;
  /** Defaults the form to a specific source type (from the empty-state CTAs). */
  initialType?: SourceType;
}

interface StrainOption { id: string; name: string; type: string | null }
interface AreaOption { id: string; name: string }
interface MotherOption { id: string; plant_identifier: string | null; strain_id: string | null; area_id: string | null }
interface PhenoOption { id: string; pheno_number: string; pheno_name: string | null; strain_id: string | null }

const SOURCE_ICONS: Record<SourceType, React.ComponentType<{ className?: string }>> = {
  seed: Flower,
  clone: GitBranch,
  tissue_culture: FlaskConical,
};

export default function SourceFormModal({ open, onClose, onSave, editing, initialType }: Props) {
  const isEdit = !!editing;
  const { orgId } = useOrg();

  const [form, setForm] = useState<SourceInput>({
    source_type: "seed",
    strain_id: "",
    area_id: "",
    quantity: 1,
    date: new Date().toISOString().slice(0, 10),
    status: "available",
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [useExternalMother, setUseExternalMother] = useState(false);

  const [strains, setStrains] = useState<StrainOption[]>([]);
  const [areas, setAreas] = useState<AreaOption[]>([]);
  const [motherPlants, setMotherPlants] = useState<MotherOption[]>([]);
  const [phenos, setPhenos] = useState<PhenoOption[]>([]);

  useEffect(() => {
    if (!open || !orgId) return;
    (async () => {
      const [sRes, aRes, mRes, pRes] = await Promise.all([
        supabase.from("grow_strains").select("id, name, type").eq("org_id", orgId).eq("is_active", true).order("name"),
        supabase.from("grow_areas").select("id, name").eq("org_id", orgId).eq("is_active", true).order("name"),
        supabase.from("grow_plants").select("id, plant_identifier, strain_id, area_id").eq("org_id", orgId).eq("is_mother_plant", true),
        supabase.from("grow_phenotypes").select("id, pheno_number, pheno_name, strain_id").eq("org_id", orgId).eq("is_retired", false),
      ]);
      setStrains((sRes.data ?? []) as StrainOption[]);
      setAreas((aRes.data ?? []) as AreaOption[]);
      setMotherPlants((mRes.data ?? []) as MotherOption[]);
      setPhenos((pRes.data ?? []) as PhenoOption[]);
    })();
  }, [open, orgId]);

  // Hydrate form
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setUseExternalMother(false);
    if (editing) {
      setForm({
        source_type: editing.source_type,
        strain_id: editing.strain_id ?? "",
        area_id: editing.area_id ?? "",
        quantity: editing.current_quantity ?? editing.initial_quantity ?? 1,
        date: (editing.source_type === "clone" ? editing.cut_date : editing.acquired_date) ?? new Date().toISOString().slice(0, 10),
        status: editing.status,
        source_vendor: editing.source_vendor,
        vendor_lot_number: editing.vendor_lot_number,
        cost_per_unit: editing.cost_per_unit,
        is_feminized: editing.is_feminized,
        is_autoflower: editing.is_autoflower,
        germination_rate_expected: editing.germination_rate_expected,
        mother_plant_id: editing.mother_plant_id,
        phenotype_id: editing.phenotype_id,
        is_rooted: editing.is_rooted,
        root_date: editing.root_date,
        rooting_medium: editing.rooting_medium,
        rooting_hormone: editing.rooting_hormone,
        health_rating: editing.health_rating,
        notes: editing.notes,
        ccrs_notes: editing.ccrs_notes,
      });
      setShowAdvanced(true);
    } else {
      setForm({
        source_type: initialType ?? "seed",
        strain_id: "",
        area_id: "",
        quantity: 1,
        date: new Date().toISOString().slice(0, 10),
        status: "available",
      });
      setShowAdvanced(false);
    }
  }, [open, editing, initialType]);

  const set = <K extends keyof SourceInput>(field: K, value: SourceInput[K]) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  };

  // Filter motherPlants / phenos by selected strain
  const availableMothers = useMemo(
    () => motherPlants.filter((m) => !form.strain_id || m.strain_id === form.strain_id),
    [motherPlants, form.strain_id],
  );
  const availablePhenos = useMemo(
    () => phenos.filter((p) => !form.strain_id || p.strain_id === form.strain_id),
    [phenos, form.strain_id],
  );

  const isClone = form.source_type === "clone";
  const isSeed = form.source_type === "seed";

  const validate = (): boolean => {
    const next: typeof errors = {};
    if (!form.strain_id) next.strain_id = "Strain is required";
    if (!form.area_id) next.area_id = "Area is required";
    if (!form.quantity || form.quantity <= 0) next.quantity = "Quantity must be > 0";
    if (!form.date) next.date = "Date is required";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      // If clone + external mother mode, null out mother_plant_id
      const mother = isClone && useExternalMother ? null : form.mother_plant_id;
      const saved = await onSave({ ...form, mother_plant_id: mother });
      toast.success(
        `${form.quantity} ${SOURCE_TYPE_LABELS[form.source_type].toLowerCase()}${form.quantity === 1 ? "" : "s"} added`,
        { description: `Strain: ${strains.find((s) => s.id === form.strain_id)?.name ?? ""}` },
      );
      onClose();
      void saved;
    } catch (err: any) {
      toast.error(err?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const typeColor = SOURCE_TYPE_COLORS[form.source_type];

  return (
    <ScrollableModal
      open={open}
      onClose={onClose}
      size="md"
      onSubmit={handleSubmit}
      header={
        <ModalHeader
          icon={<Sprout className="w-4 h-4 text-primary" />}
          title={isEdit ? "Edit grow source" : "New grow source"}
          subtitle="Seeds, clones, or tissue culture — the starting point of every grow"
        />
      }
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving} className="min-w-[100px]">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : isEdit ? "Save" : "Add Source"}
          </Button>
        </>
      }
    >
      <div className="p-6 space-y-4">
        {/* Type segmented control */}
        <div className="space-y-1.5">
          <label className="block text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Type</label>
          <div className="grid grid-cols-3 gap-1.5">
            {SOURCE_TYPES.map((t) => {
              const Icon = SOURCE_ICONS[t];
              const color = SOURCE_TYPE_COLORS[t];
              const selected = form.source_type === t;
              return (
                <button
                  key={t}
                  type="button"
                  disabled={isEdit}
                  onClick={() => set("source_type", t)}
                  className={cn(
                    "flex items-center justify-center gap-1.5 h-10 rounded-lg border text-[13px] font-medium transition-all",
                    selected ? `${color.bg} ${color.text} border-transparent ring-2 ring-offset-1 ring-offset-background` : "bg-muted/30 border-border text-muted-foreground hover:text-foreground",
                    isEdit && "cursor-not-allowed opacity-70",
                  )}
                  style={selected ? { boxShadow: `0 0 0 2px ${color.hex}40` } : undefined}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {SOURCE_TYPE_LABELS[t]}
                </button>
              );
            })}
          </div>
          {isEdit && <p className="text-[11px] text-muted-foreground/70">Type can't change after creation — add a new source instead.</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Strain" required error={errors.strain_id}>
            {strains.length === 0 ? (
              <div className="h-10 px-3 flex items-center text-[12px] text-muted-foreground border border-dashed border-border rounded-lg">
                Add a strain in Cultivation → Strains first
              </div>
            ) : (
              <select
                value={form.strain_id}
                onChange={(e) => {
                  set("strain_id", e.target.value);
                  // Clear mother/pheno if they don't match new strain
                  set("mother_plant_id", null);
                  set("phenotype_id", null);
                }}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">— Select strain —</option>
                {strains.map((s) => <option key={s.id} value={s.id}>{s.name}{s.type ? ` (${s.type})` : ""}</option>)}
              </select>
            )}
          </Field>
          <Field label="Quantity" required error={errors.quantity}>
            <Input
              type="number" min="1" step="1"
              value={form.quantity}
              onChange={(e) => set("quantity", Number(e.target.value) || 0)}
              className="font-mono"
              autoFocus
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={isClone ? "Cut Date" : "Date Acquired"} required error={errors.date}>
            <Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
          </Field>
          <Field label="Area" required error={errors.area_id} helper={isClone ? "Where clones are being rooted" : "Where seeds are stored"}>
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
                <option value="">— Select area —</option>
                {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            )}
          </Field>
        </div>

        {/* Clone-specific: mother plant picker on the required step */}
        {isClone && (
          <Field label="Mother Plant">
            {useExternalMother ? (
              <div className="space-y-1.5">
                <div className="h-10 px-3 flex items-center text-[12px] text-muted-foreground border border-border bg-muted/30 rounded-lg italic">
                  Unknown / External mother
                </div>
                <button type="button" onClick={() => setUseExternalMother(false)} className="text-[11px] text-primary hover:underline">
                  ← Pick from library instead
                </button>
              </div>
            ) : availableMothers.length === 0 ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
                <div className="flex items-start gap-2 text-[12px]">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500" />
                  <div>
                    <p className="text-foreground font-medium">
                      {form.strain_id ? "No mother plants found for this strain." : "Pick a strain to see mother plants."}
                    </p>
                    <p className="text-muted-foreground mt-0.5">
                      You can still add clones without a mother plant link, or go to Plants to designate one.
                    </p>
                  </div>
                </div>
                <button type="button" onClick={() => setUseExternalMother(true)} className="text-[11px] font-medium text-primary hover:underline">
                  Use Unknown / External →
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <select
                  value={form.mother_plant_id ?? ""}
                  onChange={(e) => set("mother_plant_id", e.target.value || null)}
                  className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">— Pick mother plant —</option>
                  {availableMothers.map((m) => (
                    <option key={m.id} value={m.id}>{m.plant_identifier ?? m.id.slice(0, 8)}</option>
                  ))}
                </select>
                <button type="button" onClick={() => setUseExternalMother(true)} className="text-[11px] text-muted-foreground hover:text-primary">
                  None of these — mother is Unknown / External
                </button>
              </div>
            )}
          </Field>
        )}

        {/* Advanced toggle */}
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
              className="space-y-5 overflow-hidden"
            >
              {/* Seed-specific */}
              {isSeed && (
                <Section title="Source">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Vendor / Supplier">
                      <Input value={form.source_vendor ?? ""} onChange={(e) => set("source_vendor", e.target.value)} placeholder="e.g. Humboldt Seed Co." />
                    </Field>
                    <Field label="Vendor Lot #">
                      <Input value={form.vendor_lot_number ?? ""} onChange={(e) => set("vendor_lot_number", e.target.value)} className="font-mono" />
                    </Field>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Cost per Seed">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">$</span>
                        <Input type="number" step="0.01" min="0" value={form.cost_per_unit ?? ""} onChange={(e) => set("cost_per_unit", e.target.value ? Number(e.target.value) : null)} className="font-mono pl-6" />
                      </div>
                    </Field>
                    <Field label="Expected Germ %" helper="For yield forecasting">
                      <Input
                        type="number" step="0.1" min="0" max="100"
                        value={form.germination_rate_expected ?? ""}
                        onChange={(e) => set("germination_rate_expected", e.target.value ? Number(e.target.value) : null)}
                        className="font-mono"
                        placeholder="95"
                      />
                    </Field>
                    <div className="flex flex-col gap-1.5 pt-5">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input type="checkbox" checked={!!form.is_feminized} onChange={(e) => set("is_feminized", e.target.checked)} className="w-4 h-4 rounded border-border accent-primary" />
                        <span className="text-[12px]">Feminized</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input type="checkbox" checked={!!form.is_autoflower} onChange={(e) => set("is_autoflower", e.target.checked)} className="w-4 h-4 rounded border-border accent-primary" />
                        <span className="text-[12px]">Autoflower</span>
                      </label>
                    </div>
                  </div>
                </Section>
              )}

              {/* Clone-specific */}
              {isClone && (
                <Section title="Clone Details">
                  <Field label="Phenotype">
                    {availablePhenos.length === 0 ? (
                      <div className="h-10 px-3 flex items-center text-[12px] text-muted-foreground border border-dashed border-border rounded-lg italic">
                        {form.strain_id ? "No phenotypes tracked for this strain" : "Pick a strain first"}
                      </div>
                    ) : (
                      <select
                        value={form.phenotype_id ?? ""}
                        onChange={(e) => set("phenotype_id", e.target.value || null)}
                        className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="">— None —</option>
                        {availablePhenos.map((p) => <option key={p.id} value={p.id}>{p.pheno_number}{p.pheno_name ? ` — ${p.pheno_name}` : ""}</option>)}
                      </select>
                    )}
                  </Field>
                  <div className="grid grid-cols-2 gap-3 items-end">
                    <label className="flex items-center gap-2 cursor-pointer select-none h-10">
                      <input type="checkbox" checked={!!form.is_rooted} onChange={(e) => set("is_rooted", e.target.checked)} className="w-4 h-4 rounded border-border accent-primary" />
                      <span className="text-[13px] text-foreground">Rooted</span>
                    </label>
                    {form.is_rooted && (
                      <Field label="Root Date">
                        <Input type="date" value={form.root_date ?? ""} onChange={(e) => set("root_date", e.target.value || null)} />
                      </Field>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Rooting Medium">
                      <select
                        value={form.rooting_medium ?? ""}
                        onChange={(e) => set("rooting_medium", (e.target.value || null) as RootingMedium | null)}
                        className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="">—</option>
                        {ROOTING_MEDIUMS.map((r) => <option key={r} value={r}>{ROOTING_MEDIUM_LABELS[r]}</option>)}
                      </select>
                    </Field>
                    <Field label="Rooting Hormone">
                      <Input value={form.rooting_hormone ?? ""} onChange={(e) => set("rooting_hormone", e.target.value)} placeholder="e.g. Clonex" />
                    </Field>
                  </div>
                  <Field label="Health Rating">
                    <div className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5">
                      {HEALTH_RATINGS.map((h) => (
                        <button
                          key={h}
                          type="button"
                          onClick={() => set("health_rating", h)}
                          className={cn(
                            "px-3 h-8 text-[12px] font-medium rounded-md",
                            form.health_rating === h ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {HEALTH_RATING_LABELS[h]}
                        </button>
                      ))}
                    </div>
                  </Field>
                  {/* Optional external vendor for purchased clones */}
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Vendor (if purchased)">
                      <Input value={form.source_vendor ?? ""} onChange={(e) => set("source_vendor", e.target.value)} placeholder="Leave blank if cut in-house" />
                    </Field>
                    <Field label="Cost per Clone">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">$</span>
                        <Input type="number" step="0.01" min="0" value={form.cost_per_unit ?? ""} onChange={(e) => set("cost_per_unit", e.target.value ? Number(e.target.value) : null)} className="font-mono pl-6" />
                      </div>
                    </Field>
                  </div>
                </Section>
              )}

              {/* CCRS */}
              <Section title="CCRS">
                <div className="flex items-start gap-2 rounded-lg bg-blue-500/10 border border-blue-500/20 p-3 text-[11px] text-foreground">
                  <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-blue-500" />
                  <div>
                    Grow sources map to CCRS <span className="font-mono">PropagationMaterial</span> inventory
                    (Seed, Clone, or Plant). External ID is auto-generated.
                  </div>
                </div>
                <Field label="Notes for CCRS">
                  <Input value={form.ccrs_notes ?? ""} onChange={(e) => set("ccrs_notes", e.target.value)} />
                </Field>
              </Section>

              {/* Other */}
              <Section title="Other">
                <Field label="Status">
                  <select
                    value={form.status ?? "available"}
                    onChange={(e) => set("status", e.target.value as SourceStatus)}
                    className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {SOURCE_STATUSES.map((s) => <option key={s} value={s}>{SOURCE_STATUS_LABELS[s]}</option>)}
                  </select>
                </Field>
                <Field label="Notes">
                  <textarea
                    value={form.notes ?? ""}
                    onChange={(e) => set("notes", e.target.value)}
                    rows={3}
                    placeholder="Seed condition, germination observations, anything relevant…"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  />
                </Field>
              </Section>
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
