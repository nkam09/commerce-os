import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";

/**
 * GET /api/pm/orders/exchange-rate?currency=JPY
 * Returns the current exchange rate (1 foreign unit = X USD) from exchangerate-api.com.
 */
export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const currency = req.nextUrl.searchParams.get("currency");
    if (!currency || currency === "USD") {
      return NextResponse.json({ rate: 1, source: "static", timestamp: new Date().toISOString() });
    }

    const res = await fetch("https://api.exchangerate-api.com/v4/latest/USD", {
      next: { revalidate: 3600 }, // cache for 1 hour
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to fetch exchange rates" },
        { status: 502 }
      );
    }

    const data = await res.json();
    const foreignPerUSD = data.rates?.[currency];

    if (!foreignPerUSD) {
      return NextResponse.json(
        { error: `Currency ${currency} not found` },
        { status: 400 }
      );
    }

    // We want: 1 foreign unit = X USD
    const rate = 1 / foreignPerUSD;

    return NextResponse.json({
      rate: Math.round(rate * 1000000) / 1000000, // 6 decimal places
      foreignPerUSD,
      source: "exchangerate-api.com",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[exchange-rate] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch exchange rate" },
      { status: 500 }
    );
  }
}
