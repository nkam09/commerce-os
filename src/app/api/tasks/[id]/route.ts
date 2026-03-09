import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import prisma from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest(req);
    const data = await req.json();
    const task = await prisma.task.findFirst({ where: { id: params.id, userId: user.id } });
    if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const updated = await prisma.task.update({ where: { id: params.id }, data });
    if (updated.projectId) {
      const allTasks = await prisma.task.findMany({ where: { projectId: updated.projectId } });
      const done = allTasks.filter(t => t.status === "DONE").length;
      const progress = Math.round((done / allTasks.length) * 100);
      await prisma.project.update({ where: { id: updated.projectId }, data: { progressPercent: progress } });
    }
    return NextResponse.json(updated);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
