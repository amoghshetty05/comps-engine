// Every database read the app makes lives here, so the API routes and the
// server-rendered pages share exactly the same SQL and MongoDB queries.
import { query as rawQuery } from "./db";

// Market data is read as the read-only database role; admin-only data as app_admin.
const query = (text, params = []) => rawQuery(text, params, "app_analyst");
const adminQuery = (text, params = []) => rawQuery(text, params, "app_admin");
import { dealsCollection } from "./mongo";

// Sort keys the user may pick, mapped to SQL. Column names cannot be passed
// as $1 parameters, so a fixed whitelist is the safe way to sort dynamically.
const SORTS = {
  ticker: "ticker ASC",
  mcap: "market_cap DESC NULLS LAST",
  ev_ebitda: "ev_ebitda ASC NULLS LAST",
  pe: "pe_ratio ASC NULLS LAST",
  pb: "pb_ratio ASC NULLS LAST",
  margin: "ebitda_margin_pct DESC NULLS LAST",
};

export async function listCompanies(sort = "mcap") {
  const order = SORTS[sort] ?? SORTS.mcap;
  return query(`SELECT * FROM latest_multiples ORDER BY sector, ${order}`);
}

export async function getCompany(ticker) {
  const rows = await query(
    `SELECT m.*, c.description, c.updated_at, md.shares_outstanding
       FROM latest_multiples m
       JOIN companies c USING (company_id)
       LEFT JOIN latest_market md USING (company_id)
      WHERE upper(m.ticker) = upper($1)`,
    [ticker]
  );
  return rows[0] ?? null;
}

/** Target + same-sector peers (closest market cap first) + sector medians. */
export async function getComps(ticker, limit = 10) {
  const target = await getCompany(ticker);
  if (!target) return null;
  const peers = await query("SELECT * FROM get_sector_comps($1, $2)", [target.company_id, limit]);
  const [summary] = await query("SELECT * FROM sector_summary WHERE sector = $1", [target.sector]);
  return { target, peers, summary: summary ?? null };
}

/** Semantic neighbours from pgvector, joined to their multiples. */
export async function getSimilar(ticker, limit = 5) {
  return query(
    `SELECT s.ticker, s.name, s.sector, s.similarity,
            m.market_cap, m.ev_ebitda, m.pe_ratio, m.pb_ratio
       FROM companies c
       CROSS JOIN LATERAL similar_companies(c.company_id, $2) s
       LEFT JOIN latest_multiples m ON m.ticker = s.ticker
      WHERE upper(c.ticker) = upper($1)
      ORDER BY s.similarity DESC`,
    [ticker, limit]
  );
}

/** Full-text search on descriptions (GIN index) plus a plain name/ticker match. */
export async function searchCompanies(q) {
  return query(
    `SELECT c.ticker, c.name, s.name AS sector,
            ts_rank(c.description_tsv, websearch_to_tsquery('english', $1)) AS rank,
            ts_headline('english', coalesce(c.description, ''),
                        websearch_to_tsquery('english', $1),
                        'MaxWords=30, MinWords=12, StartSel=<mark>, StopSel=</mark>') AS snippet
       FROM companies c JOIN sectors s USING (sector_id)
      WHERE c.description_tsv @@ websearch_to_tsquery('english', $1)
         OR c.name ILIKE '%' || $1 || '%'
         OR c.ticker ILIKE $1 || '%'
      ORDER BY (c.name ILIKE '%' || $1 || '%') DESC, rank DESC
      LIMIT 20`,
    [q]
  );
}

export async function sectorSummary() {
  return query("SELECT * FROM sector_summary ORDER BY sector");
}

// ---------------------------------------------------------------- MongoDB
export async function getDeals(ticker) {
  const deals = await dealsCollection();
  return deals
    .find({ ticker: ticker.toUpperCase() }, { projection: { _id: 0 } })
    .sort({ date: -1 })
    .toArray();
}

/** Aggregation pipeline: deal count and disclosed value per sector per year. */
export async function dealsBySectorYear() {
  const deals = await dealsCollection();
  return deals
    .aggregate([
      {
        $group: {
          _id: { sector: "$sector", year: { $year: "$date" } },
          deals: { $sum: 1 },
          value_inr_cr: { $sum: { $ifNull: ["$deal.value_inr_cr", 0] } },
          types: { $addToSet: "$type" },
        },
      },
      { $sort: { "_id.sector": 1, "_id.year": 1 } },
    ])
    .toArray();
}

// ---------------------------------------------------------------- admin
export async function auditLog(limit = 40) {
  return adminQuery(
    `SELECT a.log_id, a.table_name, a.operation, a.record_id, a.changed_at,
            a.old_data, a.new_data, u.email AS changed_by
       FROM audit_log a LEFT JOIN users u ON u.user_id = a.changed_by
      ORDER BY a.log_id DESC LIMIT $1`,
    [limit]
  );
}
