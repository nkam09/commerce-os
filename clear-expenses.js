const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
async function main() {
  const result = await p.expense.deleteMany({});
  console.log("Deleted", result.count, "expenses");
  await p.$disconnect();
}
main();
