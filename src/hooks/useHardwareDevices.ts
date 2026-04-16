import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useOrg } from "@/lib/org";
import type { HardwareDevice, HardwareDeviceInput } from "./useEquipment";

export type { HardwareDevice, HardwareDeviceInput };

/**
 * CRUD for grow_hardware_devices as a standalone resource.
 *
 * Most Equipment flows go through useEquipment, which manages the hardware
 * device row implicitly (create + link in one call). This hook exists for
 * dedicated hardware management views (e.g. future Integrations settings).
 */
export function useHardwareDevices() {
  const { user } = useAuth();
  const { orgId } = useOrg();
  const [data, setData] = useState<HardwareDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!user || !orgId) { setData([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data: rows, error: err } = await supabase
        .from("grow_hardware_devices")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (err) { setError(err.message); setLoading(false); return; }
      setError(null);
      setData((rows ?? []) as HardwareDevice[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id, orgId, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const createDevice = useCallback(async (input: HardwareDeviceInput) => {
    if (!orgId) throw new Error("No active org");
    const { data: row, error: err } = await supabase
      .from("grow_hardware_devices")
      .insert({ ...input, org_id: orgId })
      .select("*")
      .single();
    if (err) throw err;
    refresh();
    return row as HardwareDevice;
  }, [orgId, refresh]);

  const updateDevice = useCallback(async (id: string, patch: Partial<HardwareDeviceInput>) => {
    const { data: row, error: err } = await supabase
      .from("grow_hardware_devices")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (err) throw err;
    refresh();
    return row as HardwareDevice;
  }, [refresh]);

  const deleteDevice = useCallback(async (id: string) => {
    const { error: err } = await supabase.from("grow_hardware_devices").delete().eq("id", id);
    if (err) throw err;
    refresh();
  }, [refresh]);

  return { data, loading, error, refresh, createDevice, updateDevice, deleteDevice };
}

export function useHardwareDeviceStats(devices: HardwareDevice[]) {
  return useMemo(() => {
    const now = Date.now();
    const stale = now - 7 * 24 * 60 * 60 * 1000;
    return {
      total: devices.length,
      active: devices.filter((d) => d.is_active).length,
      online: devices.filter((d) => d.last_ping_at && new Date(d.last_ping_at).getTime() > stale).length,
      byType: devices.reduce<Record<string, number>>((acc, d) => {
        const k = d.device_type ?? "other";
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {}),
    };
  }, [devices]);
}
