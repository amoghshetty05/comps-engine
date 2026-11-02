import { auditLog, listCompanies } from "@/lib/queries";
import { getSession } from "@/lib/session";
import FinancialsForm from "@/components/FinancialsForm";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await getSession(); // middleware already guarantees an admin
  const [companies, raw] = await Promise.all([listCompanies("ticker"), auditLog(150)]);
  // record_financials also bumps companies.updated_at; those rows say nothing
  // useful on screen, so hide updates where only the timestamp changed.
  const log = raw.filter((r) => describe(r) !== TIMESTAMP_ONLY).slice(0, 30);

  return (
    <>
      <h1>Admin</h1>
      <p className="sub">Signed in as {session.email}. Changes run through the <code>record_financials</code> procedure
        in one transaction and are recorded by the audit trigger.</p>

      <div className="panel">
        <h2>Record financials</h2>
        <FinancialsForm companies={companies.map((c) => ({ ticker: c.ticker, name: c.name }))} />
      </div>

      <div className="panel tablewrap">
        <h2>Audit log <span className="muted small">— written by triggers, latest 30 meaningful changes</span></h2>
        <table>
          <thead>
            <tr><th>#</th><th>When</th><th>Table</th><th>Operation</th><th>Record</th><th>By</th><th>Change</th></tr>
          </thead>
          <tbody>
            {log.map((r) => (
              <tr key={r.log_id} style={{ verticalAlign: "top" }}>
                <td className="muted">{r.log_id}</td>
                <td className="small">{new Date(r.changed_at).toLocaleString("en-IN")}</td>
                <td>{r.table_name}</td>
                <td>{r.operation}</td>
                <td className="num">{r.record_id}</td>
                <td className="small">{r.changed_by ?? <span className="muted">script</span>}</td>
                <td><pre className="json">{describe(r)}</pre></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

const TIMESTAMP_ONLY = "(timestamp only)";

// Show only the fields that changed, instead of two whole JSON rows.
function describe({ operation, old_data, new_data }) {
  if (operation === "UPDATE") {
    const changed = Object.keys(new_data || {}).filter(
      (k) => k !== "updated_at" && JSON.stringify(old_data?.[k]) !== JSON.stringify(new_data[k]));
    return changed.map((k) => `${k}: ${short(old_data?.[k])} → ${short(new_data[k])}`).join("\n") || TIMESTAMP_ONLY;
  }
  const row = operation === "DELETE" ? old_data : new_data;
  const keys = ["ticker", "fiscal_year", "revenue", "net_income"].filter((k) => row && k in row);
  return `${operation === "DELETE" ? "removed" : "added"} ${keys.map((k) => `${k}=${short(row[k])}`).join(", ")}`;
}

function short(v) {
  const s = v == null ? "null" : String(v);
  return s.length > 40 ? s.slice(0, 37) + "…" : s;
}
