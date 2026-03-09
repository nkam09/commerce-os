/**
 * Commerce OS — Seed File
 * Run: npx prisma db seed
 * Add to package.json: "prisma": { "seed": "ts-node prisma/seed.ts" }
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding Commerce OS...");

  // ─── USER ────────────────────────────────────────────────────────────────
  const user = await prisma.user.upsert({
    where:  { email: "naim@commerceos.io" },
    update: {},
    create: {
      email: "naim@commerceos.io",
      name:  "Naim",
      settings: {
        create: {
          cashFloor:             20000,
          defaultVelocityWindow: 30,
          timezone:              "America/New_York",
          currency:              "USD",
        },
      },
    },
  });
  console.log("✓ User created:", user.email);

  // ─── MARKETPLACE ─────────────────────────────────────────────────────────
  const marketplace = await prisma.marketplace.upsert({
    where:  { userId_marketplaceCode: { userId: user.id, marketplaceCode: "US" } },
    update: {},
    create: {
      userId:          user.id,
      marketplaceCode: "US",
      region:          "NA",
      currency:        "USD",
      timezone:        "America/New_York",
    },
  });
  console.log("✓ Marketplace created:", marketplace.marketplaceCode);

  // ─── PRODUCTS ─────────────────────────────────────────────────────────────
  const productData = [
    { asin: "B08XYZ1234", sku: "KLZ-50PACK", title: "Kleanaza 50 Pack Wipes",         brand: "Kleanaza" },
    { asin: "B09ABC5678", sku: "CI-MARKERS",  title: "Concept Inks Art Markers Set",   brand: "Concept Inks" },
    { asin: "B07DEF9012", sku: "KLZ-100PACK", title: "Kleanaza 100 Pack Wipes",        brand: "Kleanaza" },
    { asin: "B06GHI3456", sku: "CI-PRO-SET",  title: "Concept Inks Professional Set",  brand: "Concept Inks" },
  ];

  const settingsData = [
    { landedCogsPerUnit: 7.50, safetyStockDays: 14, productionLeadDays: 25, shippingLeadDays: 28, receivingBufferDays: 5, reorderCoverageDays: 90, reorderMinQty: 500, reorderCasePack: 50, targetMargin: 0.30, targetAcos: 0.15, targetTacos: 0.10 },
    { landedCogsPerUnit: 9.20, safetyStockDays: 14, productionLeadDays: 30, shippingLeadDays: 28, receivingBufferDays: 5, reorderCoverageDays: 90, reorderMinQty: 300, reorderCasePack: 24, targetMargin: 0.25, targetAcos: 0.20, targetTacos: 0.14 },
    { landedCogsPerUnit: 12.00, safetyStockDays: 14, productionLeadDays: 25, shippingLeadDays: 28, receivingBufferDays: 5, reorderCoverageDays: 90, reorderMinQty: 200, reorderCasePack: 24, targetMargin: 0.32, targetAcos: 0.15, targetTacos: 0.10 },
    { landedCogsPerUnit: 14.50, safetyStockDays: 14, productionLeadDays: 35, shippingLeadDays: 30, receivingBufferDays: 7, reorderCoverageDays: 90, reorderMinQty: 150, reorderCasePack: 12, targetMargin: 0.28, targetAcos: 0.22, targetTacos: 0.16 },
  ];

  const products = [];
  for (let i = 0; i < productData.length; i++) {
    const p = await prisma.product.upsert({
      where:  { userId_asin: { userId: user.id, asin: productData[i].asin } },
      update: {},
      create: { userId: user.id, ...productData[i] },
    });
    await prisma.productSettings.upsert({
      where:  { productId: p.id },
      update: {},
      create: { productId: p.id, ...settingsData[i] },
    });
    products.push(p);
  }
  console.log("✓ Products created:", products.length);

  // ─── DAILY SALES (90 days) ───────────────────────────────────────────────
  const today = new Date();
  let salesCount = 0;

  const baseVelocities  = [42, 28, 19, 13];
  const baseRevPerUnit  = [18.99, 24.99, 32.99, 39.99];
  const baseFbaFee      = [3.50, 4.20, 5.10, 6.30];
  const baseReferralPct = [0.15, 0.15, 0.15, 0.15];

  for (let d = 89; d >= 0; d--) {
    const date = new Date(today);
    date.setDate(today.getDate() - d);
    date.setHours(0, 0, 0, 0);

    for (let pi = 0; pi < products.length; pi++) {
      const vel   = baseVelocities[pi] + Math.round((Math.random() - 0.5) * 8);
      const units = Math.max(0, vel);
      const rev   = baseRevPerUnit[pi];
      const gross = units * rev;
      const refunds = Math.random() < 0.03 ? 1 : 0;

      await prisma.dailySales.upsert({
        where: { productId_marketplaceId_date: { productId: products[pi].id, marketplaceId: marketplace.id, date } },
        update: {},
        create: {
          productId:    products[pi].id,
          marketplaceId: marketplace.id,
          date,
          unitsSold:    units,
          orderCount:   Math.ceil(units * 0.95),
          grossSales:   gross,
          refundCount:  refunds,
          refundAmount: refunds * rev,
        },
      });

      const adSpend   = gross * (0.12 + Math.random() * 0.06);
      const adSales   = adSpend / (0.14 + Math.random() * 0.06);

      await prisma.dailyAds.upsert({
        where: { campaignId_marketplaceId_date: { campaignId: `${products[pi].sku}-SP`, marketplaceId: marketplace.id, date } },
        update: {},
        create: {
          productId:      products[pi].id,
          marketplaceId:  marketplace.id,
          campaignId:     `${products[pi].sku}-SP`,
          campaignName:   `${products[pi].sku} Sponsored Products`,
          date,
          spend:          adSpend,
          attributedSales: adSales,
          clicks:         Math.round(adSpend / (0.35 + Math.random() * 0.2)),
          impressions:    Math.round(adSpend / 0.003),
          orders:         Math.round(units * 0.35),
        },
      });

      await prisma.dailyFees.upsert({
        where: { productId_marketplaceId_date: { productId: products[pi].id, marketplaceId: marketplace.id, date } },
        update: {},
        create: {
          productId:            products[pi].id,
          marketplaceId:        marketplace.id,
          date,
          referralFees:         gross * baseReferralPct[pi],
          fbaFees:              units * baseFbaFee[pi],
          storageFees:          units * 0.05,
          returnProcessingFees: refunds * 1.5,
          otherFees:            0,
        },
      });

      salesCount++;
    }
  }
  console.log("✓ Daily facts seeded:", salesCount, "rows per table");

  // ─── INVENTORY SNAPSHOTS ─────────────────────────────────────────────────
  const snapData = [
    { available: 336, reserved: 48, inbound: 0,    awd: 0 },
    { available: 672, reserved: 84, inbound: 1500, awd: 0 },
    { available: 266, reserved: 28, inbound: 0,    awd: 0 },
    { available: 403, reserved: 56, inbound: 0,    awd: 0 },
  ];

  for (let i = 0; i < products.length; i++) {
    await prisma.inventorySnapshot.create({
      data: {
        productId:    products[i].id,
        marketplaceId: marketplace.id,
        snapshotAt:   new Date(),
        ...snapData[i],
      },
    });
  }
  console.log("✓ Inventory snapshots created");

  // ─── PURCHASE ORDERS ─────────────────────────────────────────────────────
  const po1 = await prisma.purchaseOrder.create({
    data: {
      userId:       user.id,
      supplierName: "Shenzhen Klean Co.",
      poNumber:     "PO-2024-041",
      status:       "IN_PRODUCTION",
      orderDate:    new Date("2024-07-15"),
      depositDueDate: new Date("2024-07-15"),
      balanceDueDate: new Date("2024-09-05"),
      etaDate:      new Date("2024-09-15"),
      depositAmount: 9000,
      balanceAmount: 9000,
      freightEstimate: 3200,
      items: {
        create: [{
          productId: products[0].id,
          qtyUnits:  2000,
          unitCost:  9.00,
          totalCost: 18000,
        }],
      },
    },
  });

  await prisma.purchaseOrder.create({
    data: {
      userId:       user.id,
      supplierName: "Concept Arts Ltd.",
      poNumber:     "PO-2024-042",
      status:       "SHIPPED",
      orderDate:    new Date("2024-07-01"),
      depositDueDate: new Date("2024-07-01"),
      balanceDueDate: new Date("2024-08-10"),
      etaDate:      new Date("2024-08-28"),
      depositAmount: 6000,
      balanceAmount: 6000,
      freightEstimate: 2800,
      items: {
        create: [{
          productId: products[1].id,
          qtyUnits:  1500,
          unitCost:  8.00,
          totalCost: 12000,
        }],
      },
    },
  });

  await prisma.purchaseOrder.create({
    data: {
      userId:       user.id,
      supplierName: "Shenzhen Klean Co.",
      poNumber:     "PO-2024-043",
      status:       "DRAFT",
      orderDate:    new Date("2024-08-19"),
      depositDueDate: new Date("2024-08-25"),
      balanceDueDate: new Date("2024-09-20"),
      etaDate:      new Date("2024-10-01"),
      depositAmount: 7000,
      balanceAmount: 7000,
      freightEstimate: 2400,
      items: {
        create: [{
          productId: products[2].id,
          qtyUnits:  1000,
          unitCost:  14.00,
          totalCost: 14000,
        }],
      },
    },
  });
  console.log("✓ Purchase orders created");

  // ─── SHIPMENTS ────────────────────────────────────────────────────────────
  await prisma.shipment.create({
    data: {
      userId:             user.id,
      linkedPoId:         po1.id,
      shipmentName:       "KLZ Aug Shipment",
      origin:             "Shenzhen, CN",
      destination:        "Amazon FBA US-East",
      mode:               "SEA",
      stage:              "ON_WATER",
      etaDate:            new Date("2024-08-28"),
      freightCostEstimate: 2800,
      items: {
        create: [{ productId: products[1].id, qtyUnits: 1500 }],
      },
    },
  });
  console.log("✓ Shipments created");

  // ─── REIMBURSEMENTS ──────────────────────────────────────────────────────
  await prisma.reimbursement.createMany({
    data: [
      { userId: user.id, productId: products[0].id, issueType: "Lost Inventory",      amountEstimated: 840, amountRecovered: 0,   status: "FOLLOW_UP", openedAt: new Date(Date.now() - 18 * 86400000) },
      { userId: user.id, productId: products[1].id, issueType: "Damaged Inventory",   amountEstimated: 320, amountRecovered: 320, status: "CLOSED",    openedAt: new Date(Date.now() - 45 * 86400000) },
      { userId: user.id, productId: products[2].id, issueType: "FBA Fee Overcharge",  amountEstimated: 210, amountRecovered: 0,   status: "SUBMITTED", openedAt: new Date(Date.now() - 7  * 86400000) },
      { userId: user.id, productId: products[3].id, issueType: "Lost Inventory",      amountEstimated: 640, amountRecovered: 0,   status: "OPEN",      openedAt: new Date(Date.now() - 3  * 86400000) },
    ],
  });
  console.log("✓ Reimbursements created");

  // ─── EXPENSES ────────────────────────────────────────────────────────────
  await prisma.expense.createMany({
    data: [
      { userId: user.id, category: "Software",          vendor: "Helium 10",       amount: 99,   frequency: "MONTHLY", startDate: new Date("2024-01-01") },
      { userId: user.id, category: "Software",          vendor: "Jungle Scout",    amount: 49,   frequency: "MONTHLY", startDate: new Date("2024-01-01") },
      { userId: user.id, category: "Prep & Logistics",  vendor: "3PL Partner",     amount: 1200, frequency: "MONTHLY", startDate: new Date("2024-01-01") },
      { userId: user.id, category: "Loan Payment",      vendor: "Amazon Lending",  amount: 2800, frequency: "MONTHLY", startDate: new Date("2024-03-01") },
      { userId: user.id, category: "Payroll",           vendor: "VA Team",         amount: 1500, frequency: "MONTHLY", startDate: new Date("2024-01-01") },
    ],
  });
  console.log("✓ Expenses created");

  // ─── PROJECTS ─────────────────────────────────────────────────────────────
  const proj1 = await prisma.project.create({
    data: {
      userId:          user.id,
      name:            "Q4 PPC Optimization",
      status:          "IN_PROGRESS",
      owner:           "Naim",
      dueDate:         new Date("2024-09-01"),
      progressPercent: 65,
    },
  });

  await prisma.task.createMany({
    data: [
      { userId: user.id, projectId: proj1.id, title: "Audit all campaigns for wasted spend", status: "DONE",  priority: "HIGH" },
      { userId: user.id, projectId: proj1.id, title: "Pause bottom 20% keywords by ACoS",   status: "DONE",  priority: "HIGH" },
      { userId: user.id, projectId: proj1.id, title: "Add negative keywords from STR",       status: "DOING", priority: "HIGH" },
      { userId: user.id, projectId: proj1.id, title: "Test dayparting on KLZ-50PACK",        status: "TODO",  priority: "MEDIUM" },
      { userId: user.id, projectId: proj1.id, title: "Review competitor bids",               status: "TODO",  priority: "LOW" },
    ],
  });

  await prisma.project.create({
    data: {
      userId:          user.id,
      name:            "New SKU Launch — KLZ Pro",
      status:          "QUEUED",
      owner:           "Naim",
      dueDate:         new Date("2024-10-15"),
      progressPercent: 15,
    },
  });
  console.log("✓ Projects and tasks created");

  // ─── CASH EVENTS ─────────────────────────────────────────────────────────
  const cashEvents = [
    { eventDate: new Date("2026-03-15"), type: "AMAZON_PAYOUT", direction: "INFLOW",  amount: 14200, notes: "Amazon Settlement" },
    { eventDate: new Date("2026-03-25"), type: "AD_SPEND",      direction: "OUTFLOW", amount: 5800,  notes: "PPC Monthly Invoice" },
    { eventDate: new Date("2026-03-28"), type: "FREIGHT",       direction: "OUTFLOW", amount: 2800,  notes: "SHIP-001 Freight Final" },
    { eventDate: new Date("2026-04-01"), type: "AMAZON_PAYOUT", direction: "INFLOW",  amount: 16500, notes: "Amazon Settlement" },
    { eventDate: new Date("2026-04-05"), type: "PO_BALANCE",    direction: "OUTFLOW", amount: 9000,  notes: "PO-2024-041 Balance" },
    { eventDate: new Date("2026-04-10"), type: "PO_DEPOSIT",    direction: "OUTFLOW", amount: 7000,  notes: "PO-2024-043 Deposit" },
    { eventDate: new Date("2026-04-15"), type: "FREIGHT",       direction: "OUTFLOW", amount: 3200,  notes: "SHIP-002 Freight Est." },
    { eventDate: new Date("2026-04-15"), type: "AMAZON_PAYOUT", direction: "INFLOW",  amount: 15800, notes: "Amazon Settlement" },
    { eventDate: new Date("2026-05-01"), type: "AMAZON_PAYOUT", direction: "INFLOW",  amount: 19200, notes: "Amazon Settlement" },
    { eventDate: new Date("2026-05-10"), type: "PO_BALANCE",    direction: "OUTFLOW", amount: 7000,  notes: "PO-2024-043 Balance" },
    { eventDate: new Date("2026-05-15"), type: "AD_SPEND",      direction: "OUTFLOW", amount: 6200,  notes: "PPC Monthly Invoice" },
    { eventDate: new Date("2026-06-01"), type: "AMAZON_PAYOUT", direction: "INFLOW",  amount: 18400, notes: "Amazon Settlement" },
    { eventDate: new Date("2026-06-10"), type: "FREIGHT",       direction: "OUTFLOW", amount: 3500,  notes: "Upcoming Shipment Freight" },
    { eventDate: new Date("2026-06-15"), type: "AD_SPEND",      direction: "OUTFLOW", amount: 6500,  notes: "PPC Monthly Invoice" },
    { eventDate: new Date("2026-07-01"), type: "AMAZON_PAYOUT", direction: "INFLOW",  amount: 20100, notes: "Amazon Settlement" },
    { eventDate: new Date("2026-07-15"), type: "AD_SPEND",      direction: "OUTFLOW", amount: 6800,  notes: "PPC Monthly Invoice" },
  ] as const;

  await prisma.cashEvent.createMany({
    data: cashEvents.map(e => ({ ...e, userId: user.id })),
  });
  console.log("✓ Cash events created");

  // ─── AI INSIGHTS ─────────────────────────────────────────────────────────
  await prisma.aiInsight.createMany({
    data: [
      {
        userId:      user.id,
        productId:   products[0].id,
        scope:       "INVENTORY",
        insightType: "ALERT",
        severity:    "HIGH",
        title:       "KLZ-50PACK Stockout in 8 Days",
        body:        "At current 42 units/day velocity, KLZ-50PACK has only 8 days of stock remaining. Reorder trigger of 45 days has already passed. Place PO immediately or expedite via air freight.",
        actionText:  "Create Purchase Order",
        status:      "OPEN",
      },
      {
        userId:      user.id,
        scope:       "CASH",
        insightType: "ALERT",
        severity:    "HIGH",
        title:       "Cash Floor Warning — September",
        body:        "Approving PO-2024-041 deposit ($9,000) and PO-2024-043 balance ($9,000) in the same week as freight invoices creates a $21k outflow window. September ending cash drops to $22k, near your $20k floor.",
        actionText:  "Review Cash Plan",
        status:      "OPEN",
      },
      {
        userId:      user.id,
        productId:   products[1].id,
        scope:       "ADS",
        insightType: "SUGGESTION",
        severity:    "MEDIUM",
        title:       "CI-MARKERS ACoS above target",
        body:        "CI-MARKERS ACoS is 25% vs. 18% target. 3 low-performing keywords are consuming 40% of spend with <5% conversion. Suggest pausing those campaigns.",
        actionText:  "Review Keywords",
        status:      "OPEN",
      },
      {
        userId:      user.id,
        productId:   products[2].id,
        scope:       "INVENTORY",
        insightType: "SUGGESTION",
        severity:    "LOW",
        title:       "KLZ-100PACK velocity accelerating",
        body:        "7-day velocity (24 units/day) is 26% above 30-day velocity (19 units/day). If trend holds, current reorder quantity of 300 units may be insufficient.",
        actionText:  "Adjust Reorder Qty",
        status:      "OPEN",
      },
    ],
  });
  console.log("✓ AI insights seeded");

  // ─── SYNC CONNECTION ─────────────────────────────────────────────────────
  await prisma.syncConnection.upsert({
    where:  { userId_provider: { userId: user.id, provider: "amazon_sp_api" } },
    update: {},
    create: {
      userId:   user.id,
      provider: "amazon_sp_api",
      status:   "ACTIVE",
    },
  });
  console.log("✓ Sync connection created");

  console.log("\n✅ Seed complete! Commerce OS is ready.");
  console.log("   User email: naim@commerceos.io");
  console.log("   Products:", products.length);
  console.log("   90 days of sales data seeded");
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
