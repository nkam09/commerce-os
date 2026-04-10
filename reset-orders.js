const{PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
p.$queryRawUnsafe("UPDATE sync_cursors SET cursor = '2026-03-01T00:00:00Z' WHERE \"jobName\" = 'sync-orders'")
.then(()=>console.log('orders cursor set to Mar 1'))
.catch(e=>console.error(e))
.finally(()=>p.$disconnect());
