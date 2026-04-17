import { useState } from "react";
import { FileUp, Sparkles, CheckCircle2, AlertTriangle, Loader2, FileText, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import ScrollableModal, { ModalHeader } from "@/components/ui/scrollable-modal";
import { callEdgeFunction } from "@/lib/edge-function";

export interface COAExtraction {
  lab_name: string | null;
  lab_license_number: string | null;
  lab_sample_id: string | null;
  test_date: string | null;
  report_date: string | null;
  batch_barcode: string | null;
  tested_external_id: string | null;
  product_name: string | null;
  potency: {
    thca_pct: number | null;
    thc_pct: number | null;
    total_thc_pct: number | null;
    cbda_pct: number | null;
    cbd_pct: number | null;
    total_cbd_pct: number | null;
    total_cannabinoids_pct: number | null;
    total_terpenes_pct: number | null;
  };
  pesticides_pass: boolean | null;
  heavy_metals_pass: boolean | null;
  microbials_pass: boolean | null;
  mycotoxins_pass: boolean | null;
  residual_solvents_pass: boolean | null;
  water_activity_pass: boolean | null;
  moisture_content_pass: boolean | null;
  moisture_content_pct: number | null;
  water_activity: number | null;
  overall_result: "Pass" | "Fail" | "FailExtractableOnly" | "FailRetestAllowed" | null;
  notes: string | null;
  confidence: "high" | "medium" | "low";
}

interface COAExtractorProps {
  open: boolean;
  onClose: () => void;
  /** Called after the user confirms the extraction. Parent should prefill their add-result flow. */
  onExtracted: (data: COAExtraction) => void;
}

const ACCEPTED_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

/**
 * Modal that accepts a COA PDF/image, sends it to the ask-cody Edge Function
 * with intent=extract_coa, and surfaces the extracted JSON for review.
 */
export default function COAExtractor({ open, onClose, onExtracted }: COAExtractorProps) {
  const [file, setFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extraction, setExtraction] = useState<COAExtraction | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setFile(null); setExtraction(null); setError(null); setExtracting(false);
  };

  const handleFile = (f: File) => {
    setError(null); setExtraction(null);
    if (!ACCEPTED_MIME.includes(f.type)) {
      setError(`Unsupported file type: ${f.type}. Upload a PDF or image (JPG/PNG/WEBP).`);
      return;
    }
    if (f.size > 15 * 1024 * 1024) {
      setError("File too large — limit is 15 MB.");
      return;
    }
    setFile(f);
  };

  const extract = async () => {
    if (!file) return;
    setExtracting(true); setError(null);
    try {
      const base64 = await fileToBase64(file);
      const res = await callEdgeFunction<{ extraction: COAExtraction; tokens_used: number; model: string }>(
        "ask-cody",
        { intent: "extract_coa", attachment: { base64, mime_type: file.type as any, filename: file.name } },
        90_000,
      );
      setExtraction(res.extraction);
      toast.success(`COA extracted — confidence: ${res.extraction.confidence}`);
    } catch (err: any) {
      const msg = err?.message ?? "Extraction failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setExtracting(false);
    }
  };

  const confirm = () => {
    if (!extraction) return;
    onExtracted(extraction);
    reset();
    onClose();
  };

  const closeAndReset = () => { reset(); onClose(); };

  return (
    <ScrollableModal
      open={open}
      onClose={closeAndReset}
      size="lg"
      header={<ModalHeader icon={<Sparkles className="w-4 h-4 text-purple-500" />} title="Extract COA with AI" subtitle="Upload a lab Certificate of Analysis — Cody will read the potency, contaminants, and overall pass/fail." />}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={closeAndReset}>Cancel</Button>
          {extraction ? (
            <Button onClick={confirm} className="gap-1.5 min-w-[150px]">
              <CheckCircle2 className="w-3.5 h-3.5" /> Use these values
            </Button>
          ) : (
            <Button onClick={extract} disabled={!file || extracting} className="gap-1.5 min-w-[150px]">
              {extracting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {extracting ? "Extracting…" : "Extract"}
            </Button>
          )}
        </>
      }
    >
      <div className="p-6 space-y-4">
        {!extraction ? (
          <>
            <label className="block">
              <div className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-accent/50 transition-colors ${file ? "border-primary/40 bg-primary/5" : "border-border"}`}>
                {file ? (
                  <div className="space-y-2">
                    <FileText className="w-8 h-8 mx-auto text-primary" />
                    <div className="text-[13px] font-medium">{file.name}</div>
                    <div className="text-[11px] text-muted-foreground">{(file.size / 1024).toFixed(0)} KB · {file.type}</div>
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); setFile(null); setExtraction(null); }}
                      className="text-[11px] text-muted-foreground hover:text-destructive inline-flex items-center gap-1"
                    >
                      <X className="w-3 h-3" /> Remove
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <FileUp className="w-8 h-8 mx-auto text-muted-foreground/60" />
                    <div className="text-[13px] font-medium">Drop a COA file here, or click to upload</div>
                    <div className="text-[11px] text-muted-foreground">PDF, JPG, PNG, WEBP · up to 15 MB</div>
                  </div>
                )}
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,image/jpeg,image/png,image/webp"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
              </div>
            </label>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[12px] text-destructive">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <div>{error}</div>
              </div>
            )}

            <div className="rounded-lg bg-muted/30 p-4 text-[11px] text-muted-foreground leading-relaxed">
              <div className="font-semibold text-foreground mb-1">What Cody extracts</div>
              Lab name + license, sample ID, test/report dates, potency (THC, THCA, CBD, CBDA, total terpenes),
              pass/fail for pesticides, heavy metals, microbials, mycotoxins, solvents, moisture + water activity,
              and an overall Pass/Fail.
            </div>
          </>
        ) : (
          <ExtractionReview data={extraction} />
        )}
      </div>
    </ScrollableModal>
  );
}

function ExtractionReview({ data }: { data: COAExtraction }) {
  const confidenceColor = data.confidence === "high" ? "text-emerald-500" : data.confidence === "medium" ? "text-amber-500" : "text-destructive";
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between py-1.5 border-b border-border/60 last:border-0">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-[12px] font-medium">{value ?? <span className="text-muted-foreground/50 italic">null</span>}</span>
    </div>
  );
  const passBadge = (v: boolean | null) => v == null ? <span className="text-muted-foreground/50 italic">—</span>
    : v ? <span className="inline-flex items-center h-5 px-2 rounded-full text-[10px] font-medium bg-emerald-500/15 text-emerald-500">PASS</span>
        : <span className="inline-flex items-center h-5 px-2 rounded-full text-[10px] font-medium bg-red-500/15 text-red-500">FAIL</span>;
  return (
    <div className="space-y-4">
      <div className={`flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 ${confidenceColor}`}>
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4" />
          <div>
            <div className="text-[12px] font-semibold">Extracted — review before applying</div>
            <div className="text-[10px] text-muted-foreground">Confidence: {data.confidence}. Adjust any field in the next step.</div>
          </div>
        </div>
        {data.overall_result && (
          <span className={`inline-flex items-center h-6 px-3 rounded-full text-[11px] font-semibold uppercase tracking-wider ${data.overall_result === "Pass" ? "bg-emerald-500/15 text-emerald-500" : "bg-red-500/15 text-red-500"}`}>
            {data.overall_result}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Lab + identification</h3>
          {row("Lab name", data.lab_name)}
          {row("Lab license", data.lab_license_number)}
          {row("Sample ID", data.lab_sample_id)}
          {row("Test date", data.test_date)}
          {row("Report date", data.report_date)}
          {row("Batch barcode", data.batch_barcode)}
          {row("Product", data.product_name)}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Potency</h3>
          {row("THCA", data.potency.thca_pct != null ? `${data.potency.thca_pct}%` : null)}
          {row("THC", data.potency.thc_pct != null ? `${data.potency.thc_pct}%` : null)}
          {row("Total THC", data.potency.total_thc_pct != null ? `${data.potency.total_thc_pct}%` : null)}
          {row("CBDA", data.potency.cbda_pct != null ? `${data.potency.cbda_pct}%` : null)}
          {row("CBD", data.potency.cbd_pct != null ? `${data.potency.cbd_pct}%` : null)}
          {row("Total CBD", data.potency.total_cbd_pct != null ? `${data.potency.total_cbd_pct}%` : null)}
          {row("Total cannabinoids", data.potency.total_cannabinoids_pct != null ? `${data.potency.total_cannabinoids_pct}%` : null)}
          {row("Total terpenes", data.potency.total_terpenes_pct != null ? `${data.potency.total_terpenes_pct}%` : null)}
        </div>

        <div className="rounded-lg border border-border bg-card p-4 md:col-span-2">
          <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Contaminant panels</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="flex justify-between text-[11px]"><span className="text-muted-foreground">Pesticides</span>{passBadge(data.pesticides_pass)}</div>
            <div className="flex justify-between text-[11px]"><span className="text-muted-foreground">Heavy metals</span>{passBadge(data.heavy_metals_pass)}</div>
            <div className="flex justify-between text-[11px]"><span className="text-muted-foreground">Microbials</span>{passBadge(data.microbials_pass)}</div>
            <div className="flex justify-between text-[11px]"><span className="text-muted-foreground">Mycotoxins</span>{passBadge(data.mycotoxins_pass)}</div>
            <div className="flex justify-between text-[11px]"><span className="text-muted-foreground">Res. solvents</span>{passBadge(data.residual_solvents_pass)}</div>
            <div className="flex justify-between text-[11px]"><span className="text-muted-foreground">Water activity</span>{passBadge(data.water_activity_pass)}</div>
            <div className="flex justify-between text-[11px]"><span className="text-muted-foreground">Moisture</span>{passBadge(data.moisture_content_pass)}</div>
          </div>
          <div className="mt-3 pt-3 border-t border-border/60 grid grid-cols-2 gap-2 text-[11px]">
            <div className="flex justify-between"><span className="text-muted-foreground">Moisture %</span><span className="font-mono">{data.moisture_content_pct ?? "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Water activity</span><span className="font-mono">{data.water_activity ?? "—"}</span></div>
          </div>
        </div>

        {data.notes && (
          <div className="rounded-lg border border-border bg-card p-4 md:col-span-2">
            <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Notes</h3>
            <p className="text-[12px]">{data.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // strip "data:<mime>;base64," prefix
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}
