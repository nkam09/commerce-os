/**
 * Pacific timezone date helpers for client-side components.
 *
 * All order data is attributed to America/Los_Angeles calendar dates.
 * These helpers ensure client-side date presets ("today", "yesterday", etc.)
 * align with the same timezone so the dashboard doesn't show "tomorrow"
 * after midnight UTC but before midnight Pacific.
 */

/**
 * Returns today's date string (YYYY-MM-DD) in Pacific time.
 */
export function pacificDateStr(): string {
  const now = new Date();
  const pacificStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  // en-US gives MM/DD/YYYY
  const [month, day, year] = pacificStr.split("/");
  return `${year}-${month}-${day}`;
}

/**
 * Returns a YYYY-MM-DD string for N days before the given YYYY-MM-DD date.
 */
export function subDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Returns year and month (0-indexed) from a YYYY-MM-DD string.
 */
export function parseYearMonth(dateStr: string): { year: number; month: number } {
  const [y, m] = dateStr.split("-").map(Number);
  return { year: y, month: m - 1 };
}

/**
 * Formats a Date as YYYY-MM-DD (UTC).
 */
export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
