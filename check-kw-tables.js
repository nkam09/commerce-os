const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
async function main() {
  const kw = await p.dailyKeyword.count();
  const st = await p.dailySearchTerm.count();
  console.log("daily_keywords:", kw, "rows");
  console.log("daily_search_terms:", st, "rows");
  console.log("Models accessible: OK");
  await p["$disconnect"]();
}
main();
