-- =====================================================================
-- demo_queries.sql | Queries for the report and the viva.
-- Not part of the schema: apply_sql.py does not run this file.
-- Run with:  docker compose exec -T postgres psql -U comps_admin -d comps_engine < db/queries/demo_queries.sql
-- =====================================================================

-- Q1. JOIN (4 relations): latest revenue and net margin per company, with sector.
--     latest_market (a view) keeps one price row per company even after the
--     loader has run on several different days.
SELECT c.ticker, s.name AS sector, f.fiscal_year, f.revenue,
       ROUND(100 * f.net_income / f.revenue, 1) AS net_margin_pct, m.market_cap
FROM companies c
JOIN sectors s              ON s.sector_id = c.sector_id
JOIN financial_statements f ON f.company_id = c.company_id
JOIN latest_market m        ON m.company_id = c.company_id
WHERE f.fiscal_year = (SELECT MAX(fiscal_year) FROM financial_statements)
ORDER BY f.revenue DESC
LIMIT 8;

-- Q2. NESTED (non-correlated) subquery: companies bigger than the average company
SELECT ticker, name, market_cap
FROM latest_multiples
WHERE market_cap > (SELECT AVG(market_cap) FROM latest_multiples)
ORDER BY market_cap DESC;

-- Q3. CORRELATED subquery: companies trading at a P/E above their OWN sector's
--     average. The inner query re-runs for each outer row, using that row's sector.
SELECT o.ticker, o.sector, o.pe_ratio,
       (SELECT ROUND(AVG(i.pe_ratio), 1) FROM latest_multiples i WHERE i.sector = o.sector) AS sector_avg_pe
FROM latest_multiples o
WHERE o.pe_ratio > (SELECT AVG(i.pe_ratio) FROM latest_multiples i WHERE i.sector = o.sector)
ORDER BY o.sector, o.pe_ratio DESC;

-- Q4. EXISTS (correlated): companies that reported a net loss in any year loaded
SELECT c.ticker, c.name
FROM companies c
WHERE EXISTS (SELECT 1 FROM financial_statements f
              WHERE f.company_id = c.company_id AND f.net_income < 0)
ORDER BY c.ticker;

-- Q5. RECURSIVE CTE: walk each IT company's fiscal years one at a time,
--     starting from its earliest year, and compound revenue growth into an index
--     (first year = 100). Each recursive step joins the NEXT fiscal year.
WITH RECURSIVE growth AS (
    SELECT f.company_id, f.fiscal_year, f.revenue, 100.0::numeric AS revenue_index
    FROM financial_statements f
    WHERE f.fiscal_year = (SELECT MIN(fiscal_year) FROM financial_statements x
                           WHERE x.company_id = f.company_id)
  UNION ALL
    SELECT n.company_id, n.fiscal_year, n.revenue,
           ROUND(g.revenue_index * n.revenue / g.revenue, 1)
    FROM growth g
    JOIN financial_statements n
      ON n.company_id = g.company_id AND n.fiscal_year = g.fiscal_year + 1
)
SELECT c.ticker, g.fiscal_year, g.revenue, g.revenue_index
FROM growth g
JOIN companies c USING (company_id)
JOIN sectors s USING (sector_id)
WHERE s.name = 'IT Services' AND c.ticker IN ('TCS.NS', 'INFY.NS', 'PERSISTENT.NS')
ORDER BY c.ticker, g.fiscal_year;

-- Q6. CTE + WINDOW functions: year-on-year revenue growth, ranked within sector
WITH yoy AS (
    SELECT c.ticker, s.name AS sector, f.fiscal_year, f.revenue,
           LAG(f.revenue) OVER (PARTITION BY f.company_id ORDER BY f.fiscal_year) AS prev_revenue
    FROM financial_statements f
    JOIN companies c USING (company_id)
    JOIN sectors s USING (sector_id)
)
SELECT sector, ticker, ROUND(100 * (revenue / prev_revenue - 1), 1) AS revenue_growth_pct,
       RANK() OVER (PARTITION BY sector ORDER BY revenue / prev_revenue DESC) AS rank_in_sector
FROM yoy
WHERE fiscal_year = (SELECT MAX(fiscal_year) FROM financial_statements) AND prev_revenue > 0
ORDER BY sector, rank_in_sector;

-- Q7. GROUP BY + HAVING: sectors whose average EBITDA margin is above 15%
SELECT sector, COUNT(*) AS companies, ROUND(AVG(ebitda_margin_pct), 1) AS avg_ebitda_margin
FROM latest_multiples
WHERE ebitda_margin_pct IS NOT NULL
GROUP BY sector
HAVING AVG(ebitda_margin_pct) > 15;

-- Q8. Stored functions: sector comps for Infosys
SELECT ticker, market_cap, ev_ebitda, pe_ratio FROM get_sector_comps(
    (SELECT company_id FROM companies WHERE ticker = 'INFY.NS'), 4);
