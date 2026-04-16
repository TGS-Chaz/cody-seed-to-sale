/**
 * Shared helpers for all CCRS CSV generators.
 *
 * Every CCRS file (except Strain) uses the same 3-row header block:
 *   Row 1: SubmittedBy, SubmittedDate, NumberRecords
 *   Row 2: corresponding values
 *   Row 3: column headers for item records
 *   Rows 4+: item records
 *
 * Dates: MM/DD/YYYY. Datetimes: MM/DD/YYYY hh:mm AM/PM.
 * Every record (except Strain) gets CreatedBy/CreatedDate/UpdatedBy/UpdatedDate + Operation.
 */

export interface CCRSHeader {
  submittedBy: string;
  submittedDate?: Date;
  numberRecords: number;
}

export interface CommonRecordFields {
  createdBy: string;
  createdDate: Date;
  updatedBy?: string;
  updatedDate?: Date;
  operation?: "Insert" | "Update" | "Delete";
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "";
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${date.getFullYear()}`;
}

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "";
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  let h = date.getHours();
  const min = String(date.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12; if (h === 0) h = 12;
  return `${mm}/${dd}/${date.getFullYear()} ${String(h).padStart(2, "0")}:${min} ${ampm}`;
}

export function csvEscape(value: string | number | boolean | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildHeaderBlock(header: CCRSHeader): string {
  return [
    "SubmittedBy,SubmittedDate,NumberRecords",
    [csvEscape(header.submittedBy), csvEscape(formatDate(header.submittedDate ?? new Date())), csvEscape(header.numberRecords)].join(","),
  ].join("\n");
}

export function buildCSV(header: CCRSHeader, columnHeaders: readonly string[], rows: string[][]): string {
  return [
    buildHeaderBlock(header),
    columnHeaders.join(","),
    ...rows.map((r) => r.join(",")),
  ].join("\n");
}

export function filename(category: string, licenseOrIntegratorId: string, at: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const ts = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`;
  return `${category.toLowerCase()}_${licenseOrIntegratorId}_${ts}.csv`;
}

/** Common last 5 columns: CreatedBy, CreatedDate, UpdatedBy, UpdatedDate, Operation. */
export function commonRecordCols(f: CommonRecordFields): string[] {
  return [
    csvEscape(f.createdBy),
    csvEscape(formatDate(f.createdDate)),
    csvEscape(f.updatedBy ?? f.createdBy),
    csvEscape(formatDate(f.updatedDate ?? f.createdDate)),
    csvEscape(f.operation ?? "Insert"),
  ];
}
