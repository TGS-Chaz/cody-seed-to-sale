import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useOrg } from "@/lib/org";
import type {
  EquipmentType,
  EquipmentStatus,
  HardwareConnectionType,
  HardwareIntegrationType,
  HardwareDeviceType,
} from "@/lib/schema-enums";

export interface HardwareDevice {
  id: string;
  org_id: string;
  facility_id: string | null;
  device_type: HardwareDeviceType | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  mac_address: string | null;
  ip_address: string | null;
  connection_type: HardwareConnectionType | null;
  integration_type: HardwareIntegrationType | null;
  api_endpoint: string | null;
  api_key_encrypted: string | null;
  webhook_url: string | null;
  assigned_to_area_id: string | null;
  is_active: boolean;
  last_ping_at: string | null;
  last_reading_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Equipment {
  id: string;
  org_id: string;
  facility_id: string | null;
  area_id: string | null;
  equipment_type: EquipmentType | null;
  name: string | null;
  make: string | null;
  model: string | null;
  serial_number: string | null;
  asset_tag: string | null;
  status: EquipmentStatus;
  requires_calibration: boolean;
  last_calibration_date: string | null;
  next_calibration_due: string | null;
  calibration_frequency_days: number | null;
  purchase_date: string | null;
  purchase_price: number | null;
  warranty_expires: string | null;
  vendor: string | null;
  hardware_device_id: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  /** Joined facility */
  facility?: { id: string; name: string } | null;
  /** Joined area */
  area?: { id: string; name: string } | null;
  /** Joined hardware device (if integrated) */
  hardware_device?: HardwareDevice | null;
}

export interface EquipmentInput {
  name: string;
  equipment_type: EquipmentType;
  make?: string | null;
  model?: string | null;
  serial_number?: string | null;
  asset_tag?: string | null;
  facility_id?: string | null;
  area_id?: string | null;
  status?: EquipmentStatus;
  requires_calibration?: boolean;
  calibration_frequency_days?: number | null;
  last_calibration_date?: string | null;
  next_calibration_due?: string | null;
  purchase_date?: string | null;
  purchase_price?: number | null;
  warranty_expires?: string | null;
  vendor?: string | null;
  hardware_device_id?: string | null;
  notes?: string | null;
}

/** Hardware device payload for create/update — shared shape across
 * the useEquipment hook (when creating an integrated device inline from
 * the Equipment form) and the useHardwareDevices hook. */
export interface HardwareDeviceInput {
  device_type: HardwareDeviceType;
  manufacturer?: string | null;
  model?: string | null;
  serial_number?: string | null;
  mac_address?: string | null;
  ip_address?: string | null;
  connection_type?: HardwareConnectionType | null;
  integration_type?: HardwareIntegrationType | null;
  api_endpoint?: string | null;
  api_key_encrypted?: string | null;
  webhook_url?: string | null;
  facility_id?: string | null;
  assigned_to_area_id?: string | null;
  notes?: string | null;
}

export function useEquipment() {
  const { user } = useAuth();
  const { orgId } = useOrg();
  const [data, setData] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!user || !orgId) { setData([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [eqRes, facRes, areaRes, hwRes] = await Promise.all([
        supabase.from("grow_equipment").select("*").eq("org_id", orgId).order("name", { ascending: true, nullsFirst: false }),
        supabase.from("grow_facilities").select("id, name").eq("org_id", orgId),
        supabase.from("grow_areas").select("id, name").eq("org_id", orgId),
        supabase.from("grow_hardware_devices").select("*").eq("org_id", orgId),
      ]);
      if (cancelled) return;
      if (eqRes.error) { setError(eqRes.error.message); setLoading(false); return; }
      const facById = new Map<string, any>();
      (facRes.data ?? []).forEach((f: any) => facById.set(f.id, f));
      const areaById = new Map<string, any>();
      (areaRes.data ?? []).forEach((a: any) => areaById.set(a.id, a));
      const hwById = new Map<string, any>();
      (hwRes.data ?? []).forEach((h: any) => hwById.set(h.id, h));

      const merged = (eqRes.data ?? []).map((e: any) => ({
        ...e,
        facility: e.facility_id ? facById.get(e.facility_id) ?? null : null,
        area: e.area_id ? areaById.get(e.area_id) ?? null : null,
        hardware_device: e.hardware_device_id ? hwById.get(e.hardware_device_id) ?? null : null,
      })) as Equipment[];

      setError(null);
      setData(merged);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id, orgId, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  /**
   * Create equipment. If `hardwareDevice` is supplied, a grow_hardware_devices row is
   * inserted first and the equipment row links to it via hardware_device_id.
   * Both inserts are scoped to the active org_id.
   */
  const createEquipment = useCallback(async (
    input: EquipmentInput,
    hardwareDevice?: HardwareDeviceInput | null,
  ): Promise<Equipment> => {
    if (!orgId) throw new Error("No active org");

    let hardware_device_id: string | null = input.hardware_device_id ?? null;
    if (hardwareDevice && !hardware_device_id) {
      const hwPayload = {
        ...hardwareDevice,
        org_id: orgId,
        facility_id: hardwareDevice.facility_id ?? input.facility_id ?? null,
        assigned_to_area_id: hardwareDevice.assigned_to_area_id ?? input.area_id ?? null,
      };
      const { data: hwRow, error: hwErr } = await supabase
        .from("grow_hardware_devices")
        .insert(hwPayload)
        .select("id")
        .single();
      if (hwErr) throw hwErr;
      hardware_device_id = hwRow!.id;
    }

    const payload = {
      ...input,
      org_id: orgId,
      hardware_device_id,
      status: input.status ?? "active",
      requires_calibration: input.requires_calibration ?? false,
    };
    const { data: row, error: err } = await supabase.from("grow_equipment").insert(payload).select("*").single();
    if (err) throw err;
    refresh();
    return row as Equipment;
  }, [orgId, refresh]);

  const updateEquipment = useCallback(async (
    id: string,
    patch: Partial<EquipmentInput>,
    hardwareDevicePatch?: { id?: string | null; data?: HardwareDeviceInput | null; disconnect?: boolean } | null,
  ): Promise<Equipment> => {
    if (!orgId) throw new Error("No active org");

    let hardware_device_id: string | null | undefined = patch.hardware_device_id;

    if (hardwareDevicePatch) {
      if (hardwareDevicePatch.disconnect) {
        hardware_device_id = null;
      } else if (hardwareDevicePatch.id && hardwareDevicePatch.data) {
        // Update existing hardware device row
        const { error: hwErr } = await supabase
          .from("grow_hardware_devices")
          .update(hardwareDevicePatch.data)
          .eq("id", hardwareDevicePatch.id);
        if (hwErr) throw hwErr;
        hardware_device_id = hardwareDevicePatch.id;
      } else if (hardwareDevicePatch.data && !hardwareDevicePatch.id) {
        // Create new hardware device row and link it
        const hwPayload = {
          ...hardwareDevicePatch.data,
          org_id: orgId,
          facility_id: hardwareDevicePatch.data.facility_id ?? patch.facility_id ?? null,
          assigned_to_area_id: hardwareDevicePatch.data.assigned_to_area_id ?? patch.area_id ?? null,
        };
        const { data: hwRow, error: hwErr } = await supabase
          .from("grow_hardware_devices")
          .insert(hwPayload)
          .select("id")
          .single();
        if (hwErr) throw hwErr;
        hardware_device_id = hwRow!.id;
      }
    }

    const updatePayload: any = { ...patch };
    if (hardware_device_id !== undefined) updatePayload.hardware_device_id = hardware_device_id;

    const { data: row, error: err } = await supabase
      .from("grow_equipment")
      .update(updatePayload)
      .eq("id", id)
      .select("*")
      .single();
    if (err) throw err;
    refresh();
    return row as Equipment;
  }, [orgId, refresh]);

  const decommissionEquipment = useCallback(async (id: string) => {
    const { error: err } = await supabase
      .from("grow_equipment")
      .update({ status: "decommissioned", is_active: false })
      .eq("id", id);
    if (err) throw err;
    refresh();
  }, [refresh]);

  return { data, loading, error, refresh, createEquipment, updateEquipment, decommissionEquipment };
}

export function useEquipmentItem(id: string | undefined) {
  const { user } = useAuth();
  const { orgId } = useOrg();
  const [data, setData] = useState<Equipment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!user || !orgId || !id) { setData(null); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data: row, error: err } = await supabase
        .from("grow_equipment")
        .select("*")
        .eq("id", id)
        .eq("org_id", orgId)
        .maybeSingle();
      if (cancelled) return;
      if (err) { setError(err.message); setLoading(false); return; }
      if (!row) { setData(null); setLoading(false); return; }

      const [facRes, areaRes, hwRes] = await Promise.all([
        row.facility_id ? supabase.from("grow_facilities").select("id, name").eq("id", row.facility_id).maybeSingle() : Promise.resolve({ data: null }),
        row.area_id ? supabase.from("grow_areas").select("id, name").eq("id", row.area_id).maybeSingle() : Promise.resolve({ data: null }),
        row.hardware_device_id ? supabase.from("grow_hardware_devices").select("*").eq("id", row.hardware_device_id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      if (cancelled) return;
      setData({
        ...(row as any),
        facility: (facRes as any).data ?? null,
        area: (areaRes as any).data ?? null,
        hardware_device: (hwRes as any).data ?? null,
      } as Equipment);
      setError(null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id, orgId, id, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, refresh };
}

export function useEquipmentStats(equipment: Equipment[]) {
  return useMemo(() => {
    const now = Date.now();
    const in7 = now + 7 * 24 * 60 * 60 * 1000;
    return {
      total: equipment.length,
      integrated: equipment.filter((e) => !!e.hardware_device_id).length,
      needsCalibration: equipment.filter((e) => {
        if (!e.requires_calibration) return false;
        if (!e.next_calibration_due) return true; // Required but never scheduled
        const t = new Date(e.next_calibration_due).getTime();
        return t <= in7;
      }).length,
      outOfService: equipment.filter((e) => e.status === "out_of_service" || e.status === "decommissioned").length,
    };
  }, [equipment]);
}
