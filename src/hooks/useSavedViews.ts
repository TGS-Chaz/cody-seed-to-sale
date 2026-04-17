import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useOrg } from "@/lib/org";

export interface SavedView {
  id: string;
  org_id: string;
  user_id: string;
  page_key: string;
  name: string;
  filter_config: Record<string, any>;
  sort_config: Record<string, any> | null;
  is_default: boolean;
  is_shared: boolean;
  created_at: string | null;
}

export interface SavedViewInput {
  name: string;
  filter_config: Record<string, any>;
  sort_config?: Record<string, any> | null;
  is_default?: boolean;
  is_shared?: boolean;
}

export function useSavedViews(pageKey: string) {
  const { user } = useAuth();
  const { orgId } = useOrg();
  const [data, setData] = useState<SavedView[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!user || !orgId || !pageKey) { setData([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      // Return own views + org-shared views
      const { data: rows, error } = await supabase
        .from("grow_saved_views")
        .select("*")
        .eq("org_id", orgId)
        .eq("page_key", pageKey)
        .or(`user_id.eq.${user.id},is_shared.eq.true`)
        .order("is_default", { ascending: false })
        .order("name", { ascending: true });
      if (cancelled) return;
      if (error) { console.error("useSavedViews:", error.message); setData([]); }
      else setData((rows ?? []) as SavedView[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id, orgId, pageKey, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, refresh };
}

export function useCreateView(pageKey: string) {
  const { user } = useAuth();
  const { orgId } = useOrg();
  return useCallback(async (input: SavedViewInput): Promise<SavedView> => {
    if (!user || !orgId) throw new Error("Not authenticated");
    // If marking default, clear other defaults for this user + page
    if (input.is_default) {
      await supabase.from("grow_saved_views")
        .update({ is_default: false })
        .eq("org_id", orgId).eq("page_key", pageKey).eq("user_id", user.id);
    }
    const { data, error } = await supabase.from("grow_saved_views").insert({
      org_id: orgId,
      user_id: user.id,
      page_key: pageKey,
      name: input.name,
      filter_config: input.filter_config as any,
      sort_config: (input.sort_config ?? null) as any,
      is_default: input.is_default ?? false,
      is_shared: input.is_shared ?? false,
    }).select("*").single();
    if (error) throw error;
    return data as SavedView;
  }, [user?.id, orgId, pageKey]);
}

export function useUpdateView() {
  return useCallback(async (id: string, patch: Partial<SavedViewInput>): Promise<void> => {
    const payload: any = { ...patch };
    const { error } = await supabase.from("grow_saved_views").update(payload).eq("id", id);
    if (error) throw error;
  }, []);
}

export function useDeleteView() {
  return useCallback(async (id: string): Promise<void> => {
    const { error } = await supabase.from("grow_saved_views").delete().eq("id", id);
    if (error) throw error;
  }, []);
}

export function useSetDefaultView(pageKey: string) {
  const { user } = useAuth();
  const { orgId } = useOrg();
  return useCallback(async (id: string | null): Promise<void> => {
    if (!user || !orgId) return;
    // Clear existing defaults for this user/page
    await supabase.from("grow_saved_views")
      .update({ is_default: false })
      .eq("org_id", orgId).eq("page_key", pageKey).eq("user_id", user.id);
    if (id) {
      const { error } = await supabase.from("grow_saved_views")
        .update({ is_default: true }).eq("id", id);
      if (error) throw error;
    }
  }, [user?.id, orgId, pageKey]);
}
