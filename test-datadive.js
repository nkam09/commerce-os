require("dotenv").config({ path: ".env.local" });
const key = process.env.DATADIVE_API_KEY;

async function main() {
  const radarId = "bb1b4583-aedd-460c-947d-ec27fc4f8bf5";
  
  // Get rankings with dates
  let res = await fetch(`https://api.datadive.tools/v1/niches/rank-radars/${radarId}?startDate=2026-04-01&endDate=2026-04-13`, {
    headers: { "x-api-key": key, "accept": "application/json" }
  });
  console.log("Rankings status:", res.status);
  const data = await res.json();
  console.log(JSON.stringify(data).slice(0, 3000));

  // Also get the bowl covers niche keywords
  const nicheRes = await fetch("https://api.datadive.tools/v1/niches?page=1&pageSize=100", {
    headers: { "x-api-key": key, "accept": "application/json" }
  });
  const niches = await nicheRes.json();
  const bowlNiche = niches.data?.find(n => n.heroKeyword?.toLowerCase().includes("bowl cover"));
  if (bowlNiche) {
    console.log("\n\nBowl covers niche:", bowlNiche.nicheId);
    res = await fetch(`https://api.datadive.tools/v1/niches/${bowlNiche.nicheId}/keywords`, {
      headers: { "x-api-key": key, "accept": "application/json" }
    });
    console.log("Keywords status:", res.status);
    const kw = await res.json();
    console.log(JSON.stringify(kw).slice(0, 2000));
  } else {
    console.log("\nNo bowl covers niche. Searching all:");
    niches.data?.filter(n => n.heroKeyword?.toLowerCase().includes("bowl") || n.heroKeyword?.toLowerCase().includes("cover"))
      .forEach(n => console.log(" ", n.nicheId, n.heroKeyword));
  }
}
main().catch(e => console.error(e));
