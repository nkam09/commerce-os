const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
async function main() {
  try { const c = await p.pMSpace.count(); console.log("pm_spaces:", c); } catch(e) { console.log("pm_spaces: TABLE MISSING"); }
  try { const c = await p.pMList.count(); console.log("pm_lists:", c); } catch(e) { console.log("pm_lists: TABLE MISSING"); }
  try { const c = await p.pMTask.count(); console.log("pm_tasks:", c); } catch(e) { console.log("pm_tasks: TABLE MISSING"); }
  try { const c = await p.pMSubtask.count(); console.log("pm_subtasks:", c); } catch(e) { console.log("pm_subtasks: TABLE MISSING"); }
  try { const c = await p.pMComment.count(); console.log("pm_comments:", c); } catch(e) { console.log("pm_comments: TABLE MISSING"); }
  await p.$disconnect();
}
main();
