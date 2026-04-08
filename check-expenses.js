const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
async function main() {
  const count = await p.expense.count();
  const all = await p.expense.findMany({ orderBy: { effectiveAt: "desc" } });
  console.log("Total expenses:", count);
  console.log("Expenses:", JSON.stringify(all, null, 2));
  await p.$disconnect();
}
main();
