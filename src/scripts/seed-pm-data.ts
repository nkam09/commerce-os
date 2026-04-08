/**
 * Seed PM with realistic test data
 * Run: npx --yes dotenv-cli -- npx tsx src/scripts/seed-pm-data.ts
 */

import { prisma } from "@/lib/db/prisma";

async function main() {
  const user = await prisma.user.findFirst();
  if (!user) {
    console.error("No user found");
    process.exit(1);
  }
  const userId = user.clerkId;
  console.log(`userId: ${userId}`);

  // Clean all existing PM data
  console.log("Cleaning existing PM data...");
  await prisma.pMComment.deleteMany({ where: { task: { list: { space: { userId } } } } });
  await prisma.pMSubtask.deleteMany({ where: { task: { list: { space: { userId } } } } });
  await prisma.pMTask.deleteMany({ where: { list: { space: { userId } } } });
  await prisma.pMList.deleteMany({ where: { space: { userId } } });
  await prisma.pMSpace.deleteMany({ where: { userId } });

  // Create space
  const space = await prisma.pMSpace.create({
    data: {
      userId,
      name: "Kitchen Strong",
      color: "#3b82f6",
      order: 0,
    },
  });
  console.log(`Created space: ${space.name}`);

  // Create lists
  const listLaunch = await prisma.pMList.create({
    data: { name: "Product Launch", spaceId: space.id, order: 0 },
  });
  const listMarketing = await prisma.pMList.create({
    data: { name: "Marketing", spaceId: space.id, order: 1 },
  });
  console.log(`Created lists: ${listLaunch.name}, ${listMarketing.name}`);

  // Create tasks for Product Launch
  const tasks = [
    { title: "Finalize product listing", status: "In Progress", priority: "High", dueDate: new Date("2026-04-10"), tags: ["amazon", "listing"], order: 0 },
    { title: "Order product photography", status: "To Do", priority: "Medium", dueDate: new Date("2026-04-15"), tags: ["creative"], order: 1 },
    { title: "Write A+ Content", status: "To Do", priority: "Medium", dueDate: new Date("2026-04-18"), tags: ["amazon", "content"], order: 2 },
    { title: "Set initial PPC campaigns", status: "To Do", priority: "High", dueDate: new Date("2026-04-20"), tags: ["ppc"], order: 3 },
    { title: "Submit product for review", status: "Done", priority: "Urgent", dueDate: new Date("2026-04-05"), tags: ["compliance"], order: 4, completedAt: new Date("2026-04-04") },
  ];

  for (const t of tasks) {
    const task = await prisma.pMTask.create({
      data: {
        title: t.title,
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDate,
        tags: t.tags,
        order: t.order,
        listId: listLaunch.id,
        completedAt: t.completedAt ?? null,
      },
    });
    console.log(`  Task: ${task.title} (${task.status})`);

    // Add subtasks to first task
    if (t.order === 0) {
      await prisma.pMSubtask.createMany({
        data: [
          { title: "Upload main images", completed: true, order: 0, taskId: task.id },
          { title: "Write bullet points", completed: true, order: 1, taskId: task.id },
          { title: "Add backend keywords", completed: false, order: 2, taskId: task.id },
          { title: "Set pricing", completed: false, order: 3, taskId: task.id },
        ],
      });
      await prisma.pMComment.create({
        data: { content: "Images approved by design team. Ready for upload.", taskId: task.id },
      });
      console.log("    Added subtasks + comment");
    }
  }

  // Create tasks for Marketing
  const mktTasks = [
    { title: "Create social media calendar", status: "In Progress", priority: "Medium", dueDate: new Date("2026-04-12"), tags: ["social"], order: 0 },
    { title: "Reach out to influencers", status: "To Do", priority: "Low", dueDate: new Date("2026-04-25"), tags: ["influencer"], order: 1 },
  ];
  for (const t of mktTasks) {
    await prisma.pMTask.create({
      data: { ...t, listId: listMarketing.id },
    });
  }

  // Final verification
  const { getPMPageData } = await import("@/lib/services/pm-service");
  const data = await getPMPageData(userId);
  console.log(`\n✅ Seeded: ${data.spaces.length} spaces, ${data.tasks.length} tasks`);
  for (const s of data.spaces) {
    console.log(`  ${s.name}: ${s.lists.map((l) => `${l.name} (${l.taskCount} tasks)`).join(", ")}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
