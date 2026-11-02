-- =====================================================================
-- 06_seed.sql  |  Sectors and the company universe (19 NSE companies)
-- Financials, prices and descriptions are loaded by ingest/ scripts.
-- Safe to re-run.
-- =====================================================================

INSERT INTO sectors (name, uses_ev_multiples) VALUES
    ('IT Services',       TRUE),
    ('Consumer Internet', TRUE),
    ('Private Banks',     FALSE)
ON CONFLICT (name) DO NOTHING;

INSERT INTO companies (ticker, name, sector_id)
SELECT v.ticker, v.name, s.sector_id
FROM (VALUES
    ('TCS.NS',        'Tata Consultancy Services', 'IT Services'),
    ('INFY.NS',       'Infosys',                   'IT Services'),
    ('WIPRO.NS',      'Wipro',                     'IT Services'),
    ('HCLTECH.NS',    'HCL Technologies',          'IT Services'),
    ('TECHM.NS',      'Tech Mahindra',             'IT Services'),
    ('LTM.NS',        'LTM (formerly LTIMindtree)', 'IT Services'),
    ('PERSISTENT.NS', 'Persistent Systems',        'IT Services'),
    ('COFORGE.NS',    'Coforge',                   'IT Services'),

    ('ETERNAL.NS',    'Eternal (Zomato)',          'Consumer Internet'),
    ('SWIGGY.NS',     'Swiggy',                    'Consumer Internet'),
    ('NYKAA.NS',      'FSN E-Commerce (Nykaa)',    'Consumer Internet'),
    ('POLICYBZR.NS',  'PB Fintech (PolicyBazaar)', 'Consumer Internet'),
    ('NAUKRI.NS',     'Info Edge (Naukri)',        'Consumer Internet'),

    ('HDFCBANK.NS',   'HDFC Bank',                 'Private Banks'),
    ('ICICIBANK.NS',  'ICICI Bank',                'Private Banks'),
    ('AXISBANK.NS',   'Axis Bank',                 'Private Banks'),
    ('KOTAKBANK.NS',  'Kotak Mahindra Bank',       'Private Banks'),
    ('INDUSINDBK.NS', 'IndusInd Bank',             'Private Banks'),
    ('FEDERALBNK.NS', 'Federal Bank',              'Private Banks')
) AS v(ticker, name, sector_name)
JOIN sectors s ON s.name = v.sector_name
ON CONFLICT (ticker) DO NOTHING;
