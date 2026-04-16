import { useEffect, useState } from "react";
import * as Icons from "lucide-react";
import { Loader2, StickyNote } from "lucide-react";
import { toast } from "sonner";
import ScrollableModal, { ModalHeader } from "@/components/ui/scrollable-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NoteAttribute, NoteAttributeInput, NOTE_ICON_OPTIONS } from "@/hooks/useNoteAttributes";
import { STATUS_COLORS } from "@/hooks/useAccountStatuses";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (input: NoteAttributeInput) => Promise<void>;
  editing?: NoteAttribute | null;
}

function renderIcon(name: string | null | undefined, className: string) {
  const IconComp = (Icons as any)[name ?? "FileText"] ?? Icons.FileText;
  return <IconComp className={className} />;
}

export default function NoteAttributeFormModal({ open, onClose, onSave, editing }: Props) {
  const isEdit = !!editing;
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string>("FileText");
  const [color, setColor] = useState<string>(STATUS_COLORS[0]);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setIcon(editing.icon ?? "FileText");
      setColor(editing.color ?? STATUS_COLORS[0]);
      setIsActive(editing.is_active);
    } else {
      setName("");
      setIcon("FileText");
      setColor(STATUS_COLORS[0]);
      setIsActive(true);
    }
    setError(null);
  }, [open, editing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError("Name is required"); return; }
    setSaving(true);
    try {
      await onSave({ name: name.trim(), icon, color, is_active: isActive });
      toast.success(isEdit ? "Attribute updated" : "Attribute created");
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
          icon={<StickyNote className="w-4 h-4 text-primary" />}
          title={isEdit ? "Edit note attribute" : "New note attribute"}
          subtitle="Tag a note with its type"
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
        <Field label="Name" required error={error ?? undefined}>
          <Input value={name} onChange={(e) => { setName(e.target.value); setError(null); }} placeholder="e.g. Sample Dropped" autoFocus />
        </Field>

        <div className="space-y-1.5">
          <label className="block text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Icon</label>
          <div className="grid grid-cols-9 gap-1.5">
            {NOTE_ICON_OPTIONS.map((iconName) => (
              <button
                key={iconName}
                type="button"
                onClick={() => setIcon(iconName)}
                className={cn(
                  "flex items-center justify-center w-8 h-8 rounded-md border transition-all",
                  icon === iconName ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
                aria-label={iconName}
              >
                {renderIcon(iconName, "w-3.5 h-3.5")}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Color</label>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={cn(
                  "w-7 h-7 rounded-full border-2 transition-all",
                  color === c ? "border-foreground scale-110" : "border-border/40 hover:scale-105",
                )}
                style={{ background: c }}
                aria-label={c}
              />
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none pt-1">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="w-4 h-4 rounded border-border accent-primary"
          />
          <span className="text-[13px] text-foreground">Active</span>
        </label>

        <div className="mt-4 pt-3 border-t border-border">
          <p className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground mb-2">Preview</p>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium" style={{ background: `${color}20`, color }}>
            {renderIcon(icon, "w-3 h-3")}
            {name || "Attribute name"}
          </div>
        </div>
      </div>
    </ScrollableModal>
  );
}

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}
