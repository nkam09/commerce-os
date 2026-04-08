// ─── Rank Tracking Service ────────────────────────────────────────────────────
// Mock data for the /rank-tracking page. Returns keyword rank data
// for 3 products with Branded / Primary / Long-tail zones.

// ─── Types ───────────────────────────────────────────────────────────────────

export type RankTrackingProduct = {
  asin: string;
  title: string;
};

export type HeatmapCell = {
  date: string; // ISO date
  rank: number | null;
};

export type RankTrackingKeyword = {
  id: string;
  keyword: string;
  zone: "branded" | "primary" | "long-tail";
  searchVolume: number;
  currentRank: number | null;
  bestRank: number;
  worstRank: number;
  avgRank30d: number;
  rankChange: number; // positive = improved (rank decreased numerically)
  sponsoredRank: number | null;
  heatmap: HeatmapCell[];
};

export type RankTrackingData = {
  product: RankTrackingProduct;
  keywords: RankTrackingKeyword[];
};

// ─── Deterministic pseudo-random ────────────────────────────────────────────

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// ─── Products ───────────────────────────────────────────────────────────────

const PRODUCTS: RankTrackingProduct[] = [
  { asin: "B0EXAMPLE1", title: "Eco-Friendly Water Bottle 50-pack" },
  { asin: "B0EXAMPLE2", title: "Eco-Friendly Water Bottle 100-pack" },
  { asin: "B0EXAMPLE3", title: "Bamboo Utensil Set" },
];

// ─── Keyword definitions per product ────────────────────────────────────────

type KeywordSeed = {
  keyword: string;
  zone: "branded" | "primary" | "long-tail";
  searchVolume: number;
  baseRank: number;
  volatility: number;
  sponsoredBase: number | null;
};

const PRODUCT_KEYWORDS: Record<string, KeywordSeed[]> = {
  B0EXAMPLE1: [
    // Branded
    { keyword: "eco bottle brand", zone: "branded", searchVolume: 2400, baseRank: 3, volatility: 2, sponsoredBase: 1 },
    { keyword: "commerce os water", zone: "branded", searchVolume: 1800, baseRank: 2, volatility: 1, sponsoredBase: 1 },
    { keyword: "eco bottle official", zone: "branded", searchVolume: 950, baseRank: 5, volatility: 3, sponsoredBase: 2 },
    // Primary
    { keyword: "eco friendly water bottle", zone: "primary", searchVolume: 74200, baseRank: 12, volatility: 8, sponsoredBase: 4 },
    { keyword: "reusable water bottle bulk", zone: "primary", searchVolume: 38600, baseRank: 18, volatility: 10, sponsoredBase: 6 },
    { keyword: "water bottle pack", zone: "primary", searchVolume: 52100, baseRank: 22, volatility: 12, sponsoredBase: 8 },
    { keyword: "sustainable water bottle", zone: "primary", searchVolume: 28400, baseRank: 15, volatility: 9, sponsoredBase: 5 },
    { keyword: "bpa free water bottle bulk", zone: "primary", searchVolume: 19800, baseRank: 25, volatility: 14, sponsoredBase: 7 },
    // Long-tail
    { keyword: "eco friendly water bottle for office 50 pack", zone: "long-tail", searchVolume: 3200, baseRank: 8, volatility: 18, sponsoredBase: 3 },
    { keyword: "reusable water bottles bulk for events", zone: "long-tail", searchVolume: 2100, baseRank: 14, volatility: 22, sponsoredBase: null },
    { keyword: "sustainable water bottle gift set wholesale", zone: "long-tail", searchVolume: 1450, baseRank: 35, volatility: 25, sponsoredBase: null },
    { keyword: "eco water bottle multipack bpa free", zone: "long-tail", searchVolume: 4800, baseRank: 20, volatility: 15, sponsoredBase: 9 },
  ],
  B0EXAMPLE2: [
    // Branded
    { keyword: "eco bottle brand", zone: "branded", searchVolume: 2400, baseRank: 4, volatility: 2, sponsoredBase: 2 },
    { keyword: "commerce os water 100", zone: "branded", searchVolume: 1200, baseRank: 1, volatility: 1, sponsoredBase: 1 },
    // Primary
    { keyword: "eco friendly water bottle", zone: "primary", searchVolume: 74200, baseRank: 16, volatility: 9, sponsoredBase: 5 },
    { keyword: "reusable water bottle bulk", zone: "primary", searchVolume: 38600, baseRank: 9, volatility: 6, sponsoredBase: 3 },
    { keyword: "water bottle 100 pack", zone: "primary", searchVolume: 22800, baseRank: 6, volatility: 5, sponsoredBase: 2 },
    { keyword: "bulk water bottles for events", zone: "primary", searchVolume: 15600, baseRank: 11, volatility: 8, sponsoredBase: 4 },
    { keyword: "wholesale reusable bottles", zone: "primary", searchVolume: 12400, baseRank: 28, volatility: 15, sponsoredBase: 8 },
    // Long-tail
    { keyword: "eco friendly water bottle 100 pack for wedding", zone: "long-tail", searchVolume: 1800, baseRank: 5, volatility: 12, sponsoredBase: 2 },
    { keyword: "reusable water bottle bulk 100 count bpa free", zone: "long-tail", searchVolume: 2600, baseRank: 10, volatility: 16, sponsoredBase: null },
    { keyword: "sustainable water bottles party favors bulk", zone: "long-tail", searchVolume: 980, baseRank: 42, volatility: 30, sponsoredBase: null },
  ],
  B0EXAMPLE3: [
    // Branded
    { keyword: "commerce os bamboo utensils", zone: "branded", searchVolume: 800, baseRank: 1, volatility: 1, sponsoredBase: 1 },
    { keyword: "eco brand utensil set", zone: "branded", searchVolume: 1100, baseRank: 6, volatility: 3, sponsoredBase: 2 },
    // Primary
    { keyword: "bamboo utensil set", zone: "primary", searchVolume: 42500, baseRank: 14, volatility: 8, sponsoredBase: 5 },
    { keyword: "eco friendly utensils", zone: "primary", searchVolume: 31200, baseRank: 20, volatility: 11, sponsoredBase: 7 },
    { keyword: "reusable cutlery set", zone: "primary", searchVolume: 26800, baseRank: 32, volatility: 15, sponsoredBase: 10 },
    { keyword: "sustainable kitchen utensils", zone: "primary", searchVolume: 18400, baseRank: 25, volatility: 12, sponsoredBase: 6 },
    // Long-tail
    { keyword: "bamboo utensil set with carrying case travel", zone: "long-tail", searchVolume: 3800, baseRank: 9, volatility: 20, sponsoredBase: 3 },
    { keyword: "eco friendly bamboo cutlery set for camping", zone: "long-tail", searchVolume: 2200, baseRank: 18, volatility: 22, sponsoredBase: null },
    { keyword: "sustainable bamboo utensils gift set", zone: "long-tail", searchVolume: 1600, baseRank: 45, volatility: 28, sponsoredBase: null },
  ],
};

// ─── Heatmap generator ──────────────────────────────────────────────────────

function generateHeatmap(
  seed: number,
  baseRank: number,
  volatility: number,
  days: number,
): HeatmapCell[] {
  const rand = seededRandom(seed);
  const cells: HeatmapCell[] = [];
  let currentRank = baseRank;

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const iso = date.toISOString().slice(0, 10);

    // Small chance of null (not ranked that day)
    if (rand() < 0.04) {
      cells.push({ date: iso, rank: null });
      continue;
    }

    // Smooth random walk
    const drift = (rand() - 0.48) * volatility * 0.4;
    currentRank = Math.max(1, Math.min(150, Math.round(currentRank + drift)));
    cells.push({ date: iso, rank: currentRank });
  }

  return cells;
}

// ─── Main query ─────────────────────────────────────────────────────────────

export function getRankTrackingProducts(): RankTrackingProduct[] {
  return PRODUCTS;
}

export function getRankTrackingData(
  asin: string,
  dateRange: "last7" | "last30" | "last90",
): RankTrackingData {
  const product = PRODUCTS.find((p) => p.asin === asin) ?? PRODUCTS[0];
  const seeds = PRODUCT_KEYWORDS[product.asin] ?? PRODUCT_KEYWORDS["B0EXAMPLE1"];
  const days = dateRange === "last7" ? 7 : dateRange === "last90" ? 90 : 30;

  const keywords: RankTrackingKeyword[] = seeds.map((kw, idx) => {
    const heatmap = generateHeatmap(
      idx * 173 + asin.charCodeAt(asin.length - 1) * 31,
      kw.baseRank,
      kw.volatility,
      days,
    );

    const rankedCells = heatmap.filter((c) => c.rank !== null) as { date: string; rank: number }[];
    const ranks = rankedCells.map((c) => c.rank);

    const currentRank = rankedCells.length > 0 ? rankedCells[rankedCells.length - 1].rank : null;
    const bestRank = ranks.length > 0 ? Math.min(...ranks) : kw.baseRank;
    const worstRank = ranks.length > 0 ? Math.max(...ranks) : kw.baseRank;
    const avgRank = ranks.length > 0
      ? Math.round(ranks.reduce((a, b) => a + b, 0) / ranks.length)
      : kw.baseRank;

    // Rank change: compare last two ranked days
    let rankChange = 0;
    if (rankedCells.length >= 2) {
      const prev = rankedCells[rankedCells.length - 2].rank;
      const curr = rankedCells[rankedCells.length - 1].rank;
      rankChange = prev - curr; // positive = improved (lower rank number)
    }

    const rand = seededRandom(idx * 41 + 7);
    const sponsoredRank = kw.sponsoredBase !== null
      ? Math.max(1, kw.sponsoredBase + Math.round((rand() - 0.5) * 4))
      : null;

    return {
      id: `rt_${asin}_${idx.toString().padStart(3, "0")}`,
      keyword: kw.keyword,
      zone: kw.zone,
      searchVolume: kw.searchVolume,
      currentRank,
      bestRank,
      worstRank,
      avgRank30d: avgRank,
      rankChange,
      sponsoredRank,
      heatmap,
    };
  });

  return { product, keywords };
}
