"""Phase 3: load real financials, prices and business descriptions into Postgres.

Data source: Yahoo Finance via the yfinance library (unofficial, free).
Raw responses are cached in ingest/cache/<TICKER>.json so you only download
once and the demo never depends on Yahoo being up.

Run from the repo root (venv active, `python ingest/apply_sql.py` done first):
    python ingest/load_financials.py               # use cache where present
    python ingest/load_financials.py --refresh     # re-download everything
    python ingest/load_financials.py --only TCS.NS INFY.NS
    python ingest/load_financials.py --offline     # cache only, no network

Every amount is converted to INR crore (divide by 1e7) to match the schema.
Statements Yahoo serves in USD (e.g. Infosys) are translated to INR first:
income items at the fiscal-year average USD/INR rate, balance-sheet items at
the closing rate on the year-end date. Rates also come from Yahoo (INR=X)
and are cached in ingest/cache/fx_USDINR.json. Each company year is written through the record_financials
stored procedure, in its own transaction, so one bad year is skipped
without losing the rest.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time
from datetime import date
from pathlib import Path

import psycopg
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
CACHE = Path(__file__).resolve().parent / "cache"
CRORE = 1e7
YEARS_WANTED = 4

load_dotenv(ROOT / ".env")

# yfinance row labels vary between companies, so each field lists the
# labels to try in order of preference.
INCOME_ROWS = {
    "revenue":    ["Total Revenue", "Operating Revenue"],
    "ebitda":     ["EBITDA", "Normalized EBITDA"],
    "net_income": ["Net Income", "Net Income Common Stockholders",
                   "Net Income From Continuing Operation Net Minority Interest"],
}
BALANCE_ROWS = {
    "total_debt":   ["Total Debt"],
    "cash":         ["Cash And Cash Equivalents",
                     "Cash Cash Equivalents And Short Term Investments",
                     "Cash Financial"],
    "total_equity": ["Stockholders Equity", "Common Stock Equity",
                     "Total Equity Gross Minority Interest"],
}
# Yahoo's currency label is wrong for some companies. Each entry here was
# checked by hand against the company's annual report.
#   HCLTECH.NS: labelled USD, but the figures are INR (FY26 revenue
#               ~Rs 1.30 lakh crore, matching the annual report).
CURRENCY_OVERRIDES = {
    "HCLTECH.NS": "INR",
}

INFO_KEYS = ["longName", "longBusinessSummary", "currentPrice",
             "regularMarketPrice", "previousClose", "marketCap",
             "sharesOutstanding", "currency", "financialCurrency"]


# ---------------------------------------------------------------- fetch
def frame_to_dict(df) -> dict:
    """DataFrame (rows = line items, cols = period dates) -> plain JSON dict."""
    if df is None or df.empty:
        return {}
    out = {}
    for col in df.columns:
        key = col.date().isoformat() if hasattr(col, "date") else str(col)
        out[key] = {
            str(row): (None if v is None or (isinstance(v, float) and math.isnan(v)) else float(v))
            for row, v in df[col].items()
        }
    return out


def fetch(ticker: str) -> dict:
    import yfinance as yf  # imported here so --offline works without network

    t = yf.Ticker(ticker)
    info = t.info or {}
    return {
        "ticker": ticker,
        "fetched_on": date.today().isoformat(),
        "info": {k: info.get(k) for k in INFO_KEYS},
        "income": frame_to_dict(t.income_stmt),
        "balance": frame_to_dict(t.balance_sheet),
    }


def has_data(raw: dict) -> bool:
    return bool(raw.get("income")) or bool(raw.get("info", {}).get("marketCap"))


def get_raw(ticker: str, refresh: bool, offline: bool) -> dict | None:
    path = CACHE / f"{ticker}.json"
    if path.exists() and not refresh:
        raw = json.loads(path.read_text(encoding="utf-8"))
        if has_data(raw):
            return raw  # an empty cached file (failed earlier fetch) is re-fetched
    if offline:
        return None
    raw = fetch(ticker)
    time.sleep(1.5)  # be polite to Yahoo; rapid calls get rate-limited
    if not has_data(raw):
        # Never cache an empty response, or it would be reused forever.
        raise RuntimeError("Yahoo returned no data (ticker renamed or delisted?)")
    CACHE.mkdir(exist_ok=True)
    path.write_text(json.dumps(raw, indent=1), encoding="utf-8")
    return raw


def get_usd_inr(offline: bool) -> dict | None:
    """Daily USD->INR closing rates {iso_date: rate}, cached like the statements."""
    path = CACHE / "fx_USDINR.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    if offline:
        return None
    import yfinance as yf

    hist = yf.Ticker("INR=X").history(start="2019-04-01", auto_adjust=False)
    rates = {d.date().isoformat(): round(float(c), 4)
             for d, c in hist["Close"].items() if not math.isnan(c)}
    if not rates:
        raise RuntimeError("could not download USD/INR exchange rates")
    CACHE.mkdir(exist_ok=True)
    path.write_text(json.dumps(rates, indent=1), encoding="utf-8")
    return rates


def fx_rates_for(period_end: str, fx: dict) -> tuple[float, float] | None:
    """(average rate over the fiscal year, closing rate at year end).

    Standard translation practice: income-statement items (a flow over the
    year) use the average rate; balance-sheet items (a snapshot on one date)
    use the closing rate on that date.
    """
    end = date.fromisoformat(period_end)
    start = date(end.year - 1, end.month, end.day).isoformat()
    in_year = [r for d, r in fx.items() if start < d <= period_end]
    up_to_end = [d for d in fx if d <= period_end]
    if len(in_year) < 100 or not up_to_end:
        return None  # not enough FX history to translate this year honestly
    return sum(in_year) / len(in_year), fx[max(up_to_end)]


# ---------------------------------------------------------------- parse
def pick(row_map: dict, labels: list[str]):
    for label in labels:
        v = row_map.get(label)
        if v is not None:
            return v
    return None


def to_crore(v):
    return None if v is None else round(v / CRORE, 2)


def statement_currency(raw: dict) -> str:
    info = raw.get("info", {})
    return (CURRENCY_OVERRIDES.get(raw.get("ticker", ""))
            or info.get("financialCurrency") or info.get("currency") or "INR")


def parse(raw: dict, fx: dict | None = None) -> tuple[dict, list[dict], list[str]]:
    """Return (company-level fields, list of yearly rows, warnings).

    fx is the USD->INR rate table; it is only needed for companies whose
    statements Yahoo serves in USD.
    """
    warnings: list[str] = []
    info = raw.get("info", {})

    currency = statement_currency(raw)
    if currency not in ("INR", "USD"):
        warnings.append(f"financials are in {currency}; only INR and USD are supported - skipped")
        return {}, [], warnings
    if currency == "USD" and not fx:
        warnings.append("financials are in USD but no USD/INR rates are available - skipped")
        return {}, [], warnings

    price = info.get("currentPrice") or info.get("regularMarketPrice") or info.get("previousClose")
    company = {
        "description": info.get("longBusinessSummary"),
        "price": round(price, 2) if price else None,
        "market_cap": to_crore(info.get("marketCap")),
        "shares": info.get("sharesOutstanding"),
    }
    if not company["description"]:
        warnings.append("no business description")
    if not company["price"] or not company["market_cap"]:
        warnings.append("no price / market cap")

    years = []
    for period in sorted(raw.get("income", {}), reverse=True):
        inc = raw["income"][period]
        bal = raw.get("balance", {}).get(period, {})
        avg_rate = close_rate = 1.0
        if currency == "USD":
            rates = fx_rates_for(period, fx)
            if rates is None:
                warnings.append(f"FY{period[:4]}: no USD/INR rates for that year - skipped")
                continue
            avg_rate, close_rate = rates

        def conv(v, rate):
            return None if v is None else to_crore(v * rate)

        row = {k: conv(pick(inc, labels), avg_rate) for k, labels in INCOME_ROWS.items()}
        row.update({k: conv(pick(bal, labels), close_rate) for k, labels in BALANCE_ROWS.items()})
        # Indian fiscal years end on 31 March; FY2025 = Apr 2024 - Mar 2025,
        # so the period end date's year is the fiscal year label.
        row["fiscal_year"] = int(period[:4])
        if row["revenue"] is None:
            continue  # Yahoo sometimes returns an empty oldest column
        years.append(row)
        if len(years) == YEARS_WANTED:
            break

    if not years:
        warnings.append("no usable financial statements")
    elif len(years) < YEARS_WANTED:
        warnings.append(f"only {len(years)} fiscal year(s) available")

    # Sanity check that catches unit/currency mix-ups: a listed company's
    # market cap is almost never below 0.2x or above 60x its revenue.
    if years and company["market_cap"] and years[0]["revenue"]:
        ps = company["market_cap"] / years[0]["revenue"]
        if not 0.2 <= ps <= 60:
            warnings.append(f"price/sales of {ps:.1f}x looks wrong - check the currency of the statements")
    return company, years, warnings


# ---------------------------------------------------------------- load
def load_company(conn, company_id: int, uses_ev: bool, raw: dict,
                 fx: dict | None) -> tuple[int, list[str]]:
    company, years, warnings = parse(raw, fx)
    loaded = 0

    if company.get("description"):
        with conn.transaction():
            conn.execute("UPDATE companies SET description = %s WHERE company_id = %s",
                         (company["description"], company_id))

    for i, y in enumerate(years):
        if not uses_ev:
            y["ebitda"] = None  # EBITDA is not meaningful for banks; store nothing
        elif y["ebitda"] is None:
            warnings.append(f"FY{y['fiscal_year']}: EBITDA missing")
        latest = i == 0
        try:
            with conn.transaction():
                conn.execute(
                    # Explicit casts: CALL does not implicitly convert the
                    # smallint/double types psycopg sends for Python numbers.
                    "CALL record_financials(%s::int, %s::int, %s::numeric, %s::numeric,"
                    " %s::numeric, %s::numeric, %s::numeric, %s::numeric,"
                    " %s::numeric, %s::numeric)",
                    (company_id, y["fiscal_year"], y["revenue"], y["ebitda"],
                     y["net_income"], max(y["total_debt"] or 0, 0), max(y["cash"] or 0, 0),
                     y["total_equity"],
                     company.get("price") if latest else None,
                     company.get("market_cap") if latest else None),
                )
            loaded += 1
        except psycopg.Error as e:
            msg = (e.diag.message_primary or str(e)).strip()
            warnings.append(f"FY{y['fiscal_year']}: rejected by database ({msg})")

    if company.get("shares") and years:
        with conn.transaction():
            conn.execute(
                """UPDATE market_data SET shares_outstanding = %s
                   WHERE company_id = %s AND as_of_date = CURRENT_DATE""",
                (int(company["shares"]), company_id))
    return loaded, warnings


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--refresh", action="store_true", help="ignore cache and re-download")
    ap.add_argument("--offline", action="store_true", help="use cache only, never download")
    ap.add_argument("--only", nargs="+", metavar="TICKER", help="load just these tickers")
    args = ap.parse_args()

    with psycopg.connect(os.environ["DATABASE_URL"], autocommit=True) as conn:
        rows = conn.execute(
            """SELECT c.company_id, c.ticker, s.uses_ev_multiples
               FROM companies c JOIN sectors s USING (sector_id)
               ORDER BY s.name, c.ticker""").fetchall()
        if not rows:
            sys.exit("No companies found. Run `python ingest/apply_sql.py` first.")
        if args.only:
            wanted = {t.upper() for t in args.only}
            rows = [r for r in rows if r[1].upper() in wanted]

        problems = 0
        fx, fx_tried = None, False
        for company_id, ticker, uses_ev in rows:
            try:
                raw = get_raw(ticker, args.refresh, args.offline)
            except Exception as e:
                print(f"[FAIL] {ticker:15} download failed: {e}")
                problems += 1
                continue
            if raw is None:
                print(f"[SKIP] {ticker:15} not in cache (running --offline)")
                continue

            if statement_currency(raw) == "USD" and fx is None and not fx_tried:
                fx_tried = True  # download the rate table once, only if needed
                try:
                    fx = get_usd_inr(args.offline)
                except Exception as e:
                    print(f"[WARN] USD/INR rates unavailable: {e}")

            loaded, warnings = load_company(conn, company_id, uses_ev, raw, fx)
            status = "OK" if loaded and not warnings else ("WARN" if loaded else "FAIL")
            problems += status != "OK"
            print(f"[{status:4}] {ticker:15} {loaded} year(s) loaded")
            for w in warnings:
                print(f"         - {w}")

        print()
        complete, total = conn.execute(
            "SELECT (SELECT count(*) FROM latest_multiples), (SELECT count(*) FROM companies)"
        ).fetchone()
        print(f"Companies with a complete comps row: {complete} of {total} in the database")
        if problems:
            print(f"{problems} of the companies above need a look (see WARN/FAIL lines).")


if __name__ == "__main__":
    main()
