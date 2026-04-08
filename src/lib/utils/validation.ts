import { z } from "zod";

// ─── Shared field schemas ─────────────────────────────────────────────────────

export const currencyField = z
  .number({ invalid_type_error: "Must be a number" })
  .nonnegative("Must be 0 or greater")
  .multipleOf(0.01, "Max 2 decimal places");

export const positiveInt = z
  .number({ invalid_type_error: "Must be a number" })
  .int("Must be a whole number")
  .positive("Must be greater than 0");

export const nonNegativeInt = z
  .number({ invalid_type_error: "Must be a number" })
  .int("Must be a whole number")
  .nonnegative("Must be 0 or greater");

export const optionalString = z.string().trim().optional().nullable();

export const requiredString = z.string().trim().min(1, "Required");

export const optionalDate = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v ? new Date(v) : null));

// ─── Create schemas ───────────────────────────────────────────────────────────

export const CreateProductSchema = z.object({
  asin: z
    .string()
    .trim()
    .min(10, "ASIN must be at least 10 characters")
    .max(10, "ASIN must be exactly 10 characters"),
  sku: optionalString,
  fnsku: optionalString,
  title: optionalString,
  brand: optionalString,
  category: optionalString,
});

export const CreatePurchaseOrderSchema = z.object({
  supplier: requiredString,
  poNumber: optionalString,
  totalAmount: currencyField,
  depositAmount: z.number().nonnegative().multipleOf(0.01).default(0),
  currency: z.string().default("USD"),
  expectedEta: optionalDate,
  notes: optionalString,
});

export const CreateShipmentSchema = z.object({
  reference: optionalString,
  supplier: optionalString,
  origin: optionalString,
  destination: optionalString,
  mode: z.enum(["AIR", "SEA", "GROUND", "EXPRESS"]).default("SEA"),
  stage: z
    .enum([
      "PREPARING",
      "PICKED_UP",
      "IN_TRANSIT",
      "CUSTOMS",
      "ARRIVED",
      "DELIVERED",
      "CANCELLED",
    ])
    .default("PREPARING"),
  carrier: optionalString,
  trackingNumber: optionalString,
  cartons: z.number().int().nonnegative().optional().nullable(),
  units: z.number().int().nonnegative().optional().nullable(),
  shippingCost: z.number().nonnegative().optional().nullable(),
  currency: z.string().default("USD"),
  etaDeparture: optionalDate,
  etaArrival: optionalDate,
  notes: optionalString,
});

export const CreateExpenseSchema = z.object({
  name: requiredString,
  category: optionalString,
  amount: currencyField,
  currency: z.string().default("USD"),
  frequency: z
    .enum(["ONE_TIME", "WEEKLY", "MONTHLY", "QUARTERLY", "ANNUALLY"])
    .default("MONTHLY"),
  effectiveAt: z.string().transform((v) => new Date(v)),
  endsAt: optionalDate,
  vendor: optionalString,
  notes: optionalString,
});

export const CreateProjectSchema = z.object({
  title: requiredString,
  description: optionalString,
  status: z
    .enum(["BACKLOG", "IN_PROGRESS", "BLOCKED", "COMPLETE", "ARCHIVED"])
    .default("BACKLOG"),
  owner: optionalString,
  dueDate: optionalDate,
  priority: z.number().int().nonnegative().default(0),
  notes: optionalString,
});

// ─── Update schemas ───────────────────────────────────────────────────────────

export const UpdateProductSettingsSchema = z.object({
  landedCogs: z.number().nonnegative().optional().nullable(),
  freightCost: z.number().nonnegative().optional().nullable(),
  prepCost: z.number().nonnegative().optional().nullable(),
  overheadCost: z.number().nonnegative().optional().nullable(),
  safetyStockDays: nonNegativeInt.optional().nullable(),
  productionLeadDays: nonNegativeInt.optional().nullable(),
  shippingLeadDays: nonNegativeInt.optional().nullable(),
  receivingBufferDays: nonNegativeInt.optional().nullable(),
  reorderCoverageDays: nonNegativeInt.optional().nullable(),
  reorderMinQty: nonNegativeInt.optional().nullable(),
  reorderCasePack: positiveInt.optional().nullable(),
  targetMarginPct: z.number().min(0).max(1).optional().nullable(),
  targetAcosPct: z.number().min(0).max(1).optional().nullable(),
  targetTacosPct: z.number().min(0).max(1).optional().nullable(),
  notes: optionalString,
});

export const UpdatePurchaseOrderSchema = CreatePurchaseOrderSchema.partial().extend({
  status: z
    .enum([
      "DRAFT",
      "CONFIRMED",
      "DEPOSITED",
      "IN_PRODUCTION",
      "SHIPPED",
      "RECEIVED",
      "CANCELLED",
      "ARCHIVED",
    ])
    .optional(),
  balanceDue: z.number().nonnegative().optional(),
  depositPaidAt: optionalDate,
});

export const UpdateShipmentSchema = CreateShipmentSchema.partial();

export const UpdateExpenseSchema = CreateExpenseSchema.partial().extend({
  effectiveAt: optionalDate,
});

export const UpdateProjectSchema = CreateProjectSchema.partial();

// ─── Helper ───────────────────────────────────────────────────────────────────

export function parseBody<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  body: unknown
):
  | { data: z.output<TSchema>; error: null }
  | { data: null; error: string } {
  const result = schema.safeParse(body);

  if (!result.success) {
    const msg =
      result.error.issues
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join("; ") || "Invalid request body";

    return { data: null, error: msg };
  }

  return { data: result.data, error: null };
}