import { listCompanies } from "@/lib/queries";

export const dynamic = "force-dynamic";

// GET /api/companies?sort=pe  -> every company with its latest multiples
export async function GET(req) {
  const sort = new URL(req.url).searchParams.get("sort") ?? "mcap";
  return Response.json(await listCompanies(sort));
}
