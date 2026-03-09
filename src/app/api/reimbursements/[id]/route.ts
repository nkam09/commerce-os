import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import prisma from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest(req);
    const data = await req.json();
    const item = await prisma.reimbursement.findFirst({ where: { id: params.id, userId: user.id } });
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const updated = await prisma.reimbursement.update({ where: { id: params.id }, data });
    if (updated.status === "CLOSED" && updated.amountRecovered > 0) {
      await prisma.cashEvent.create({ data: { userId: user.id, eventDate: new Date(), type: "REIMBURSEMENT", direction: "INFLOW", amount: updated.amountRecovered, linkedObjectType: "Reimbursement", linkedObjectId: updated.id, notes: `Reimbursement closed: ${updated.issueType}` } });
    }
    return NextResponse.json(updated);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
