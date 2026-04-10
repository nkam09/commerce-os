const{PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
p.$queryRawUnsafe('SELECT SUM("refundedReferralFee") as val FROM daily_sales WHERE date >= \'2026-04-01\' AND date <= \'2026-04-10\' AND "refundedReferralFee" > 0')
.then(r => console.log("refundedReferralFee:", r[0]?.val, typeof r[0]?.val))
.catch(e => console.log("ERROR:", e.message?.slice(0, 100)))
.finally(() => p.$disconnect());
