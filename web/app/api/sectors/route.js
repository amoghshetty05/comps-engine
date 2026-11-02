import { dealsBySectorYear, sectorSummary } from "@/lib/queries";

export const dynamic = "force-dynamic";

// GET /api/sectors  -> SQL sector medians + MongoDB deal activity by sector
export async function GET() {
  const summary = await sectorSummary();
  let deals = null;
  try {
    deals = await dealsBySectorYear();
  } catch {
    deals = null; // the SQL half still works if MongoDB is down
  }
  return Response.json({ summary, deals });
}
