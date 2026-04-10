const{PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
p.$queryRawUnsafe("UPDATE sync_cursors SET cursor = NULL WHERE \"jobName\" = 'sync-settlement-refunds'")
.then(()=>{
  console.log('DONE - cursor set to NULL');
  return p.$queryRawUnsafe("SELECT \"jobName\", cursor FROM sync_cursors WHERE \"jobName\" = 'sync-settlement-refunds'");
})
.then(r=>console.log('verify:', r))
.catch(e=>console.error(e))
.finally(()=>p.$disconnect());
