-- CreateTable
CREATE TABLE "supplier_orders" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "supplier" TEXT NOT NULL DEFAULT 'Ningbo Doublefly Import And Export Co., Ltd',
    "orderDate" DATE NOT NULL,
    "deliveryAddress" TEXT,
    "amazonOrderId" TEXT,
    "amazonRefId" TEXT,
    "terms" TEXT NOT NULL DEFAULT '50/50 Upfront/Before Delivery',
    "estProductionDays" INTEGER,
    "estDeliveryDays" INTEGER,
    "actProductionEnd" DATE,
    "actDeliveryDate" DATE,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_order_items" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "asin" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'pc.',
    "unitPrice" DECIMAL(10,4) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_order_payments" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(14,4) NOT NULL,
    "paidDate" DATE,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_order_payments_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "supplier_orders" ADD CONSTRAINT "supplier_orders_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "pm_spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_order_items" ADD CONSTRAINT "supplier_order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "supplier_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_order_payments" ADD CONSTRAINT "supplier_order_payments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "supplier_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
