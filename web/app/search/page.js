import Link from "next/link";
import { searchCompanies } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }) {
  const q = (searchParams?.q ?? "").trim().slice(0, 100);
  const results = q.length >= 2 ? await searchCompanies(q) : [];

  return (
    <>
      <p className="small"><Link href="/">← All companies</Link></p>
      <h1>Search</h1>
      <p className="sub">Postgres full-text search over business descriptions (GIN-indexed tsvector).</p>
      <form action="/search" className="searchbar" style={{ marginBottom: 20 }}>
        <input name="q" defaultValue={q} required minLength={2} />
        <button>Search</button>
      </form>

      {q && results.length === 0 && <p className="muted">No companies match “{q}”.</p>}
      {results.map((r) => (
        <div key={r.ticker} className="panel" style={{ padding: "12px 18px", marginBottom: 10 }}>
          <Link href={`/company/${r.ticker}`}><strong>{r.name}</strong></Link>{" "}
          <span className="tag">{r.sector}</span>
          {r.rank > 0 && <span className="muted small">relevance {Number(r.rank).toFixed(3)}</span>}
          {/* ts_headline output: only <mark> tags from our own StartSel/StopSel */}
          <div className="small muted" dangerouslySetInnerHTML={{ __html: escapeExceptMark(r.snippet) }} />
        </div>
      ))}
    </>
  );
}

// Descriptions come from an external source, so escape everything and then
// restore only the <mark> tags Postgres inserted.
function escapeExceptMark(s = "") {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/&lt;mark&gt;/g, "<mark>").replace(/&lt;\/mark&gt;/g, "</mark>");
}
