const { getSpClientForUser } = require("./src/lib/amazon/get-sp-client-for-user");
async function main() {
  const client = getSpClientForUser();
  // Get orders right around midnight ET on Feb 28
  const page = await client.getOrders({
    createdAfter: "2026-02-28T04:00:00Z",
    marketplaceIds: ["ATVPDKIKX0DER"],
  });
  // Show first 10 orders with their exact PurchaseDate
  for (const o of page.Orders.slice(0, 10)) {
    const utc = new Date(o.PurchaseDate);
    const etStr = utc.toLocaleString("en-US", { timeZone: "America/New_York" });
    const ptStr = utc.toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
    console.log(o.AmazonOrderId, "UTC:", o.PurchaseDate, "ET:", etStr, "PT:", ptStr);
  }
}
main();
