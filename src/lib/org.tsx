import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { supabase } from "./supabase";
import { useAuth } from "./auth";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  plan: string;
  crm_plan: string | null;
  intel_plan: string | null;
}

export interface OrgMembership {
  org_id: string;
  role: string;
  organization: Organization;
}

interface OrgContextValue {
  org: Organization | null;
  orgId: string | null;
  memberships: OrgMembership[];
  role: string | null;
  loading: boolean;
  switchOrg: (orgId: string) => void;
  refresh: () => void;
}

const OrgContext = createContext<OrgContextValue | null>(null);

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [org, setOrg] = useState<Organization | null>(null);
  const [memberships, setMemberships] = useState<OrgMembership[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!user) { setOrg(null); setMemberships([]); setRole(null); setLoading(false); return; }

    async function load() {
      setLoading(true);

      const { data: members, error: memErr } = await supabase
        .from("org_members")
        .select("org_id, role")
        .eq("user_id", user!.id);

      if (memErr) { console.error("OrgProvider: failed to load memberships:", memErr.message); setLoading(false); return; }
      if (!members || members.length === 0) { setLoading(false); return; }

      const orgIds = members.map((m: any) => m.org_id);
      const { data: orgs, error: orgErr } = await supabase
        .from("organizations")
        .select("id, name, slug, logo_url, plan, crm_plan, intel_plan")
        .in("id", orgIds);

      if (orgErr) { console.error("OrgProvider: failed to load orgs:", orgErr.message); setLoading(false); return; }

      const orgMap = new Map((orgs ?? []).map((o: any) => [o.id, o]));
      const mems = (members ?? []).filter((m: any) => orgMap.has(m.org_id)).map((m: any) => ({
        org_id: m.org_id,
        role: m.role,
        organization: orgMap.get(m.org_id) as Organization,
      }));

      setMemberships(mems);

      if (mems.length > 0) {
        const savedOrgId = localStorage.getItem("cody-active-org");
        const active = mems.find((m) => m.org_id === savedOrgId) ?? mems[0];
        setOrg(active.organization);
        setRole(active.role);
        localStorage.setItem("cody-active-org", active.org_id);
      } else {
        setOrg(null);
        setRole(null);
      }
      setLoading(false);
    }

    load();
  }, [user?.id, tick]);

  const switchOrg = useCallback((targetOrgId: string) => {
    const mem = memberships.find((m) => m.org_id === targetOrgId);
    if (mem) {
      setOrg(mem.organization);
      setRole(mem.role);
      localStorage.setItem("cody-active-org", targetOrgId);
      window.location.reload();
    }
  }, [memberships]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const orgId = org?.id ?? null;

  // Memoize the value so consumers don't see a new ref on unrelated re-renders.
  const value = useMemo(
    () => ({ org, orgId, memberships, role, loading, switchOrg, refresh }),
    [org, orgId, memberships, role, loading, switchOrg, refresh],
  );

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error("useOrg must be used inside OrgProvider");
  return ctx;
}
