import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useOrg } from "@/lib/org";

export interface KioskEmployee {
  id: string;
  employee_number: string | null;
  first_name: string;
  last_name: string;
  job_title: string | null;
  facility_id: string | null;
  last_punch?: { punch_type: string; punched_at: string } | null;
}

/** Very lightweight session state kept in sessionStorage — no auth, meant for shared tablets. */
const SESSION_KEY = "cody_grow_kiosk_session";

export interface KioskSession {
  employeeId: string;
  employeeName: string;
  facilityId: string | null;
  sessionId: string;
  signedInAt: string;
}

export function useKioskSession() {
  const [session, setSession] = useState<KioskSession | null>(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });

  const signOut = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    setSession(null);
  }, []);

  const setKioskSession = useCallback((s: KioskSession | null) => {
    if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(SESSION_KEY);
    setSession(s);
  }, []);

  return { session, setSession: setKioskSession, signOut };
}

/**
 * Look up employee by employee_number. PIN validation is optional — if the
 * employee has a matching kiosk session with a pin, require it; otherwise
 * employee_number is enough (many orgs don't use PINs on shared tablets).
 */
export function useKioskLogin() {
  const { orgId } = useOrg();
  return useCallback(async (employeeNumber: string, pin?: string): Promise<KioskEmployee | null> => {
    if (!orgId) throw new Error("No active org");
    const { data: employee } = await supabase.from("grow_employees")
      .select("id, employee_number, first_name, last_name, job_title, facility_id")
      .eq("org_id", orgId).eq("employee_number", employeeNumber.trim()).eq("employment_status", "active").maybeSingle();
    if (!employee) return null;
    // Optional PIN check against kiosk_sessions.pin_code for this employee's facility
    if (pin) {
      const { data: kioskSession } = await supabase.from("grow_kiosk_sessions")
        .select("pin_code").eq("org_id", orgId).eq("facility_id", employee.facility_id ?? "").maybeSingle();
      if (kioskSession && (kioskSession as any).pin_code && (kioskSession as any).pin_code !== pin) {
        return null;
      }
    }
    return employee as KioskEmployee;
  }, [orgId]);
}

export function useLatestPunch(employeeId: string | undefined) {
  const [punch, setPunch] = useState<any | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!employeeId) { setPunch(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("grow_time_clock_punches")
        .select("*").eq("employee_id", employeeId)
        .order("punched_at", { ascending: false }).limit(1);
      if (!cancelled) setPunch(((data ?? []) as any[])[0] ?? null);
    })();
    return () => { cancelled = true; };
  }, [employeeId, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { punch, refresh, isClockedIn: punch?.punch_type === "in" };
}

export function useKioskPunch() {
  const { orgId } = useOrg();
  return useCallback(async (employeeId: string, punchType: "in" | "out") => {
    if (!orgId) throw new Error("No active org");
    const { error } = await supabase.from("grow_time_clock_punches").insert({
      org_id: orgId,
      employee_id: employeeId,
      punch_type: punchType,
      punched_at: new Date().toISOString(),
    });
    if (error) throw error;
  }, [orgId]);
}

export function useKioskTasks(employeeId: string | undefined) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!employeeId) { setTasks([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);
      const { data } = await supabase.from("grow_tasks")
        .select("*").eq("assigned_to_employee_id", employeeId)
        .not("status", "in", "(completed,cancelled)")
        .order("scheduled_end", { ascending: true, nullsFirst: false }).limit(20);
      if (!cancelled) { setTasks((data ?? []) as any[]); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [employeeId, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { tasks, loading, refresh };
}

export function useKioskScanPlant() {
  const { orgId } = useOrg();
  return useCallback(async (identifier: string) => {
    if (!orgId) return null;
    const { data } = await supabase.from("grow_plants")
      .select("*").eq("org_id", orgId).or(`plant_identifier.eq.${identifier},external_id.eq.${identifier}`).maybeSingle();
    if (!data) return null;
    const [strain, area] = await Promise.all([
      (data as any).strain_id ? supabase.from("grow_strains").select("name, type").eq("id", (data as any).strain_id).maybeSingle() : Promise.resolve({ data: null }),
      (data as any).area_id ? supabase.from("grow_areas").select("name").eq("id", (data as any).area_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    return { ...(data as any), strain: (strain as any).data, area: (area as any).data };
  }, [orgId]);
}

export function useKioskScanBatch() {
  const { orgId } = useOrg();
  return useCallback(async (barcode: string) => {
    if (!orgId) return null;
    const { data } = await supabase.from("grow_batches")
      .select("*").eq("org_id", orgId).or(`barcode.eq.${barcode},external_id.eq.${barcode}`).maybeSingle();
    if (!data) return null;
    const [product, strain] = await Promise.all([
      (data as any).product_id ? supabase.from("grow_products").select("name, ccrs_inventory_category").eq("id", (data as any).product_id).maybeSingle() : Promise.resolve({ data: null }),
      (data as any).strain_id ? supabase.from("grow_strains").select("name, type").eq("id", (data as any).strain_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    return { ...(data as any), product: (product as any).data, strain: (strain as any).data };
  }, [orgId]);
}

export function useKioskLog() {
  const { orgId } = useOrg();
  return useCallback(async (input: { area_id?: string | null; content: string; log_type?: string }) => {
    if (!orgId) throw new Error("No active org");
    const { error } = await supabase.from("grow_logs").insert({
      org_id: orgId,
      content: input.content,
      log_type: input.log_type ?? "general",
      area_id: input.area_id ?? null,
      recorded_at: new Date().toISOString(),
    });
    if (error) throw error;
  }, [orgId]);
}
