-- =====================================================================
-- 05_alter_demo.sql  |  ALTER / DROP examples for the viva
-- Written to be re-runnable (IF NOT EXISTS / IF EXISTS).
-- =====================================================================

-- ALTER: add a column and a constraint to an existing table
ALTER TABLE companies ADD COLUMN IF NOT EXISTS isin VARCHAR(12);

ALTER TABLE companies DROP CONSTRAINT IF EXISTS chk_companies_isin;
ALTER TABLE companies ADD CONSTRAINT chk_companies_isin
    CHECK (isin IS NULL OR LENGTH(isin) = 12);

-- CREATE + DROP: a throw-away index, to demonstrate index management
CREATE INDEX IF NOT EXISTS idx_tmp_companies_name ON companies (name);
DROP INDEX IF EXISTS idx_tmp_companies_name;
