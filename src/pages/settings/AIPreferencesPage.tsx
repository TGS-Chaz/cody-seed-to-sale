import { useEffect, useMemo, useState } from "react";
import {
  Sparkles, Leaf, Calendar, TrendingUp, Users, ShoppingCart,
  MessageCircle, Shield, Save, Loader2, Info, Bot,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/shared/PageHeader";
import { useCodyContext } from "@/hooks/useCodyContext";
import { useOrgSettings, OrgSettingsPatch, CodyPersonality } from "@/hooks/useOrgSettings";
import {
  CODY_RESPONSE_STYLES, CODY_RESPONSE_STYLE_LABELS, CodyResponseStyle,
  CODY_TONES, CODY_TONE_LABELS, CodyTone,
} from "@/lib/schema-enums";
import { cn } from "@/lib/utils";

type AiFeatureKey = keyof Pick<OrgSettingsPatch,
  | "enable_ai_yield_predictions"
  | "enable_ai_anomaly_detection"
  | "enable_ai_harvest_timing"
  | "enable_ai_crop_steering"
  | "enable_ai_task_assignment"
  | "enable_ai_smart_scheduling"
  | "enable_ai_compliance_reminders"
  | "enable_ai_customer_insights"
  | "enable_ai_price_optimization"
  | "enable_ai_demand_forecasting"
  | "enable_ai_smart_replies"
  | "enable_ai_note_summarization"
  | "enable_ai_report_narratives"
>;

interface FeatureDef {
  key: AiFeatureKey;
  label: string;
  description: string;
}

interface FeatureGroup {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  accentClass: string;
  features: FeatureDef[];
}

const FEATURE_GROUPS: FeatureGroup[] = [
  {
    title: "Cultivation AI",
    icon: Leaf,
    accentClass: "text-emerald-500 bg-emerald-500/15",
    features: [
      { key: "enable_ai_yield_predictions", label: "Yield Predictions", description: "Cody predicts harvest yields based on historical data" },
      { key: "enable_ai_anomaly_detection", label: "Anomaly Detection", description: "Get alerts when environmental data looks unusual" },
      { key: "enable_ai_harvest_timing", label: "Harvest Timing", description: "Cody suggests optimal harvest windows per strain" },
      { key: "enable_ai_crop_steering", label: "Crop Steering Recommendations", description: "AI-driven VPD and irrigation guidance" },
    ],
  },
  {
    title: "Operations AI",
    icon: Calendar,
    accentClass: "text-blue-500 bg-blue-500/15",
    features: [
      { key: "enable_ai_task_assignment", label: "Task Auto-Assignment", description: "Cody suggests the best team member for each task based on skills and availability" },
      { key: "enable_ai_smart_scheduling", label: "Smart Scheduling", description: "Optimize task schedules to minimize bottlenecks" },
      { key: "enable_ai_compliance_reminders", label: "Compliance Reminders", description: "Proactive alerts for expiring licenses, overdue calibrations, CCRS deadlines" },
    ],
  },
  {
    title: "Sales AI",
    icon: TrendingUp,
    accentClass: "text-purple-500 bg-purple-500/15",
    features: [
      { key: "enable_ai_customer_insights", label: "Customer Insights", description: "Cody analyzes buying patterns and suggests upsell opportunities" },
      { key: "enable_ai_price_optimization", label: "Price Optimization", description: "Suggest price adjustments based on market data from Cody Intel" },
      { key: "enable_ai_demand_forecasting", label: "Demand Forecasting", description: "Predict product demand based on sales history" },
    ],
  },
  {
    title: "Communication AI",
    icon: MessageCircle,
    accentClass: "text-amber-500 bg-amber-500/15",
    features: [
      { key: "enable_ai_smart_replies", label: "Smart Replies in Chat", description: "Cody suggests responses in team chat" },
      { key: "enable_ai_note_summarization", label: "Note Summarization", description: "Auto-summarize long account notes" },
      { key: "enable_ai_report_narratives", label: "Report Narratives", description: "Cody writes natural-language summaries of reports" },
    ],
  },
];

export default function AIPreferencesPage() {
  const { data: settings, loading, update, updateCodyPersonality } = useOrgSettings();
  const { setContext, clearContext } = useCodyContext();

  const [aiEnabled, setAiEnabled] = useState(true);
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [personality, setPersonality] = useState<CodyPersonality>({
    style: "balanced", tone: "professional", emojis: false, language: "en",
  });
  const [crossIntel, setCrossIntel] = useState(true);
  const [crossCrm, setCrossCrm] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setAiEnabled(settings.enable_ai_insights ?? true);
    const f: Record<string, boolean> = {};
    FEATURE_GROUPS.forEach((g) => g.features.forEach((feat) => {
      f[feat.key] = (settings[feat.key] as boolean | null) ?? true;
    }));
    setFeatures(f);
    setPersonality(settings.cody_personality ?? {
      style: "balanced", tone: "professional", emojis: false, language: "en",
    });
    setCrossIntel(settings.enable_cross_product_intel ?? true);
    setCrossCrm(settings.enable_cross_product_crm ?? true);
  }, [settings]);

  const enabledCount = useMemo(
    () => FEATURE_GROUPS.reduce((acc, g) => acc + g.features.filter((f) => features[f.key]).length, 0),
    [features],
  );
  const totalCount = useMemo(
    () => FEATURE_GROUPS.reduce((acc, g) => acc + g.features.length, 0),
    [],
  );

  // Cody context
  const sig = settings ? `${settings.enable_ai_insights}:${enabledCount}/${totalCount}` : "";
  const payload = useMemo(() => {
    if (!settings) return null;
    return {
      ai: {
        enabled: aiEnabled,
        features_enabled_count: enabledCount,
        features_total: totalCount,
        personality,
        cross_product_intel: crossIntel,
        cross_product_crm: crossCrm,
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  useEffect(() => {
    if (!payload) return;
    setContext({ context_type: "ai_preferences", page_data: payload });
    return () => clearContext();
  }, [setContext, clearContext, payload]);

  const toggleFeature = (key: AiFeatureKey) => {
    setFeatures((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const patch: OrgSettingsPatch = {
        enable_ai_insights: aiEnabled,
        enable_cross_product_intel: crossIntel,
        enable_cross_product_crm: crossCrm,
      };
      FEATURE_GROUPS.forEach((g) => g.features.forEach((f) => {
        (patch as any)[f.key] = features[f.key] ?? true;
      }));
      await update(patch);
      await updateCodyPersonality(personality);
      toast.success("AI preferences saved");
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      <PageHeader
        title="AI Preferences"
        description="Configure how Cody AI assists your team across the platform"
        breadcrumbs={[{ label: "Settings", to: "/settings" }, { label: "AI Preferences" }]}
        actions={
          <Button onClick={handleSave} disabled={saving} className="gap-1.5 min-w-[140px]">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save Preferences
          </Button>
        }
      />

      {/* ─── Status card ───────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-gradient-to-br from-primary/5 to-purple-500/5 p-6 mb-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br from-primary/20 to-purple-500/20 text-primary">
            <Sparkles className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-[16px] font-semibold text-foreground">Cody AI is {aiEnabled ? "enabled" : "disabled"}</h2>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary/15 text-primary uppercase tracking-wider">
                Enterprise — Full AI Access
              </span>
            </div>
            <p className="text-[12px] text-muted-foreground">
              {enabledCount}/{totalCount} AI features enabled. Usage tracking will surface here once the AI Gateway is wired.
            </p>
          </div>
          <label className="inline-flex items-center cursor-pointer select-none">
            <input
              type="checkbox"
              checked={aiEnabled}
              onChange={(e) => setAiEnabled(e.target.checked)}
              className="sr-only peer"
            />
            <div className="relative w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/20 rounded-full peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-background after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary" />
          </label>
        </div>
      </section>

      {/* ─── Feature groups ────────────────────────────────────────────────── */}
      {FEATURE_GROUPS.map((group) => (
        <section key={group.title} className="rounded-xl border border-border bg-card mb-6 overflow-hidden">
          <div className="px-6 py-3 border-b border-border flex items-center gap-2">
            <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center", group.accentClass)}>
              <group.icon className="w-3.5 h-3.5" />
            </div>
            <h3 className="text-[14px] font-semibold text-foreground">{group.title}</h3>
          </div>
          <ul className="divide-y divide-border">
            {group.features.map((f) => (
              <li key={f.key} className="px-6 py-3.5 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-foreground">{f.label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{f.description}</p>
                </div>
                <Toggle checked={!!features[f.key]} onChange={() => toggleFeature(f.key)} disabled={!aiEnabled} />
              </li>
            ))}
          </ul>
        </section>
      ))}

      {/* ─── Personality ───────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-card mb-6 overflow-hidden">
        <div className="px-6 py-3 border-b border-border flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-pink-500/15 text-pink-500">
            <Bot className="w-3.5 h-3.5" />
          </div>
          <h3 className="text-[14px] font-semibold text-foreground">Cody Personality</h3>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Response Style">
              <select
                value={personality.style}
                onChange={(e) => setPersonality((p) => ({ ...p, style: e.target.value as CodyResponseStyle }))}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {CODY_RESPONSE_STYLES.map((s) => <option key={s} value={s}>{CODY_RESPONSE_STYLE_LABELS[s]}</option>)}
              </select>
            </Field>
            <Field label="Tone">
              <select
                value={personality.tone}
                onChange={(e) => setPersonality((p) => ({ ...p, tone: e.target.value as CodyTone }))}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {CODY_TONES.map((t) => <option key={t} value={t}>{CODY_TONE_LABELS[t]}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3 items-end">
            <label className="flex items-center gap-2 cursor-pointer select-none h-10">
              <input
                type="checkbox"
                checked={personality.emojis}
                onChange={(e) => setPersonality((p) => ({ ...p, emojis: e.target.checked }))}
                className="w-4 h-4 rounded border-border accent-primary"
              />
              <span className="text-[13px] text-foreground">Include emojis in responses</span>
            </label>
            <Field label="Default Language">
              <select
                value={personality.language}
                onChange={(e) => setPersonality((p) => ({ ...p, language: e.target.value }))}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="en">English</option>
                <option value="es" disabled>Español (coming soon)</option>
              </select>
            </Field>
          </div>
        </div>
      </section>

      {/* ─── Data Access ───────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-card mb-6 overflow-hidden">
        <div className="px-6 py-3 border-b border-border flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-blue-500/15 text-blue-500">
            <Shield className="w-3.5 h-3.5" />
          </div>
          <h3 className="text-[14px] font-semibold text-foreground">Data Access</h3>
        </div>
        <div className="p-6 space-y-4">
          <div className="rounded-lg bg-muted/30 border border-border p-4 space-y-2 text-[12px]">
            <div className="flex items-start gap-2">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" />
              <div className="flex-1">
                <p className="text-foreground mb-1.5"><span className="font-semibold">Cody has read access to:</span> Plants, Batches, Orders, Accounts, Environmental Data, Tasks, Reports</p>
                <p className="text-muted-foreground mb-1.5"><span className="font-semibold text-foreground">Cody does NOT have access to:</span> SAW credentials, financial account numbers, employee SSNs</p>
                <p className="text-muted-foreground">
                  Cody conversations are stored in <code className="font-mono bg-background px-1 py-0.5 rounded">cody_conversations</code> and <code className="font-mono bg-background px-1 py-0.5 rounded">cody_messages</code>.
                </p>
              </div>
            </div>
          </div>

          <ul className="divide-y divide-border rounded-lg border border-border overflow-hidden">
            <li className="px-4 py-3 flex items-center gap-4">
              <Users className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-foreground">Cross-product: Cody CRM</p>
                <p className="text-[11px] text-muted-foreground">Allow Cody to reference customer and pipeline data from your Cody CRM</p>
              </div>
              <Toggle checked={crossCrm} onChange={() => setCrossCrm((v) => !v)} disabled={!aiEnabled} />
            </li>
            <li className="px-4 py-3 flex items-center gap-4">
              <ShoppingCart className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-foreground">Cross-product: Cody Intel</p>
                <p className="text-[11px] text-muted-foreground">Allow Cody to reference market intelligence, competitor pricing, and demand signals</p>
              </div>
              <Toggle checked={crossIntel} onChange={() => setCrossIntel((v) => !v)} disabled={!aiEnabled} />
            </li>
          </ul>
        </div>
      </section>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-1.5 min-w-[140px]">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save Preferences
        </Button>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <label className={cn("inline-flex items-center shrink-0", disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer")}>
      <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} className="sr-only peer" />
      <div className="relative w-10 h-5 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/20 rounded-full peer-checked:after:translate-x-[18px] after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-background after:border-border after:border after:rounded-full after:h-4 after:w-4 after:transition-transform peer-checked:bg-primary" />
    </label>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] uppercase tracking-wider font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
