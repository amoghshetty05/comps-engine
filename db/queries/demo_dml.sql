-- =====================================================================
-- demo_dml.sql | DML examples. Everything runs inside one transaction and
-- is ROLLED BACK at the end, so running it never changes your data.
-- Run with:  docker compose exec -T postgres psql -U comps_admin -d comps_engine < db/queries/demo_dml.sql
-- =====================================================================
BEGIN;

-- INSERT: a user and a saved comp set (with RETURNING to see generated keys)
INSERT INTO users (email, password_hash, full_name, role)
VALUES ('demo.analyst@example.com', '$2a$12$placeholderhashplaceholderhashplacehold', 'Demo Analyst', 'analyst')
RETURNING user_id, email, role;

INSERT INTO comp_sets (user_id, target_company_id, name)
SELECT u.user_id, c.company_id, 'Infosys vs large-cap IT'
FROM users u, companies c
WHERE u.email = 'demo.analyst@example.com' AND c.ticker = 'INFY.NS'
RETURNING set_id, name;

-- INSERT ... SELECT: add the three largest IT peers to that comp set
INSERT INTO comp_set_members (set_id, company_id)
SELECT cs.set_id, m.company_id
FROM comp_sets cs
JOIN latest_multiples m ON m.sector = 'IT Services' AND m.ticker <> 'INFY.NS'
WHERE cs.name = 'Infosys vs large-cap IT'
ORDER BY m.market_cap DESC
LIMIT 3;

SELECT cs.name, c.ticker
FROM comp_set_members csm
JOIN comp_sets cs USING (set_id)
JOIN companies c USING (company_id);

-- UPDATE: rename the comp set
UPDATE comp_sets SET name = 'Infosys vs Tier-1 IT'
WHERE name = 'Infosys vs large-cap IT'
RETURNING set_id, name;

-- UPSERT through the stored procedure (one transaction, audited by trigger).
-- CALL arguments cannot contain subqueries, so look the id up in a DO block.
DO $$
DECLARE v_id INT;
BEGIN
    SELECT company_id INTO v_id FROM companies WHERE ticker = 'WIPRO.NS';
    CALL record_financials(v_id, 2026, 92624, 21044, 13197, 0, 0);
END
$$;
SELECT table_name, operation, record_id FROM audit_log ORDER BY log_id DESC LIMIT 2;

-- Constraint in action: a negative revenue is rejected by CHECK (chk_fin_revenue)
SAVEPOINT before_bad_insert;
INSERT INTO financial_statements (company_id, fiscal_year, revenue)
VALUES ((SELECT company_id FROM companies WHERE ticker = 'TCS.NS'), 2020, -1);
ROLLBACK TO SAVEPOINT before_bad_insert;

-- DELETE: ON DELETE CASCADE removes the comp set's members too
DELETE FROM users WHERE email = 'demo.analyst@example.com' RETURNING user_id;
SELECT COUNT(*) AS comp_sets_left FROM comp_sets WHERE name LIKE 'Infosys vs%';

ROLLBACK;  -- undo everything above
