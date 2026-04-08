const { getSpClientForUser } = require("./src/lib/amazon/get-sp-client-for-user");
async function main() {
  const client = getSpClientForUser();
  const agg = {};
  let nextToken;
  let count = 0;
  const knownAsins = new Set(["B07XYBW774", "B0B27GRHFR", "B0D7NNL4BL"]);

  do {
    const page = await client.getOrders({
      createdAfter: "2026-02-01T00:00:00Z",
      marketplaceIds: ["ATVPDKIKX0DER"],
      nextToken,
    });
    for (const o of page.Orders) {
      if (o.OrderStatus === "Canceled") continue;
      const d = new Date(o.PurchaseDate);
      if (d >= new Date("2026-03-01T08:00:00Z")) continue;
      if (d < new Date("2026-02-01T08:00:00Z")) continue;

      const items = await client.getAllOrderItems(o.AmazonOrderId);
      await new Promise(r => setTimeout(r, 300));

      for (const item of items) {
        if (!knownAsins.has(item.ASIN)) continue;
        const pt = new Intl.DateTimeFormat("en-US", {
          timeZone: "America/Los_Angeles",
          year: "numeric", month: "2-digit", day: "2-digit",
        }).formatToParts(d);
        const yr = pt.find(p => p.type === "year").value;
        const mo = pt.find(p => p.type === "month").value;
        const dy = pt.find(p => p.type === "day").value;
        const dateKey = yr + "-" + mo + "-" + dy;

        if (!agg[dateKey]) agg[dateKey] = { units: 0, sales: 0 };
        agg[dateKey].units += item.QuantityOrdered || 0;
        agg[dateKey].sales += parseFloat(item.ItemPrice?.Amount || "0");
      }
      count++;
    }
    nextToken = page.NextToken;
    console.log("processed", count, "orders so far...");
  } while (nextToken);

  console.log("\nPacific time Feb breakdown:");
  const dates = Object.keys(agg).filter(d => d.startsWith("2026-02")).sort();
  let totalUnits = 0, totalSales = 0;
  for (const d of dates) {
    console.log(d, "units:", agg[d].units, "sales:", agg[d].sales.toFixed(2));
    totalUnits += agg[d].units;
    totalSales += agg[d].sales;
  }
  console.log("TOTAL units:", totalUnits, "sales:", totalSales.toFixed(2));
  console.log("Sellerboard: units: 819, sales: 13463.91");
}
main();
