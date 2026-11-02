import { getComps } from "@/lib/queries";

export const dynamic = "force-dynamic";

// GET /api/comps?ticker=TCS.NS  -> target, same-sector peers, sector medians
export async function GET(req) {
  const ticker = new URL(req.url).searchParams.get("ticker");
  if (!ticker) return Response.json({ error: "ticker is required" }, { status: 400 });
  const comps = await getComps(ticker);
  if (!comps) return Response.json({ error: `Unknown ticker ${ticker}` }, { status: 404 });
  return Response.json(comps);
}
