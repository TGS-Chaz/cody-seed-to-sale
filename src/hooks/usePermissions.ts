import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export interface Permission {
  id: string;
  key: string;
  category: string;
  name: string;
  description: string | null;
}

const CATEGORY_ORDER = [
  "Cultivation",
  "Inventory",
  "Production",
  "Sales",
  "Fulfillment",
  "Compliance",
  "Configuration",
  "Financial",
  "AI",
];

export const CATEGORY_COLORS: Record<string, { bg: string; text: string; hex: string }> = {
  Cultivation:   { bg: "bg-emerald-500/15", text: "text-emerald-500", hex: "#10B981" },
  Inventory:     { bg: "bg-primary/15", text: "text-primary", hex: "#00D4AA" },
  Production:    { bg: "bg-orange-500/15", text: "text-orange-500", hex: "#F97316" },
  Sales:         { bg: "bg-blue-500/15", text: "text-blue-500", hex: "#3B82F6" },
  Fulfillment:   { bg: "bg-purple-500/15", text: "text-purple-500", hex: "#A855F7" },
  Compliance:    { bg: "bg-red-500/15", text: "text-red-500", hex: "#EF4444" },
  Configuration: { bg: "bg-amber-500/15", text: "text-amber-500", hex: "#F59E0B" },
  Financial:     { bg: "bg-pink-500/15", text: "text-pink-500", hex: "#F472B6" },
  AI:            { bg: "bg-indigo-500/15", text: "text-indigo-500", hex: "#6366F1" },
};

export function useAllPermissions() {
  const [data, setData] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: rows } = await supabase
        .from("grow_permissions")
        .select("id, key, category, name, description");
      const sorted = (rows ?? []).sort((a: any, b: any) => {
        const ca = CATEGORY_ORDER.indexOf(a.category);
        const cb = CATEGORY_ORDER.indexOf(b.category);
        if (ca !== cb) return ca - cb;
        return a.name.localeCompare(b.name);
      });
      setData(sorted as Permission[]);
      setLoading(false);
    })();
  }, []);

  return { data, loading };
}

/** Group permissions by category */
export function groupByCategory(permissions: Permission[]): Map<string, Permission[]> {
  const map = new Map<string, Permission[]>();
  for (const p of permissions) {
    if (!map.has(p.category)) map.set(p.category, []);
    map.get(p.category)!.push(p);
  }
  return map;
}

/**
 * Build a matrix of role_id → Set<permission_id> for all roles in the org.
 * Used by the permissions matrix tab and by the role cards.
 */
export function usePermissionMatrix(roleIds: string[] | undefined) {
  const [matrix, setMatrix] = useState<Record<string, Set<string>>>({});
  const [loading, setLoading] = useState(true);
  const key = (roleIds ?? []).join(",");

  useEffect(() => {
    if (!roleIds || roleIds.length === 0) { setMatrix({}); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data: rows } = await supabase
        .from("grow_role_permissions")
        .select("role_id, permission_id, is_allowed")
        .in("role_id", roleIds)
        .eq("is_allowed", true);
      if (cancelled) return;
      const next: Record<string, Set<string>> = {};
      for (const r of rows ?? []) {
        const rid = (r as any).role_id;
        if (!next[rid]) next[rid] = new Set();
        next[rid].add((r as any).permission_id);
      }
      setMatrix(next);
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { matrix, loading };
}

export { CATEGORY_ORDER };
