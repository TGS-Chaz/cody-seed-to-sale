import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, Save, User, Sun, Moon, Sunset } from "lucide-react";
import AvatarStudio from "@/components/shared/AvatarStudio";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useProfile, profileInitials } from "@/lib/profile";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/lib/theme";
import { useProductAccess } from "@/hooks/useProductAccess";

interface ProfileForm {
  first_name: string;
  last_name: string;
  phone: string;
  role: string;
  company: string;
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile, refresh } = useProfile();
  const { preference, setTheme } = useTheme();
  const { tier } = useProductAccess("grow");

  const [form, setForm] = useState<ProfileForm>({
    first_name: "", last_name: "", phone: "", role: "", company: "The Green Solution",
  });
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Sync form from profile
  useEffect(() => {
    if (profile) {
      const parts = (profile.full_name ?? "").split(/\s+/);
      setForm({
        first_name: profile.first_name ?? parts[0] ?? "",
        last_name: profile.last_name ?? parts.slice(1).join(" ") ?? "",
        phone: profile.phone ?? "",
        role: profile.role ?? "",
        company: profile.company ?? "The Green Solution",
      });
      setAvatarUrl(profile.avatar_url ?? null);
    }
  }, [profile, user]);

  function set(field: keyof ProfileForm, value: string) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    setError(null);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${user.id}/avatar.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = `${urlData.publicUrl}?t=${Date.now()}`;
      setAvatarUrl(url);
    } catch (err: any) {
      setError(err.message ?? "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeAvatar() {
    setAvatarUrl(null);
    if (user) {
      await supabase.from("profiles").update({ avatar_url: null }).eq("id", user.id);
      refresh();
    }
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const { error: upsertError } = await supabase.from("profiles").upsert({
        id: user.id,
        first_name: form.first_name || null,
        last_name: form.last_name || null,
        full_name: `${form.first_name} ${form.last_name}`.trim() || null,
        phone: form.phone || null,
        role: form.role || null,
        company: form.company || null,
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString(),
      });
      if (upsertError) throw upsertError;
      refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      setError(err.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const initials = profileInitials(
    avatarUrl ? { ...profile, avatar_url: avatarUrl } as any : profile,
    user?.email
  );

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto min-h-full">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
        className="flex items-center gap-3 mb-6"
      >
        <button
          onClick={() => navigate(-1)}
          className="w-11 h-11 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-[20px] font-bold text-foreground leading-none">Profile</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{user?.email}</p>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
        className="rounded-xl border border-border bg-card overflow-hidden"
        style={{ boxShadow: "0 4px 24px var(--shadow-color)" }}
      >
        {/* Avatar Studio */}
        <div
          className="p-6"
          style={{ borderBottom: "1px solid var(--glass-border)" }}
        >
          <AvatarStudio
            currentAvatarUrl={avatarUrl}
            initials={initials}
            uploading={uploading}
            onUploadClick={() => fileRef.current?.click()}
            onRemove={removeAvatar}
            onSave={async (dataUrl) => {
              if (!user) return;
              let finalUrl = dataUrl;

              try {
                let blob: Blob;
                if (dataUrl.startsWith("data:")) {
                  const res = await fetch(dataUrl);
                  blob = await res.blob();
                } else if (dataUrl.startsWith("http") && !dataUrl.includes(import.meta.env.VITE_SUPABASE_URL)) {
                  const res = await fetch(dataUrl);
                  blob = await res.blob();
                } else {
                  blob = null as any;
                }
                if (blob) {
                  const ext = blob.type.includes("svg") ? "svg" : "png";
                  const path = `${user.id}/avatar-${Date.now()}.${ext}`;
                  const { error: uploadErr } = await supabase.storage.from("avatars").upload(path, blob, { upsert: true, contentType: blob.type });
                  if (!uploadErr) {
                    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
                    finalUrl = `${urlData.publicUrl}?t=${Date.now()}`;
                  } else {
                    console.warn("Avatar upload failed:", uploadErr.message);
                  }
                }
              } catch (err) {
                console.warn("Avatar save error, using original URL:", err);
              }

              setAvatarUrl(finalUrl);
              const { error: dbErr } = await supabase.from("profiles").update({
                avatar_url: finalUrl,
              }).eq("id", user.id);
              if (dbErr) console.error("Profile update failed:", dbErr.message);
              refresh();
              setSaved(true);
              setTimeout(() => setSaved(false), 2500);
            }}
          />
          <div className="mt-3">
            <p className="text-[13px] font-semibold text-foreground">
              {`${form.first_name} ${form.last_name}`.trim() || user?.email?.split("@")[0] || "Your Name"}
            </p>
            <p className="text-[11px] text-muted-foreground">{form.role || "No role set"}</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarUpload}
          />
        </div>

        {/* Form fields */}
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
              First Name
            </label>
            <Input
              value={form.first_name}
              onChange={e => set("first_name", e.target.value)}
              placeholder="First Name"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
              Last Name
            </label>
            <Input
              value={form.last_name}
              onChange={e => set("last_name", e.target.value)}
              placeholder="Last Name"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
              Email
            </label>
            <Input value={user?.email ?? ""} disabled className="opacity-50 cursor-not-allowed" />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
              Phone
            </label>
            <Input
              value={form.phone}
              onChange={e => set("phone", e.target.value)}
              placeholder="e.g. (509) 555-0100"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
              Role / Title
            </label>
            <Input
              value={form.role}
              onChange={e => set("role", e.target.value)}
              placeholder="e.g. Head Grower"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
              Company
            </label>
            <Input
              value={form.company}
              onChange={e => set("company", e.target.value)}
              placeholder="e.g. The Green Solution"
            />
          </div>
        </div>

        {/* Footer */}
        <div
          className="px-6 py-4 flex items-center justify-between gap-3"
          style={{ borderTop: "1px solid var(--glass-border)" }}
        >
          {error && (
            <p className="text-[12px] text-destructive flex-1">{error}</p>
          )}
          {!error && saved && (
            <p className="text-[12px] text-primary flex-1">Profile saved.</p>
          )}
          {!error && !saved && <span className="flex-1" />}
          <Button onClick={handleSave} disabled={saving} className="gap-2 min-w-[100px]">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? "Saving…" : "Save Profile"}
          </Button>
        </div>
      </motion.div>

      {/* Current Plan */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="mt-4 rounded-lg border border-border p-4"
        style={{ background: "var(--glass-bg)" }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-foreground">Cody Grow Plan</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase"
              style={{ background: "hsl(168 100% 42% / 0.12)", color: "hsl(168 100% 42%)" }}>
              {tier ?? "—"}
            </span>
          </div>
          <button onClick={() => navigate("/settings")}
            className="text-[11px] text-primary hover:text-primary/80 font-medium">
            Manage Plan →
          </button>
        </div>
      </motion.div>

      {/* Theme Preference */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.11 }}
        className="mt-4 rounded-xl border border-border p-4 bg-card"
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {preference === "auto" ? <Sunset className="w-4 h-4 text-primary" /> : preference === "dark" ? <Moon className="w-4 h-4 text-primary" /> : <Sun className="w-4 h-4 text-primary" />}
            <span className="text-[13px] font-semibold text-foreground">Appearance</span>
          </div>
          <div className="flex gap-1 p-0.5 rounded-lg bg-secondary">
            {([
              { key: "light" as const, label: "Light", Icon: Sun },
              { key: "dark" as const, label: "Dark", Icon: Moon },
              { key: "auto" as const, label: "Auto", Icon: Sunset },
            ]).map(({ key, label, Icon }) => (
              <button key={key}
                onClick={() => setTheme(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  preference === key
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-3 h-3" /> {label}
              </button>
            ))}
          </div>
        </div>
        {preference === "auto" && (
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Theme adapts to time of day — bright during the day, warm tones at dusk, dark at night.
          </p>
        )}
      </motion.div>

      {/* Info card */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15 }}
        className="mt-4 rounded-lg border border-border p-4"
        style={{ background: "var(--glass-bg)" }}
      >
        <div className="flex items-start gap-3">
          <User className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
          <div>
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              Your profile is shared across Cody CRM, Intel, and Grow — the same avatar and name appear in every product.
              Avatar photos are stored in Supabase Storage.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
