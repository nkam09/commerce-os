const{PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
p.$queryRawUnsafe("UPDATE sync_cursors SET cursor = NULL WHERE \"jobName\" = 'sync-settlement-refunds'")
.then(()=>console.log('settlement cursor reset'))
.catch(e=>console.error(e))
.finally(()=>p.$disconnect());
