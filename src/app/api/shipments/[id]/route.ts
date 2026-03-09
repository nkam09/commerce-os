import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import prisma from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest(req);
    const data = await req.json();
    const shipment = await prisma.shipment.findFirst({ where: { id: params.id, userId: user.id } });
    if (!shipment) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const updated = await prisma.shipment.update({ where: { id: params.id }, data });
    return NextResponse.json(updated);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
