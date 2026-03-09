import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import prisma, { createPurchaseOrder, getPurchaseOrders } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    const pos = await getPurchaseOrders(user.id);
    return NextResponse.json(pos);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    const { items, ...poData } = await req.json();
    const po = await createPurchaseOrder(user.id, { ...poData, user: { connect: { id: user.id } } }, items ?? []);
    if (po.depositAmount > 0 && po.depositDueDate) {
      await prisma.cashEvent.create({ data: { userId: user.id, eventDate: new Date(po.depositDueDate), type: "PO_DEPOSIT", direction: "OUTFLOW", amount: po.depositAmount, linkedObjectType: "PurchaseOrder", linkedObjectId: po.id, notes: `${po.poNumber} Deposit` } });
    }
    if (po.balanceAmount > 0 && po.balanceDueDate) {
      await prisma.cashEvent.create({ data: { userId: user.id, eventDate: new Date(po.balanceDueDate), type: "PO_BALANCE", direction: "OUTFLOW", amount: po.balanceAmount, linkedObjectType: "PurchaseOrder", linkedObjectId: po.id, notes: `${po.poNumber} Balance` } });
    }
    return NextResponse.json(po, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
