import Link from "next/link";
import { notFound } from "next/navigation";
import { getComps, getDeals, getSimilar } from "@/lib/queries";
import { crore, date, multiple, pct, price } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CompanyPage({ params }) {
  const ticker = decodeURIComponent(params.ticker);
  const comps = await getComps(ticker);
  if (!comps) notFound();
  const { target: t, peers, summary } = comps;

  const similar = await getSimilar(ticker, 6);
  let deals = [];
  let dealsError = null;
  try {
    deals = await getDeals(t.ticker);
  } catch {
    dealsError = "Deal history is unavailable (MongoDB is not reachable).";
  }

  const isBank = t.ev_ebitda == null && t.enterprise_value == null;

  return (
    <>
      <p className="small"><Link href="/">← All companies</Link></p>
      <h1>{t.name}</h1>
      <p className="sub">{t.ticker} · {t.sector} · FY{t.fiscal_year} financials · price as of {date(t.as_of_date)}</p>

      <div className="panel">
        <div className="stats">
          <Stat k="Price" v={price(t.price)} />
          <Stat k="Market cap" v={crore(t.market_cap)} />
          {!isBank && <Stat k="Enterprise value" v={crore(t.enterprise_value)} />}
          <Stat k="Revenue" v={crore(t.revenue)} />
          {!isBank && <Stat k="EV/EBITDA" v={multiple(t.ev_ebitda)} />}
          <Stat k="P/E" v={multiple(t.pe_ratio)} />
          <Stat k="P/B" v={multiple(t.pb_ratio)} />
        </div>
        {t.description && (
          <details className="desc">
            <summary className="small muted">{t.description.slice(0, 220)}{t.description.length > 220 ? "… " : ""}
              {t.description.length > 220 && <span className="more">Read more</span>}</summary>
            <p className="small muted">{t.description}</p>
          </details>
        )}
      </div>

      <div className="panel tablewrap">
        <h2>Sector comps <span className="muted small">— same sector, closest market cap first (SQL)</span></h2>
        <table>
          <thead>
            <tr>
              <th>Company</th><th className="num">Market cap</th><th className="num">Revenue</th>
              <th className="num">EV/EBITDA</th><th className="num">P/E</th><th className="num">P/B</th>
              <th className="num">EBITDA margin</th><th className="num">Net margin</th>
            </tr>
          </thead>
          <tbody>
            <CompRow r={t} target />
            {peers.map((p) => <CompRow key={p.ticker} r={p} />)}
            {summary && (
              <tr className="median">
                <td>Sector median ({summary.companies} cos.)</td><td /><td />
                <td className="num">{multiple(summary.median_ev_ebitda)}</td>
                <td className="num">{multiple(summary.median_pe)}</td>
                <td className="num">{multiple(summary.avg_pb)} avg</td><td /><td />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="grid2">
        <div className="panel">
          <h2>Similar businesses <span className="muted small">— by description (pgvector)</span></h2>
          {similar.length === 0 && <p className="muted small">No embeddings yet. Run <code>python ingest/embed.py</code>.</p>}
          {similar.map((s) => (
            <div key={s.ticker} style={{ marginBottom: 12 }}>
              <Link href={`/company/${s.ticker}`}>{s.name}</Link>{" "}
              <span className={`tag ${s.sector === t.sector ? "" : "cross"}`}>{s.sector}</span>
              <span className="muted small"> P/E {multiple(s.pe_ratio)} · {s.ev_ebitda == null
                ? `P/B ${multiple(s.pb_ratio)}` : `EV/EBITDA ${multiple(s.ev_ebitda)}`}</span>
              <div className="bar" title={`cosine similarity ${s.similarity}`}>
                <div style={{ width: `${Math.max(0, s.similarity) * 100}%` }} />
              </div>
              <span className="muted small">similarity {Number(s.similarity).toFixed(2)}</span>
            </div>
          ))}
          <p className="small muted">Orange tags mark matches from a different sector: businesses that read
            alike even though their sector labels differ.</p>
        </div>

        <div className="panel">
          <h2>Deal history <span className="muted small">— MongoDB</span></h2>
          {dealsError && <div className="msg err">{dealsError}</div>}
          {!dealsError && deals.length === 0 && <p className="muted small">No deals recorded for this company.</p>}
          {deals.map((d) => <Deal key={d.headline} d={d} />)}
        </div>
      </div>
    </>
  );
}

function Stat({ k, v }) {
  return <div className="stat"><div className="k">{k}</div><div className="v">{v}</div></div>;
}

function CompRow({ r, target }) {
  return (
    <tr className={target ? "target" : ""}>
      <td>{target ? r.name : <Link href={`/company/${r.ticker}`}>{r.name}</Link>}</td>
      <td className="num">{crore(r.market_cap)}</td>
      <td className="num">{crore(r.revenue)}</td>
      <td className="num">{multiple(r.ev_ebitda)}</td>
      <td className="num">{multiple(r.pe_ratio)}</td>
      <td className="num">{multiple(r.pb_ratio)}</td>
      <td className="num">{pct(r.ebitda_margin_pct)}</td>
      <td className="num">{pct(r.net_margin_pct)}</td>
    </tr>
  );
}

// Each deal type stores different fields (the reason it lives in MongoDB),
// so the facts line is built from whichever section the document has.
function Deal({ d }) {
  const facts = [];
  if (d.deal) {
    if (d.deal.target) facts.push(`Target: ${d.deal.target}`);
    if (d.deal.value_inr_cr) facts.push(`₹${d.deal.value_inr_cr.toLocaleString("en-IN")} cr`);
    if (d.deal.value_usd_mn) facts.push(`US$${d.deal.value_usd_mn.toLocaleString("en-US")} mn`);
    if (d.deal.stake_pct) facts.push(`${d.deal.stake_pct}% stake`);
    if (d.deal.consideration) facts.push(`paid in ${d.deal.consideration}`);
  }
  if (d.merger) {
    facts.push(`With: ${d.merger.counterparty}`, `Swap: ${d.merger.swap_ratio}`);
    if (d.merger.effective_date) facts.push(`effective ${date(d.merger.effective_date)}`);
  }
  if (d.ipo) facts.push(`Issue size ₹${d.ipo.issue_size_inr_cr.toLocaleString("en-IN")} cr`);
  if (d.raise) facts.push(`${d.raise.instrument}: ₹${d.raise.amount_inr_cr.toLocaleString("en-IN")} cr`);

  return (
    <div className="deal">
      <div className="when"><span className="type">{d.type}</span> · {date(d.date)}</div>
      <div><strong>{d.headline}</strong></div>
      {d.summary && <div className="small">{d.summary}</div>}
      {facts.length > 0 && <div className="facts">{facts.join(" · ")}</div>}
      <div>
        {(d.tags || []).map((tag) => <span key={tag} className="tag">{tag}</span>)}
        {d.source_url && <a className="small" href={d.source_url} target="_blank" rel="noreferrer">source</a>}
      </div>
    </div>
  );
}
