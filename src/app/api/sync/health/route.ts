import { requireUser } from "@/lib/auth/require-user";
import { prisma } from "@/lib/db/prisma";
import { apiSuccess, apiServerError, apiUnauthorized } from "@/lib/utils/api";

export async function GET() {
  try {
    const { userId } = await requireUser();

    const connections = await prisma.syncConnection.findMany({
      where: { userId },
      include: {
        jobRuns: {
          orderBy: { startedAt: "desc" },
          take: 5,
          select: {
            id: true,
            jobName: true,
            status: true,
            fetchedCount: true,
            writtenCount: true,
            errorMessage: true,
            startedAt: true,
            finishedAt: true,
          },
        },
        cursors: {
          select: {
            jobName: true,
            cursor: true,
            lastRunAt: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const data = connections.map((conn) => ({
      id: conn.id,
      name: conn.name,
      type: conn.type,
      status: conn.status,
      lastTestedAt: conn.lastTestedAt?.toISOString() ?? null,
      recentRuns: conn.jobRuns.map((r) => ({
        id: r.id,
        jobName: r.jobName,
        status: r.status,
        fetchedCount: r.fetchedCount,
        writtenCount: r.writtenCount,
        errorMessage: r.errorMessage,
        startedAt: r.startedAt.toISOString(),
        finishedAt: r.finishedAt?.toISOString() ?? null,
      })),
      cursors: conn.cursors.map((c) => ({
        jobName: c.jobName,
        cursor: c.cursor,
        lastRunAt: c.lastRunAt?.toISOString() ?? null,
      })),
    }));

    return apiSuccess({ connections: data });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") return apiUnauthorized();
    return apiServerError(err);
  }
}
