const{PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
p.$queryRawUnsafe("SELECT \"jobName\", cursor FROM sync_cursors WHERE \"jobName\" = 'sync-finances'")
.then(r=>console.log(r))
.catch(e=>console.error(e))
.finally(()=>p.$disconnect());
