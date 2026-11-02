"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const FIELDS = [
  ["revenue", "Revenue (₹ cr)", true],
  ["ebitda", "EBITDA (₹ cr)"],
  ["net_income", "Net income (₹ cr)"],
  ["total_debt", "Total debt (₹ cr)"],
  ["cash", "Cash (₹ cr)"],
  ["total_equity", "Total equity (₹ cr)"],
  ["price", "Share price (₹), optional"],
  ["market_cap", "Market cap (₹ cr), optional"],
];

export default function FinancialsForm({ companies }) {
  const router = useRouter();
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const body = Object.fromEntries(new FormData(e.currentTarget));
    const res = await fetch("/api/admin/financials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setMsg(res.ok ? { ok: true, text: data.message } : { ok: false, text: data.error || "Failed" });
    setBusy(false);
    if (res.ok) router.refresh(); // re-render the audit log below
  }

  return (
    <form className="stack" onSubmit={submit}>
      <div className="formgrid">
        <label>Company
          <select name="ticker" required>
            {companies.map((c) => <option key={c.ticker} value={c.ticker}>{c.name} ({c.ticker})</option>)}
          </select>
        </label>
        <label>Fiscal year<input name="fiscal_year" type="number" defaultValue={new Date().getFullYear()} required /></label>
        {FIELDS.map(([name, label, required]) => (
          <label key={name}>{label}<input name={name} type="number" step="any" required={!!required} /></label>
        ))}
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        If a fiscal year already exists it is updated. Try EBITDA greater than revenue: the validation
        trigger rejects it and nothing is saved.
      </p>
      {msg && <div className={`msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</div>}
      <div><button disabled={busy}>{busy ? "Saving…" : "Save in one transaction"}</button></div>
    </form>
  );
}
