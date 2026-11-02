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

// Database roles created in db/07_roles.sql. A role name cannot be a $1
// parameter, so only these fixed names are ever put into SET ROLE.
const DB_ROLES = new Set(["app_analyst", "app_admin"]);

/** Run one parameterised query. Values are always passed separately ($1, $2 ...),
 *  never concatenated into the SQL string, which is what prevents SQL injection.
 *
 *  With a role, the query runs inside a short transaction after
 *  SET LOCAL ROLE, so Postgres checks that role's privileges. Without one it
 *  runs as the connecting user (only the login/register routes do this,
 *  because no role is known before someone has logged in). */
export async function query(text, params = [], role = null) {
  if (!role) return (await pool.query(text, params)).rows;
  return transaction((client) => client.query(text, params).then((r) => r.rows), { role });
}

/** Run fn inside a transaction on one connection.
 *  - role:   database role for the whole transaction (SET LOCAL ROLE)
 *  - userId: stored in app.user_id, which the audit trigger reads to record
 *            who made the change. */
export async function transaction(fn, { role = null, userId = null } = {}) {
  if (role && !DB_ROLES.has(role)) throw new Error(`Unknown database role ${role}`);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (role) await client.query(`SET LOCAL ROLE ${role}`);
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
