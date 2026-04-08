const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const result = await p.dailyAd.aggregate({
    where: {
      date: {
        gte: new Date('2026-02-01'),
        lt: new Date('2026-03-01'),
      },
    },
    _sum: {
      spend: true,
      attributedSales: true,
    },
  });
  console.log('Feb 2026 daily_ads:', JSON.stringify(result, null, 2));

  const campaigns = await p.dailyAd.groupBy({
    by: ['campaignName'],
    where: {
      date: {
        gte: new Date('2026-02-01'),
        lt: new Date('2026-03-01'),
      },
    },
    _sum: { spend: true },
    orderBy: { _sum: { spend: 'desc' } },
    take: 10,
  });
  console.log('\nTop 10 campaigns by spend:', JSON.stringify(campaigns, null, 2));

  await p["$disconnect"]();
}

main();
