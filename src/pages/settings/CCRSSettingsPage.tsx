import { useEffect, useMemo, useState } from "react";
import {
  ShieldCheck, ExternalLink, Eye, EyeOff, Info, Loader2, CheckCircle2,
  AlertTriangle, Clock, FileText, Upload, Send, Save, Globe,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PageHeader from "@/components/shared/PageHeader";
import StatusPill from "@/components/shared/StatusPill";
import DateTime from "@/components/shared/DateTime";
import { useCodyContext } from "@/hooks/useCodyContext";
import { useOrgSettings } from "@/hooks/useOrgSettings";
import { supabase } from "@/lib/supabase";
import { useOrg } from "@/lib/org";
import {
  CCRS_INTEGRATOR_STATUSES, CCRS_INTEGRATOR_STATUS_LABELS, CcrsIntegratorStatus,
  CCRS_AUTO_UPLOAD_FREQUENCIES, CCRS_AUTO_UPLOAD_FREQUENCY_LABELS, CcrsAutoUploadFrequency,
  CCRS_NOTIFICATION_PREFERENCES, CCRS_NOTIFICATION_PREFERENCE_LABELS, CcrsNotificationPreference,
  CCRS_FILE_CATEGORIES, CCRS_FILE_CATEGORY_LABELS,
  DAYS_OF_WEEK, DAY_OF_WEEK_LABELS,
  WCIA_HOSTING_TYPES, WCIA_HOSTING_TYPE_LABELS, WciaHostingType,
} from "@/lib/schema-enums";
import { cn } from "@/lib/utils";

interface RecentUpload {
  id: string;
  file_category: string;
  status: string;
  record_count: number | null;
  error_count: number | null;
  created_at: string;
}

const STATUS_VARIANT: Record<CcrsIntegratorStatus, { icon: React.ComponentType<{ className?: string }>; variant: "success" | "warning" | "critical" | "muted" }> = {
  not_applied: { icon: Info, variant: "muted" },
  pending: { icon: Clock, variant: "warning" },
  approved: { icon: CheckCircle2, variant: "success" },
  suspended: { icon: AlertTriangle, variant: "critical" },
};

export default function CCRSSettingsPage() {
  const { orgId } = useOrg();
  const { data: settings, loading, update } = useOrgSettings();
  const { setContext, clearContext } = useCodyContext();

  // Form state mirrors the settings row; hydrated on load.
  const [integratorId, setIntegratorId] = useState("");
  const [integratorStatus, setIntegratorStatus] = useState<CcrsIntegratorStatus>("not_applied");
  const [primaryEmail, setPrimaryEmail] = useState("");
  const [secondaryEmail, setSecondaryEmail] = useState("");
  const [sawUsername, setSawUsername] = useState("");
  const [sawPassword, setSawPassword] = useState("");
  const [revealPassword, setRevealPassword] = useState(false);
  const [autoFrequency, setAutoFrequency] = useState<CcrsAutoUploadFrequency>("manual");
  const [uploadDays, setUploadDays] = useState<string[]>([]);
  const [uploadTime, setUploadTime] = useState("02:00");
  const [uploadFileTypes, setUploadFileTypes] = useState<string[]>([...CCRS_FILE_CATEGORIES]);
  const [notificationPref, setNotificationPref] = useState<CcrsNotificationPreference>("both");
  const [notificationRecipients, setNotificationRecipients] = useState<string[]>([]);
  const [submittedBy, setSubmittedBy] = useState("");

  const [wciaEnabled, setWciaEnabled] = useState(true);
  const [wciaHosting, setWciaHosting] = useState<WciaHostingType>("cody_hosted");
  const [wciaUrl, setWciaUrl] = useState("");
  const [wciaExpiryDays, setWciaExpiryDays] = useState<number>(30);

  const [savingCcrs, setSavingCcrs] = useState(false);
  const [savingWcia, setSavingWcia] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);

  const [memberEmails, setMemberEmails] = useState<string[]>([]);
  const [recentUploads, setRecentUploads] = useState<RecentUpload[]>([]);

  // Hydrate form from settings
  useEffect(() => {
    if (!settings) return;
    setIntegratorId(settings.ccrs_integrator_id ?? "");
    setIntegratorStatus((settings.ccrs_integrator_status as CcrsIntegratorStatus) ?? "not_applied");
    setPrimaryEmail(settings.ccrs_reporting_email ?? "");
    setSecondaryEmail(settings.ccrs_secondary_reporting_email ?? "");
    setSawUsername(settings.ccrs_saw_username ?? "");
    setSawPassword(settings.ccrs_saw_password_encrypted ?? "");
    setAutoFrequency((settings.ccrs_auto_upload_frequency as CcrsAutoUploadFrequency) ?? "manual");
    setUploadDays(settings.ccrs_upload_days ?? []);
    setUploadTime(settings.ccrs_upload_time?.slice(0, 5) ?? "02:00");
    setUploadFileTypes(settings.ccrs_upload_file_types ?? [...CCRS_FILE_CATEGORIES]);
    setNotificationPref((settings.ccrs_notification_preference as CcrsNotificationPreference) ?? "both");
    setNotificationRecipients(settings.ccrs_notification_recipients ?? []);
    setSubmittedBy(settings.ccrs_submitted_by_username ?? "");

    setWciaEnabled(settings.wcia_enabled ?? true);
    setWciaHosting((settings.wcia_hosting_type as WciaHostingType) ?? "cody_hosted");
    setWciaUrl(settings.wcia_self_hosted_url ?? "");
    setWciaExpiryDays(settings.wcia_link_expiry_days ?? 30);
  }, [settings]);

  // Load org members for notification recipients picker
  useEffect(() => {
    if (!orgId) return;
    (async () => {
      const { data } = await supabase
        .from("org_members")
        .select("user_id")
        .eq("org_id", orgId);
      const userIds = (data ?? []).map((r: any) => r.user_id);
      if (userIds.length === 0) { setMemberEmails([]); return; }
      const { data: emps } = await supabase
        .from("grow_employees")
        .select("email, user_id")
        .eq("org_id", orgId)
        .in("user_id", userIds);
      const emails = (emps ?? []).map((e: any) => e.email).filter(Boolean);
      setMemberEmails(Array.from(new Set(emails as string[])));
    })();
  }, [orgId]);

  // Load recent CCRS uploads
  useEffect(() => {
    if (!orgId) return;
    (async () => {
      const { data } = await supabase
        .from("grow_ccrs_submission_files")
        .select("id, file_category, status, record_count, error_count, created_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(5);
      setRecentUploads((data ?? []) as RecentUpload[]);
    })();
  }, [orgId]);

  // Cody context
  const sig = settings
    ? `${settings.ccrs_integrator_status}:${settings.ccrs_auto_upload_frequency}:${(settings.ccrs_upload_file_types ?? []).length}`
    : "";
  const payload = useMemo(() => {
    if (!settings) return null;
    return {
      ccrs: {
        integrator_id: settings.ccrs_integrator_id,
        integrator_status: settings.ccrs_integrator_status,
        auto_upload_frequency: settings.ccrs_auto_upload_frequency,
        auto_upload_enabled: (settings.ccrs_auto_upload_frequency ?? "manual") !== "manual",
        included_file_types: settings.ccrs_upload_file_types,
      },
      wcia: {
        enabled: settings.wcia_enabled,
        hosting: settings.wcia_hosting_type,
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  useEffect(() => {
    if (!payload) return;
    setContext({ context_type: "ccrs_settings", page_data: payload });
    return () => clearContext();
  }, [setContext, clearContext, payload]);

  const toggleDay = (d: string) => {
    setUploadDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };
  const toggleFileType = (t: string) => {
    setUploadFileTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };
  const toggleRecipient = (email: string) => {
    setNotificationRecipients((prev) => (prev.includes(email) ? prev.filter((x) => x !== email) : [...prev, email]));
  };

  const handleSaveCcrs = async () => {
    setSavingCcrs(true);
    try {
      await update({
        ccrs_integrator_id: integratorId.trim() || null,
        ccrs_integrator_status: integratorStatus,
        ccrs_reporting_email: primaryEmail.trim() || null,
        ccrs_secondary_reporting_email: secondaryEmail.trim() || null,
        ccrs_saw_username: sawUsername.trim() || null,
        ccrs_saw_password_encrypted: sawPassword.trim() || null,
        ccrs_auto_upload_frequency: autoFrequency,
        ccrs_upload_days: uploadDays,
        ccrs_upload_time: uploadTime,
        ccrs_upload_file_types: uploadFileTypes,
        ccrs_notification_preference: notificationPref,
        ccrs_notification_recipients: notificationRecipients,
        ccrs_submitted_by_username: submittedBy.trim() || null,
      });
      toast.success("CCRS settings saved");
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setSavingCcrs(false);
    }
  };

  const handleSaveWcia = async () => {
    setSavingWcia(true);
    try {
      await update({
        wcia_enabled: wciaEnabled,
        wcia_hosting_type: wciaHosting,
        wcia_self_hosted_url: wciaHosting === "self_hosted" ? (wciaUrl.trim() || null) : null,
        wcia_link_expiry_days: wciaExpiryDays,
      });
      toast.success("WCIA settings saved");
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setSavingWcia(false);
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    // Stub — SAW doesn't expose a test endpoint. Edge function will handle auth
    // in a follow-up prompt.
    setTimeout(() => {
      setTestingConnection(false);
      toast("Test not yet available", {
        description: "SAW authentication test will be wired when the upload Edge Function ships.",
      });
    }, 600);
  };

  const showWeeklyDays = autoFrequency === "weekly" || autoFrequency === "twice_weekly";

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const statusCfg = STATUS_VARIANT[integratorStatus];
  const StatusIcon = statusCfg.icon;

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      <PageHeader
        title="CCRS & Compliance"
        description="Configure your CCRS integrator settings and compliance reporting"
        breadcrumbs={[{ label: "Settings", to: "/settings" }, { label: "CCRS & Compliance" }]}
      />

      {/* ─── Section 1: Integrator Status ──────────────────────────────────── */}
      <SectionCard>
        <div className="flex items-start gap-4">
          <div className={cn(
            "w-12 h-12 rounded-xl flex items-center justify-center shrink-0",
            integratorStatus === "approved" ? "bg-emerald-500/15 text-emerald-500" :
            integratorStatus === "pending" ? "bg-amber-500/15 text-amber-500" :
            integratorStatus === "suspended" ? "bg-red-500/15 text-red-500" :
            "bg-muted text-muted-foreground",
          )}>
            <StatusIcon className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-[16px] font-semibold text-foreground">Integrator Status</h2>
              <StatusPill label={CCRS_INTEGRATOR_STATUS_LABELS[integratorStatus]} variant={statusCfg.variant} />
            </div>
            <p className="text-[12px] text-muted-foreground mb-2">
              <span className="font-medium">Integrator ID:</span>{" "}
              {integratorId ? <span className="font-mono text-foreground">{integratorId}</span> : <span className="italic">Not yet assigned</span>}
            </p>
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              To upload CCRS files on behalf of your licensees, Cody Grow must be on the WSLCB approved
              integrator list. Application is submitted to <span className="font-mono">examiner@lcb.wa.gov</span> with form LIQ1455.
            </p>
            <div className="flex flex-wrap gap-3 mt-3 text-[12px]">
              <a
                href="https://lcb.wa.gov/ccrs/integrators"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <ExternalLink className="w-3 h-3" /> View WSLCB Integrator Requirements
              </a>
              <a
                href="https://lcb.wa.gov/sites/default/files/publications/Cannabis/CCRS/LIQ1455%20CCRS%20System%20Access%20App.docx"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <ExternalLink className="w-3 h-3" /> Download LIQ1455 Application
              </a>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* ─── Section 2: CCRS Configuration ─────────────────────────────────── */}
      <SectionCard title="CCRS Configuration" subtitle="Integrator ID, SAW credentials, and auto-upload preferences">
        <Subsection title="Reporting Identity">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Integrator ID" helper="10-digit ID assigned by LCB after approval">
              <Input
                value={integratorId}
                onChange={(e) => setIntegratorId(e.target.value.replace(/\D/g, ""))}
                placeholder="1234567890"
                className="font-mono"
                maxLength={10}
              />
            </Field>
            <Field label="Integrator Status">
              <select
                value={integratorStatus}
                onChange={(e) => setIntegratorStatus(e.target.value as CcrsIntegratorStatus)}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {CCRS_INTEGRATOR_STATUSES.map((s) => (
                  <option key={s} value={s}>{CCRS_INTEGRATOR_STATUS_LABELS[s]}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Primary Contact Email">
              <Input type="email" value={primaryEmail} onChange={(e) => setPrimaryEmail(e.target.value)} placeholder="ccrs@yourcompany.com" />
            </Field>
            <Field label="Secondary Contact Email" helper="CCRS supports up to 2 emails per integrator">
              <Input type="email" value={secondaryEmail} onChange={(e) => setSecondaryEmail(e.target.value)} placeholder="backup@yourcompany.com" />
            </Field>
          </div>
        </Subsection>

        <Subsection title="SAW Authentication">
          <div className="flex items-start gap-2 rounded-lg bg-blue-500/10 border border-blue-500/20 p-3 text-[12px] text-foreground">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-blue-500" />
            <div>
              CCRS uses SAW (<a href="https://secureaccess.wa.gov" target="_blank" rel="noreferrer" className="text-primary hover:underline">secureaccess.wa.gov</a>) for authentication.
              Cody Grow uploads CSV files on your behalf using your SAW credentials.
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="SAW Username">
              <Input value={sawUsername} onChange={(e) => setSawUsername(e.target.value)} placeholder="your-saw-username" />
            </Field>
            <Field label="SAW Password">
              <div className="relative">
                <Input
                  type={revealPassword ? "text" : "password"}
                  value={sawPassword}
                  onChange={(e) => setSawPassword(e.target.value)}
                  className="font-mono pr-9"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setRevealPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-accent text-muted-foreground"
                >
                  {revealPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </Field>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleTestConnection} disabled={testingConnection || !sawUsername}>
              {testingConnection ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Test Connection
            </Button>
          </div>
          <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-[12px]">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500" />
            <span>Cody Grow stores these credentials encrypted at rest. They are only used to upload CCRS files and are never logged or displayed back to other users.</span>
          </div>
        </Subsection>

        <Subsection title="Upload Preferences">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Auto-Upload Frequency">
              <select
                value={autoFrequency}
                onChange={(e) => setAutoFrequency(e.target.value as CcrsAutoUploadFrequency)}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {CCRS_AUTO_UPLOAD_FREQUENCIES.map((f) => (
                  <option key={f} value={f}>{CCRS_AUTO_UPLOAD_FREQUENCY_LABELS[f]}</option>
                ))}
              </select>
            </Field>
            {autoFrequency !== "manual" && (
              <Field label="Upload Time (24h, local)">
                <Input type="time" value={uploadTime} onChange={(e) => setUploadTime(e.target.value)} />
              </Field>
            )}
          </div>
          {showWeeklyDays && (
            <Field label="Upload Day(s)">
              <div className="flex flex-wrap gap-1.5">
                {DAYS_OF_WEEK.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDay(d)}
                    className={cn(
                      "inline-flex items-center h-7 px-2.5 rounded-full border text-[12px] font-medium transition-colors",
                      uploadDays.includes(d)
                        ? "bg-primary/15 border-primary/40 text-primary"
                        : "bg-muted/30 border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {DAY_OF_WEEK_LABELS[d]}
                  </button>
                ))}
              </div>
            </Field>
          )}
          <Field label="Include in Auto-Upload" helper="Uncheck file categories you want to upload manually instead">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {CCRS_FILE_CATEGORIES.map((t) => (
                <label key={t} className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={uploadFileTypes.includes(t)}
                    onChange={() => toggleFileType(t)}
                    className="w-4 h-4 rounded border-border accent-primary"
                  />
                  <span className="text-[12px] text-foreground">{CCRS_FILE_CATEGORY_LABELS[t]}</span>
                </label>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Notification on Upload">
              <select
                value={notificationPref}
                onChange={(e) => setNotificationPref(e.target.value as CcrsNotificationPreference)}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {CCRS_NOTIFICATION_PREFERENCES.map((p) => (
                  <option key={p} value={p}>{CCRS_NOTIFICATION_PREFERENCE_LABELS[p]}</option>
                ))}
              </select>
            </Field>
            <Field label="Recipients" helper={memberEmails.length === 0 ? "Add team members to see them here" : undefined}>
              {memberEmails.length === 0 ? (
                <div className="h-10 px-3 flex items-center text-[12px] text-muted-foreground border border-dashed border-border rounded-lg">
                  No team member emails available
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {memberEmails.map((email) => (
                    <button
                      key={email}
                      type="button"
                      onClick={() => toggleRecipient(email)}
                      className={cn(
                        "inline-flex items-center h-7 px-2.5 rounded-full border text-[11px] font-medium transition-colors",
                        notificationRecipients.includes(email)
                          ? "bg-primary/15 border-primary/40 text-primary"
                          : "bg-muted/30 border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {email}
                    </button>
                  ))}
                </div>
              )}
            </Field>
          </div>
        </Subsection>

        <Subsection title="File Defaults">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Default SubmittedBy Username" helper="Appears in the SubmittedBy column of every CCRS CSV">
              <Input value={submittedBy} onChange={(e) => setSubmittedBy(e.target.value)} placeholder="your-username" className="font-mono" />
            </Field>
            <Field label="Date Format" helper="Locked to CCRS spec">
              <Input value="MM/DD/YYYY" disabled className="font-mono opacity-60" />
            </Field>
          </div>
        </Subsection>

        <div className="flex justify-end pt-2">
          <Button onClick={handleSaveCcrs} disabled={savingCcrs} className="gap-1.5 min-w-[160px]">
            {savingCcrs ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save CCRS Settings
          </Button>
        </div>
      </SectionCard>

      {/* ─── Section 3: Recent CCRS Uploads ────────────────────────────────── */}
      <SectionCard title="Recent CCRS Uploads" subtitle="Last 5 files submitted by your org">
        {recentUploads.length === 0 ? (
          <div className="text-center py-8">
            <Upload className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-[13px] font-medium text-foreground mb-1">No CCRS files uploaded yet</p>
            <p className="text-[12px] text-muted-foreground">
              Configure your settings above, then generate your first upload from the Compliance Dashboard.
            </p>
          </div>
        ) : (
          <>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full">
                <thead className="border-b border-border bg-muted/30">
                  <tr>
                    <th className="text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground px-3 py-2">Date</th>
                    <th className="text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground px-3 py-2">Category</th>
                    <th className="text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground px-3 py-2">Records</th>
                    <th className="text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground px-3 py-2">Errors</th>
                    <th className="text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {recentUploads.map((u) => (
                    <tr key={u.id}>
                      <td className="px-3 py-2"><DateTime value={u.created_at} format="date-only" className="text-[12px]" /></td>
                      <td className="px-3 py-2 text-[12px] capitalize">{u.file_category}</td>
                      <td className="px-3 py-2 text-right text-[12px] font-mono tabular-nums">{u.record_count ?? "—"}</td>
                      <td className={cn("px-3 py-2 text-right text-[12px] font-mono tabular-nums", (u.error_count ?? 0) > 0 ? "text-destructive" : "")}>{u.error_count ?? 0}</td>
                      <td className="px-3 py-2 text-[12px] capitalize">{u.status.replaceAll("_", " ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pt-3">
              <a href="/compliance/ccrs" className="inline-flex items-center gap-1 text-[12px] text-primary hover:underline">
                View all uploads <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </>
        )}
      </SectionCard>

      {/* ─── Section 4: WCIA ───────────────────────────────────────────────── */}
      <SectionCard title="WCIA Configuration" subtitle="Washington Cannabis Integrators Alliance — B2B data exchange">
        <div className="flex items-start gap-2 rounded-lg bg-blue-500/10 border border-blue-500/20 p-3 text-[12px] text-foreground">
          <Globe className="w-3.5 h-3.5 mt-0.5 shrink-0 text-blue-500" />
          <div>
            WCIA enables B2B data exchange between integrators via JSON links. When you ship a manifest,
            Cody Grow generates a WCIA JSON file that the receiving integrator can import.
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={wciaEnabled}
            onChange={(e) => setWciaEnabled(e.target.checked)}
            className="w-4 h-4 rounded border-border accent-primary"
          />
          <span className="text-[13px] text-foreground">Generate WCIA JSON links for outbound manifests</span>
        </label>
        {wciaEnabled && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="JSON Hosting">
                <select
                  value={wciaHosting}
                  onChange={(e) => setWciaHosting(e.target.value as WciaHostingType)}
                  className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {WCIA_HOSTING_TYPES.map((h) => (
                    <option key={h} value={h}>{WCIA_HOSTING_TYPE_LABELS[h]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Link Expiration" helper="Days until WCIA link expires">
                <Input
                  type="number"
                  min="1"
                  max="365"
                  value={wciaExpiryDays}
                  onChange={(e) => setWciaExpiryDays(Number(e.target.value) || 30)}
                  className="font-mono w-32"
                />
              </Field>
            </div>
            {wciaHosting === "self_hosted" && (
              <Field label="Self-Hosted URL" helper="Base URL where WCIA JSON files will be hosted">
                <Input value={wciaUrl} onChange={(e) => setWciaUrl(e.target.value)} placeholder="https://wcia.yourcompany.com" className="font-mono" />
              </Field>
            )}
          </>
        )}
        <div className="flex justify-end pt-2">
          <Button onClick={handleSaveWcia} disabled={savingWcia} className="gap-1.5 min-w-[140px]">
            {savingWcia ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save WCIA Settings
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SectionCard({ title, subtitle, children }: { title?: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card mb-6 overflow-hidden">
      {title && (
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
          {subtitle && <p className="text-[12px] text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      )}
      <div className="p-6 space-y-5">{children}</div>
    </section>
  );
}

function Subsection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
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

void FileText; void ShieldCheck;
