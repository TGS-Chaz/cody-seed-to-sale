import { useEffect, useState } from "react";
import { Loader2, ScrollText, Camera } from "lucide-react";
import { toast } from "sonner";
import ScrollableModal, { ModalHeader } from "@/components/ui/scrollable-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useCreateGrowLog, GROW_LOG_TYPES, GROW_LOG_TYPE_LABELS, GrowLogInput,
} from "@/hooks/usePlants";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  plantId: string;
  onSuccess?: () => void;
  /** Pre-selects a log type — used when the caller knows what kind of entry
   * this is (e.g. "issue" or "milestone"). */
  initialType?: typeof GROW_LOG_TYPES[number];
}

export default function AddGrowLogModal({ open, onClose, plantId, onSuccess, initialType }: Props) {
  const createLog = useCreateGrowLog();
  const [type, setType] = useState<typeof GROW_LOG_TYPES[number]>("observation");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [recordedAt, setRecordedAt] = useState<string>(() => new Date().toISOString().slice(0, 16));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setType(initialType ?? "observation");
    setTitle("");
    setContent("");
    setRecordedAt(new Date().toISOString().slice(0, 16));
  }, [open, initialType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() && !content.trim()) {
      toast.error("Add a title or content");
      return;
    }
    setSaving(true);
    try {
      const input: GrowLogInput = {
        plant_id: plantId,
        log_type: type,
        title: title.trim() || null,
        content: content.trim() || null,
        recorded_at: new Date(recordedAt).toISOString(),
      };
      await createLog(input);
      toast.success("Log entry added");
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
      size="md"
      onSubmit={handleSubmit}
      header={
        <ModalHeader
          icon={<ScrollText className="w-4 h-4 text-primary" />}
          title="Add grow log entry"
          subtitle="Timestamped observations, techniques, and milestones"
        />
      }
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving} className="min-w-[100px]">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
          </Button>
        </>
      }
    >
      <div className="p-6 space-y-4">
        <div className="space-y-1.5">
          <label className="block text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Type</label>
          <div className="flex flex-wrap gap-1.5">
            {GROW_LOG_TYPES.filter((t) => t !== "measurement").map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={cn(
                  "inline-flex items-center h-7 px-2.5 rounded-full border text-[11px] font-medium transition-colors",
                  type === t
                    ? "bg-primary/15 border-primary/40 text-primary"
                    : "bg-muted/30 border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {GROW_LOG_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground/70">
            Use the Measurements tab for quantitative entries.
          </p>
        </div>

        <Field label="Title" helper="Short summary — e.g. 'Topped, removed 3rd node'">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </Field>

        <Field label="Content" helper="Supports markdown. Detail what happened and what you observed.">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={6}
            placeholder="What did you do? What did you notice? What's the next step?"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring resize-none font-mono text-[12px]"
          />
        </Field>

        <Field label="When">
          <Input type="datetime-local" value={recordedAt} onChange={(e) => setRecordedAt(e.target.value)} />
        </Field>

        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 flex items-center gap-2 text-[11px] text-muted-foreground">
          <Camera className="w-3.5 h-3.5" />
          <span>Photo uploads coming soon — reply with a link in the content for now.</span>
        </div>
      </div>
    </ScrollableModal>
  );
}

function Field({ label, helper, children }: { label: string; helper?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] uppercase tracking-wider font-medium text-muted-foreground">{label}</label>
      {children}
      {helper && <p className="text-[11px] text-muted-foreground/70">{helper}</p>}
    </div>
  );
}
