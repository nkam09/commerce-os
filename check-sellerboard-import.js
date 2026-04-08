const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
async function main() {
  const rows = await p.dailyAd.aggregate({
    where: { campaignName: "Sellerboard Import" },
    _sum: { spend: true, attributedSales: true, clicks: true, impressions: true },
    _count: true,
  });
  console.log("Sellerboard Import:", JSON.stringify(rows, null, 2));

  const dateRange = await p.dailyAd.aggregate({
    where: { campaignName: "Sellerboard Import" },
    _min: { date: true },
    _max: { date: true },
  });
  console.log("Date range:", dateRange._min.date, "to", dateRange._max.date);

  await p["$disconnect"]();
}
main();
