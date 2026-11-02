import { dealsBySectorYear, sectorSummary } from "@/lib/queries";
import { multiple } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SectorsPage() {
  const summary = await sectorSummary();
  let deals = null;
  try {
    deals = await dealsBySectorYear();
  } catch {
    deals = null;
  }

  return (
    <>
      <h1>Sectors</h1>
      <p className="sub">Valuation benchmarks from SQL, and deal activity from a MongoDB aggregation pipeline.</p>

      <div className="panel tablewrap">
        <h2>Sector valuation <span className="muted small">— view sector_summary</span></h2>
        <table>
          <thead>
            <tr>
              <th>Sector</th><th className="num">Companies</th>
              <th className="num">Median EV/EBITDA</th><th className="num">Avg EV/EBITDA</th>
              <th className="num">Median P/E</th><th className="num">Avg P/E</th><th className="num">Avg P/B</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((s) => (
              <tr key={s.sector}>
                <td>{s.sector}</td><td className="num">{s.companies}</td>
                <td className="num">{multiple(s.median_ev_ebitda)}</td><td className="num">{multiple(s.avg_ev_ebitda)}</td>
                <td className="num">{multiple(s.median_pe)}</td><td className="num">{multiple(s.avg_pe)}</td>
                <td className="num">{multiple(s.avg_pb)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="small muted">Medians resist outliers: one loss-thin company with a P/E of 800 drags the average
          far more than the median, which is why comps tables quote medians.</p>
      </div>

      <div className="panel tablewrap">
        <h2>Deal activity <span className="muted small">— MongoDB $group by sector and year</span></h2>
        {!deals && <div className="msg err">MongoDB is not reachable.</div>}
        {deals && (
          <table>
            <thead>
              <tr><th>Sector</th><th className="num">Year</th><th className="num">Deals</th>
                <th className="num">Disclosed value</th><th>Types</th></tr>
            </thead>
            <tbody>
              {deals.map((d) => (
                <tr key={`${d._id.sector}-${d._id.year}`}>
                  <td>{d._id.sector}</td><td className="num">{d._id.year}</td><td className="num">{d.deals}</td>
                  <td className="num">{d.value_inr_cr ? `₹${d.value_inr_cr.toLocaleString("en-IN")} cr` : "—"}</td>
                  <td>{d.types.sort().map((t) => <span key={t} className="tag">{t}</span>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
