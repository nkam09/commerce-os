const{PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
async function main() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  await p.$queryRawUnsafe("UPDATE sync_cursors SET cursor=$1 WHERE \"jobName\"='sync-refund-events'", sevenDaysAgo);
  console.log("Reset sync-refund-events cursor to:", sevenDaysAgo);
}
main().catch(console.error).finally(()=>p.$disconnect());
