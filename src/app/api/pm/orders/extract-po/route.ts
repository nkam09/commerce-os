import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { apiSuccess, apiError, apiServerError, apiUnauthorized } from "@/lib/utils/api";

/* ─── Types ─────────────────────────────────────────── */

type Confidence = "high" | "medium" | "low";

type ExtractedLineItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  unit: string;
  confidence: Confidence;
};

type ExtractedData = {
  orderNumber: { value: string; confidence: Confidence } | null;
  supplier: { value: string; confidence: Confidence } | null;
  orderDate: { value: string; confidence: Confidence } | null;
  currency: { value: string; confidence: Confidence } | null;
  shipMethod: { value: string; confidence: Confidence } | null;
  terms: { value: string; confidence: Confidence } | null;
  lineItems: ExtractedLineItem[];
  notes: string;
};

/* ─── Prompt ────────────────────────────────────────── */

const EXTRACTION_PROMPT = `You are a purchase order data extraction assistant. Analyze the uploaded document (a purchase order, invoice, or proforma) and extract structured data.

Return ONLY valid JSON matching this exact schema — no markdown fences, no commentary:

{
  "orderNumber": { "value": "string", "confidence": "high|medium|low" } | null,
  "supplier": { "value": "string", "confidence": "high|medium|low" } | null,
  "orderDate": { "value": "YYYY-MM-DD", "confidence": "high|medium|low" } | null,
  "currency": { "value": "USD|CNY|EUR|GBP|CAD", "confidence": "high|medium|low" } | null,
  "shipMethod": { "value": "Sea|Air|Express|Truck", "confidence": "high|medium|low" } | null,
  "terms": { "value": "string", "confidence": "high|medium|low" } | null,
  "lineItems": [
    {
      "description": "string",
      "quantity": number,
      "unitPrice": number,
      "unit": "pc.|set|kg|roll|box",
      "confidence": "high|medium|low"
    }
  ],
  "notes": "string with anything notable (discrepancies, handwritten text, etc.)"
}

Rules:
- Use null for fields you cannot find or confidently extract.
- "high" = clearly printed/typed, unambiguous.
- "medium" = partially visible, slight ambiguity, or inferred from context.
- "low" = guessed from layout/context, handwritten, or very uncertain.
- For orderDate, convert any date format to YYYY-MM-DD.
- For currency, map symbols (¥ = CNY, $ = USD, € = EUR, £ = GBP) to ISO codes.
- For terms, look for payment terms like "T/T", "30% deposit", "50/50", "Net 30", etc. Normalize to a readable string.
- For lineItems, extract every distinct product row. If unit price or quantity is unclear, set confidence to "low".
- notes should mention anything the user should verify manually.`;

/* ─── Allowed MIME types ────────────────────────────── */

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

type ImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

/* ─── POST handler ──────────────────────────────────── */

export async function POST(req: NextRequest) {
  try {
    try {
      await requireUser();
    } catch {
      return apiUnauthorized();
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return apiError("No file uploaded", 400);
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return apiError(
        `Unsupported file type: ${file.type}. Accepted: JPEG, PNG, WebP, GIF, PDF.`,
        400
      );
    }

    if (file.size > 20 * 1024 * 1024) {
      return apiError("File too large. Maximum size is 20 MB.", 400);
    }

    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");

    const anthropic = new Anthropic();

    /* Build the content blocks for the message */
    const isPDF = file.type === "application/pdf";

    const contentBlocks: Anthropic.Messages.ContentBlockParam[] = isPDF
      ? [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: base64,
            },
          },
          { type: "text", text: EXTRACTION_PROMPT },
        ]
      : [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: file.type as ImageMediaType,
              data: base64,
            },
          },
          { type: "text", text: EXTRACTION_PROMPT },
        ];

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      messages: [{ role: "user", content: contentBlocks }],
    });

    /* Extract the text response */
    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return apiError("No text response from extraction model", 500);
    }

    /* Parse the JSON — strip markdown fences if model added them */
    let raw = textBlock.text.trim();
    if (raw.startsWith("```")) {
      raw = raw.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    }

    let extracted: ExtractedData;
    try {
      extracted = JSON.parse(raw) as ExtractedData;
    } catch {
      console.error("[extract-po] Failed to parse model output:", raw);
      return apiError("Failed to parse extraction result. Please try again.", 500);
    }

    return apiSuccess(extracted);
  } catch (err) {
    return apiServerError(err);
  }
}
