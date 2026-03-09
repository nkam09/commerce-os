import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import prisma from "@/lib/db";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest(req);
    const po = await prisma.purchaseOrder.findFirst({ where: { id: params.id, userId: user.id }, include: { items: { include: { product: true } } } });
    if (!po) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(po);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest(req);
    const data = await req.json();
    const po = await prisma.purchaseOrder.findFirst({ where: { id: params.id, userId: user.id } });
    if (!po) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const updated = await prisma.purchaseOrder.update({ where: { id: params.id }, data });
    return NextResponse.json(updated);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
