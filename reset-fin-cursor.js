const{PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
p.$queryRawUnsafe("SELECT \"jobName\", cursor FROM sync_cursors WHERE \"jobName\" LIKE '%finance%'")
.then(r=>console.log('current:', r))
.catch(e=>console.error(e))
.finally(()=>p.$disconnect());
