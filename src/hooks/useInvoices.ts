import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useOrg } from "@/lib/org";

export interface Invoice {
  id: string;
  org_id: string;
  account_id: string;
  order_id: string | null;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  status: string | null;
  subtotal: number;
  discount_total: number | null;
  tax_total: number | null;
  total: number;
  amount_paid: number | null;
  balance: number;
  paid_at: string | null;
  notes: string | null;
  invoice_pdf_url: string | null;
  quickbooks_invoice_id: string | null;
  created_at: string | null;
  account?: { id: string; company_name: string; license_number: string | null } | null;
  order?: { id: string; order_number: string } | null;
}

export interface InvoiceFilters {
  account_id?: string;
  order_id?: string;
  status?: string;
}

export function useInvoices(filters: InvoiceFilters = {}) {
  const { user } = useAuth();
  const { orgId } = useOrg();
  const [data, setData] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const sig = [filters.account_id, filters.order_id, filters.status].join(":");

  useEffect(() => {
    if (!user || !orgId) { setData([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      let q = supabase.from("grow_invoices").select("*").eq("org_id", orgId);
      if (filters.account_id) q = q.eq("account_id", filters.account_id);
      if (filters.order_id) q = q.eq("order_id", filters.order_id);
      if (filters.status) q = q.eq("status", filters.status);
      const { data: rows, error } = await q.order("invoice_date", { ascending: false });
      if (cancelled) return;
      if (error) { console.error("useInvoices:", error.message); setData([]); setLoading(false); return; }
      const accountIds = Array.from(new Set(((rows ?? []) as any[]).map((r) => r.account_id).filter(Boolean)));
      const orderIds = Array.from(new Set(((rows ?? []) as any[]).map((r) => r.order_id).filter(Boolean)));
      const [{ data: accounts }, { data: orders }] = await Promise.all([
        accountIds.length > 0 ? supabase.from("grow_accounts").select("id, company_name, license_number").in("id", accountIds) : Promise.resolve({ data: [] }),
        orderIds.length > 0 ? supabase.from("grow_orders").select("id, order_number").in("id", orderIds) : Promise.resolve({ data: [] }),
      ]);
      const accountById = new Map<string, any>((accounts ?? []).map((a: any) => [a.id, a]));
      const orderById = new Map<string, any>((orders ?? []).map((o: any) => [o.id, o]));
      if (cancelled) return;
      setData(((rows ?? []) as any[]).map((r) => ({
        ...r,
        account: r.account_id ? accountById.get(r.account_id) ?? null : null,
        order: r.order_id ? orderById.get(r.order_id) ?? null : null,
      })));
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, orgId, tick, sig]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, refresh };
}

export function useInvoice(id: string | undefined) {
  const [data, setData] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!id) { setData(null); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data: row, error } = await supabase.from("grow_invoices").select("*").eq("id", id).single();
      if (cancelled) return;
      if (error || !row) { setData(null); setLoading(false); return; }
      const [{ data: account }, { data: order }] = await Promise.all([
        supabase.from("grow_accounts").select("id, company_name, license_number").eq("id", (row as any).account_id).single(),
        (row as any).order_id
          ? supabase.from("grow_orders").select("id, order_number").eq("id", (row as any).order_id).single()
          : Promise.resolve({ data: null }),
      ]);
      if (cancelled) return;
      setData({ ...(row as any), account: account as any, order: order as any });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, refresh };
}

export function useGenerateInvoice() {
  const { user } = useAuth();
  const { orgId } = useOrg();
  return useCallback(async (orderId: string, opts?: { dueDays?: number; notes?: string | null }): Promise<Invoice> => {
    if (!orgId || !user) throw new Error("Not authenticated");

    // Prevent duplicate — one invoice per order
    const { data: existing } = await supabase.from("grow_invoices").select("*").eq("org_id", orgId).eq("order_id", orderId).maybeSingle();
    if (existing) throw new Error(`Invoice ${(existing as any).invoice_number} already exists for this order`);

    const { data: order, error: oErr } = await supabase
      .from("grow_orders")
      .select("id, order_number, account_id, subtotal, discount_total, tax_total, total")
      .eq("id", orderId).single();
    if (oErr || !order) throw new Error(oErr?.message ?? "Order not found");

    const now = new Date();
    const dueDays = opts?.dueDays ?? 30;
    const due = new Date(now.getTime() + dueDays * 86400000);
    const stamp = now.toISOString().slice(0, 10).replace(/-/g, "");
    const invoiceNumber = `INV-${stamp}-${now.getTime().toString().slice(-4)}`;

    const total = Number((order as any).total ?? 0);
    const { data: inv, error } = await supabase.from("grow_invoices").insert({
      org_id: orgId,
      account_id: (order as any).account_id,
      order_id: orderId,
      invoice_number: invoiceNumber,
      invoice_date: now.toISOString().slice(0, 10),
      due_date: due.toISOString().slice(0, 10),
      status: "unpaid",
      subtotal: Number((order as any).subtotal ?? 0),
      discount_total: Number((order as any).discount_total ?? 0),
      tax_total: Number((order as any).tax_total ?? 0),
      total,
      amount_paid: 0,
      balance: total,
      notes: opts?.notes ?? null,
      created_by: user.id,
    }).select("*").single();
    if (error) throw error;

    // Flip order → invoiced if it's past release
    await supabase.from("grow_orders").update({ status: "invoiced" }).eq("id", orderId).in("status", ["released", "manifested", "allocated"]);

    return inv as unknown as Invoice;
  }, [user?.id, orgId]);
}

export function useMarkInvoicePaid() {
  return useCallback(async (id: string, amount?: number): Promise<void> => {
    const { data: inv, error: rErr } = await supabase.from("grow_invoices").select("total, amount_paid").eq("id", id).single();
    if (rErr || !inv) throw new Error(rErr?.message ?? "Invoice not found");
    const total = Number((inv as any).total ?? 0);
    const alreadyPaid = Number((inv as any).amount_paid ?? 0);
    const toPay = amount ?? (total - alreadyPaid);
    const newPaid = alreadyPaid + toPay;
    const fullyPaid = newPaid >= total;
    const { error } = await supabase.from("grow_invoices").update({
      amount_paid: newPaid,
      balance: Math.max(0, total - newPaid),
      status: fullyPaid ? "paid" : "partial",
      paid_at: fullyPaid ? new Date().toISOString() : null,
    }).eq("id", id);
    if (error) throw error;
  }, []);
}

export interface InvoiceStats {
  total: number;
  outstanding: number;
  paid: number;
  overdue: number;
  outstandingAmount: number;
  paidAmount: number;
  overdueAmount: number;
  aging: { current: number; days_30: number; days_60: number; days_90: number; days_90_plus: number };
}

export function useInvoiceStats(invoices: Invoice[]): InvoiceStats {
  return useMemo(() => {
    const now = Date.now();
    let outstandingAmount = 0, paidAmount = 0, overdueAmount = 0;
    let outstanding = 0, paid = 0, overdue = 0;
    const aging = { current: 0, days_30: 0, days_60: 0, days_90: 0, days_90_plus: 0 };
    for (const inv of invoices) {
      const bal = Number(inv.balance ?? 0);
      if (inv.status === "paid") { paid++; paidAmount += Number(inv.total ?? 0); continue; }
      outstanding++; outstandingAmount += bal;
      const due = inv.due_date ? new Date(inv.due_date).getTime() : null;
      if (due && due < now) {
        overdue++; overdueAmount += bal;
        const daysPast = Math.floor((now - due) / 86400000);
        if (daysPast <= 30) aging.days_30 += bal;
        else if (daysPast <= 60) aging.days_60 += bal;
        else if (daysPast <= 90) aging.days_90 += bal;
        else aging.days_90_plus += bal;
      } else {
        aging.current += bal;
      }
    }
    return {
      total: invoices.length,
      outstanding, paid, overdue,
      outstandingAmount, paidAmount, overdueAmount,
      aging,
    };
  }, [invoices]);
}
