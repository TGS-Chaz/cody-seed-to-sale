import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  FlaskConical, Loader2, Beaker, ClipboardCheck, Upload, ChevronDown, ChevronUp, Info, X, Plus,
} from "lucide-react";
import { toast } from "sonner";
import ScrollableModal, { ModalHeader } from "@/components/ui/scrollable-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { useOrg } from "@/lib/org";
import {
  useCreateQALot, useCreateQASample, useCreateQAResult, parseWCIAJSON,
  QALot, QASample, CreateQAResultInput,
} from "@/hooks/useQA";
import {
  QA_RESULT_LAB_TEST_STATUSES, QaResultLabTestStatus, COMMON_TERPENES, TERPENE_COLORS,
} from "@/lib/schema-enums";
import { cn } from "@/lib/utils";

// ─── Create QA Lot ──────────────────────────────────────────────────────────

interface BatchOption {
  id: string;
  barcode: string;
  product?: { name: string };
  strain?: { name: string };
  current_weight_grams: number | null;
  current_quantity: number | null;
}

export function CreateQALotModal({ open, onClose, onSuccess, initialBatchId }: {
  open: boolean; onClose: () => void; onSuccess?: (lot: QALot) => void; initialBatchId?: string;
}) {
  const { orgId } = useOrg();
  const createLot = useCreateQALot();
  const [batchId, setBatchId] = useState("");
  const [lotNumber, setLotNumber] = useState("");
  const [weight, setWeight] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [batches, setBatches] = useState<BatchOption[]>([]);

  useEffect(() => {
    if (!open || !orgId) return;
    setBatchId(initialBatchId ?? "");
    setLotNumber(`QA-${Date.now().toString().slice(-8)}`);
    setWeight("");
    setNotes("");
    (async () => {
      const { data: rows } = await supabase
        .from("grow_batches")
        .select("id, barcode, product_id, strain_id, current_weight_grams, current_quantity")
        .eq("org_id", orgId)
        .gt("current_quantity", 0)
        .order("created_at", { ascending: false });
      const productIds = Array.from(new Set(((rows ?? []) as any[]).map((r) => r.product_id).filter(Boolean)));
      const strainIds = Array.from(new Set(((rows ?? []) as any[]).map((r) => r.strain_id).filter(Boolean)));
      const [pRes, sRes] = await Promise.all([
        productIds.length > 0 ? supabase.from("grow_products").select("id, name").in("id", productIds) : Promise.resolve({ data: [] }),
        strainIds.length > 0 ? supabase.from("grow_strains").select("id, name").in("id", strainIds) : Promise.resolve({ data: [] }),
      ]);
      const pById = new Map<string, any>((pRes.data ?? []).map((p: any) => [p.id, p]));
      const sById = new Map<string, any>((sRes.data ?? []).map((s: any) => [s.id, s]));
      setBatches(((rows ?? []) as any[]).map((r) => ({
        id: r.id, barcode: r.barcode,
        product: pById.get(r.product_id) ?? null,
        strain: sById.get(r.strain_id) ?? null,
        current_weight_grams: r.current_weight_grams,
        current_quantity: r.current_quantity,
      })));
    })();
  }, [open, orgId, initialBatchId]);

  const selectedBatch = useMemo(() => batches.find((b) => b.id === batchId), [batches, batchId]);

  useEffect(() => {
    if (selectedBatch && !weight) {
      setWeight(String(selectedBatch.current_weight_grams ?? selectedBatch.current_quantity ?? ""));
    }
  }, [selectedBatch, weight]);

  const valid = !!batchId && !!lotNumber.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) { toast.error("Batch + lot number required"); return; }
    setSaving(true);
    try {
      const lot = await createLot({
        batch_id: batchId,
        lot_number: lotNumber.trim(),
        lot_weight_grams: weight ? Number(weight) : null,
        notes: notes.trim() || null,
      });
      toast.success(`QA Lot ${lot.lot_number} created`);
      onSuccess?.(lot);
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Create failed");
    } finally { setSaving(false); }
  };

  return (
    <ScrollableModal
      open={open}
      onClose={onClose}
      size="md"
      onSubmit={handleSubmit}
      header={<ModalHeader icon={<FlaskConical className="w-4 h-4 text-blue-500" />} title="Create QA Lot" subtitle="Segregate a batch for lab testing" />}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={!valid || saving} className="min-w-[120px] gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FlaskConical className="w-3.5 h-3.5" />}
            Create Lot
          </Button>
        </>
      }
    >
      <div className="p-6 space-y-4">
        <Field label="Batch" required>
          <select value={batchId} onChange={(e) => setBatchId(e.target.value)} className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="">— Select batch —</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.barcode} · {b.product?.name ?? "?"} · {b.strain?.name ?? "?"} · {Number(b.current_quantity ?? 0).toFixed(0)}g
              </option>
            ))}
          </select>
        </Field>
        {selectedBatch && (
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-[12px] grid grid-cols-3 gap-3">
            <div><div className="text-[10px] text-muted-foreground uppercase tracking-wider">Barcode</div><div className="font-mono font-semibold">{selectedBatch.barcode}</div></div>
            <div><div className="text-[10px] text-muted-foreground uppercase tracking-wider">Product</div><div>{selectedBatch.product?.name ?? "—"}</div></div>
            <div><div className="text-[10px] text-muted-foreground uppercase tracking-wider">Available</div><div className="font-mono">{Number(selectedBatch.current_quantity ?? 0).toFixed(0)}g</div></div>
          </div>
        )}
        <Field label="Lot number" required helper="Internal reference for this QA lot">
          <Input value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} className="font-mono" />
        </Field>
        <Field label="Lot weight (g)" helper="Auto-filled from batch. Edit if this lot covers a subset.">
          <div className="relative">
            <Input type="number" step="0.1" min="0" value={weight} onChange={(e) => setWeight(e.target.value)} className="font-mono pr-12" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">g</span>
          </div>
        </Field>
        <Field label="Notes">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
        </Field>
      </div>
    </ScrollableModal>
  );
}

// ─── Pull Sample ────────────────────────────────────────────────────────────

interface LotOption {
  id: string;
  lot_number: string;
  parent_batch_id: string;
  lot_weight_grams: number | null;
  status: string | null;
  batch?: { barcode: string };
}

export function CreateSampleModal({ open, onClose, onSuccess, initialLotId }: {
  open: boolean; onClose: () => void; onSuccess?: (sample: QASample) => void; initialLotId?: string;
}) {
  const { orgId } = useOrg();
  const createSample = useCreateQASample();
  const [lotId, setLotId] = useState("");
  const [labName, setLabName] = useState("");
  const [labLicense, setLabLicense] = useState("");
  const [weight, setWeight] = useState("");
  const [saving, setSaving] = useState(false);
  const [lots, setLots] = useState<LotOption[]>([]);

  useEffect(() => {
    if (!open || !orgId) return;
    setLotId(initialLotId ?? "");
    setLabName("");
    setLabLicense("");
    setWeight("");
    (async () => {
      const { data: rows } = await supabase
        .from("grow_qa_lots")
        .select("id, lot_number, parent_batch_id, lot_weight_grams, status")
        .eq("org_id", orgId)
        .in("status", ["created", "sampled"])
        .order("created_at", { ascending: false });
      const batchIds = Array.from(new Set(((rows ?? []) as any[]).map((r) => r.parent_batch_id)));
      const { data: batches } = batchIds.length > 0
        ? await supabase.from("grow_batches").select("id, barcode").in("id", batchIds)
        : { data: [] };
      const bById = new Map<string, any>((batches ?? []).map((b: any) => [b.id, b]));
      setLots(((rows ?? []) as any[]).map((r) => ({ ...r, batch: bById.get(r.parent_batch_id) ?? null })));
    })();
  }, [open, orgId, initialLotId]);

  const valid = !!lotId && Number(weight) > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) { toast.error("Lot + weight required"); return; }
    setSaving(true);
    try {
      const sample = await createSample({
        qa_lot_id: lotId,
        lab_name: labName.trim() || null,
        lab_license_number: labLicense.trim() || null,
        sample_weight_grams: Number(weight),
      });
      toast.success(`Sample pulled (${weight}g)`);
      onSuccess?.(sample);
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed");
    } finally { setSaving(false); }
  };

  return (
    <ScrollableModal
      open={open}
      onClose={onClose}
      size="md"
      onSubmit={handleSubmit}
      header={<ModalHeader icon={<Beaker className="w-4 h-4 text-amber-500" />} title="Pull sample" subtitle="Pull a testable sample from a QA lot" />}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={!valid || saving} className="min-w-[120px] gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Beaker className="w-3.5 h-3.5" />}
            Pull Sample
          </Button>
        </>
      }
    >
      <div className="p-6 space-y-4">
        <Field label="QA Lot" required>
          <select value={lotId} onChange={(e) => setLotId(e.target.value)} className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="">— Select lot —</option>
            {lots.map((l) => (
              <option key={l.id} value={l.id}>
                {l.lot_number} · {l.batch?.barcode ?? "?"} · {Number(l.lot_weight_grams ?? 0).toFixed(0)}g · {l.status}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Lab name">
            <Input value={labName} onChange={(e) => setLabName(e.target.value)} placeholder="e.g. Confidence Analytics" />
          </Field>
          <Field label="Lab license #">
            <Input value={labLicense} onChange={(e) => setLabLicense(e.target.value)} className="font-mono" />
          </Field>
        </div>
        <Field label="Sample weight (g)" required helper="Typical: 3-5g for flower">
          <div className="relative">
            <Input type="number" step="0.01" min="0" value={weight} onChange={(e) => setWeight(e.target.value)} className="font-mono pr-12" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">g</span>
          </div>
        </Field>
      </div>
    </ScrollableModal>
  );
}

// ─── Add Results ────────────────────────────────────────────────────────────

export function AddResultsModal({ open, onClose, onSuccess, initialLotId, initialSampleId }: {
  open: boolean; onClose: () => void; onSuccess?: () => void; initialLotId?: string; initialSampleId?: string;
}) {
  const { orgId } = useOrg();
  const createResult = useCreateQAResult();
  const [lotId, setLotId] = useState("");
  const [sampleId, setSampleId] = useState("");
  const [labName, setLabName] = useState("");
  const [labLicense, setLabLicense] = useState("");
  const [testDate, setTestDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [labTestStatus, setLabTestStatus] = useState<QaResultLabTestStatus>("Pass");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);

  // Potency
  const [thc, setThc] = useState("");
  const [thca, setThca] = useState("");
  const [d9, setD9] = useState("");
  const [cbd, setCbd] = useState("");
  const [cbda, setCbda] = useState("");
  const [cbg, setCbg] = useState("");
  const [cbn, setCbn] = useState("");
  // Terpenes
  const [totalTerp, setTotalTerp] = useState("");
  const [terpenes, setTerpenes] = useState<Array<{ name: string; value: string }>>([]);
  // Contaminants
  const [pestP, setPestP] = useState<boolean | null>(null);
  const [heavyP, setHeavyP] = useState<boolean | null>(null);
  const [microP, setMicroP] = useState<boolean | null>(null);
  const [mycoP, setMycoP] = useState<boolean | null>(null);
  const [solvP, setSolvP] = useState<boolean | null>(null);
  const [foreignP, setForeignP] = useState<boolean | null>(null);
  const [moisture, setMoisture] = useState("");
  const [waterAct, setWaterAct] = useState("");
  // COA
  const [coaUrls, setCoaUrls] = useState<string[]>([]);
  const [coaInput, setCoaInput] = useState("");
  // CCRS
  const [testName, setTestName] = useState("");
  const [testValue, setTestValue] = useState("");
  const [overallPass, setOverallPass] = useState<"auto" | "true" | "false">("auto");
  const [expDate, setExpDate] = useState("");
  const [notes, setNotes] = useState("");

  const [lots, setLots] = useState<LotOption[]>([]);
  const [samples, setSamples] = useState<Array<{ id: string; qa_lot_id: string; lab_name: string | null; sample_weight_grams: number }>>([]);

  useEffect(() => {
    if (!open || !orgId) return;
    setLotId(initialLotId ?? "");
    setSampleId(initialSampleId ?? "");
    setLabName(""); setLabLicense("");
    setTestDate(new Date().toISOString().slice(0, 10));
    setLabTestStatus("Pass");
    setShowAdvanced(false);
    setThc(""); setThca(""); setD9(""); setCbd(""); setCbda(""); setCbg(""); setCbn("");
    setTotalTerp(""); setTerpenes([]);
    setPestP(null); setHeavyP(null); setMicroP(null); setMycoP(null); setSolvP(null); setForeignP(null);
    setMoisture(""); setWaterAct("");
    setCoaUrls([]); setCoaInput("");
    setTestName(""); setTestValue(""); setOverallPass("auto");
    setExpDate(""); setNotes("");
    (async () => {
      const { data: lotRows } = await supabase
        .from("grow_qa_lots").select("id, lot_number, parent_batch_id, lot_weight_grams, status").eq("org_id", orgId)
        .order("created_at", { ascending: false });
      const batchIds = Array.from(new Set(((lotRows ?? []) as any[]).map((r) => r.parent_batch_id)));
      const { data: batches } = batchIds.length > 0
        ? await supabase.from("grow_batches").select("id, barcode").in("id", batchIds)
        : { data: [] };
      const bById = new Map<string, any>((batches ?? []).map((b: any) => [b.id, b]));
      setLots(((lotRows ?? []) as any[]).map((r) => ({ ...r, batch: bById.get(r.parent_batch_id) ?? null })));
      const { data: sampleRows } = await supabase
        .from("grow_qa_samples").select("id, qa_lot_id, lab_name, sample_weight_grams").eq("org_id", orgId);
      setSamples((sampleRows ?? []) as any);
    })();
  }, [open, orgId, initialLotId, initialSampleId]);

  const samplesForLot = useMemo(() => samples.filter((s) => s.qa_lot_id === lotId), [samples, lotId]);

  // Auto-fill lab info from selected sample
  useEffect(() => {
    const s = samples.find((x) => x.id === sampleId);
    if (s && s.lab_name && !labName) setLabName(s.lab_name);
  }, [sampleId, samples, labName]);

  const addTerpene = () => setTerpenes((t) => [...t, { name: "Myrcene", value: "" }]);
  const removeTerpene = (i: number) => setTerpenes((t) => t.filter((_, idx) => idx !== i));
  const updateTerpene = (i: number, patch: Partial<{ name: string; value: string }>) => {
    setTerpenes((t) => t.map((x, idx) => idx === i ? { ...x, ...patch } : x));
  };

  const addCoaUrl = () => {
    const v = coaInput.trim();
    if (!v) return;
    setCoaUrls((u) => [...u, v]);
    setCoaInput("");
  };
  const removeCoaUrl = (i: number) => setCoaUrls((u) => u.filter((_, idx) => idx !== i));

  const valid = !!lotId && !!testDate && !!labTestStatus;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) { toast.error("Lot + date + status required"); return; }
    setSaving(true);
    try {
      const terpeneData: Record<string, number> = {};
      for (const t of terpenes) {
        if (t.name && t.value) terpeneData[t.name] = Number(t.value);
      }
      const input: CreateQAResultInput = {
        qa_lot_id: lotId,
        qa_sample_id: sampleId || null,
        lab_name: labName.trim() || null,
        lab_license_number: labLicense.trim() || null,
        test_date: testDate,
        test_name: testName.trim() || null,
        test_value: testValue.trim() || null,
        lab_test_status: labTestStatus,
        overall_pass: overallPass === "auto" ? null : overallPass === "true",
        source_type: "manual",
        thc_total_pct: thc ? Number(thc) : null,
        thc_a_pct: thca ? Number(thca) : null,
        thc_delta9_pct: d9 ? Number(d9) : null,
        cbd_total_pct: cbd ? Number(cbd) : null,
        cbd_a_pct: cbda ? Number(cbda) : null,
        cbg_pct: cbg ? Number(cbg) : null,
        cbn_pct: cbn ? Number(cbn) : null,
        total_terpenes_pct: totalTerp ? Number(totalTerp) : null,
        terpene_data: Object.keys(terpeneData).length > 0 ? terpeneData : null,
        pesticides_pass: pestP,
        heavy_metals_pass: heavyP,
        microbials_pass: microP,
        mycotoxins_pass: mycoP,
        residual_solvents_pass: solvP,
        foreign_matter_pass: foreignP,
        moisture_pct: moisture ? Number(moisture) : null,
        water_activity: waterAct ? Number(waterAct) : null,
        coa_urls: coaUrls.length > 0 ? coaUrls : null,
        expiration_date: expDate || null,
        notes: notes.trim() || null,
      };
      await createResult(input);
      toast.success("Results saved");
      onSuccess?.();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Save failed");
    } finally { setSaving(false); }
  };

  return (
    <ScrollableModal
      open={open}
      onClose={onClose}
      size="md"
      onSubmit={handleSubmit}
      header={<ModalHeader icon={<ClipboardCheck className="w-4 h-4 text-emerald-500" />} title="Add lab results" subtitle="Record test outcomes for a QA lot" />}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={!valid || saving} className="min-w-[120px] gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ClipboardCheck className="w-3.5 h-3.5" />}
            Save Results
          </Button>
        </>
      }
    >
      <div className="p-6 space-y-4">
        <Field label="QA Lot" required>
          <select value={lotId} onChange={(e) => setLotId(e.target.value)} className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="">— Select lot —</option>
            {lots.map((l) => <option key={l.id} value={l.id}>{l.lot_number} · {l.batch?.barcode ?? "?"}</option>)}
          </select>
        </Field>
        {samplesForLot.length > 0 && (
          <Field label="Sample (optional)">
            <select value={sampleId} onChange={(e) => setSampleId(e.target.value)} className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="">— No specific sample —</option>
              {samplesForLot.map((s) => <option key={s.id} value={s.id}>{s.id.slice(0, 8)} · {s.lab_name ?? "—"} · {s.sample_weight_grams}g</option>)}
            </select>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Lab name"><Input value={labName} onChange={(e) => setLabName(e.target.value)} /></Field>
          <Field label="Lab license #"><Input value={labLicense} onChange={(e) => setLabLicense(e.target.value)} className="font-mono" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Test date" required><Input type="date" value={testDate} onChange={(e) => setTestDate(e.target.value)} /></Field>
          <Field label="CCRS lab test status" required>
            <select value={labTestStatus} onChange={(e) => setLabTestStatus(e.target.value as QaResultLabTestStatus)} className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              {QA_RESULT_LAB_TEST_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        </div>

        <button type="button" onClick={() => setShowAdvanced((v) => !v)} className="flex items-center gap-1.5 text-[12px] font-medium text-primary hover:text-primary/80 pt-1">
          {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {showAdvanced ? "Hide all fields" : "Show all fields"}
        </button>

        <AnimatePresence initial={false}>
          {showAdvanced && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="space-y-5 overflow-hidden">
              <Section title="Potency">
                <div className="grid grid-cols-2 gap-3">
                  <NumField label="THC Total %" value={thc} onChange={setThc} />
                  <NumField label="THC-A %" value={thca} onChange={setThca} />
                  <NumField label="Delta-9 THC %" value={d9} onChange={setD9} />
                  <NumField label="CBD Total %" value={cbd} onChange={setCbd} />
                  <NumField label="CBD-A %" value={cbda} onChange={setCbda} />
                  <NumField label="CBG %" value={cbg} onChange={setCbg} />
                  <NumField label="CBN %" value={cbn} onChange={setCbn} />
                </div>
              </Section>

              <Section title="Terpenes">
                <NumField label="Total terpenes %" value={totalTerp} onChange={setTotalTerp} />
                {terpenes.length > 0 && (
                  <div className="space-y-2">
                    {terpenes.map((t, i) => {
                      const color = TERPENE_COLORS[t.name] ?? "bg-muted text-muted-foreground";
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <select value={t.name} onChange={(e) => updateTerpene(i, { name: e.target.value })} className={cn("h-9 px-3 rounded-md border border-border text-[12px] flex-1", color)}>
                            {COMMON_TERPENES.map((n) => <option key={n} value={n}>{n}</option>)}
                          </select>
                          <div className="relative w-28">
                            <Input type="number" step="0.01" min="0" value={t.value} onChange={(e) => updateTerpene(i, { value: e.target.value })} className="font-mono h-9 pr-8" placeholder="0.00" />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">%</span>
                          </div>
                          <button type="button" onClick={() => removeTerpene(i)} className="p-1 text-muted-foreground hover:text-destructive">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <button type="button" onClick={addTerpene} className="flex items-center gap-1.5 text-[12px] font-medium text-primary hover:text-primary/80">
                  <Plus className="w-3.5 h-3.5" /> Add terpene
                </button>
              </Section>

              <Section title="Contaminants">
                <div className="grid grid-cols-2 gap-2">
                  <PassFailToggle label="Pesticides" value={pestP} onChange={setPestP} />
                  <PassFailToggle label="Heavy Metals" value={heavyP} onChange={setHeavyP} />
                  <PassFailToggle label="Microbials" value={microP} onChange={setMicroP} />
                  <PassFailToggle label="Mycotoxins" value={mycoP} onChange={setMycoP} />
                  <PassFailToggle label="Residual Solvents" value={solvP} onChange={setSolvP} />
                  <PassFailToggle label="Foreign Matter" value={foreignP} onChange={setForeignP} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <NumField label="Moisture %" value={moisture} onChange={setMoisture} />
                  <NumField label="Water Activity" value={waterAct} onChange={setWaterAct} />
                </div>
              </Section>

              <Section title="Documents">
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input value={coaInput} onChange={(e) => setCoaInput(e.target.value)} placeholder="https://lab.example.com/coa.pdf" className="flex-1" />
                    <Button type="button" variant="outline" onClick={addCoaUrl} disabled={!coaInput.trim()}>Add</Button>
                  </div>
                  {coaUrls.length > 0 && (
                    <ul className="space-y-1">
                      {coaUrls.map((u, i) => (
                        <li key={i} className="flex items-center gap-2 text-[11px]">
                          <span className="flex-1 font-mono truncate">{u}</span>
                          <button type="button" onClick={() => removeCoaUrl(i)} className="p-1 text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex items-start gap-2 rounded-lg bg-muted/30 border border-border p-3 text-[11px]">
                  <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" />
                  <span>COA file upload via Supabase Storage — coming soon. For now paste the URL.</span>
                </div>
              </Section>

              <Section title="CCRS">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Test name" helper="e.g. Cannabinoid D9 THCA Percent"><Input value={testName} onChange={(e) => setTestName(e.target.value)} /></Field>
                  <Field label="Test value"><Input value={testValue} onChange={(e) => setTestValue(e.target.value)} className="font-mono" /></Field>
                </div>
              </Section>

              <Section title="Overall">
                <Field label="Overall pass" helper="Auto derives from contaminants + status. Override if needed.">
                  <div className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5 w-full">
                    {(["auto", "true", "false"] as const).map((v) => (
                      <button key={v} type="button" onClick={() => setOverallPass(v)} className={cn("flex-1 h-9 text-[12px] font-medium rounded-md transition-colors", overallPass === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                        {v === "auto" ? "Auto" : v === "true" ? "Pass" : "Fail"}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Expiration date"><Input type="date" value={expDate} onChange={(e) => setExpDate(e.target.value)} /></Field>
              </Section>

              <Field label="Notes">
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
              </Field>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ScrollableModal>
  );
}

// ─── Import JSON ────────────────────────────────────────────────────────────

export function ImportJSONModal({ open, onClose, onSuccess }: {
  open: boolean; onClose: () => void; onSuccess?: () => void;
}) {
  const { orgId } = useOrg();
  const createResult = useCreateQAResult();
  const [jsonText, setJsonText] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [lotId, setLotId] = useState("");
  const [lots, setLots] = useState<LotOption[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !orgId) return;
    setJsonText(""); setParseError(null); setLotId("");
    (async () => {
      const { data: rows } = await supabase.from("grow_qa_lots").select("id, lot_number, parent_batch_id, lot_weight_grams, status").eq("org_id", orgId).order("created_at", { ascending: false });
      const batchIds = Array.from(new Set(((rows ?? []) as any[]).map((r) => r.parent_batch_id)));
      const { data: batches } = batchIds.length > 0
        ? await supabase.from("grow_batches").select("id, barcode").in("id", batchIds)
        : { data: [] };
      const bById = new Map<string, any>((batches ?? []).map((b: any) => [b.id, b]));
      setLots(((rows ?? []) as any[]).map((r) => ({ ...r, batch: bById.get(r.parent_batch_id) ?? null })));
    })();
  }, [open, orgId]);

  const parsed = useMemo(() => {
    if (!jsonText.trim() || !lotId) return null;
    try {
      const obj = JSON.parse(jsonText);
      setParseError(null);
      return parseWCIAJSON(obj, lotId);
    } catch (err: any) {
      setParseError(err?.message ?? "Invalid JSON");
      return null;
    }
  }, [jsonText, lotId]);

  const previewRows = useMemo(() => {
    if (!parsed) return [];
    return [
      ["Lab", parsed.lab_name ?? "—"],
      ["Test date", parsed.test_date],
      ["THC total", parsed.thc_total_pct != null ? `${parsed.thc_total_pct}%` : "—"],
      ["CBD total", parsed.cbd_total_pct != null ? `${parsed.cbd_total_pct}%` : "—"],
      ["Total terpenes", parsed.total_terpenes_pct != null ? `${parsed.total_terpenes_pct}%` : "—"],
      ["Pesticides", passLabel(parsed.pesticides_pass)],
      ["Heavy metals", passLabel(parsed.heavy_metals_pass)],
      ["Microbials", passLabel(parsed.microbials_pass)],
      ["Mycotoxins", passLabel(parsed.mycotoxins_pass)],
      ["Residual solvents", passLabel(parsed.residual_solvents_pass)],
      ["Foreign matter", passLabel(parsed.foreign_matter_pass)],
    ];
  }, [parsed]);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setJsonText(String(reader.result));
    reader.readAsText(file);
  };

  const valid = !!parsed && !!lotId;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) { toast.error("Pick a lot and paste valid JSON"); return; }
    setSaving(true);
    try {
      await createResult(parsed!);
      toast.success("WCIA results imported");
      onSuccess?.();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Import failed");
    } finally { setSaving(false); }
  };

  return (
    <ScrollableModal
      open={open}
      onClose={onClose}
      size="md"
      onSubmit={handleSubmit}
      header={<ModalHeader icon={<Upload className="w-4 h-4 text-purple-500" />} title="Import lab results from JSON" subtitle="WCIA JSON format or lab API response" />}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={!valid || saving} className="min-w-[120px] gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            Import
          </Button>
        </>
      }
    >
      <div className="p-6 space-y-4">
        <Field label="QA Lot" required>
          <select value={lotId} onChange={(e) => setLotId(e.target.value)} className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="">— Select lot —</option>
            {lots.map((l) => <option key={l.id} value={l.id}>{l.lot_number} · {l.batch?.barcode ?? "?"}</option>)}
          </select>
        </Field>
        <div className="space-y-1.5">
          <label className="flex items-center justify-between">
            <span className="block text-[11px] uppercase tracking-wider font-medium text-muted-foreground">JSON</span>
            <label className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline cursor-pointer">
              <Upload className="w-3 h-3" />
              Upload file
              <input type="file" accept=".json,application/json" className="hidden" onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }} />
            </label>
          </label>
          <textarea value={jsonText} onChange={(e) => setJsonText(e.target.value)} rows={8} placeholder='{"lab": {...}, "results": [...]}' className="w-full rounded-lg border border-input bg-background px-3 py-2 text-[11px] font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
          {parseError && <p className="text-[11px] text-destructive">{parseError}</p>}
        </div>
        {parsed && (
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Parsed preview</h3>
            <dl className="divide-y divide-border/50">
              {previewRows.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[160px_1fr] py-1.5 text-[12px]">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="font-mono">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </ScrollableModal>
  );
}

function passLabel(v: boolean | null | undefined): string {
  if (v === true) return "Pass";
  if (v === false) return "Fail";
  return "—";
}

// ─── primitives ─────────────────────────────────────────────────────────────

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

function NumField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <div className="relative">
        <Input type="number" step="0.01" min="0" value={value} onChange={(e) => onChange(e.target.value)} className="font-mono pr-8" placeholder="0.00" />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">%</span>
      </div>
    </Field>
  );
}

function PassFailToggle({ label, value, onChange }: { label: string; value: boolean | null; onChange: (v: boolean | null) => void }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2">
      <span className="text-[12px] font-medium">{label}</span>
      <div className="inline-flex rounded-md border border-border overflow-hidden">
        <button type="button" onClick={() => onChange(value === null ? true : null)} className={cn("px-2 py-0.5 text-[10px] font-semibold transition-colors", value === true ? "bg-emerald-500/20 text-emerald-500" : "bg-muted text-muted-foreground/60 hover:bg-muted/80")}>PASS</button>
        <button type="button" onClick={() => onChange(value === null ? false : null)} className={cn("px-2 py-0.5 text-[10px] font-semibold transition-colors border-l border-border", value === false ? "bg-destructive/20 text-destructive" : "bg-muted text-muted-foreground/60 hover:bg-muted/80")}>FAIL</button>
      </div>
    </div>
  );
}
