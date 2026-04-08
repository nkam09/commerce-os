import { PrismaClient, ProductStatus, PurchaseOrderStatus, ShipmentMode, ShipmentStage, ExpenseFrequency, ProjectStatus, InsightType, InsightScope, InsightSeverity, InsightStatus, SyncConnectionStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding Commerce OS demo data…");

  // ─── User ──────────────────────────────────────────────────────────────────
  const user = await prisma.user.upsert({
    where: { clerkId: "demo_clerk_user_001" },
    update: {},
    create: { clerkId: "demo_clerk_user_001" },
  });
  console.log("✓ User:", user.id);

  // ─── Marketplace ───────────────────────────────────────────────────────────
  const marketplace = await prisma.marketplace.upsert({
    where: { userId_code: { userId: user.id, code: "ATVPDKIKX0DER" } },
    update: {},
    create: {
      userId: user.id,
      code: "ATVPDKIKX0DER",
      name: "Amazon US",
      region: "us-east-1",
    },
  });
  console.log("✓ Marketplace:", marketplace.name);

  // ─── Products ──────────────────────────────────────────────────────────────
  const productA = await prisma.product.upsert({
    where: { userId_asin: { userId: user.id, asin: "B08XYZ1234" } },
    update: {},
    create: {
      userId: user.id,
      asin: "B08XYZ1234",
      sku: "SKU-001-A",
      fnsku: "X001ABC123",
      title: "Premium Stainless Steel Water Bottle 32oz",
      brand: "HydroElite",
      category: "Kitchen & Dining",
      status: ProductStatus.ACTIVE,
    },
  });

  const productB = await prisma.product.upsert({
    where: { userId_asin: { userId: user.id, asin: "B09ABC5678" } },
    update: {},
    create: {
      userId: user.id,
      asin: "B09ABC5678",
      sku: "SKU-002-B",
      fnsku: "X002DEF456",
      title: "Bamboo Cutting Board Set (3-Pack)",
      brand: "ChefNature",
      category: "Kitchen & Dining",
      status: ProductStatus.ACTIVE,
    },
  });

  const productC = await prisma.product.upsert({
    where: { userId_asin: { userId: user.id, asin: "B07DEF9012" } },
    update: {},
    create: {
      userId: user.id,
      asin: "B07DEF9012",
      sku: "SKU-003-C",
      fnsku: "X003GHI789",
      title: "Silicone Baking Mat Non-Stick (2-Pack)",
      brand: "BakePro",
      category: "Kitchen & Dining",
      status: ProductStatus.ACTIVE,
    },
  });

  console.log("✓ Products: A, B, C");

  // ─── Product Settings ──────────────────────────────────────────────────────
  await prisma.productSetting.upsert({
    where: { productId: productA.id },
    update: {},
    create: {
      productId: productA.id,
      landedCogs: 6.50,
      freightCost: 1.20,
      prepCost: 0.35,
      overheadCost: 0.50,
      safetyStockDays: 30,
      productionLeadDays: 45,
      shippingLeadDays: 21,
      receivingBufferDays: 7,
      reorderCoverageDays: 90,
      reorderMinQty: 500,
      reorderCasePack: 24,
      targetMarginPct: 0.30,
      targetAcosPct: 0.12,
      targetTacosPct: 0.10,
    },
  });

  await prisma.productSetting.upsert({
    where: { productId: productB.id },
    update: {},
    create: {
      productId: productB.id,
      landedCogs: 9.80,
      freightCost: 1.80,
      prepCost: 0.50,
      overheadCost: 0.75,
      safetyStockDays: 30,
      productionLeadDays: 60,
      shippingLeadDays: 25,
      receivingBufferDays: 7,
      reorderCoverageDays: 90,
      reorderMinQty: 300,
      reorderCasePack: 12,
      targetMarginPct: 0.28,
      targetAcosPct: 0.14,
      targetTacosPct: 0.12,
    },
  });

  await prisma.productSetting.upsert({
    where: { productId: productC.id },
    update: {},
    create: {
      productId: productC.id,
      landedCogs: 4.20,
      freightCost: 0.90,
      prepCost: 0.25,
      overheadCost: 0.40,
      safetyStockDays: 30,
      productionLeadDays: 30,
      shippingLeadDays: 18,
      receivingBufferDays: 5,
      reorderCoverageDays: 60,
      reorderMinQty: 1000,
      reorderCasePack: 50,
      targetMarginPct: 0.32,
      targetAcosPct: 0.10,
      targetTacosPct: 0.08,
    },
  });

  console.log("✓ Product settings");

  // ─── Daily Sales (last 30 days) ────────────────────────────────────────────
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const salesData = [
    { product: productA, unitsSold: 42, grossSales: 1260.00, refundCount: 1, refundAmount: 30.00 },
    { product: productB, unitsSold: 18, grossSales: 702.00, refundCount: 0, refundAmount: 0 },
    { product: productC, unitsSold: 67, grossSales: 1407.00, refundCount: 2, refundAmount: 42.00 },
  ];

  for (const s of salesData) {
    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const variance = 0.75 + Math.random() * 0.5;
      const units = Math.max(1, Math.round(s.unitsSold * variance / 30));
      const gross = parseFloat((s.grossSales * variance / 30).toFixed(2));

      await prisma.dailySale.upsert({
        where: { productId_marketplaceId_date: { productId: s.product.id, marketplaceId: marketplace.id, date } },
        update: {},
        create: {
          productId: s.product.id,
          marketplaceId: marketplace.id,
          date,
          unitsSold: units,
          orderCount: units,
          grossSales: gross,
          refundCount: i % 7 === 0 ? 1 : 0,
          refundAmount: i % 7 === 0 ? parseFloat((s.refundAmount / 4).toFixed(2)) : 0,
        },
      });
    }
  }

  console.log("✓ Daily sales (30 days × 3 products)");

  // ─── Daily Fees (last 30 days) ─────────────────────────────────────────────
  const feeData = [
    { product: productA, referralFee: 3.78, fbaFee: 3.22, storageFee: 0.15 },
    { product: productB, referralFee: 5.61, fbaFee: 3.85, storageFee: 0.22 },
    { product: productC, referralFee: 2.11, fbaFee: 2.89, storageFee: 0.08 },
  ];

  for (const f of feeData) {
    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);

      await prisma.dailyFee.upsert({
        where: { productId_marketplaceId_date: { productId: f.product.id, marketplaceId: marketplace.id, date } },
        update: {},
        create: {
          productId: f.product.id,
          marketplaceId: marketplace.id,
          date,
          referralFee: parseFloat((f.referralFee * (0.85 + Math.random() * 0.3)).toFixed(4)),
          fbaFee: parseFloat((f.fbaFee * (0.9 + Math.random() * 0.2)).toFixed(4)),
          storageFee: parseFloat((f.storageFee * (0.8 + Math.random() * 0.4)).toFixed(4)),
          returnProcessingFee: 0,
          otherFees: 0,
        },
      });
    }
  }

  console.log("✓ Daily fees (30 days × 3 products)");

  // ─── Daily Ads (last 30 days) ──────────────────────────────────────────────
  const adData = [
    { product: productA, spend: 28.50, attributedSales: 237.50, clicks: 185, impressions: 4200 },
    { product: productB, spend: 15.20, attributedSales: 108.70, clicks: 97, impressions: 2800 },
    { product: productC, spend: 22.00, attributedSales: 220.00, clicks: 142, impressions: 3600 },
  ];

  for (const a of adData) {
    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const v = 0.7 + Math.random() * 0.6;
      const spend = parseFloat((a.spend * v / 30).toFixed(4));
      const sales = parseFloat((a.attributedSales * v / 30).toFixed(4));
      const clicks = Math.max(1, Math.round(a.clicks * v / 30));
      const impressions = Math.round(a.impressions * v / 30);
      const orders = Math.max(0, Math.round(clicks * 0.08));
      const acos = sales > 0 ? parseFloat((spend / sales).toFixed(4)) : null;
      const roas = spend > 0 ? parseFloat((sales / spend).toFixed(4)) : null;
      const cpc = clicks > 0 ? parseFloat((spend / clicks).toFixed(4)) : null;

      await prisma.dailyAd.create({
        data: {
          productId: a.product.id,
          marketplaceId: marketplace.id,
          date,
          campaignName: `SP - ${a.product.asin} - Auto`,
          spend,
          attributedSales: sales,
          clicks,
          impressions,
          orders,
          acos,
          roas,
          cpc,
        },
      });
    }
  }

  console.log("✓ Daily ads (30 days × 3 products)");

  // ─── Inventory Snapshots ───────────────────────────────────────────────────
  const inventoryData = [
    { product: productA, available: 284, reserved: 12, inbound: 500, awd: 0, warehouse: 0 },
    { product: productB, available: 47, reserved: 3, inbound: 0, awd: 0, warehouse: 0 },
    { product: productC, available: 892, reserved: 28, inbound: 1000, awd: 200, warehouse: 0 },
  ];

  for (const inv of inventoryData) {
    await prisma.inventorySnapshot.create({
      data: {
        productId: inv.product.id,
        marketplaceId: marketplace.id,
        snapshotDate: today,
        available: inv.available,
        reserved: inv.reserved,
        inbound: inv.inbound,
        awd: inv.awd,
        warehouse: inv.warehouse,
      },
    });
  }

  console.log("✓ Inventory snapshots");

  // ─── Purchase Orders ───────────────────────────────────────────────────────
  const eta1 = new Date(today);
  eta1.setDate(eta1.getDate() + 28);

  const eta2 = new Date(today);
  eta2.setDate(eta2.getDate() + 55);

  await prisma.purchaseOrder.create({
    data: {
      userId: user.id,
      poNumber: "PO-2024-001",
      supplier: "Shenzhen Global Supply Co.",
      status: PurchaseOrderStatus.IN_PRODUCTION,
      totalAmount: 8750.00,
      depositAmount: 4375.00,
      balanceDue: 4375.00,
      currency: "USD",
      expectedEta: eta1,
      depositPaidAt: new Date(today.getTime() - 14 * 86400000),
      notes: "300 units Water Bottle + 200 units Cutting Board",
    },
  });

  await prisma.purchaseOrder.create({
    data: {
      userId: user.id,
      poNumber: "PO-2024-002",
      supplier: "Ningbo Manufacturing Ltd.",
      status: PurchaseOrderStatus.CONFIRMED,
      totalAmount: 4200.00,
      depositAmount: 0,
      balanceDue: 4200.00,
      currency: "USD",
      expectedEta: eta2,
      notes: "1500 units Baking Mat",
    },
  });

  await prisma.purchaseOrder.create({
    data: {
      userId: user.id,
      poNumber: "PO-2024-003",
      supplier: "Shenzhen Global Supply Co.",
      status: PurchaseOrderStatus.RECEIVED,
      totalAmount: 6300.00,
      depositAmount: 3150.00,
      balanceDue: 0,
      currency: "USD",
      notes: "Previous order - fully received",
    },
  });

  console.log("✓ Purchase orders");

  // ─── Shipments ─────────────────────────────────────────────────────────────
  const etaShip1 = new Date(today);
  etaShip1.setDate(etaShip1.getDate() + 18);

  await prisma.shipment.create({
    data: {
      userId: user.id,
      reference: "SHP-2024-001",
      supplier: "Shenzhen Global Supply Co.",
      origin: "Shenzhen, CN",
      destination: "FBA - ONT8",
      mode: ShipmentMode.SEA,
      stage: ShipmentStage.IN_TRANSIT,
      carrier: "COSCO",
      trackingNumber: "COSCO1234567890",
      cartons: 24,
      units: 576,
      cbm: 2.40,
      weightKg: 142.80,
      shippingCost: 980.00,
      currency: "USD",
      etaDeparture: new Date(today.getTime() - 10 * 86400000),
      etaArrival: etaShip1,
      notes: "Water bottle reorder",
    },
  });

  await prisma.shipment.create({
    data: {
      userId: user.id,
      reference: "SHP-2024-002",
      supplier: "Ningbo Manufacturing Ltd.",
      origin: "Ningbo, CN",
      destination: "FBA - MDW2",
      mode: ShipmentMode.AIR,
      stage: ShipmentStage.CUSTOMS,
      carrier: "DHL Express",
      trackingNumber: "1234567890DHL",
      cartons: 8,
      units: 200,
      cbm: 0.85,
      weightKg: 38.50,
      shippingCost: 420.00,
      currency: "USD",
      etaDeparture: new Date(today.getTime() - 5 * 86400000),
      etaArrival: new Date(today.getTime() + 3 * 86400000),
    },
  });

  console.log("✓ Shipments");

  // ─── Expenses ──────────────────────────────────────────────────────────────
  const expenseStart = new Date(today);
  expenseStart.setDate(1);
  expenseStart.setMonth(0);
  expenseStart.setFullYear(today.getFullYear());

  await prisma.expense.create({
    data: {
      userId: user.id,
      name: "Helium 10 Subscription",
      category: "Software",
      amount: 99.00,
      currency: "USD",
      frequency: ExpenseFrequency.MONTHLY,
      effectiveAt: expenseStart,
      vendor: "Helium 10",
    },
  });

  await prisma.expense.create({
    data: {
      userId: user.id,
      name: "Prep Center - Anytime Commerce",
      category: "Operations",
      amount: 340.00,
      currency: "USD",
      frequency: ExpenseFrequency.MONTHLY,
      effectiveAt: expenseStart,
      vendor: "Anytime Commerce",
      notes: "Per-unit prep + storage",
    },
  });

  await prisma.expense.create({
    data: {
      userId: user.id,
      name: "Bookkeeping - Bench",
      category: "Professional Services",
      amount: 249.00,
      currency: "USD",
      frequency: ExpenseFrequency.MONTHLY,
      effectiveAt: expenseStart,
      vendor: "Bench",
    },
  });

  await prisma.expense.create({
    data: {
      userId: user.id,
      name: "Amazon Brand Registry Trademark",
      category: "Legal",
      amount: 1500.00,
      currency: "USD",
      frequency: ExpenseFrequency.ONE_TIME,
      effectiveAt: new Date(today.getTime() - 90 * 86400000),
      vendor: "USPTO",
      notes: "One-time trademark filing",
    },
  });

  console.log("✓ Expenses");

  // ─── Projects ──────────────────────────────────────────────────────────────
  const due1 = new Date(today);
  due1.setDate(due1.getDate() + 14);
  const due2 = new Date(today);
  due2.setDate(due2.getDate() + 30);
  const due3 = new Date(today);
  due3.setDate(due3.getDate() + 60);

  await prisma.project.create({
    data: {
      userId: user.id,
      title: "Launch Water Bottle Variation (64oz)",
      description: "Research, source, and launch a 64oz variant of the water bottle. Include new listing, photography, and launch PPC.",
      status: ProjectStatus.IN_PROGRESS,
      owner: "Alex",
      dueDate: due2,
      priority: 1,
    },
  });

  await prisma.project.create({
    data: {
      userId: user.id,
      title: "Optimize Cutting Board PPC Campaigns",
      description: "Review search term reports, add negatives, adjust bids. Target ACOS < 14%.",
      status: ProjectStatus.IN_PROGRESS,
      owner: "Sam",
      dueDate: due1,
      priority: 2,
    },
  });

  await prisma.project.create({
    data: {
      userId: user.id,
      title: "A+ Content Refresh - All Products",
      description: "Update A+ content modules with new lifestyle imagery. Submit for review.",
      status: ProjectStatus.BACKLOG,
      owner: "Alex",
      dueDate: due3,
      priority: 3,
    },
  });

  await prisma.project.create({
    data: {
      userId: user.id,
      title: "Set Up Commerce OS Live Sync",
      description: "Add SP API and Ads API credentials. Run first sync. Validate data against Seller Central.",
      status: ProjectStatus.BACKLOG,
      owner: "Admin",
      dueDate: due1,
      priority: 1,
    },
  });

  console.log("✓ Projects");

  // ─── AI Insights ───────────────────────────────────────────────────────────
  await prisma.aIInsight.create({
    data: {
      userId: user.id,
      productId: productB.id,
      type: InsightType.REORDER_ALERT,
      scope: InsightScope.INVENTORY,
      severity: InsightSeverity.WARNING,
      status: InsightStatus.OPEN,
      title: "Bamboo Cutting Board – Low Inventory",
      body: "At current sell-through rate (~18 units/day), available inventory of 47 units will reach stockout in ~2.6 days. Inbound shipment not detected. Consider expedited reorder.",
    },
  });

  await prisma.aIInsight.create({
    data: {
      userId: user.id,
      productId: productA.id,
      type: InsightType.MARGIN_ALERT,
      scope: InsightScope.PRODUCT,
      severity: InsightSeverity.INFO,
      status: InsightStatus.OPEN,
      title: "Water Bottle – ACOS Trending Up",
      body: "30-day average ACOS is 13.2%, approaching your 12% target. Review campaign bids and search term performance.",
    },
  });

  await prisma.aIInsight.create({
    data: {
      userId: user.id,
      type: InsightType.GENERAL,
      scope: InsightScope.GLOBAL,
      severity: InsightSeverity.INFO,
      status: InsightStatus.OPEN,
      title: "Commerce OS – Awaiting Live Sync",
      body: "Amazon SP API and Ads API credentials have not been connected. Add credentials in Settings to begin live data sync.",
    },
  });

  console.log("✓ AI insights");

  // ─── Sync Connection (placeholder) ────────────────────────────────────────
  const existingConn = await prisma.syncConnection.findFirst({
    where: { userId: user.id, type: "SP_API" },
  });

  if (!existingConn) {
    await prisma.syncConnection.create({
      data: {
        userId: user.id,
        name: "Amazon US – SP API",
        type: "SP_API",
        status: SyncConnectionStatus.INACTIVE,
        marketplaceId: marketplace.id,
        metadata: { note: "Add credentials in .env to activate" },
      },
    });

    await prisma.syncConnection.create({
      data: {
        userId: user.id,
        name: "Amazon US – Ads API",
        type: "ADS_API",
        status: SyncConnectionStatus.INACTIVE,
        profileId: "",
        metadata: { note: "Add credentials in .env to activate" },
      },
    });
  }

  console.log("✓ Sync connections");
  console.log("\n✅ Seed complete.");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
