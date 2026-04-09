const{PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
async function main() {
  const conn = await p.$queryRawUnsafe("SELECT id, credentials FROM sync_connections LIMIT 1");
  console.log("connection:", conn[0]?.id);
  
  // We need to download a settlement report and inspect it
  // Let's just check what the parser is filtering on
  const fs = require('fs');
  const parser = fs.readFileSync('src/lib/amazon/settlement-report-parser.ts', 'utf8');
  const lines = parser.split('\n');
  lines.forEach((l, i) => {
    if (l.toLowerCase().includes('transaction') || l.toLowerCase().includes('refund') || l.toLowerCase().includes('filter')) {
      console.log(`L${i+1}: ${l.trim()}`);
    }
  });
}
main().catch(console.error).finally(()=>p.$disconnect());
