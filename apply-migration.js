const{PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
p.$queryRawUnsafe('ALTER TABLE "daily_fees" ADD COLUMN IF NOT EXISTS "awdStorageFee" DECIMAL(14,4) NOT NULL DEFAULT 0')
.then(()=>console.log('column added'))
.catch(e=>console.error(e))
.finally(()=>p.$disconnect());
