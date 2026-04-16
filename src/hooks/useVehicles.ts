import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useOrg } from "@/lib/org";

export type VehicleType = "delivery" | "pickup";

export interface Vehicle {
  id: string;
  org_id: string;
  vehicle_type: VehicleType;
  make: string;
  model: string;
  year: string;
  color: string | null;
  vin: string | null;
  license_plate: string;
  unit_name: string | null;
  client_account_id: string | null;
  insurance_company: string | null;
  insurance_policy_number: string | null;
  insurance_expires: string | null;
  registration_expires: string | null;
  hide_for_fulfillment: boolean;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  client_account?: { id: string; company_name: string } | null;
}

export interface VehicleInput {
  vehicle_type: VehicleType;
  make: string;
  model: string;
  year: string;
  color?: string | null;
  vin?: string | null;
  license_plate: string;
  unit_name?: string | null;
  client_account_id?: string | null;
  insurance_company?: string | null;
  insurance_policy_number?: string | null;
  insurance_expires?: string | null;
  registration_expires?: string | null;
  hide_for_fulfillment?: boolean;
  is_active?: boolean;
  notes?: string | null;
}

export function useVehicles() {
  const { user } = useAuth();
  const { orgId } = useOrg();
  const [data, setData] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!user || !orgId) { setData([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [vehicleRes, accRes] = await Promise.all([
        supabase.from("grow_vehicles").select("*").eq("org_id", orgId).order("unit_name", { nullsFirst: false }),
        supabase.from("grow_accounts").select("id, company_name").eq("org_id", orgId),
      ]);
      if (cancelled) return;
      if (vehicleRes.error) { setError(vehicleRes.error.message); setLoading(false); return; }
      const accById = new Map<string, any>();
      (accRes.data ?? []).forEach((a: any) => accById.set(a.id, a));
      const merged = (vehicleRes.data ?? []).map((v: any) => ({
        ...v,
        client_account: v.client_account_id ? accById.get(v.client_account_id) ?? null : null,
      })) as Vehicle[];
      setError(null);
      setData(merged);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id, orgId, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const createVehicle = useCallback(async (input: VehicleInput): Promise<Vehicle> => {
    if (!orgId) throw new Error("No active org");
    const { data: row, error: err } = await supabase
      .from("grow_vehicles")
      .insert({ ...input, org_id: orgId })
      .select("*").single();
    if (err) throw err;
    refresh();
    return row as any as Vehicle;
  }, [orgId, refresh]);

  const updateVehicle = useCallback(async (id: string, patch: Partial<VehicleInput>) => {
    const { data: row, error: err } = await supabase.from("grow_vehicles").update(patch).eq("id", id).select("*").single();
    if (err) throw err;
    refresh();
    return row as any as Vehicle;
  }, [refresh]);

  const archiveVehicle = useCallback(async (id: string) => {
    const { error: err } = await supabase.from("grow_vehicles").update({ is_active: false }).eq("id", id);
    if (err) throw err;
    refresh();
  }, [refresh]);

  return { data, loading, error, refresh, createVehicle, updateVehicle, archiveVehicle };
}

export function useVehicleStats(vehicles: Vehicle[]) {
  return useMemo(() => {
    const now = Date.now();
    const in30 = now + 30 * 24 * 60 * 60 * 1000;
    return {
      total: vehicles.length,
      delivery: vehicles.filter((v) => v.vehicle_type === "delivery").length,
      pickup: vehicles.filter((v) => v.vehicle_type === "pickup").length,
      insuranceExpiring: vehicles.filter((v) => {
        if (!v.insurance_expires) return false;
        const t = new Date(v.insurance_expires).getTime();
        return t >= now && t <= in30;
      }).length,
    };
  }, [vehicles]);
}
