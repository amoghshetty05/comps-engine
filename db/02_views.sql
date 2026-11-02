-- =====================================================================
-- 02_views.sql  |  Views for the comps table
-- =====================================================================

-- Most recent fiscal year per company
CREATE VIEW latest_financials AS
SELECT DISTINCT ON (company_id) *
FROM financial_statements
ORDER BY company_id, fiscal_year DESC;

-- Most recent market snapshot per company
CREATE VIEW latest_market AS
SELECT DISTINCT ON (company_id) *
FROM market_data
ORDER BY company_id, as_of_date DESC;

-- ---------------------------------------------------------------------
-- latest_multiples: the comps table.
--   EV = market cap + total debt - cash
--   EV-based multiples are NULL for sectors with uses_ev_multiples = FALSE
--   (banks). EV/EBITDA and P/E are NULL when the denominator is <= 0,
--   because a negative multiple has no valuation meaning.
-- ---------------------------------------------------------------------
CREATE VIEW latest_multiples AS
SELECT
    c.company_id,
    c.ticker,
    c.name,
    s.name                                             AS sector,
    f.fiscal_year,
    m.as_of_date,
    m.price,
    m.market_cap,
    f.revenue,
    f.ebitda,
    f.net_income,
    CASE WHEN s.uses_ev_multiples
         THEN m.market_cap + f.total_debt - f.cash END AS enterprise_value,
    CASE WHEN s.uses_ev_multiples AND f.revenue > 0
         THEN ROUND((m.market_cap + f.total_debt - f.cash) / f.revenue, 2) END AS ev_revenue,
    CASE WHEN s.uses_ev_multiples AND f.ebitda > 0
         THEN ROUND((m.market_cap + f.total_debt - f.cash) / f.ebitda, 2) END  AS ev_ebitda,
    CASE WHEN f.net_income > 0
         THEN ROUND(m.market_cap / f.net_income, 2) END                        AS pe_ratio,
    CASE WHEN f.total_equity > 0
         THEN ROUND(m.market_cap / f.total_equity, 2) END                      AS pb_ratio,
    CASE WHEN f.revenue > 0 AND f.ebitda IS NOT NULL
         THEN ROUND(100 * f.ebitda / f.revenue, 1) END                         AS ebitda_margin_pct,
    CASE WHEN f.revenue > 0 AND f.net_income IS NOT NULL
         THEN ROUND(100 * f.net_income / f.revenue, 1) END                     AS net_margin_pct
FROM companies c
JOIN sectors s          ON s.sector_id  = c.sector_id
JOIN latest_financials f ON f.company_id = c.company_id
JOIN latest_market m     ON m.company_id = c.company_id;

-- Median and average multiples per sector (medians resist outliers,
-- which is why bankers quote them in comps)
CREATE VIEW sector_summary AS
SELECT
    sector,
    COUNT(*)                                                   AS companies,
    ROUND(AVG(ev_ebitda), 2)                                   AS avg_ev_ebitda,
    ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY ev_ebitda))::numeric, 2) AS median_ev_ebitda,
    ROUND(AVG(pe_ratio), 2)                                    AS avg_pe,
    ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY pe_ratio))::numeric, 2)  AS median_pe,
    ROUND(AVG(pb_ratio), 2)                                    AS avg_pb
FROM latest_multiples
GROUP BY sector;
