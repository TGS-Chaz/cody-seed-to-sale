import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useOrg } from "@/lib/org";

export interface NoteAttribute {
  id: string;
  org_id: string;
  name: string;
  icon: string | null;
  color: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface NoteAttributeInput {
  name: string;
  icon?: string | null;
  color?: string | null;
  sort_order?: number;
  is_active?: boolean;
}

/** Common lucide icon names users can pick from when creating a note attribute. */
export const NOTE_ICON_OPTIONS = [
  "Package",
  "DollarSign",
  "AlertTriangle",
  "Clock",
  "ShoppingCart",
  "CreditCard",
  "CheckCircle",
  "Phone",
  "Mail",
  "MessageCircle",
  "Calendar",
  "MapPin",
  "FileText",
  "Star",
  "Flag",
  "Coffee",
  "Users",
  "Info",
];

export function useNoteAttributes() {
  const { user } = useAuth();
  const { orgId } = useOrg();
  const [data, setData] = useState<NoteAttribute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!user || !orgId) { setData([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data: rows, error: err } = await supabase
        .from("grow_note_attributes")
        .select("*")
        .eq("org_id", orgId)
        .order("sort_order");
      if (cancelled) return;
      if (err) { setError(err.message); setLoading(false); return; }
      setError(null);
      setData((rows ?? []) as NoteAttribute[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id, orgId, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const createAttribute = useCallback(async (input: NoteAttributeInput) => {
    if (!orgId) throw new Error("No active org");
    const next_sort = (data.at(-1)?.sort_order ?? 0) + 1;
    const payload = { ...input, org_id: orgId, sort_order: input.sort_order ?? next_sort };
    const { data: row, error: err } = await supabase.from("grow_note_attributes").insert(payload).select("*").single();
    if (err) throw err;
    refresh();
    return row as NoteAttribute;
  }, [orgId, data, refresh]);

  const updateAttribute = useCallback(async (id: string, patch: Partial<NoteAttributeInput>) => {
    const { data: row, error: err } = await supabase.from("grow_note_attributes").update(patch).eq("id", id).select("*").single();
    if (err) throw err;
    refresh();
    return row as NoteAttribute;
  }, [refresh]);

  const deleteAttribute = useCallback(async (id: string) => {
    const { error: err } = await supabase.from("grow_note_attributes").delete().eq("id", id);
    if (err) throw err;
    refresh();
  }, [refresh]);

  const reorderAttributes = useCallback(async (orderedIds: string[]) => {
    await Promise.all(
      orderedIds.map((id, idx) =>
        supabase.from("grow_note_attributes").update({ sort_order: idx + 1 }).eq("id", id),
      ),
    );
    refresh();
  }, [refresh]);

  return { data, loading, error, refresh, createAttribute, updateAttribute, deleteAttribute, reorderAttributes };
}

export function useNoteAttributeStats(attrs: NoteAttribute[]) {
  return useMemo(() => ({
    total: attrs.length,
    active: attrs.filter((a) => a.is_active).length,
  }), [attrs]);
}
