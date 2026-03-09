import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import prisma, { getReimbursements } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    const items = await getReimbursements(user.id);
    return NextResponse.json(items);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    const data = await req.json();
    const item = await prisma.reimbursement.create({ data: { ...data, userId: user.id } });
    return NextResponse.json(item, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
