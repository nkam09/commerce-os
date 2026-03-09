import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import prisma, { getShipments } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    const shipments = await getShipments(user.id);
    return NextResponse.json(shipments);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    const { items, ...data } = await req.json();
    const shipment = await prisma.shipment.create({ data: { ...data, userId: user.id, items: { create: items ?? [] } }, include: { items: { include: { product: true } } } });
    if (shipment.freightCostEstimate > 0 && shipment.etaDate) {
      const freightDate = new Date(shipment.etaDate);
      freightDate.setDate(freightDate.getDate() - 7);
      await prisma.cashEvent.create({ data: { userId: user.id, eventDate: freightDate, type: "FREIGHT", direction: "OUTFLOW", amount: shipment.freightCostEstimate, linkedObjectType: "Shipment", linkedObjectId: shipment.id, notes: `${shipment.shipmentName} Freight` } });
    }
    return NextResponse.json(shipment, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
