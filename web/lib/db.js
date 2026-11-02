import pg from "pg";

// Postgres NUMERIC arrives as a string by default (to avoid precision loss).
// Every number here is a display value, so parse to float once, globally.
pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
// COUNT(*) is BIGINT (also a string by default); our counts are small.
pg.types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));
// DATE: keep '2026-11-02' as-is. Turning it into a JS Date would apply the
// server's timezone and could show the previous day.
pg.types.setTypeParser(1082, (v) => v);

// One pool per server process. In dev, Next.js reloads modules on every
// change, so the pool is cached on globalThis to avoid leaking connections.
const pool =
  globalThis.__pgPool ??
  new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
if (process.env.NODE_ENV !== "production") globalThis.__pgPool = pool;

/** Run one parameterised query. Values are always passed separately ($1, $2 ...),
 *  never concatenated into the SQL string, which is what prevents SQL injection. */
export async function query(text, params = []) {
  const res = await pool.query(text, params);
  return res.rows;
}

/** Run fn inside a transaction on one connection. If the user id is given it is
 *  stored in the transaction-local setting app.user_id, which the audit trigger
 *  reads to record who made the change. */
export async function transaction(fn, userId = null) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (userId != null) {
      await client.query("SELECT set_config('app.user_id', $1, true)", [String(userId)]);
    }
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
