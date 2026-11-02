import { getSimilar } from "@/lib/queries";

export const dynamic = "force-dynamic";

// GET /api/similar?ticker=INFY.NS&limit=5  -> nearest neighbours by embedding
export async function GET(req) {
  const params = new URL(req.url).searchParams;
  const ticker = params.get("ticker");
  if (!ticker) return Response.json({ error: "ticker is required" }, { status: 400 });
  const limit = Math.min(Math.max(parseInt(params.get("limit") ?? "5", 10) || 5, 1), 18);
  return Response.json(await getSimilar(ticker, limit));
}
