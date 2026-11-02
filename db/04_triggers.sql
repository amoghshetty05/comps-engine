-- =====================================================================
-- 04_triggers.sql  |  Triggers
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Generic audit trigger. The primary-key column name is passed as the
--    trigger argument. The web app can record who made the change with:
--        SELECT set_config('app.user_id', '<user_id>', true);
--    inside the same transaction; otherwise changed_by stays NULL.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION audit_row_change() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    v_pk      TEXT := TG_ARGV[0];
    v_old     JSONB;
    v_new     JSONB;
    v_user    INT;
    v_rec_id  INT;
BEGIN
    v_user := NULLIF(current_setting('app.user_id', true), '')::INT;

    IF TG_OP <> 'INSERT' THEN v_old := to_jsonb(OLD); END IF;
    IF TG_OP <> 'DELETE' THEN v_new := to_jsonb(NEW); END IF;

    v_rec_id := COALESCE(v_new ->> v_pk, v_old ->> v_pk)::INT;

    -- description_tsv is derived data and only adds noise to the log
    INSERT INTO audit_log (table_name, operation, record_id, old_data, new_data, changed_by)
    VALUES (TG_TABLE_NAME, TG_OP, v_rec_id,
            v_old - 'description_tsv', v_new - 'description_tsv', v_user);

    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_audit_financials
AFTER INSERT OR UPDATE OR DELETE ON financial_statements
FOR EACH ROW EXECUTE FUNCTION audit_row_change('statement_id');

CREATE TRIGGER trg_audit_companies
AFTER INSERT OR UPDATE OR DELETE ON companies
FOR EACH ROW EXECUTE FUNCTION audit_row_change('company_id');

-- ---------------------------------------------------------------------
-- 2. Business-rule validation: reject data that is individually legal
--    for the column types but makes no financial sense.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION validate_financials() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.ebitda IS NOT NULL AND NEW.ebitda > NEW.revenue THEN
        RAISE EXCEPTION 'EBITDA (%) cannot exceed revenue (%)', NEW.ebitda, NEW.revenue
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.fiscal_year > EXTRACT(YEAR FROM CURRENT_DATE)::INT + 1 THEN
        RAISE EXCEPTION 'Fiscal year % is too far in the future', NEW.fiscal_year
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_financials
BEFORE INSERT OR UPDATE ON financial_statements
FOR EACH ROW EXECUTE FUNCTION validate_financials();

-- ---------------------------------------------------------------------
-- 3. Keep companies.updated_at current on any edit
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_companies_touch
BEFORE UPDATE ON companies
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
