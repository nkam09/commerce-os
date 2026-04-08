const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
async function main() {
  // Feb keyword totals
  const kwFeb = await p.dailyKeyword.aggregate({
    where: { date: { gte: new Date("2026-02-01"), lt: new Date("2026-03-01") } },
    _sum: { spend: true, attributedSales: true, clicks: true, impressions: true, orders: true },
    _count: true,
  });
  console.log("Feb keywords:", JSON.stringify(kwFeb, null, 2));

  // Feb search term totals
  const stFeb = await p.dailySearchTerm.aggregate({
    where: { date: { gte: new Date("2026-02-01"), lt: new Date("2026-03-01") } },
    _sum: { spend: true, attributedSales: true, clicks: true },
    _count: true,
  });
  console.log("\nFeb search terms:", JSON.stringify(stFeb, null, 2));

  // Compare with daily_ads Feb spend (should be $3,477.31)
  const adFeb = await p.dailyAd.aggregate({
    where: { date: { gte: new Date("2026-02-01"), lt: new Date("2026-03-01") } },
    _sum: { spend: true, attributedSales: true },
  });
  console.log("\nFeb daily_ads (reference):", JSON.stringify(adFeb, null, 2));

  // Top 10 keywords by spend
  const topKw = await p.dailyKeyword.groupBy({
    by: ["keywordText", "matchType"],
    where: { date: { gte: new Date("2026-02-01"), lt: new Date("2026-03-01") } },
    _sum: { spend: true, attributedSales: true, clicks: true },
    orderBy: { _sum: { spend: "desc" } },
    take: 10,
  });
  console.log("\nTop 10 keywords by spend:");
  for (const k of topKw) {
    console.log("  " + (k.keywordText || "(null)").padEnd(40) + k.matchType?.padEnd(15) + " $" + parseFloat(k._sum.spend).toFixed(2));
  }

  // Top 10 search terms by spend
  const topSt = await p.dailySearchTerm.groupBy({
    by: ["searchTerm"],
    where: { date: { gte: new Date("2026-02-01"), lt: new Date("2026-03-01") } },
    _sum: { spend: true, clicks: true },
    orderBy: { _sum: { spend: "desc" } },
    take: 10,
  });
  console.log("\nTop 10 search terms by spend:");
  for (const s of topSt) {
    console.log("  " + (s.searchTerm || "(null)").padEnd(40) + " $" + parseFloat(s._sum.spend).toFixed(2));
  }

  await p["$disconnect"]();
}
main();
