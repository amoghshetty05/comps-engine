import { searchCompanies } from "@/lib/queries";

export const dynamic = "force-dynamic";

// GET /api/search?q=cloud consulting  -> full-text search over descriptions
export async function GET(req) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return Response.json([]);
  return Response.json(await searchCompanies(q.slice(0, 100)));
}
