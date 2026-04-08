const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
async function main() {
  const result = await p.dailyAd.deleteMany({
    where: { campaignName: "Sellerboard Import" },
  });
  console.log("Deleted", result.count, "Sellerboard Import rows");
  await p["$disconnect"]();
}
main();
