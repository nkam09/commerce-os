import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import prisma from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    const projectId = req.nextUrl.searchParams.get("projectId");
    const tasks = await prisma.task.findMany({ where: { userId: user.id, ...(projectId ? { projectId } : {}) }, orderBy: { createdAt: "desc" } });
    return NextResponse.json(tasks);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    const data = await req.json();
    const task = await prisma.task.create({ data: { ...data, userId: user.id } });
    return NextResponse.json(task, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
