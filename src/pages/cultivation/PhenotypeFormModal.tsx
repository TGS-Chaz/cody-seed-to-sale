import { useEffect, useState } from "react";
import { Loader2, Sparkles, Star } from "lucide-react";
import { toast } from "sonner";
import ScrollableModal, { ModalHeader } from "@/components/ui/scrollable-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { useOrg } from "@/lib/org";
import { Phenotype, PhenotypeInput } from "@/hooks/useStrains";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  strainId: string;
  defaultPhenoNumber: string;
  editing?: Phenotype | null;
  onSave: (input: PhenotypeInput) => Promise<Phenotype>;
}

interface PlantOption { id: string; plant_tag: string | null; is_mother_plant: boolean | null }

export default function PhenotypeFormModal({ open, onClose, strainId, defaultPhenoNumber, editing, onSave }: Props) {
  const isEdit = !!editing;
  const { orgId } = useOrg();

  const [phenoNumber, setPhenoNumber] = useState<string>(defaultPhenoNumber);
  const [phenoName, setPhenoName] = useState("");
  const [motherPlantId, setMotherPlantId] = useState<string>("");
  const [thcAvg, setThcAvg] = useState<string>("");
  const [cbdAvg, setCbdAvg] = useState<string>("");
  const [terpenesAvg, setTerpenesAvg] = useState<string>("");
  const [yieldAvg, setYieldAvg] = useState<string>("");
  const [flowerDaysAvg, setFlowerDaysAvg] = useState<string>("");
  const [isKeeper, setIsKeeper] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [motherPlants, setMotherPlants] = useState<PlantOption[]>([]);

  useEffect(() => {
    if (!open || !orgId) return;
    (async () => {
      // Load mother plants for this strain. is_mother_plant may not yet exist
      // in the schema — fall back to all plants for this strain on that error.
      const { data, error } = await supabase
        .from("grow_plants")
        .select("id, plant_tag, is_mother_plant")
        .eq("org_id", orgId)
        .eq("strain_id", strainId)
        .order("plant_tag");
      if (error) {
        const { data: fallback } = await supabase
          .from("grow_plants")
          .select("id, plant_tag")
          .eq("org_id", orgId)
          .eq("strain_id", strainId);
        setMotherPlants((fallback ?? []).map((p: any) => ({ ...p, is_mother_plant: null })) as PlantOption[]);
      } else {
        setMotherPlants(((data ?? []) as any[]).filter((p) => p.is_mother_plant !== false) as PlantOption[]);
      }
    })();
  }, [open, orgId, strainId]);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setPhenoNumber(editing.pheno_number);
      setPhenoName(editing.pheno_name ?? "");
      setMotherPlantId(editing.mother_plant_id ?? "");
      setThcAvg(editing.thc_avg != null ? String(editing.thc_avg) : "");
      setCbdAvg(editing.cbd_avg != null ? String(editing.cbd_avg) : "");
      setTerpenesAvg(editing.total_terpenes_avg != null ? String(editing.total_terpenes_avg) : "");
      setYieldAvg(editing.yield_avg_grams != null ? String(editing.yield_avg_grams) : "");
      setFlowerDaysAvg(editing.flower_days_avg != null ? String(editing.flower_days_avg) : "");
      setIsKeeper(editing.is_keeper);
      setNotes(editing.notes ?? "");
    } else {
      setPhenoNumber(defaultPhenoNumber);
      setPhenoName("");
      setMotherPlantId("");
      setThcAvg(""); setCbdAvg(""); setTerpenesAvg("");
      setYieldAvg(""); setFlowerDaysAvg("");
      setIsKeeper(false);
      setNotes("");
    }
  }, [open, editing, defaultPhenoNumber]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phenoNumber.trim()) { toast.error("Pheno number is required"); return; }
    const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));
    setSaving(true);
    try {
      await onSave({
        strain_id: strainId,
        pheno_number: phenoNumber.trim(),
        pheno_name: phenoName.trim() || null,
        mother_plant_id: motherPlantId || null,
        thc_avg: numOrNull(thcAvg),
        cbd_avg: numOrNull(cbdAvg),
        total_terpenes_avg: numOrNull(terpenesAvg),
        yield_avg_grams: numOrNull(yieldAvg),
        flower_days_avg: flowerDaysAvg ? Number(flowerDaysAvg) : null,
        is_keeper: isKeeper,
        notes: notes.trim() || null,
      });
      toast.success(isEdit ? "Phenotype updated" : "Phenotype added");
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
      header={
        <ModalHeader
          icon={<Sparkles className="w-4 h-4 text-primary" />}
          title={isEdit ? "Edit phenotype" : "New phenotype"}
          subtitle="Selected genetic expression of this strain"
        />
      }
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving} className="min-w-[100px]">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : isEdit ? "Save" : "Add"}
          </Button>
        </>
      }
    >
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-[120px_1fr] gap-3">
          <Field label="Number" required>
            <Input value={phenoNumber} onChange={(e) => setPhenoNumber(e.target.value)} className="font-mono" autoFocus />
          </Field>
          <Field label="Name">
            <Input value={phenoName} onChange={(e) => setPhenoName(e.target.value)} placeholder="e.g. Purple pheno" />
          </Field>
        </div>

        <Field label="Mother Plant" helper={motherPlants.length === 0 ? "No plants found for this strain yet" : "Plant this pheno descends from"}>
          <select
            value={motherPlantId}
            onChange={(e) => setMotherPlantId(e.target.value)}
            className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">— None —</option>
            {motherPlants.map((p) => <option key={p.id} value={p.id}>{p.plant_tag ?? p.id.slice(0, 8)}</option>)}
          </select>
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Avg THC %">
            <Input type="number" step="0.1" min="0" max="100" value={thcAvg} onChange={(e) => setThcAvg(e.target.value)} className="font-mono" placeholder="22.5" />
          </Field>
          <Field label="Avg CBD %">
            <Input type="number" step="0.1" min="0" max="100" value={cbdAvg} onChange={(e) => setCbdAvg(e.target.value)} className="font-mono" />
          </Field>
          <Field label="Total Terpenes %">
            <Input type="number" step="0.01" min="0" value={terpenesAvg} onChange={(e) => setTerpenesAvg(e.target.value)} className="font-mono" placeholder="2.5" />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Avg Yield (g)">
            <Input type="number" step="0.1" min="0" value={yieldAvg} onChange={(e) => setYieldAvg(e.target.value)} className="font-mono" placeholder="120" />
          </Field>
          <Field label="Avg Flower Days">
            <Input type="number" min="0" max="365" value={flowerDaysAvg} onChange={(e) => setFlowerDaysAvg(e.target.value)} className="font-mono" placeholder="65" />
          </Field>
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isKeeper}
            onChange={(e) => setIsKeeper(e.target.checked)}
            className="w-4 h-4 rounded border-border accent-primary"
          />
          <Star className={cn("w-3.5 h-3.5", isKeeper ? "text-amber-500 fill-amber-500" : "text-muted-foreground")} />
          <span className="text-[13px] text-foreground">Keeper</span>
        </label>

        <Field label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Terpene profile observations, vigor notes, unusual traits…"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
        </Field>
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
