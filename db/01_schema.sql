-- =====================================================================
-- 01_schema.sql  |  Comps Engine core schema (DDL)
-- All monetary amounts are stored in INR crore (1 crore = 10,000,000).
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------
-- sectors
-- uses_ev_multiples = FALSE for banks/financials: EV/EBITDA is not
-- meaningful for them (deposits are their raw material, not debt), so
-- they are valued on P/E and P/B instead.
-- ---------------------------------------------------------------------
CREATE TABLE sectors (
    sector_id         SERIAL       PRIMARY KEY,
    name              VARCHAR(80)  NOT NULL UNIQUE,
    uses_ev_multiples BOOLEAN      NOT NULL DEFAULT TRUE
);

-- ---------------------------------------------------------------------
-- companies
-- description_tsv is a generated column used for full-text search.
-- ---------------------------------------------------------------------
CREATE TABLE companies (
    company_id      SERIAL       PRIMARY KEY,
    ticker          VARCHAR(20)  NOT NULL UNIQUE,
    name            VARCHAR(150) NOT NULL,
    sector_id       INT          NOT NULL
                    REFERENCES sectors (sector_id) ON DELETE RESTRICT,
    exchange        VARCHAR(5)   NOT NULL DEFAULT 'NSE',
    currency        CHAR(3)      NOT NULL DEFAULT 'INR',
    description     TEXT,
    description_tsv TSVECTOR GENERATED ALWAYS AS
                    (to_tsvector('english', coalesce(description, ''))) STORED,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT chk_companies_exchange CHECK (exchange IN ('NSE', 'BSE'))
);

-- ---------------------------------------------------------------------
-- financial_statements: one row per company per fiscal year
-- ---------------------------------------------------------------------
CREATE TABLE financial_statements (
    statement_id  SERIAL        PRIMARY KEY,
    company_id    INT           NOT NULL
                  REFERENCES companies (company_id) ON DELETE CASCADE,
    fiscal_year   INT           NOT NULL,
    revenue       NUMERIC(18,2) NOT NULL,
    ebitda        NUMERIC(18,2),
    net_income    NUMERIC(18,2),
    total_debt    NUMERIC(18,2) NOT NULL DEFAULT 0,
    cash          NUMERIC(18,2) NOT NULL DEFAULT 0,
    total_equity  NUMERIC(18,2),
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT uq_fin_company_year UNIQUE (company_id, fiscal_year),
    CONSTRAINT chk_fin_year    CHECK (fiscal_year BETWEEN 2000 AND 2100),
    CONSTRAINT chk_fin_revenue CHECK (revenue >= 0),
    CONSTRAINT chk_fin_debt    CHECK (total_debt >= 0),
    CONSTRAINT chk_fin_cash    CHECK (cash >= 0)
);

-- ---------------------------------------------------------------------
-- market_data: price / market cap snapshots
-- ---------------------------------------------------------------------
CREATE TABLE market_data (
    market_id          SERIAL        PRIMARY KEY,
    company_id         INT           NOT NULL
                       REFERENCES companies (company_id) ON DELETE CASCADE,
    as_of_date         DATE          NOT NULL,
    price              NUMERIC(14,2) NOT NULL,
    market_cap         NUMERIC(18,2) NOT NULL,
    shares_outstanding BIGINT,
    CONSTRAINT uq_market_company_date UNIQUE (company_id, as_of_date),
    CONSTRAINT chk_market_price      CHECK (price > 0),
    CONSTRAINT chk_market_cap        CHECK (market_cap > 0)
);

-- ---------------------------------------------------------------------
-- users (application login; password_hash is a bcrypt hash)
-- ---------------------------------------------------------------------
CREATE TABLE users (
    user_id       SERIAL       PRIMARY KEY,
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(100) NOT NULL,
    full_name     VARCHAR(120) NOT NULL,
    role          VARCHAR(10)  NOT NULL DEFAULT 'analyst',
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT chk_users_role  CHECK (role IN ('admin', 'analyst')),
    CONSTRAINT chk_users_email CHECK (email LIKE '%_@_%.__%')
);

-- ---------------------------------------------------------------------
-- comp_sets: a saved comps list built by an analyst for a target company
-- ---------------------------------------------------------------------
CREATE TABLE comp_sets (
    set_id            SERIAL       PRIMARY KEY,
    user_id           INT          NOT NULL
                      REFERENCES users (user_id) ON DELETE CASCADE,
    target_company_id INT          NOT NULL
                      REFERENCES companies (company_id) ON DELETE CASCADE,
    name              VARCHAR(120) NOT NULL,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_comp_sets_user_name UNIQUE (user_id, name)
);

CREATE TABLE comp_set_members (
    set_id     INT NOT NULL REFERENCES comp_sets (set_id)     ON DELETE CASCADE,
    company_id INT NOT NULL REFERENCES companies (company_id) ON DELETE CASCADE,
    PRIMARY KEY (set_id, company_id)
);

-- ---------------------------------------------------------------------
-- audit_log: filled by triggers (see 04_triggers.sql)
-- ---------------------------------------------------------------------
CREATE TABLE audit_log (
    log_id     BIGSERIAL    PRIMARY KEY,
    table_name VARCHAR(63)  NOT NULL,
    operation  VARCHAR(10)  NOT NULL,
    record_id  INT,
    old_data   JSONB,
    new_data   JSONB,
    changed_by INT,
    changed_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT chk_audit_op CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE'))
);

-- ---------------------------------------------------------------------
-- company_embeddings: vector(384) matches all-MiniLM-L6-v2
-- ---------------------------------------------------------------------
CREATE TABLE company_embeddings (
    company_id INT          PRIMARY KEY
               REFERENCES companies (company_id) ON DELETE CASCADE,
    model_name VARCHAR(100) NOT NULL,
    embedding  vector(384)  NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Indexes (the UNIQUE/PK constraints above already create their own)
-- ---------------------------------------------------------------------
CREATE INDEX idx_companies_sector      ON companies (sector_id);
CREATE INDEX idx_companies_desc_fts    ON companies USING GIN (description_tsv);
CREATE INDEX idx_fin_company_year_desc ON financial_statements (company_id, fiscal_year DESC);
CREATE INDEX idx_market_company_date   ON market_data (company_id, as_of_date DESC);
CREATE INDEX idx_comp_sets_user        ON comp_sets (user_id);
CREATE INDEX idx_audit_table_time      ON audit_log (table_name, changed_at DESC);
CREATE INDEX idx_embeddings_hnsw       ON company_embeddings
    USING hnsw (embedding vector_cosine_ops);
