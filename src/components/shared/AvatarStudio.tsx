import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { createAvatar } from "@dicebear/core";
import {
  adventurer, adventurerNeutral, avataaars, bigEars, bottts,
  lorelei, notionists, openPeeps, personas, pixelArt, thumbs,
} from "@dicebear/collection";
import { Camera, Sparkles, Shuffle, Check, User, Lock, Loader2, Wand2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { callEdgeFunction } from "@/lib/edge-function";
import { toast } from "sonner";

// ─── Config ──────────────────────────────────────────────────────────────────

const STYLES = [
  { key: "adventurer",        label: "Adventurer",    style: adventurer },
  { key: "adventurerNeutral", label: "Adv. Neutral",  style: adventurerNeutral },
  { key: "avataaars",         label: "Avataaars",     style: avataaars },
  { key: "bigEars",           label: "Big Ears",      style: bigEars },
  { key: "bottts",            label: "Bottts",        style: bottts },
  { key: "lorelei",           label: "Lorelei",       style: lorelei },
  { key: "notionists",        label: "Notionists",    style: notionists },
  { key: "openPeeps",         label: "Open Peeps",    style: openPeeps },
  { key: "personas",          label: "Personas",      style: personas },
  { key: "pixelArt",          label: "Pixel Art",     style: pixelArt },
  { key: "thumbs",            label: "Thumbs",        style: thumbs },
] as const;

const BG_PRESETS = [
  { label: "Teal",     colors: ["0d9488"] },
  { label: "Ocean",    colors: ["3b82f6"] },
  { label: "Sunset",   colors: ["f97316"] },
  { label: "Forest",   colors: ["22c55e"] },
  { label: "Lavender", colors: ["a78bfa"] },
  { label: "Midnight", colors: ["1e1b4b"] },
  { label: "Rose",     colors: ["f472b6"] },
  { label: "None",     colors: ["transparent"] },
];

const PRESETS = [
  { name: "The Closer",   seed: "closer-sharp",   style: "avataaars",  desc: "Sharp & confident" },
  { name: "Road Warrior",  seed: "road-warrior-99", style: "adventurer", desc: "Casual & adventurous" },
  { name: "The Analyst",  seed: "analyst-focus",   style: "notionists", desc: "Glasses, focused" },
  { name: "Farm Fresh",   seed: "farm-fresh-42",   style: "openPeeps",  desc: "Outdoorsy, earthy" },
  { name: "Night Owl",    seed: "night-owl-dark",  style: "lorelei",    desc: "Edgy & dark" },
  { name: "The Boss",     seed: "boss-pro-7",      style: "personas",   desc: "Professional" },
  { name: "Dingo",        seed: "dingo-cody",      style: "bottts",     desc: "Cody mascot" },
  { name: "Wolf",         seed: "wolf-alpha",      style: "bottts",     desc: "Pack leader" },
  { name: "Fox",          seed: "fox-clever",      style: "bottts",     desc: "Clever & quick" },
  { name: "Bear",         seed: "bear-strong",     style: "bottts",     desc: "Reliable" },
  { name: "Eagle",        seed: "eagle-vision",    style: "bottts",     desc: "Sharp-eyed" },
  { name: "Owl",          seed: "owl-wise",        style: "bottts",     desc: "Wise advisor" },
];

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  currentAvatarUrl: string | null;
  onSave: (dataUrl: string) => void;
  onUploadClick: () => void;
  onRemove: () => void;
  uploading: boolean;
  initials: string;
}

const AI_STYLES = [
  { key: "3d-pixar",          label: "3D Pixar",           desc: "Animated character" },
  { key: "anime",             label: "Anime",              desc: "Japanese animation" },
  { key: "comic-book",        label: "Comic Book",         desc: "Bold illustration" },
  { key: "flat-illustration", label: "Flat Design",        desc: "Modern & clean" },
  { key: "professional",      label: "Professional",       desc: "Business headshot" },
  { key: "action-figure",     label: "Action Figure",      desc: "Toy figurine style" },
  { key: "cannabis-pro",      label: "Cannabis Pro",        desc: "Industry vibes" },
];

interface GalleryItem {
  id: string;
  image_url: string;
  type: string;
  style: string | null;
  is_favorite: boolean;
  created_at: string;
}

export default function AvatarStudio({ currentAvatarUrl, onSave, onUploadClick, onRemove, uploading, initials }: Props) {
  const [tab, setTab] = useState<"upload" | "create" | "presets" | "ai" | "gallery">("create");
  const [styleKey, setStyleKey] = useState("adventurer");
  const [seed, setSeed] = useState(() => Math.random().toString(36).slice(2));
  const [bgColor, setBgColor] = useState("0d9488");
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

  // Gallery
  const [gallery, setGallery] = useState<GalleryItem[]>([]);

  useEffect(() => {
    supabase.from("avatar_gallery").select("*").order("created_at", { ascending: false })
      .then(({ data }) => setGallery((data ?? []) as GalleryItem[]));
  }, []);

  async function saveToGallery(imageUrl: string, type: string, style?: string, prompt?: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("avatar_gallery").insert({
      user_id: user.id, image_url: imageUrl, type, style: style ?? null, prompt: prompt ?? null,
    }).select().single();
    if (data) setGallery((prev) => [data as GalleryItem, ...prev]);
  }

  async function toggleFavorite(id: string) {
    const item = gallery.find((g) => g.id === id);
    if (!item) return;
    await supabase.from("avatar_gallery").update({ is_favorite: !item.is_favorite }).eq("id", id);
    setGallery((prev) => prev.map((g) => g.id === id ? { ...g, is_favorite: !g.is_favorite } : g));
  }

  async function deleteFromGallery(id: string) {
    await supabase.from("avatar_gallery").delete().eq("id", id);
    setGallery((prev) => prev.filter((g) => g.id !== id));
  }

  // Wrap onSave to also save to gallery
  function handleSaveAvatar(url: string, type: string, style?: string, prompt?: string) {
    onSave(url);
    saveToGallery(url, type, style, prompt);
  }

  // AI Avatar state
  const [userTier, setUserTier] = useState<string>("free");
  const [aiRemaining, setAiRemaining] = useState<number | null>(null);
  const [aiMode, setAiMode] = useState<"photo" | "describe">("describe");
  const [aiStyle, setAiStyle] = useState("professional");
  const [aiPhoto, setAiPhoto] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // Load tier + remaining count
  useEffect(() => {
    async function loadTierAndUsage() {
      const { data: profile } = await supabase.from("profiles").select("tier").limit(1).single();
      const tier = profile?.tier ?? "free";
      setUserTier(tier);

      const limit = tier === "enterprise" ? 100 : tier === "pro" ? 10 : 0;
      const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
      const { count } = await supabase.from("avatar_generations")
        .select("id", { count: "exact", head: true })
        .gte("created_at", monthStart.toISOString());

      setAiRemaining(Math.max(limit - (count ?? 0), 0));
    }
    loadTierAndUsage();
  }, []);

  const styleDef = STYLES.find((s) => s.key === styleKey) ?? STYLES[0];

  const avatarSvg = useMemo(() => {
    const avatar = createAvatar(styleDef.style as any, {
      seed,
      size: 128,
      backgroundColor: bgColor === "transparent" ? undefined : [bgColor],
    });
    return avatar.toDataUri();
  }, [styleDef, seed, bgColor]);

  const presetAvatars = useMemo(() => {
    return PRESETS.map((p) => {
      const style = STYLES.find((s) => s.key === p.style)?.style ?? adventurer;
      const av = createAvatar(style as any, {
        seed: p.seed,
        size: 64,
        backgroundColor: ["1e1b4b"],
      });
      return { ...p, dataUri: av.toDataUri() };
    });
  }, []);

  function randomize() {
    setSeed(Math.random().toString(36).slice(2, 10));
    setStyleKey(STYLES[Math.floor(Math.random() * STYLES.length)].key);
    setBgColor(BG_PRESETS[Math.floor(Math.random() * (BG_PRESETS.length - 1))].colors[0]);
  }

  function saveCreated() {
    handleSaveAvatar(avatarSvg, "dicebear", styleKey);
  }

  function savePreset(dataUri: string) {
    handleSaveAvatar(dataUri, "dicebear", "preset");
  }

  function handleAiPhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setAiPhoto(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function generateAiAvatar() {
    if (aiMode === "photo" && !aiPhoto) return;
    if (aiMode === "describe" && !aiPrompt.trim()) return;
    setAiGenerating(true);
    setAiError(null);
    setAiResult(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setAiError("Not logged in"); setAiGenerating(false); return; }

      if (aiMode === "photo") {
        // Image-to-image via generate-avatar Edge Function
        let publicUrl = aiPhoto!;
        try {
          const blob = await fetch(aiPhoto!).then((r) => r.blob());
          const path = `${user.id}/ai-selfie-${Date.now()}.jpg`;
          const { error: uploadErr } = await supabase.storage.from("avatars").upload(path, blob, { upsert: true });
          if (!uploadErr) {
            const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
            if (urlData?.publicUrl) publicUrl = urlData.publicUrl;
          }
        } catch {}

        const data = await callEdgeFunction<{ image_url: string; remaining?: number }>(
          "generate-avatar",
          { image_url: publicUrl, style: aiStyle },
        );
        setAiResult(data.image_url);
        if (data.remaining != null) setAiRemaining(data.remaining);
      } else {
        // Text-to-image via generate-marketing-image Edge Function
        const styleLabel = AI_STYLES.find((s) => s.key === aiStyle)?.label ?? "Professional";
        const fullPrompt = `Portrait avatar: ${aiPrompt.trim()}. Style: ${styleLabel}. Square format, centered face/character, clean background.`;
        const data = await callEdgeFunction<{ image_url: string; remaining?: number }>(
          "generate-marketing-image",
          { prompt: fullPrompt, style: "photo-realistic", context: "avatar" },
        );
        setAiResult(data.image_url);
        if (data.remaining != null) setAiRemaining(data.remaining);
      }
    } catch (err: any) {
      const msg = err.message || "Generation failed";
      setAiError(msg);
      toast.error(msg);
    }
    setAiGenerating(false);
  }

  const isPro = userTier === "pro" || userTier === "enterprise";

  const TABS = [
    { key: "gallery" as const, label: `Gallery (${gallery.length})`, icon: User },
    { key: "upload" as const, label: "Upload", icon: Camera },
    { key: "create" as const, label: "Free", icon: Sparkles },
    { key: "presets" as const, label: "Characters", icon: User },
    { key: "ai" as const, label: isPro ? "AI Pro" : "AI Pro 🔒", icon: Wand2 },
  ];

  return (
    <div className="space-y-4">
      {/* Current Avatar */}
      {currentAvatarUrl && (
        <div className="flex items-center gap-3 pb-3" style={{ borderBottom: "1px solid var(--glass-border-subtle)" }}>
          <div className="w-14 h-14 rounded-full overflow-hidden shrink-0 ring-2 ring-primary/30">
            <img src={currentAvatarUrl} alt="" className="w-full h-full object-cover" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-foreground">Current Avatar</p>
            <p className="text-[9px] text-muted-foreground/50">Saved and visible across the app</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              tab === t.key ? "text-foreground bg-secondary/60" : "text-muted-foreground hover:text-foreground"
            }`}
            style={tab === t.key ? { borderTop: "2px solid hsl(168 100% 42%)" } : {}}>
            <t.icon className="w-3 h-3" /> {t.label}
          </button>
        ))}
      </div>

      {/* Gallery tab */}
      {tab === "gallery" && (
        <div>
          {gallery.length === 0 ? (
            <div className="text-center py-8">
              <User className="w-6 h-6 text-muted-foreground/20 mx-auto mb-2" />
              <p className="text-[11px] text-muted-foreground">No avatars saved yet. Create one from the other tabs!</p>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {gallery.map((g) => {
                const isActive = currentAvatarUrl === g.image_url;
                return (
                  <div key={g.id} className="relative group">
                    <button onClick={() => onSave(g.image_url)}
                      className={`w-full aspect-square rounded-xl overflow-hidden transition-all ${
                        isActive ? "ring-2 ring-primary scale-105" : "hover:ring-1 hover:ring-white/20"
                      }`}>
                      <img src={g.image_url} alt="" className="w-full h-full object-cover" />
                    </button>
                    {/* Favorite + Delete overlay */}
                    <div className="absolute top-0.5 right-0.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={(e) => { e.stopPropagation(); toggleFavorite(g.id); }}
                        className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                          g.is_favorite ? "bg-amber-500/80 text-white" : "bg-black/60 text-white/60 hover:text-amber-400"
                        }`}>
                        ★
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); deleteFromGallery(g.id); }}
                        className="w-5 h-5 rounded-full bg-black/60 flex items-center justify-center text-white/60 hover:text-rose-400 text-[10px]">
                        ×
                      </button>
                    </div>
                    {isActive && (
                      <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[7px] font-bold text-primary bg-black/70 px-1.5 py-0.5 rounded-full">
                        Active
                      </div>
                    )}
                    {g.is_favorite && (
                      <div className="absolute top-0.5 left-0.5 text-[8px]">⭐</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Upload tab */}
      {tab === "upload" && (
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-full overflow-hidden bg-secondary flex items-center justify-center text-xl font-bold text-muted-foreground shrink-0">
            {currentAvatarUrl ? (
              <img src={currentAvatarUrl} alt="" className="w-full h-full object-cover" />
            ) : initials}
          </div>
          <div className="flex flex-col gap-2">
            <button onClick={onUploadClick} disabled={uploading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium"
              style={{ background: "var(--glass-border)", color: "var(--glass-text)" }}>
              <Camera className="w-3 h-3" />
              {currentAvatarUrl ? "Change Photo" : "Upload Photo"}
            </button>
            {currentAvatarUrl && (
              <button onClick={onRemove}
                className="text-[11px] text-rose-400/60 hover:text-rose-400">
                Remove photo
              </button>
            )}
          </div>
        </div>
      )}

      {/* Create tab */}
      {tab === "create" && (
        <div className="space-y-3">
          {/* Preview */}
          <div className="flex items-center gap-4">
            <motion.div
              className="w-24 h-24 rounded-full overflow-hidden shrink-0 ring-2 ring-primary/30"
              whileHover={{ scale: 1.05 }}
            >
              <img src={avatarSvg} alt="" className="w-full h-full" />
            </motion.div>
            <div className="flex-1 space-y-2">
              <Button variant="outline" size="sm" className="text-xs gap-1.5 w-full" onClick={randomize}>
                <Shuffle className="w-3 h-3" /> Randomize
              </Button>
              <Button size="sm" className="text-xs gap-1.5 w-full" onClick={saveCreated}>
                <Check className="w-3 h-3" /> Save Avatar
              </Button>
            </div>
          </div>

          {/* Style grid */}
          <div>
            <label className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1.5 block">Style</label>
            <div className="flex flex-wrap gap-1">
              {STYLES.map((s) => (
                <button key={s.key} onClick={() => setStyleKey(s.key)}
                  className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${
                    styleKey === s.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground bg-secondary/40"
                  }`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Seed (for variation) */}
          <div>
            <label className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1.5 block">Variation</label>
            <input value={seed} onChange={(e) => setSeed(e.target.value)}
              className="w-full h-7 rounded-md bg-secondary/30 border border-border text-[11px] px-2 text-foreground"
              placeholder="Type anything for a unique look" />
          </div>

          {/* Background */}
          <div>
            <label className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1.5 block">Background</label>
            <div className="flex gap-1.5">
              {BG_PRESETS.map((bg) => (
                <button key={bg.label} onClick={() => setBgColor(bg.colors[0])}
                  className={`w-7 h-7 rounded-full transition-all ${bgColor === bg.colors[0] ? "ring-2 ring-primary ring-offset-1 ring-offset-background scale-110" : "hover:scale-105"}`}
                  style={{ background: bg.colors[0] === "transparent" ? "repeating-conic-gradient(var(--glass-border) 0% 25%, transparent 0% 50%) 50% / 8px 8px" : `#${bg.colors[0]}` }}
                  title={bg.label} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Presets tab */}
      {tab === "presets" && (
        <div className="grid grid-cols-3 gap-2">
          {presetAvatars.map((p) => (
            <motion.button key={p.seed}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => { setSelectedPreset(p.seed); savePreset(p.dataUri); }}
              className={`rounded-lg p-3 flex flex-col items-center gap-1.5 transition-all ${
                selectedPreset === p.seed ? "ring-2 ring-primary bg-primary/5" : "hover:bg-secondary/30"
              }`}
              style={{ border: "1px solid var(--glass-border-subtle)" }}>
              <img src={p.dataUri} alt="" className="w-12 h-12 rounded-full" />
              <span className="text-[10px] font-semibold text-foreground">{p.name}</span>
              <span className="text-[8px] text-muted-foreground/60">{p.desc}</span>
            </motion.button>
          ))}
        </div>
      )}

      {/* AI Avatar tab */}
      {tab === "ai" && (
        <div className="space-y-4">
          {!isPro ? (
            /* Locked state */
            <div className="text-center py-8 rounded-lg" style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border-subtle)" }}>
              <Lock className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm font-semibold text-foreground mb-1">AI Avatars — Pro Feature</p>
              <p className="text-[11px] text-muted-foreground mb-3">Upload a selfie and transform it into a stylized avatar using AI.</p>
              <Button size="sm" className="text-xs gap-1.5">
                <Sparkles className="w-3 h-3" /> Upgrade to Pro
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground">
                  {aiRemaining != null ? `${aiRemaining} generation${aiRemaining !== 1 ? "s" : ""} remaining` : "Fetching..."}
                </p>
              </div>

              {/* Mode toggle */}
              <div className="flex gap-1 rounded-lg p-0.5" style={{ background: "var(--glass-bg)" }}>
                <button onClick={() => setAiMode("describe")}
                  className={`flex-1 px-3 py-1.5 rounded-md text-[11px] font-medium transition-all ${
                    aiMode === "describe" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}>
                  From Description
                </button>
                <button onClick={() => setAiMode("photo")}
                  className={`flex-1 px-3 py-1.5 rounded-md text-[11px] font-medium transition-all ${
                    aiMode === "photo" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}>
                  From Photo
                </button>
              </div>

              {/* Describe mode */}
              {aiMode === "describe" && (
                <>
                  {/* Preset characters */}
                  <div>
                    <label className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1.5 block">Quick Characters</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { label: "Cannabis Executive", prompt: "A confident professional man in his 30s wearing a tailored dark suit with a subtle green pocket square, short styled hair, warm smile, modern office background" },
                        { label: "Road Warrior Rep", prompt: "A friendly sales rep in casual business attire, flannel shirt over a henley, sunglasses pushed up on head, standing next to a car, Pacific Northwest scenery" },
                        { label: "The Budtender", prompt: "A welcoming young person with a warm smile, wearing a branded apron over a t-shirt, in a bright modern cannabis dispensary, helpful and knowledgeable look" },
                        { label: "Cody the Dingo", prompt: "A friendly cartoon dingo character mascot with teal and green coloring, wearing a small business tie, winking, playful and professional, digital art style" },
                      ].map((p) => (
                        <button key={p.label} onClick={() => setAiPrompt(p.prompt)}
                          className={`px-2.5 py-2 rounded-lg text-left text-[10px] transition-all ${
                            aiPrompt === p.prompt ? "bg-primary/10 ring-1 ring-primary/30 text-foreground" : "text-muted-foreground hover:text-foreground bg-secondary/30"
                          }`} style={{ border: "1px solid var(--glass-border-subtle)" }}>
                          <span className="font-medium">{p.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1.5 block">Describe Your Character</label>
                    <textarea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} rows={3}
                      placeholder="e.g. A professional woman with curly hair and glasses wearing a green blazer, friendly smile, modern headshot"
                      className="w-full rounded-md bg-secondary/30 border border-border text-[12px] p-2.5 text-foreground placeholder:text-muted-foreground/40 resize-none outline-none focus:border-primary/30" />
                  </div>
                </>
              )}

              {/* Photo mode */}
              {aiMode === "photo" && (
                <div>
                  <label className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1.5 block">Upload Selfie</label>
                  <div className="flex items-center gap-3">
                    {aiPhoto ? (
                      <div className="w-20 h-20 rounded-full overflow-hidden shrink-0 ring-2 ring-primary/30">
                        <img src={aiPhoto} alt="" className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-secondary/40 flex items-center justify-center shrink-0"
                        style={{ border: "2px dashed var(--glass-border)" }}>
                        <Camera className="w-6 h-6 text-muted-foreground/30" />
                      </div>
                    )}
                    <div>
                      <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium cursor-pointer"
                        style={{ background: "var(--glass-border)", color: "var(--glass-text)" }}>
                        <Camera className="w-3 h-3" />
                        {aiPhoto ? "Change Photo" : "Choose Photo"}
                        <input type="file" accept="image/*" className="hidden" onChange={handleAiPhotoUpload} />
                      </label>
                      <p className="text-[9px] text-muted-foreground/40 mt-1">Clear headshot works best</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Style selector */}
              <div>
                <label className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1.5 block">Style</label>
                <div className="flex flex-wrap gap-1">
                  {AI_STYLES.map((s) => (
                    <button key={s.key} onClick={() => setAiStyle(s.key)}
                      className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${
                        aiStyle === s.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground bg-secondary/40"
                      }`}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Generate */}
              <Button className="w-full gap-2" onClick={generateAiAvatar}
                disabled={aiGenerating || (aiMode === "photo" && !aiPhoto) || (aiMode === "describe" && !aiPrompt.trim()) || (aiRemaining != null && aiRemaining <= 0)}>
                {aiGenerating ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Fetching...</>
                ) : (
                  <><Wand2 className="w-4 h-4" /> Fetch Avatar</>
                )}
              </Button>

              {aiError && <p className="text-[11px] text-rose-400 text-center">{aiError}</p>}

              {aiResult && (
                <div className="flex flex-col items-center gap-3 pt-2">
                  <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                    className="w-28 h-28 rounded-full overflow-hidden ring-2 ring-primary/40">
                    <img src={aiResult} alt="" className="w-full h-full object-cover" />
                  </motion.div>
                  <div className="flex gap-2">
                    <Button size="sm" className="text-xs gap-1.5" onClick={() => handleSaveAvatar(aiResult, "ai_generated", aiStyle, aiMode === "describe" ? aiPrompt : undefined)}>
                      <Check className="w-3 h-3" /> Use This
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={generateAiAvatar} disabled={aiGenerating}>
                      <RefreshCw className="w-3 h-3" /> Try Again
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
