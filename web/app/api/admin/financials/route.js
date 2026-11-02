import { z } from "zod";
import { transaction } from "@/lib/db";
import { requireRole } from "@/lib/session";

const num = z.coerce.number().finite();
const optNum = z.preprocess((v) => (v === "" || v == null ? null : v), num.nullable());

const Body = z.object({
  ticker: z.string().trim().min(1),
  fiscal_year: z.coerce.number().int().min(2000).max(2100),
  revenue: num.min(0),
  ebitda: optNum,
  net_income: optNum,
  total_debt: num.min(0).default(0),
  cash: num.min(0).default(0),
  total_equity: optNum,
  price: optNum,
  market_cap: optNum,
});

// POST /api/admin/financials -> record_financials() in ONE transaction,
// running as the app_admin database role. The admin's user id is put in
// app.user_id for that transaction, so the audit trigger records exactly
// who changed what.
export async function POST(req) {
  const { session, error } = await requireRole("admin");
  if (error) return error;

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return Response.json({ error: `${issue.path.join(".")}: ${issue.message}` }, { status: 400 });
  }
  const b = parsed.data;

  try {
    const result = await transaction(async (client) => {
      const { rows } = await client.query(
        "SELECT company_id FROM companies WHERE upper(ticker) = upper($1)", [b.ticker]);
      if (!rows.length) return { status: 404, body: { error: `Unknown ticker ${b.ticker}` } };

      await client.query(
        `CALL record_financials($1::int, $2::int, $3::numeric, $4::numeric, $5::numeric,
                                $6::numeric, $7::numeric, $8::numeric, $9::numeric, $10::numeric)`,
        [rows[0].company_id, b.fiscal_year, b.revenue, b.ebitda, b.net_income,
         b.total_debt, b.cash, b.total_equity, b.price, b.market_cap]
      );
      return { status: 200, body: { ok: true, message: `Saved FY${b.fiscal_year} for ${b.ticker.toUpperCase()}` } };
    }, { role: "app_admin", userId: session.userId });
    return Response.json(result.body, { status: result.status });
  } catch (err) {
    // Constraint and trigger errors (codes 23xxx, or P0001 from RAISE) are
    // the user's input being rejected; anything else is a real server error.
    if (err.code?.startsWith("23") || err.code === "P0001") {
      return Response.json({ error: `Rejected by the database: ${err.message}` }, { status: 400 });
    }
    // 42501 = insufficient_privilege: the database role itself said no.
    if (err.code === "42501") {
      return Response.json({ error: `Database permission denied: ${err.message}` }, { status: 403 });
    }
    throw err;
  }
}
