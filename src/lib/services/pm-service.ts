import { prisma } from "@/lib/db/prisma";

// ─── Project Manager Service ────────────────────────────────────────────────

// ─── Types ──────────────────────────────────────────────────────────────────

export type PMSpaceData = {
  id: string;
  name: string;
  color: string;
  order: number;
  lists: PMListData[];
};

export type PMListData = {
  id: string;
  name: string;
  spaceId: string;
  order: number;
  statuses: string[];
  taskCount: number;
};

export type PMTaskData = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: "Urgent" | "High" | "Medium" | "Low";
  dueDate: string | null;
  startDate: string | null;
  tags: string[];
  order: number;
  listId: string;
  subtasks: PMSubtaskData[];
  comments: PMCommentData[];
  aiGenerated: boolean;
  aiSource: string | null;
  asinRef: string | null;
  campaignRef: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type PMSubtaskData = {
  id: string;
  title: string;
  completed: boolean;
  order: number;
};

export type PMCommentData = {
  id: string;
  content: string;
  createdAt: string;
};

export type PMPageData = {
  spaces: PMSpaceData[];
  tasks: PMTaskData[]; // tasks for the currently selected list
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function toISODateOrNull(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString().split("T")[0];
}

function parseStatuses(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // ignore
    }
  }
  return ["To Do", "In Progress", "Review", "Done"];
}

function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // ignore
    }
  }
  return [];
}

function mapTask(t: {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: Date | null;
  startDate: Date | null;
  tags: unknown;
  order: number;
  listId: string;
  subtasks: { id: string; title: string; completed: boolean; order: number }[];
  comments: { id: string; content: string; createdAt: Date }[];
  aiGenerated: boolean;
  aiSource: string | null;
  asinRef: string | null;
  campaignRef: string | null;
  completedAt: Date | null;
  createdAt: Date;
}): PMTaskData {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority as PMTaskData["priority"],
    dueDate: toISODateOrNull(t.dueDate),
    startDate: toISODateOrNull(t.startDate),
    tags: parseTags(t.tags),
    order: t.order,
    listId: t.listId,
    subtasks: t.subtasks.map((s) => ({
      id: s.id,
      title: s.title,
      completed: s.completed,
      order: s.order,
    })),
    comments: t.comments.map((c) => ({
      id: c.id,
      content: c.content,
      createdAt: c.createdAt.toISOString(),
    })),
    aiGenerated: t.aiGenerated,
    aiSource: t.aiSource,
    asinRef: t.asinRef,
    campaignRef: t.campaignRef,
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
    createdAt: t.createdAt.toISOString(),
  };
}

// ─── Task include for reuse ─────────────────────────────────────────────────

const taskInclude = {
  subtasks: {
    orderBy: { order: "asc" as const },
    select: { id: true, title: true, completed: true, order: true },
  },
  comments: {
    orderBy: { createdAt: "asc" as const },
    select: { id: true, content: true, createdAt: true },
  },
};

// ─── Public API ─────────────────────────────────────────────────────────────

export async function getSpaces(userId: string): Promise<PMSpaceData[]> {
  const spaces = await prisma.pMSpace.findMany({
    where: { userId },
    orderBy: { order: "asc" },
    include: {
      lists: {
        orderBy: { order: "asc" },
        include: {
          _count: { select: { tasks: true } },
        },
      },
    },
  });

  return spaces.map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color,
    order: s.order,
    lists: s.lists.map((l) => ({
      id: l.id,
      name: l.name,
      spaceId: l.spaceId,
      order: l.order,
      statuses: parseStatuses(l.statuses),
      taskCount: l._count.tasks,
    })),
  }));
}

export async function getAllTasks(userId: string): Promise<PMTaskData[]> {
  const tasks = await prisma.pMTask.findMany({
    where: {
      list: { space: { userId } },
    },
    orderBy: { order: "asc" },
    include: taskInclude,
  });

  return tasks.map(mapTask);
}

export async function getTasksForList(
  userId: string,
  listId: string
): Promise<PMTaskData[]> {
  const tasks = await prisma.pMTask.findMany({
    where: {
      listId,
      list: { space: { userId } },
    },
    orderBy: { order: "asc" },
    include: taskInclude,
  });

  return tasks.map(mapTask);
}

export async function getTaskById(
  userId: string,
  taskId: string
): Promise<PMTaskData | undefined> {
  const task = await prisma.pMTask.findFirst({
    where: {
      id: taskId,
      list: { space: { userId } },
    },
    include: taskInclude,
  });

  return task ? mapTask(task) : undefined;
}

export async function getPMPageData(userId: string): Promise<PMPageData> {
  const [spaces, tasks] = await Promise.all([
    getSpaces(userId),
    getAllTasks(userId),
  ]);

  return { spaces, tasks };
}

// ─── Sync wrappers (return empty data — use async versions) ────────────────

/** @deprecated Use getPMPageData(userId) instead */
export function getPMPageDataSync(): PMPageData {
  return { spaces: [], tasks: [] };
}

/** @deprecated Use getTasksForList(userId, listId) instead */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getTasksForListSync(_listId: string): PMTaskData[] {
  return [];
}

/** @deprecated Use getAllTasks(userId) instead */
export function getAllTasksSync(): PMTaskData[] {
  return [];
}

/** @deprecated Use getTaskById(userId, taskId) instead */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getTaskByIdSync(_taskId: string): PMTaskData | undefined {
  return undefined;
}

/** @deprecated Use getSpaces(userId) instead */
export function getSpacesSync(): PMSpaceData[] {
  return [];
}
