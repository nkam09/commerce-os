const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
async function main() {
  await p.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "pm_spaces" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "color" TEXT NOT NULL DEFAULT '#3b82f6',
      "order" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT "pm_spaces_pkey" PRIMARY KEY ("id")
    )
  `);
  console.log("pm_spaces created");

  await p.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "pm_lists" (
      "id" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "spaceId" TEXT NOT NULL,
      "order" INTEGER NOT NULL DEFAULT 0,
      "statuses" JSONB NOT NULL DEFAULT '["To Do","In Progress","Review","Done"]',
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT "pm_lists_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "pm_lists_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "pm_spaces"("id") ON DELETE CASCADE
    )
  `);
  console.log("pm_lists created");

  await p.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "pm_tasks" (
      "id" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "description" TEXT,
      "status" TEXT NOT NULL DEFAULT 'To Do',
      "priority" TEXT NOT NULL DEFAULT 'Medium',
      "dueDate" DATE,
      "startDate" DATE,
      "tags" JSONB NOT NULL DEFAULT '[]',
      "order" INTEGER NOT NULL DEFAULT 0,
      "listId" TEXT NOT NULL,
      "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
      "aiSource" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT "pm_tasks_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "pm_tasks_listId_fkey" FOREIGN KEY ("listId") REFERENCES "pm_lists"("id") ON DELETE CASCADE
    )
  `);
  console.log("pm_tasks created");

  await p.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "pm_subtasks" (
      "id" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "completed" BOOLEAN NOT NULL DEFAULT false,
      "order" INTEGER NOT NULL DEFAULT 0,
      "taskId" TEXT NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT "pm_subtasks_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "pm_subtasks_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "pm_tasks"("id") ON DELETE CASCADE
    )
  `);
  console.log("pm_subtasks created");

  await p.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "pm_comments" (
      "id" TEXT NOT NULL,
      "content" TEXT NOT NULL,
      "taskId" TEXT NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT "pm_comments_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "pm_comments_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "pm_tasks"("id") ON DELETE CASCADE
    )
  `);
  console.log("pm_comments created");

  await p.$disconnect();
}
main();
