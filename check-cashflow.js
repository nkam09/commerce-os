const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
async function main() {
  const count = await p.settlement.count();
  const sample = await p.settlement.findMany({ take: 3, orderBy: { periodEnd: "desc" } });
  console.log("Settlements:", count);
  console.log("Sample:", JSON.stringify(sample, null, 2));
  await p.$disconnect();
}
main();
