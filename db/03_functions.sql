-- =====================================================================
-- 03_functions.sql  |  Stored functions and procedures
-- =====================================================================

-- ---------------------------------------------------------------------
-- get_multiples: comps row for one company
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_multiples(p_company_id INT)
RETURNS SETOF latest_multiples
LANGUAGE sql STABLE AS $$
    SELECT * FROM latest_multiples WHERE company_id = p_company_id;
$$;

-- ---------------------------------------------------------------------
-- get_sector_comps: peers in the same sector as the target, closest
-- market cap first. Ordering by |ln(cap ratio)| treats a company twice
-- as large and one half as large as equally distant.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_sector_comps(p_company_id INT, p_limit INT DEFAULT 10)
RETURNS SETOF latest_multiples
LANGUAGE sql STABLE AS $$
    SELECT p.*
    FROM latest_multiples t
    JOIN latest_multiples p
      ON p.sector = t.sector AND p.company_id <> t.company_id
    WHERE t.company_id = p_company_id
    ORDER BY ABS(LN(p.market_cap / t.market_cap))
    LIMIT p_limit;
$$;

-- ---------------------------------------------------------------------
-- similar_companies: semantic neighbours via pgvector.
-- <=> is cosine distance, so similarity = 1 - distance.
-- Unlike get_sector_comps, this can cross sector boundaries.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION similar_companies(p_company_id INT, p_limit INT DEFAULT 5)
RETURNS TABLE (company_id INT, ticker VARCHAR, name VARCHAR, sector VARCHAR, similarity NUMERIC)
LANGUAGE sql STABLE AS $$
    SELECT c.company_id, c.ticker, c.name, s.name,
           ROUND((1 - (e.embedding <=> t.embedding))::numeric, 4)
    FROM company_embeddings t
    JOIN company_embeddings e ON e.company_id <> t.company_id
    JOIN companies c ON c.company_id = e.company_id
    JOIN sectors s   ON s.sector_id  = c.sector_id
    WHERE t.company_id = p_company_id
    ORDER BY e.embedding <=> t.embedding
    LIMIT p_limit;
$$;

-- ---------------------------------------------------------------------
-- record_financials: ONE transaction that
--   1. upserts a fiscal-year statement,
--   2. optionally upserts today's market snapshot,
--   3. bumps companies.updated_at.
-- A PROCEDURE runs inside the caller's transaction, so if any step
-- fails (e.g. a CHECK constraint or trigger rejects the data) every
-- step is rolled back together.
-- ---------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE record_financials(
    p_company_id   INT,
    p_fiscal_year  INT,
    p_revenue      NUMERIC,
    p_ebitda       NUMERIC,
    p_net_income   NUMERIC,
    p_total_debt   NUMERIC,
    p_cash         NUMERIC,
    p_total_equity NUMERIC DEFAULT NULL,
    p_price        NUMERIC DEFAULT NULL,
    p_market_cap   NUMERIC DEFAULT NULL
)
LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM companies WHERE company_id = p_company_id) THEN
        RAISE EXCEPTION 'Company % does not exist', p_company_id;
    END IF;

    INSERT INTO financial_statements
        (company_id, fiscal_year, revenue, ebitda, net_income, total_debt, cash, total_equity)
    VALUES
        (p_company_id, p_fiscal_year, p_revenue, p_ebitda, p_net_income,
         p_total_debt, p_cash, p_total_equity)
    ON CONFLICT (company_id, fiscal_year) DO UPDATE SET
        revenue      = EXCLUDED.revenue,
        ebitda       = EXCLUDED.ebitda,
        net_income   = EXCLUDED.net_income,
        total_debt   = EXCLUDED.total_debt,
        cash         = EXCLUDED.cash,
        total_equity = EXCLUDED.total_equity;

    IF p_price IS NOT NULL AND p_market_cap IS NOT NULL THEN
        INSERT INTO market_data (company_id, as_of_date, price, market_cap)
        VALUES (p_company_id, CURRENT_DATE, p_price, p_market_cap)
        ON CONFLICT (company_id, as_of_date) DO UPDATE SET
            price      = EXCLUDED.price,
            market_cap = EXCLUDED.market_cap;
    END IF;

    UPDATE companies SET updated_at = now() WHERE company_id = p_company_id;
END;
$$;
