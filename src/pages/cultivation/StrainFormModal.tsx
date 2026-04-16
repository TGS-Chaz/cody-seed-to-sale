import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown, ChevronUp, Loader2, Dna, Upload, Image as ImageIcon,
  Plus, X as XIcon,
} from "lucide-react";
import { toast } from "sonner";
import ScrollableModal, { ModalHeader } from "@/components/ui/scrollable-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { useOrg } from "@/lib/org";
import {
  STRAIN_TYPES, STRAIN_TYPE_LABELS, STRAIN_TYPE_COLORS, StrainType,
  STRAIN_DIFFICULTIES, STRAIN_DIFFICULTY_LABELS,
  STRAIN_ENVIRONMENTS, STRAIN_ENVIRONMENT_LABELS,
  STRAIN_GROWTH_PATTERNS, STRAIN_GROWTH_PATTERN_LABELS,
  COMMON_TERPENES, COMMON_FLAVORS, COMMON_EFFECTS,
  TERPENE_COLORS,
} from "@/lib/schema-enums";
import {
  Strain, StrainInput, StrainLineageInput, useStrainLineage,
} from "@/hooks/useStrains";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (input: StrainInput) => Promise<Strain>;
  editing?: Strain | null;
}

interface StrainOption { id: string; name: string; type: StrainType | null }

export default function StrainFormModal({ open, onClose, onSave, editing }: Props) {
  const isEdit = !!editing;
  const { orgId } = useOrg();
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<StrainInput>({ name: "", type: "Hybrid" });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof StrainInput, string>>>({});

  // Lineage state (mother/father)
  const [motherStrainId, setMotherStrainId] = useState<string>("");
  const [motherExternal, setMotherExternal] = useState<string>("");
  const [motherMode, setMotherMode] = useState<"library" | "external">("library");
  const [fatherStrainId, setFatherStrainId] = useState<string>("");
  const [fatherExternal, setFatherExternal] = useState<string>("");
  const [fatherMode, setFatherMode] = useState<"library" | "external">("library");
  const [generation, setGeneration] = useState<string>("");

  // Strain library for Mother/Father pickers
  const [libraryStrains, setLibraryStrains] = useState<StrainOption[]>([]);

  // Custom tag inputs for terpenes/flavors/effects
  const [customTerpene, setCustomTerpene] = useState("");
  const [customFlavor, setCustomFlavor] = useState("");
  const [customEffect, setCustomEffect] = useState("");

  const { data: existingLineage, replaceLineage } = useStrainLineage(editing?.id);

  // Load library for parent picker (all strains minus the one we're editing)
  useEffect(() => {
    if (!open || !orgId) return;
    (async () => {
      const { data } = await supabase
        .from("grow_strains")
        .select("id, name, type")
        .eq("org_id", orgId)
        .eq("is_active", true)
        .order("name");
      const all = (data ?? []) as StrainOption[];
      setLibraryStrains(editing ? all.filter((s) => s.id !== editing.id) : all);
    })();
  }, [open, orgId, editing]);

  // Hydrate form on open
  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (editing) {
      setForm({
        name: editing.name,
        type: editing.type ?? "Hybrid",
        breeder: editing.breeder,
        genetics: editing.genetics,
        description: editing.description,
        ccrs_notes: editing.ccrs_notes,
        image_url: editing.image_url,
        dominant_terpenes: editing.dominant_terpenes ?? [],
        flavor_profile: editing.flavor_profile ?? [],
        effects: editing.effects ?? [],
        difficulty: editing.difficulty,
        preferred_environment: editing.preferred_environment,
        growth_pattern: editing.growth_pattern,
        average_flower_days: editing.average_flower_days,
        average_thc_pct: editing.average_thc_pct,
        average_cbd_pct: editing.average_cbd_pct,
        is_active: editing.is_active,
      });
      setShowAdvanced(true);
    } else {
      setForm({ name: "", type: "Hybrid", dominant_terpenes: [], flavor_profile: [], effects: [] });
      setShowAdvanced(false);
    }
  }, [open, editing]);

  // Hydrate lineage state from existing rows
  useEffect(() => {
    if (!open || !editing) {
      setMotherStrainId(""); setMotherExternal(""); setMotherMode("library");
      setFatherStrainId(""); setFatherExternal(""); setFatherMode("library");
      setGeneration("");
      return;
    }
    const mother = existingLineage.find((l) => l.parent_type === "mother" || l.parent_type === "both");
    const father = existingLineage.find((l) => l.parent_type === "father" || l.parent_type === "both");
    if (mother) {
      setMotherStrainId(mother.parent_strain_id ?? "");
      setMotherExternal(mother.parent_name_external ?? "");
      setMotherMode(mother.parent_strain_id ? "library" : "external");
      if (mother.generation) setGeneration(mother.generation);
    }
    if (father) {
      setFatherStrainId(father.parent_strain_id ?? "");
      setFatherExternal(father.parent_name_external ?? "");
      setFatherMode(father.parent_strain_id ? "library" : "external");
    }
  }, [open, editing, existingLineage]);

  const set = <K extends keyof StrainInput>(field: K, value: StrainInput[K]) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const toggleArrayValue = (field: "dominant_terpenes" | "flavor_profile" | "effects", v: string) => {
    const current = form[field] ?? [];
    set(field, current.includes(v) ? current.filter((x) => x !== v) : [...current, v]);
  };

  const addCustomTag = (field: "dominant_terpenes" | "flavor_profile" | "effects", value: string, reset: () => void) => {
    const v = value.trim();
    if (!v) return;
    const current = form[field] ?? [];
    if (!current.includes(v)) set(field, [...current, v]);
    reset();
  };

  const handleFileUpload = async (file: File) => {
    if (!orgId) return;
    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
      const prefix = editing?.id ?? "new";
      const path = `strains/${orgId}/${prefix}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      set("image_url", `${urlData.publicUrl}?t=${Date.now()}`);
      toast.success("Photo uploaded");
    } catch (err: any) {
      toast.error(err?.message ?? "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const validate = (): boolean => {
    const next: typeof errors = {};
    if (!form.name.trim()) next.name = "Name is required";
    else if (form.name.length > 50) next.name = "CCRS spec limits name to 50 characters";
    if (!form.type) next.type = "Strain type is required";
    if (form.average_thc_pct != null && (form.average_thc_pct < 0 || form.average_thc_pct > 100)) next.average_thc_pct = "Must be 0–100";
    if (form.average_cbd_pct != null && (form.average_cbd_pct < 0 || form.average_cbd_pct > 100)) next.average_cbd_pct = "Must be 0–100";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      const saved = await onSave({ ...form, name: form.name.trim() });

      // Build lineage rows — only insert rows that have meaningful data
      const lineageRows: StrainLineageInput[] = [];
      const motherId = motherMode === "library" ? motherStrainId : "";
      const motherExt = motherMode === "external" ? motherExternal.trim() : "";
      const fatherId = fatherMode === "library" ? fatherStrainId : "";
      const fatherExt = fatherMode === "external" ? fatherExternal.trim() : "";

      if (motherId || motherExt) {
        lineageRows.push({
          parent_strain_id: motherId || null,
          parent_name_external: motherExt || null,
          parent_type: "mother",
          generation: generation.trim() || null,
        });
      }
      if (fatherId || fatherExt) {
        lineageRows.push({
          parent_strain_id: fatherId || null,
          parent_name_external: fatherExt || null,
          parent_type: "father",
          generation: generation.trim() || null,
        });
      }

      // replaceLineage uses the hook's strainId which only hydrates after
      // edit-mode loads. For create-mode, fall back to the freshly-saved id.
      if (isEdit) {
        await replaceLineage(lineageRows);
      } else if (lineageRows.length > 0) {
        const payload = lineageRows.map((r) => ({ ...r, strain_id: saved.id }));
        await supabase.from("grow_strain_lineage").insert(payload);
      }

      toast.success(isEdit ? "Strain updated" : "Strain created");
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const typeColor = STRAIN_TYPE_COLORS[form.type ?? "Hybrid"];

  const geneticsPreview = useMemo(() => {
    const mom = motherMode === "library"
      ? libraryStrains.find((s) => s.id === motherStrainId)?.name
      : motherExternal;
    const dad = fatherMode === "library"
      ? libraryStrains.find((s) => s.id === fatherStrainId)?.name
      : fatherExternal;
    if (mom && dad) return `${mom} × ${dad}`;
    if (mom || dad) return mom ?? dad ?? "";
    return "";
  }, [motherMode, motherStrainId, motherExternal, fatherMode, fatherStrainId, fatherExternal, libraryStrains]);

  return (
    <ScrollableModal
      open={open}
      onClose={onClose}
      size="md"
      onSubmit={handleSubmit}
      header={
        <ModalHeader
          icon={<Dna className="w-4 h-4 text-primary" />}
          title={isEdit ? "Edit strain" : "New strain"}
          subtitle="Genetics library — every plant traces back here"
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
        {/* Photo */}
        <div className="space-y-1.5">
          <label className="block text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Photo</label>
          <div
            className={cn(
              "relative rounded-xl border-2 border-dashed overflow-hidden transition-colors",
              form.image_url ? "border-transparent" : "border-border hover:border-primary/40",
            )}
            style={{ aspectRatio: "16 / 9" }}
          >
            {form.image_url ? (
              <img src={form.image_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className={cn("w-full h-full flex items-center justify-center bg-gradient-to-br", typeColor.gradient)}>
                <div className="text-center">
                  <ImageIcon className="w-8 h-8 mx-auto text-muted-foreground/60 mb-1" />
                  <p className="text-[11px] text-muted-foreground">Click or drag to add a photo</p>
                </div>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
            {uploading && (
              <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            )}
            {form.image_url && !uploading && (
              <div className="absolute top-2 right-2 flex gap-1">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex items-center gap-1 bg-background/90 hover:bg-background text-[11px] px-2 py-1 rounded-md border border-border"
                >
                  <Upload className="w-3 h-3" /> Replace
                </button>
                <button
                  type="button"
                  onClick={() => set("image_url", null)}
                  className="inline-flex items-center gap-1 bg-background/90 hover:bg-destructive/10 text-destructive text-[11px] px-2 py-1 rounded-md border border-destructive/40"
                >
                  <XIcon className="w-3 h-3" /> Remove
                </button>
              </div>
            )}
          </div>
        </div>

        <Field label="Name" required error={errors.name} helper={form.name.length > 40 ? `${form.name.length}/50 chars` : undefined}>
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Blue Dream" autoFocus maxLength={50} />
        </Field>

        <div className="space-y-1.5">
          <label className="block text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
            Strain Type <span className="text-destructive">*</span>
          </label>
          <div className="flex flex-wrap gap-1.5">
            {STRAIN_TYPES.map((t) => {
              const color = STRAIN_TYPE_COLORS[t];
              const selected = form.type === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => set("type", t)}
                  className={cn(
                    "inline-flex items-center h-8 px-3 rounded-full border text-[12px] font-medium transition-all",
                    selected ? `${color.bg} ${color.text} border-transparent ring-2 ${color.ring}` : "bg-muted/30 border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {STRAIN_TYPE_LABELS[t]}
                </button>
              );
            })}
          </div>
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
              className="space-y-5 overflow-hidden"
            >
              {/* Genetics + Lineage */}
              <Section title="Genetics">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Breeder">
                    <Input value={form.breeder ?? ""} onChange={(e) => set("breeder", e.target.value)} placeholder="e.g. DJ Short" />
                  </Field>
                  <Field label="Generation" helper="e.g. F1, S1, BX2">
                    <Input value={generation} onChange={(e) => setGeneration(e.target.value)} className="font-mono" />
                  </Field>
                </div>
                <Field label="Genetics" helper={geneticsPreview ? `Auto-suggestion: ${geneticsPreview}` : "Parentage description"}>
                  <Input value={form.genetics ?? geneticsPreview} onChange={(e) => set("genetics", e.target.value)} placeholder="e.g. Girl Scout Cookies × OG Kush" />
                </Field>
                <ParentPicker
                  label="Mother"
                  mode={motherMode}
                  setMode={setMotherMode}
                  strainId={motherStrainId}
                  setStrainId={setMotherStrainId}
                  externalName={motherExternal}
                  setExternalName={setMotherExternal}
                  library={libraryStrains}
                />
                <ParentPicker
                  label="Father"
                  mode={fatherMode}
                  setMode={setFatherMode}
                  strainId={fatherStrainId}
                  setStrainId={setFatherStrainId}
                  externalName={fatherExternal}
                  setExternalName={setFatherExternal}
                  library={libraryStrains}
                />
              </Section>

              {/* Characteristics */}
              <Section title="Characteristics">
                <TagPicker
                  label="Dominant Terpenes"
                  options={[...COMMON_TERPENES]}
                  selected={form.dominant_terpenes ?? []}
                  onToggle={(v) => toggleArrayValue("dominant_terpenes", v)}
                  onRemove={(v) => toggleArrayValue("dominant_terpenes", v)}
                  customValue={customTerpene}
                  setCustomValue={setCustomTerpene}
                  onAddCustom={() => addCustomTag("dominant_terpenes", customTerpene, () => setCustomTerpene(""))}
                  colorMap={TERPENE_COLORS}
                />
                <TagPicker
                  label="Flavor Profile"
                  options={[...COMMON_FLAVORS]}
                  selected={form.flavor_profile ?? []}
                  onToggle={(v) => toggleArrayValue("flavor_profile", v)}
                  onRemove={(v) => toggleArrayValue("flavor_profile", v)}
                  customValue={customFlavor}
                  setCustomValue={setCustomFlavor}
                  onAddCustom={() => addCustomTag("flavor_profile", customFlavor, () => setCustomFlavor(""))}
                />
                <TagPicker
                  label="Effects"
                  options={[...COMMON_EFFECTS]}
                  selected={form.effects ?? []}
                  onToggle={(v) => toggleArrayValue("effects", v)}
                  onRemove={(v) => toggleArrayValue("effects", v)}
                  customValue={customEffect}
                  setCustomValue={setCustomEffect}
                  onAddCustom={() => addCustomTag("effects", customEffect, () => setCustomEffect(""))}
                />
              </Section>

              {/* Cultivation data */}
              <Section title="Cultivation Data">
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Avg Flower Days">
                    <Input
                      type="number" min="0" max="365"
                      value={form.average_flower_days ?? ""}
                      onChange={(e) => set("average_flower_days", e.target.value ? Number(e.target.value) : null)}
                      className="font-mono"
                      placeholder="65"
                    />
                  </Field>
                  <Field label="Avg THC %" error={errors.average_thc_pct}>
                    <Input
                      type="number" step="0.1" min="0" max="100"
                      value={form.average_thc_pct ?? ""}
                      onChange={(e) => set("average_thc_pct", e.target.value ? Number(e.target.value) : null)}
                      className="font-mono"
                      placeholder="21.5"
                    />
                  </Field>
                  <Field label="Avg CBD %" error={errors.average_cbd_pct}>
                    <Input
                      type="number" step="0.1" min="0" max="100"
                      value={form.average_cbd_pct ?? ""}
                      onChange={(e) => set("average_cbd_pct", e.target.value ? Number(e.target.value) : null)}
                      className="font-mono"
                      placeholder="0.5"
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Difficulty">
                    <select
                      value={form.difficulty ?? ""}
                      onChange={(e) => set("difficulty", (e.target.value || null) as any)}
                      className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="">—</option>
                      {STRAIN_DIFFICULTIES.map((d) => <option key={d} value={d}>{STRAIN_DIFFICULTY_LABELS[d]}</option>)}
                    </select>
                  </Field>
                  <Field label="Preferred Env">
                    <select
                      value={form.preferred_environment ?? ""}
                      onChange={(e) => set("preferred_environment", (e.target.value || null) as any)}
                      className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="">—</option>
                      {STRAIN_ENVIRONMENTS.map((en) => <option key={en} value={en}>{STRAIN_ENVIRONMENT_LABELS[en]}</option>)}
                    </select>
                  </Field>
                  <Field label="Growth Pattern">
                    <select
                      value={form.growth_pattern ?? ""}
                      onChange={(e) => set("growth_pattern", (e.target.value || null) as any)}
                      className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="">—</option>
                      {STRAIN_GROWTH_PATTERNS.map((gp) => <option key={gp} value={gp}>{STRAIN_GROWTH_PATTERN_LABELS[gp]}</option>)}
                    </select>
                  </Field>
                </div>
              </Section>

              <Section title="Notes">
                <Field label="Description">
                  <textarea
                    value={form.description ?? ""}
                    onChange={(e) => set("description", e.target.value)}
                    rows={3}
                    placeholder="Free-form notes about growing this strain…"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  />
                </Field>
                <Field label="CCRS Notes" helper="Internal notes for CCRS submissions">
                  <Input value={form.ccrs_notes ?? ""} onChange={(e) => set("ccrs_notes", e.target.value)} />
                </Field>
              </Section>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ScrollableModal>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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

function ParentPicker({
  label, mode, setMode, strainId, setStrainId, externalName, setExternalName, library,
}: {
  label: string;
  mode: "library" | "external";
  setMode: (m: "library" | "external") => void;
  strainId: string; setStrainId: (id: string) => void;
  externalName: string; setExternalName: (n: string) => void;
  library: StrainOption[];
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="block text-[11px] uppercase tracking-wider font-medium text-muted-foreground">{label}</label>
        <div className="inline-flex rounded-md border border-border bg-muted/30 p-0.5">
          <button
            type="button"
            onClick={() => setMode("library")}
            className={cn("px-2 h-6 text-[10px] font-medium rounded", mode === "library" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            In library
          </button>
          <button
            type="button"
            onClick={() => setMode("external")}
            className={cn("px-2 h-6 text-[10px] font-medium rounded", mode === "external" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            External
          </button>
        </div>
      </div>
      {mode === "library" ? (
        <select
          value={strainId}
          onChange={(e) => setStrainId(e.target.value)}
          className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">— None —</option>
          {library.map((s) => <option key={s.id} value={s.id}>{s.name}{s.type ? ` (${s.type})` : ""}</option>)}
        </select>
      ) : (
        <Input value={externalName} onChange={(e) => setExternalName(e.target.value)} placeholder="e.g. Durban Poison" />
      )}
    </div>
  );
}

function TagPicker({
  label, options, selected, onToggle, onRemove, customValue, setCustomValue, onAddCustom, colorMap,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
  onRemove: (v: string) => void;
  customValue: string;
  setCustomValue: (v: string) => void;
  onAddCustom: () => void;
  colorMap?: Record<string, string>;
}) {
  const custom = selected.filter((s) => !options.includes(s));
  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] uppercase tracking-wider font-medium text-muted-foreground">{label}</label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const isSel = selected.includes(opt);
          const chipColor = isSel ? (colorMap?.[opt] ?? "bg-primary/15 text-primary") : "bg-muted/30 text-muted-foreground hover:text-foreground";
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onToggle(opt)}
              className={cn("inline-flex items-center h-7 px-2.5 rounded-full border text-[11px] font-medium transition-colors", isSel ? "border-transparent ring-1 ring-primary/30" : "border-border", chipColor)}
            >
              {opt}
            </button>
          );
        })}
        {custom.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full border border-transparent ring-1 ring-primary/30 bg-primary/15 text-primary text-[11px] font-medium">
            {v}
            <button type="button" onClick={() => onRemove(v)} className="p-0.5 rounded hover:bg-primary/20">
              <XIcon className="w-2.5 h-2.5" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <Input
          value={customValue}
          onChange={(e) => setCustomValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onAddCustom(); } }}
          placeholder="Add custom…"
          className="h-8 text-[12px]"
        />
        <Button type="button" size="sm" variant="outline" onClick={onAddCustom}>
          <Plus className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}
