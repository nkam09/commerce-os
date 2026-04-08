const { getSpClientForUser } = require("./src/lib/amazon/get-sp-client-for-user");
async function main() {
  const client = getSpClientForUser();
  const items = await client.getAllOrderItems("112-3273289-4317826");
  console.log(JSON.stringify(items, null, 2));
}
main();
