import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useOrg } from "@/lib/org";
import type { CalibrationResult } from "@/lib/schema-enums";

export interface CalibrationEntry {
  id: string;
  equipment_id: string;
  calibrated_at: string;
  calibrated_by: string | null;
  technician_name: string | null;
  certificate_url: string | null;
  pass_fail: CalibrationResult | null;
  notes: string | null;
  reference_standard: string | null;
  before_reading: string | null;
  after_reading: string | null;
  tolerance: string | null;
  deviation: string | null;
  next_calibration_due: string | null;
  created_at: string;
  /** Joined equipment info */
  equipment?: {
    id: string;
    name: string | null;
    equipment_type: string | null;
    make: string | null;
    model: string | null;
  } | null;
  /** Joined technician (employee) */
  technician?: { id: string; first_name: string; last_name: string } | null;
}

export interface CalibrationEntryInput {
  equipment_id: string;
  calibrated_at: string;
  calibrated_by?: string | null;
  technician_name?: string | null;
  pass_fail: CalibrationResult;
  reference_standard?: string | null;
  before_reading?: string | null;
  after_reading?: string | null;
  tolerance?: string | null;
  deviation?: string | null;
  certificate_url?: string | null;
  next_calibration_due?: string | null;
  notes?: string | null;
}

/**
 * Load the calibration log.
 *
 * - Pass `equipmentId` to scope to a single piece of equipment (detail page).
 * - Org scoping happens implicitly through RLS on grow_calibration_log +
 *   the equipment FK. The client query also scopes by org via the equipment
 *   join (two-query pattern) to avoid leaking any row that slipped RLS.
 */
export function useCalibrationLog(equipmentId?: string | null) {
  const { user } = useAuth();
  const { orgId } = useOrg();
  const [data, setData] = useState<CalibrationEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!user || !orgId) { setData([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      // Step 1: load equipment IDs we're allowed to see in this org
      const eqQuery = supabase
        .from("grow_equipment")
        .select("id, name, equipment_type, make, model")
        .eq("org_id", orgId);
      if (equipmentId) eqQuery.eq("id", equipmentId);
      const eqRes = await eqQuery;
      if (cancelled) return;
      if (eqRes.error) { setError(eqRes.error.message); setLoading(false); return; }
      const eqById = new Map<string, any>();
      (eqRes.data ?? []).forEach((e: any) => eqById.set(e.id, e));
      const eqIds = Array.from(eqById.keys());

      if (eqIds.length === 0) {
        setData([]);
        setError(null);
        setLoading(false);
        return;
      }

      // Step 2: load calibration log rows scoped to those equipment IDs
      const [logRes, empRes] = await Promise.all([
        supabase
          .from("grow_calibration_log")
          .select("*")
          .in("equipment_id", eqIds)
          .order("calibrated_at", { ascending: false }),
        supabase.from("grow_employees").select("id, first_name, last_name").eq("org_id", orgId),
      ]);
      if (cancelled) return;
      if (logRes.error) { setError(logRes.error.message); setLoading(false); return; }
      const empById = new Map<string, any>();
      (empRes.data ?? []).forEach((e: any) => empById.set(e.id, e));

      const merged = (logRes.data ?? []).map((l: any) => ({
        ...l,
        equipment: eqById.get(l.equipment_id) ?? null,
        technician: l.calibrated_by ? empById.get(l.calibrated_by) ?? null : null,
      })) as CalibrationEntry[];

      setData(merged);
      setError(null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id, orgId, equipmentId, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  /**
   * Log a calibration event and update the parent equipment's
   * last_calibration_date / next_calibration_due in the same operation
   * (sequential — Supabase JS client has no transaction API).
   *
   * The UI-computed `next_calibration_due` (either auto-derived from
   * frequency_days or user-overridden) is persisted both on the log row
   * (for audit) and on the equipment row (for scheduling).
   */
  const createCalibrationEntry = useCallback(async (input: CalibrationEntryInput) => {
    const { data: row, error: err } = await supabase
      .from("grow_calibration_log")
      .insert(input)
      .select("*")
      .single();
    if (err) throw err;

    const equipmentUpdate: Record<string, any> = {
      last_calibration_date: input.calibrated_at.slice(0, 10),
    };
    if (input.next_calibration_due) {
      equipmentUpdate.next_calibration_due = input.next_calibration_due;
    }
    const { error: upErr } = await supabase
      .from("grow_equipment")
      .update(equipmentUpdate)
      .eq("id", input.equipment_id);
    if (upErr) throw upErr;

    refresh();
    return row as CalibrationEntry;
  }, [refresh]);

  const deleteCalibrationEntry = useCallback(async (id: string) => {
    const { error: err } = await supabase.from("grow_calibration_log").delete().eq("id", id);
    if (err) throw err;
    refresh();
  }, [refresh]);

  return { data, loading, error, refresh, createCalibrationEntry, deleteCalibrationEntry };
}

export function useCalibrationStats(entries: CalibrationEntry[]) {
  return useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const nowTs = now.getTime();
    return {
      total: entries.length,
      thisMonth: entries.filter((e) => new Date(e.calibrated_at).getTime() >= monthStart).length,
      failures: entries.filter((e) => e.pass_fail === "fail").length,
      overdueDevices: new Set(
        entries
          .filter((e) => e.next_calibration_due && new Date(e.next_calibration_due).getTime() < nowTs)
          .map((e) => e.equipment_id),
      ).size,
    };
  }, [entries]);
}
