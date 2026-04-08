const fs = require("fs");
const content = `/**
 * Pacific timezone anchor - all date functions use America/Los_Angeles
 * to match Amazon order date attribution.
 */
function pacificToday(): Date {
  const now = new Date();
  const pacificStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [month, day, year] = pacificStr.split("/");
  return new Date(\`\${year}-\${month}-\${day}T00:00:00.000Z\`);
}

export function daysAgo(n: number): Date {
  const d = pacificToday();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

export function todayUtc(): Date {
  return pacificToday();
}

export function daysFromNow(n: number): Date {
  const d = pacificToday();
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

export function toISODate(d: Date): string {
  return d.toISOString().split("T")[0];
}

export function fromISODate(s: string): Date {
  return new Date(\`\${s}T00:00:00.000Z\`);
}

export function dateRange(daysBack: number): { start: Date; end: Date } {
  return { start: daysAgo(daysBack), end: pacificToday() };
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function startOfMonthUtc(): Date {
  const d = pacificToday();
  d.setUTCDate(1);
  return d;
}
`;
fs.writeFileSync("src/lib/utils/dates.ts", content, "utf8");
console.log("Written dates.ts as UTF-8");
