import { normalizePhone } from "@/lib/identity/normalize-phone";

export interface PastAdmissionRow {
  line: number;
  name: string;
  phone: string;
  course: string;
  /** YYYY-MM-DD, or null to use the start of the academic year. */
  joinedOn: string | null;
  /** Total fee in paise, or null when the accountant will enter it. */
  feePaise: number | null;
}

export interface PastAdmissionParse {
  rows: PastAdmissionRow[];
  problems: Array<{ line: number; message: string }>;
}

/** 03/07/2025, 3-7-2025 or 2025-07-03 -> 2025-07-03. Day first, as it is written in India. */
export function parseLooseDate(raw: string): string | null {
  const t = raw.trim();
  let y: number, m: number, d: number;
  let hit = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (hit) [y, m, d] = [Number(hit[1]), Number(hit[2]), Number(hit[3])];
  else if ((hit = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t))) [d, m, y] = [Number(hit[1]), Number(hit[2]), Number(hit[3])];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * One student per line: name, phone, course, then optionally the date they
 * joined and the total fee. Tabs (pasted from a spreadsheet) or commas.
 * `courses` maps whatever a person might type (value or label, any case) to
 * the course value stored.
 */
export function parsePastAdmissions(text: string, courses: Map<string, string>): PastAdmissionParse {
  const rows: PastAdmissionRow[] = [];
  const problems: Array<{ line: number; message: string }> = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    if (!raw.trim()) return;
    const cells = (raw.includes("\t") ? raw.split("\t") : raw.split(",")).map((c) => c.trim());
    const [name, phoneRaw, courseRaw, dateRaw, feeRaw] = cells;
    // "85,000" in a comma-separated line would silently become ₹85.
    if (cells.length > 5) return void problems.push({ line, message: "Too many columns — write the fee without commas (85000)." });
    // A header row pasted along with the data.
    if (i === 0 && /^(student\s*)?name$/i.test(name ?? "")) return;
    if (!name) return void problems.push({ line, message: "No name." });
    const phone = normalizePhone(phoneRaw);
    if (!phone) return void problems.push({ line, message: `"${phoneRaw ?? ""}" is not a phone number.` });
    const course = courses.get((courseRaw ?? "").toLowerCase());
    if (!course) return void problems.push({ line, message: `Course "${courseRaw ?? ""}" is not one of your courses.` });
    let joinedOn: string | null = null;
    if (dateRaw) {
      joinedOn = parseLooseDate(dateRaw);
      if (!joinedOn) return void problems.push({ line, message: `"${dateRaw}" is not a date (use dd/mm/yyyy).` });
    }
    let feePaise: number | null = null;
    if (feeRaw) {
      const n = Number(feeRaw.replace(/[₹,\s]/g, ""));
      if (!Number.isFinite(n) || n < 0) return void problems.push({ line, message: `"${feeRaw}" is not an amount.` });
      feePaise = Math.round(n * 100);
    }
    rows.push({ line, name, phone, course, joinedOn, feePaise });
  });
  return { rows, problems };
}
