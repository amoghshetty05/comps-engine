-- =====================================================================
-- 07_roles.sql  |  Role-based access control inside the database
--
-- Two group roles mirror the two application roles:
--   app_analyst : read-only access to market data, views and functions
--   app_admin   : everything app_analyst can do, plus recording financials
--
-- The web app connects as the database owner but, for every request,
-- switches to the matching role with  SET LOCAL ROLE app_analyst|app_admin
-- inside a transaction. So even if the application had a bug, Postgres
-- itself refuses an analyst's write.
--
-- Roles are cluster-wide (they survive DROP SCHEMA), hence IF NOT EXISTS.
-- =====================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_analyst') THEN
        CREATE ROLE app_analyst NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_admin') THEN
        CREATE ROLE app_admin NOLOGIN;
    END IF;
END
$$;

-- Admins inherit every analyst privilege.
GRANT app_analyst TO app_admin;
-- The connecting user must be a member to be allowed to SET ROLE.
GRANT app_analyst, app_admin TO CURRENT_USER;

GRANT USAGE ON SCHEMA public TO app_analyst;

-- ---------------------------------------------------------------- analyst
GRANT SELECT ON sectors, companies, financial_statements, market_data,
                company_embeddings, comp_sets, comp_set_members
      TO app_analyst;
GRANT SELECT ON latest_financials, latest_market, latest_multiples, sector_summary
      TO app_analyst;
GRANT EXECUTE ON FUNCTION get_multiples(INT), get_sector_comps(INT, INT),
                          similar_companies(INT, INT)
      TO app_analyst;
-- Deliberately NOT granted to analysts: users (password hashes), audit_log,
-- and any INSERT / UPDATE / DELETE.

-- ---------------------------------------------------------------- admin
GRANT INSERT, UPDATE ON financial_statements, market_data TO app_admin;
GRANT UPDATE (description, updated_at) ON companies TO app_admin;   -- column-level
GRANT USAGE ON SEQUENCE financial_statements_statement_id_seq,
                        market_data_market_id_seq TO app_admin;
-- New procedures are executable by PUBLIC by default; take that away first so
-- only admins may even call it (table privileges would also stop an analyst).
REVOKE EXECUTE ON PROCEDURE record_financials(INT, INT, NUMERIC, NUMERIC, NUMERIC,
                                              NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC)
      FROM PUBLIC;
GRANT EXECUTE ON PROCEDURE record_financials(INT, INT, NUMERIC, NUMERIC, NUMERIC,
                                             NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC)
      TO app_admin;
GRANT SELECT ON audit_log TO app_admin;
GRANT SELECT (user_id, email) ON users TO app_admin;               -- never password_hash

-- ---------------------------------------------------------------- audit
-- Nobody gets INSERT/UPDATE/DELETE on audit_log, so the log cannot be edited
-- by hand. The audit trigger function instead runs with its owner's rights
-- (SECURITY DEFINER), which is the only way rows get into the log.
ALTER FUNCTION audit_row_change() SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION audit_row_change() FROM PUBLIC;
