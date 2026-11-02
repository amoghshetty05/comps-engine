import { getDeals } from "@/lib/queries";

export const dynamic = "force-dynamic";

// GET /api/deals?ticker=ETERNAL.NS  -> that company's deals from MongoDB
export async function GET(req) {
  const ticker = new URL(req.url).searchParams.get("ticker");
  if (!ticker) return Response.json({ error: "ticker is required" }, { status: 400 });
  try {
    return Response.json(await getDeals(ticker));
  } catch (err) {
    return Response.json({ error: `MongoDB unavailable: ${err.message}` }, { status: 503 });
  }
}
