const { getSpClientForUser } = require("./src/lib/amazon/get-sp-client-for-user");
async function main() {
  const client = getSpClientForUser();
  const page = await client.getOrders({
    createdAfter: "2026-03-01T00:00:00Z",
    marketplaceIds: ["ATVPDKIKX0DER"],
  });
  for (const order of page.Orders.slice(0, 50)) {
    const items = await client.getAllOrderItems(order.AmazonOrderId);
    for (const item of items) {
      const promo = parseFloat(item.PromotionDiscount?.Amount || "0");
      if (promo > 0) {
        console.log("ORDER:", order.AmazonOrderId);
        console.log("  ASIN:", item.ASIN);
        console.log("  ItemPrice:", item.ItemPrice?.Amount);
        console.log("  PromotionDiscount:", item.PromotionDiscount?.Amount);
        console.log("  Qty:", item.QuantityOrdered);
        return;
      }
    }
    await new Promise(r => setTimeout(r, 500));
  }
  console.log("No promo orders found in first 50");
}
main();
