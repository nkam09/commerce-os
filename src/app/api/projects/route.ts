import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import prisma, { getProjects } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    const projects = await getProjects(user.id);
    return NextResponse.json(projects);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    const data = await req.json();
    const project = await prisma.project.create({ data: { ...data, userId: user.id } });
    return NextResponse.json(project, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
