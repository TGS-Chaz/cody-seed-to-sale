import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useOrg } from "@/lib/org";

export interface OrgMember {
  user_id: string;
  email: string | null;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  role: string; // legacy single role from org_members.role (owner/admin/member)
  last_sign_in_at: string | null;
  joined_at: string | null;
}

export interface OrgMemberRoleAssignment {
  user_id: string;
  role_id: string;
  role_name: string;
}

/** Fetch org members joined with auth.users emails and profiles, via RPC (SECURITY DEFINER). */
export function useOrgMembers() {
  const { user } = useAuth();
  const { orgId } = useOrg();
  const [data, setData] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!user || !orgId) { setData([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data: rows, error: err } = await supabase.rpc("get_org_members_with_emails", { p_org_id: orgId });
      if (cancelled) return;
      if (err) setError(err.message);
      else {
        setError(null);
        setData((rows ?? []) as OrgMember[]);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id, orgId, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  return { data, loading, error, refresh };
}

/** Fetch all user→role assignments for the current org (many-to-many via grow_user_roles). */
export function useOrgUserRoles() {
  const { user } = useAuth();
  const { orgId } = useOrg();
  const [data, setData] = useState<OrgMemberRoleAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!user || !orgId) { setData([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data: rows } = await supabase
        .from("grow_user_roles")
        .select("user_id, role_id, grow_roles!inner(name)")
        .eq("org_id", orgId);
      if (cancelled) return;
      const mapped = (rows ?? []).map((r: any) => ({
        user_id: r.user_id,
        role_id: r.role_id,
        role_name: r.grow_roles?.name ?? "",
      }));
      setData(mapped);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id, orgId, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const assignRole = useCallback(
    async (userId: string, roleId: string) => {
      if (!orgId) throw new Error("No active org");
      const { error } = await supabase
        .from("grow_user_roles")
        .insert({ user_id: userId, role_id: roleId, org_id: orgId, assigned_by: user?.id });
      if (error && !error.message.includes("duplicate")) throw error;
      refresh();
    },
    [orgId, user?.id, refresh],
  );

  const unassignRole = useCallback(
    async (userId: string, roleId: string) => {
      if (!orgId) throw new Error("No active org");
      const { error } = await supabase
        .from("grow_user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("role_id", roleId)
        .eq("org_id", orgId);
      if (error) throw error;
      refresh();
    },
    [orgId, refresh],
  );

  return { data, loading, refresh, assignRole, unassignRole };
}

export function useRemoveMember() {
  const { orgId } = useOrg();
  return useCallback(
    async (userId: string) => {
      if (!orgId) throw new Error("No active org");
      // Remove all role assignments first
      await supabase.from("grow_user_roles").delete().eq("user_id", userId).eq("org_id", orgId);
      const { error } = await supabase.from("org_members").delete().eq("user_id", userId).eq("org_id", orgId);
      if (error) throw error;
    },
    [orgId],
  );
}

/** Upsert basic profile fields for a member (admin-editable from Users page). */
export function useUpdateMemberProfile() {
  return useCallback(async (userId: string, patch: { first_name?: string; last_name?: string; full_name?: string; avatar_url?: string | null; }) => {
    const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
    if (error) throw error;
  }, []);
}

/** Stats helper for the team members header */
export function useMembersStats(members: OrgMember[]) {
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const owners = members.filter((m) => m.role === "owner").length;
  const recentlyActive = members.filter((m) => m.last_sign_in_at && new Date(m.last_sign_in_at).getTime() >= thirtyDaysAgo).length;
  return {
    total: members.length,
    owners,
    recentlyActive,
    pendingInvites: 0, // Until invite flow is built via Edge Function
  };
}
