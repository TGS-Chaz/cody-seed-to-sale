import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useOrg } from "@/lib/org";
import type { DriverType as SchemaDriverType } from "@/lib/schema-enums";

export type DriverType = SchemaDriverType;

export interface Driver {
  id: string;
  org_id: string;
  driver_type: DriverType;
  first_name: string;
  last_name: string;
  drivers_license_number: string;
  drivers_license_state: string;
  drivers_license_expires: string | null;
  phone: string | null;
  email: string | null;
  employee_id: string | null;
  client_account_id: string | null;
  client_license_number: string | null;
  hide_for_fulfillment: boolean;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  /** Joined employee info (for delivery drivers) */
  employee?: { id: string; first_name: string; last_name: string } | null;
  /** Joined client account info (for pickup drivers) */
  client_account?: { id: string; company_name: string } | null;
}

export interface DriverInput {
  driver_type: DriverType;
  first_name: string;
  last_name: string;
  drivers_license_number: string;
  drivers_license_state?: string;
  drivers_license_expires?: string | null;
  phone?: string | null;
  email?: string | null;
  employee_id?: string | null;
  client_account_id?: string | null;
  client_license_number?: string | null;
  hide_for_fulfillment?: boolean;
  is_active?: boolean;
  notes?: string | null;
}

export function useDrivers() {
  const { user } = useAuth();
  const { orgId } = useOrg();
  const [data, setData] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!user || !orgId) { setData([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [driverRes, empRes, accRes] = await Promise.all([
        supabase.from("grow_drivers").select("*").eq("org_id", orgId).order("last_name"),
        supabase.from("grow_employees").select("id, first_name, last_name").eq("org_id", orgId),
        supabase.from("grow_accounts").select("id, company_name").eq("org_id", orgId),
      ]);
      if (cancelled) return;
      if (driverRes.error) { setError(driverRes.error.message); setLoading(false); return; }
      const empById = new Map<string, any>();
      (empRes.data ?? []).forEach((e: any) => empById.set(e.id, e));
      const accById = new Map<string, any>();
      (accRes.data ?? []).forEach((a: any) => accById.set(a.id, a));
      const merged = (driverRes.data ?? []).map((d: any) => ({
        ...d,
        employee: d.employee_id ? empById.get(d.employee_id) ?? null : null,
        client_account: d.client_account_id ? accById.get(d.client_account_id) ?? null : null,
      })) as Driver[];
      setError(null);
      setData(merged);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id, orgId, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const createDriver = useCallback(
    async (input: DriverInput): Promise<Driver> => {
      if (!orgId) throw new Error("No active org");
      const payload = { ...input, org_id: orgId, drivers_license_state: input.drivers_license_state ?? "WA" };
      const { data: row, error: err } = await supabase.from("grow_drivers").insert(payload).select("*").single();
      if (err) throw err;
      refresh();
      return row as any as Driver;
    },
    [orgId, refresh],
  );

  const updateDriver = useCallback(async (id: string, patch: Partial<DriverInput>) => {
    const { data: row, error: err } = await supabase.from("grow_drivers").update(patch).eq("id", id).select("*").single();
    if (err) throw err;
    refresh();
    return row as any as Driver;
  }, [refresh]);

  const archiveDriver = useCallback(async (id: string) => {
    const { error: err } = await supabase.from("grow_drivers").update({ is_active: false }).eq("id", id);
    if (err) throw err;
    refresh();
  }, [refresh]);

  return { data, loading, error, refresh, createDriver, updateDriver, archiveDriver };
}

export function useDriverStats(drivers: Driver[]) {
  return useMemo(() => {
    const now = Date.now();
    const in30 = now + 30 * 24 * 60 * 60 * 1000;
    return {
      total: drivers.length,
      delivery: drivers.filter((d) => d.driver_type === "delivery").length,
      pickup: drivers.filter((d) => d.driver_type === "pickup").length,
      licenseExpiring: drivers.filter((d) => {
        if (!d.drivers_license_expires) return false;
        const t = new Date(d.drivers_license_expires).getTime();
        return t >= now && t <= in30;
      }).length,
    };
  }, [drivers]);
}
