import { supabase } from "@/lib/supabase";

interface InvoiceLine {
  product_name: string;
  sku: string | null;
  quantity: number;
  unit_price: number;
  discount: number;
  tax: number;
  line_total: number;
}

interface InvoiceData {
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  status: string | null;
  org: { name: string | null; license: string | null; address: string | null; phone: string | null; email: string | null };
  bill_to: { name: string; license: string | null; address: string | null; contact_name: string | null; contact_email: string | null };
  order_number: string | null;
  lines: InvoiceLine[];
  subtotal: number;
  discount_total: number;
  tax_total: number;
  total: number;
  amount_paid: number;
  balance: number;
  notes: string | null;
}

export async function generateInvoice(invoiceId: string): Promise<string> {
  const { data: inv, error } = await supabase.from("grow_invoices").select("*").eq("id", invoiceId).single();
  if (error || !inv) throw new Error(error?.message ?? "Invoice not found");

  const [{ data: account }, { data: order }, { data: org }, { data: primaryFacility }] = await Promise.all([
    supabase.from("grow_accounts").select("*").eq("id", (inv as any).account_id).single(),
    (inv as any).order_id
      ? supabase.from("grow_orders").select("order_number").eq("id", (inv as any).order_id).single()
      : Promise.resolve({ data: null }),
    supabase.from("organizations").select("name").eq("id", (inv as any).org_id).single(),
    supabase.from("grow_facilities").select("*").eq("org_id", (inv as any).org_id).eq("is_primary", true).maybeSingle(),
  ]);

  let lines: InvoiceLine[] = [];
  if ((inv as any).order_id) {
    const { data: items } = await supabase
      .from("grow_order_items")
      .select("quantity, unit_price, discount, sales_tax, other_tax, line_total, product_id")
      .eq("order_id", (inv as any).order_id);
    const productIds = ((items ?? []) as any[]).map((i) => i.product_id).filter(Boolean);
    const { data: products } = productIds.length > 0
      ? await supabase.from("grow_products").select("id, name, sku").in("id", productIds)
      : { data: [] };
    const productById = new Map<string, any>(((products ?? []) as any[]).map((p) => [p.id, p]));
    lines = ((items ?? []) as any[]).map((i) => {
      const p = productById.get(i.product_id);
      return {
        product_name: p?.name ?? "—",
        sku: p?.sku ?? null,
        quantity: Number(i.quantity ?? 0),
        unit_price: Number(i.unit_price ?? 0),
        discount: Number(i.discount ?? 0),
        tax: Number(i.sales_tax ?? 0) + Number(i.other_tax ?? 0),
        line_total: Number(i.line_total ?? 0),
      };
    });
  }

  const data: InvoiceData = {
    invoice_number: (inv as any).invoice_number,
    invoice_date: (inv as any).invoice_date,
    due_date: (inv as any).due_date,
    status: (inv as any).status,
    org: {
      name: (org as any)?.name ?? null,
      license: (primaryFacility as any)?.license_number ?? null,
      address: (primaryFacility as any)?.address ?? null,
      phone: (primaryFacility as any)?.phone ?? null,
      email: (primaryFacility as any)?.email ?? null,
    },
    bill_to: {
      name: (account as any).company_name,
      license: (account as any).license_number,
      address: [(account as any).street_address, (account as any).city, (account as any).state, (account as any).postal_code].filter(Boolean).join(", ") || null,
      contact_name: (account as any).primary_contact_name,
      contact_email: (account as any).primary_contact_email,
    },
    order_number: (order as any)?.order_number ?? null,
    lines,
    subtotal: Number((inv as any).subtotal ?? 0),
    discount_total: Number((inv as any).discount_total ?? 0),
    tax_total: Number((inv as any).tax_total ?? 0),
    total: Number((inv as any).total ?? 0),
    amount_paid: Number((inv as any).amount_paid ?? 0),
    balance: Number((inv as any).balance ?? 0),
    notes: (inv as any).notes,
  };

  return renderInvoiceHTML(data);
}

function renderInvoiceHTML(d: InvoiceData): string {
  const esc = (s: string | null | undefined) => String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const money = (n: number) => `$${n.toFixed(2)}`;
  const statusColor = d.status === "paid" ? "#10B981" : d.status === "overdue" ? "#EF4444" : d.status === "partial" ? "#F59E0B" : "#6B7280";

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Invoice ${esc(d.invoice_number)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; padding: 32px; color: #111; max-width: 850px; }
    h1 { margin: 0 0 4px 0; font-size: 28px; font-weight: 700; letter-spacing: -0.5px; }
    .hdr { display: flex; justify-content: space-between; margin-bottom: 32px; align-items: flex-start; }
    .org { text-align: left; font-size: 11px; color: #333; line-height: 1.5; }
    .org .name { font-size: 14px; font-weight: 700; color: #111; margin-bottom: 2px; }
    .meta { text-align: right; font-size: 11px; color: #555; line-height: 1.6; }
    .meta strong { color: #111; display: inline-block; min-width: 80px; text-align: right; margin-right: 8px; }
    .status { display: inline-block; padding: 4px 10px; border-radius: 99px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #fff; background: ${statusColor}; }
    .billto { background: #F9FAFB; padding: 16px; border-radius: 8px; margin-bottom: 24px; }
    .billto h3 { margin: 0 0 6px 0; font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: #6B7280; }
    .billto .name { font-size: 13px; font-weight: 600; }
    .billto .addr { font-size: 11px; color: #555; line-height: 1.5; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    th, td { padding: 10px 12px; text-align: left; font-size: 11px; }
    thead { background: #111; color: #fff; }
    thead th { font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; font-size: 10px; }
    tbody tr { border-bottom: 1px solid #E5E7EB; }
    tbody tr:last-child { border-bottom: 2px solid #111; }
    .num { text-align: right; font-family: "SF Mono", Monaco, monospace; }
    .totals { display: flex; justify-content: flex-end; margin-bottom: 24px; }
    .totals table { width: 320px; }
    .totals td { border: 0; padding: 6px 12px; }
    .totals .label { text-align: right; color: #555; }
    .totals .value { text-align: right; font-family: "SF Mono", Monaco, monospace; font-weight: 500; }
    .totals .grand { border-top: 2px solid #111; font-weight: 700; font-size: 14px; }
    .totals .grand td { padding-top: 10px; }
    .totals .balance td { color: ${d.balance > 0 ? "#DC2626" : "#10B981"}; font-weight: 700; }
    .notes { border-top: 1px solid #E5E7EB; padding-top: 16px; font-size: 11px; color: #555; line-height: 1.6; }
    .notes h3 { margin: 0 0 8px 0; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #111; }
    .footer { margin-top: 32px; font-size: 9px; color: #999; text-align: center; }
    @media print { body { padding: 18px; } }
  </style>
</head>
<body>
  <div class="hdr">
    <div class="org">
      ${d.org.name ? `<div class="name">${esc(d.org.name)}</div>` : ""}
      ${d.org.license ? `<div>License: ${esc(d.org.license)}</div>` : ""}
      ${d.org.address ? `<div>${esc(d.org.address)}</div>` : ""}
      ${d.org.phone ? `<div>${esc(d.org.phone)}</div>` : ""}
      ${d.org.email ? `<div>${esc(d.org.email)}</div>` : ""}
    </div>
    <div>
      <h1>INVOICE</h1>
      <div class="meta">
        <div><strong>Invoice #:</strong> ${esc(d.invoice_number)}</div>
        <div><strong>Date:</strong> ${esc(d.invoice_date)}</div>
        ${d.due_date ? `<div><strong>Due:</strong> ${esc(d.due_date)}</div>` : ""}
        ${d.order_number ? `<div><strong>Order:</strong> ${esc(d.order_number)}</div>` : ""}
        <div style="margin-top: 10px;"><span class="status">${esc(d.status ?? "unpaid")}</span></div>
      </div>
    </div>
  </div>

  <div class="billto">
    <h3>Bill to</h3>
    <div class="name">${esc(d.bill_to.name)}</div>
    ${d.bill_to.license ? `<div class="addr">License: ${esc(d.bill_to.license)}</div>` : ""}
    ${d.bill_to.address ? `<div class="addr">${esc(d.bill_to.address)}</div>` : ""}
    ${d.bill_to.contact_name ? `<div class="addr">Attn: ${esc(d.bill_to.contact_name)}${d.bill_to.contact_email ? ` · ${esc(d.bill_to.contact_email)}` : ""}</div>` : ""}
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th>SKU</th>
        <th class="num">Qty</th>
        <th class="num">Unit</th>
        <th class="num">Discount</th>
        <th class="num">Tax</th>
        <th class="num">Line total</th>
      </tr>
    </thead>
    <tbody>
      ${d.lines.length === 0 ? `<tr><td colspan="7" style="text-align:center;color:#999;font-style:italic;padding:32px;">No line items</td></tr>` : d.lines.map((l) => `<tr>
        <td>${esc(l.product_name)}</td>
        <td style="font-family:monospace;font-size:10px;color:#666;">${esc(l.sku ?? "—")}</td>
        <td class="num">${l.quantity}</td>
        <td class="num">${money(l.unit_price)}</td>
        <td class="num">${l.discount > 0 ? `-${money(l.discount)}` : "—"}</td>
        <td class="num">${money(l.tax)}</td>
        <td class="num"><strong>${money(l.line_total)}</strong></td>
      </tr>`).join("")}
    </tbody>
  </table>

  <div class="totals">
    <table>
      <tr><td class="label">Subtotal</td><td class="value">${money(d.subtotal)}</td></tr>
      ${d.discount_total > 0 ? `<tr><td class="label">Discount</td><td class="value">-${money(d.discount_total)}</td></tr>` : ""}
      <tr><td class="label">Tax</td><td class="value">${money(d.tax_total)}</td></tr>
      <tr class="grand"><td class="label">Total</td><td class="value">${money(d.total)}</td></tr>
      ${d.amount_paid > 0 ? `<tr><td class="label">Paid</td><td class="value">${money(d.amount_paid)}</td></tr>` : ""}
      <tr class="balance"><td class="label">Balance due</td><td class="value">${money(d.balance)}</td></tr>
    </table>
  </div>

  ${d.notes ? `<div class="notes"><h3>Notes</h3>${esc(d.notes)}</div>` : ""}

  <div class="footer">
    Generated by Cody Grow · ${new Date().toLocaleString()}
  </div>
</body>
</html>`;
}

/** Open invoice HTML in a new window for printing or saving to PDF. */
export function openInvoiceWindow(html: string): void {
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) { console.warn("Popup blocked"); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
  setTimeout(() => { try { w.focus(); } catch { /* ignore */ } }, 250);
}
