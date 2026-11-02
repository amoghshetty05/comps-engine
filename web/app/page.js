import Link from "next/link";
import { listCompanies } from "@/lib/queries";
import { crore, multiple, pct } from "@/lib/format";

export const dynamic = "force-dynamic";

const COLS = [
  { key: "ticker", label: "Company" },
  { key: "mcap", label: "Market cap", num: true },
  { key: "ev_ebitda", label: "EV/EBITDA", num: true },
  { key: "pe", label: "P/E", num: true },
  { key: "pb", label: "P/B", num: true },
  { key: "margin", label: "EBITDA margin", num: true },
];

export default async function Home({ searchParams }) {
  const sort = searchParams?.sort ?? "mcap";
  const rows = await listCompanies(sort);
  const sectors = [...new Set(rows.map((r) => r.sector))];

  return (
    <>
      {searchParams?.denied && <div className="msg err" style={{ marginBottom: 16 }}>That page is for admins only.</div>}
      <h1>Companies</h1>
      <p className="sub">
        Latest multiples for {rows.length} NSE-listed companies. Banks are valued on P/E and P/B,
        so EV-based multiples are blank for them by design.
      </p>

      <form action="/search" className="searchbar" style={{ marginBottom: 20 }}>
        <input name="q" placeholder='Search descriptions, e.g. "cloud consulting" or "credit cards"' required minLength={2} />
        <button>Search</button>
      </form>

      <div className="panel tablewrap">
        <table>
          <thead>
            <tr>
              {COLS.map((c) => (
                <th key={c.key} className={c.num ? "num" : ""}>
                  <Link href={`/?sort=${c.key}`} className={sort === c.key ? "on" : ""}>{c.label}</Link>
                </th>
              ))}
              <th className="num">FY</th>
            </tr>
          </thead>
          <tbody>
            {sectors.map((s) => (
              <SectorRows key={s} sector={s} rows={rows.filter((r) => r.sector === s)} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SectorRows({ sector, rows }) {
  return (
    <>
      <tr className="group"><td colSpan={7}>{sector}</td></tr>
      {rows.map((r) => (
        <tr key={r.ticker}>
          <td><Link href={`/company/${r.ticker}`}>{r.name}</Link> <span className="muted small">{r.ticker}</span></td>
          <td className="num">{crore(r.market_cap)}</td>
          <td className="num">{multiple(r.ev_ebitda)}</td>
          <td className="num">{multiple(r.pe_ratio)}</td>
          <td className="num">{multiple(r.pb_ratio)}</td>
          <td className="num">{pct(r.ebitda_margin_pct)}</td>
          <td className="num muted">{r.fiscal_year}</td>
        </tr>
      ))}
    </>
  );
}
