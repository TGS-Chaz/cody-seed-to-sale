import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useOrg } from "@/lib/org";

export interface Role {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  is_system_role: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface RolePermissionRow {
  id?: string;
  role_id: string;
  permission_id: string;
  is_allowed: boolean;
}

export function useRoles() {
  const { user } = useAuth();
  const { orgId } = useOrg();
  const [data, setData] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!user || !orgId) { setData([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data: rows, error: err } = await supabase
        .from("grow_roles")
        .select("*")
        .eq("org_id", orgId)
        .order("is_system_role", { ascending: false })
        .order("name");
      if (cancelled) return;
      if (err) setError(err.message);
      else { setError(null); setData((rows ?? []) as Role[]); }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id, orgId, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const createRole = useCallback(
    async (input: { name: string; description?: string | null }) => {
      if (!orgId) throw new Error("No active org");
      const { data: row, error: err } = await supabase
        .from("grow_roles")
        .insert({ org_id: orgId, name: input.name, description: input.description ?? null, is_system_role: false })
        .select()
        .single();
      if (err) throw err;
      refresh();
      return row as Role;
    },
    [orgId, refresh],
  );

  const updateRole = useCallback(
    async (id: string, patch: { name?: string; description?: string | null }) => {
      const { error } = await supabase.from("grow_roles").update(patch).eq("id", id);
      if (error) throw error;
      refresh();
    },
    [refresh],
  );

  const deleteRole = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("grow_roles").delete().eq("id", id);
      if (error) throw error;
      refresh();
    },
    [refresh],
  );

  return { data, loading, error, refresh, createRole, updateRole, deleteRole };
}

export function useRolePermissions(roleId: string | null | undefined) {
  const [data, setData] = useState<RolePermissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!roleId) { setData([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data: rows } = await supabase
        .from("grow_role_permissions")
        .select("id, role_id, permission_id, is_allowed")
        .eq("role_id", roleId);
      if (cancelled) return;
      setData((rows ?? []) as RolePermissionRow[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [roleId, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  return { data, loading, refresh };
}

/**
 * Replace a role's permissions with the provided `allowed` set.
 * Non-listed permissions are removed (= denied).
 */
export function useUpdateRolePermissions() {
  return useCallback(async (roleId: string, allowedPermissionIds: string[]) => {
    // Delete all existing permissions for this role, then re-insert allowed ones.
    const { error: delErr } = await supabase.from("grow_role_permissions").delete().eq("role_id", roleId);
    if (delErr) throw delErr;
    if (allowedPermissionIds.length === 0) return;
    const inserts = allowedPermissionIds.map((pid) => ({ role_id: roleId, permission_id: pid, is_allowed: true }));
    const { error: insErr } = await supabase.from("grow_role_permissions").insert(inserts);
    if (insErr) throw insErr;
  }, []);
}

/** Count members assigned to each role in the org */
export function useRoleMemberCounts() {
  const { orgId } = useOrg();
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      const { data } = await supabase
        .from("grow_user_roles")
        .select("role_id")
        .eq("org_id", orgId);
      const map: Record<string, number> = {};
      (data ?? []).forEach((r: any) => { map[r.role_id] = (map[r.role_id] ?? 0) + 1; });
      setCounts(map);
    })();
  }, [orgId]);

  return counts;
}
