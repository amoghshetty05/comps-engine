# Comps Engine

A multi-database platform for comparable-company (comps) analysis. It combines
structured financial multiples (PostgreSQL), semantic similarity search over
business descriptions (pgvector), and unstructured deal news (MongoDB), served
through a Next.js web app with role-based access (Analyst / Admin).

DBMS Experiential Learning Level 3 project, PES University.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend + API | Next.js (App Router, Route Handlers) |
| Relational | PostgreSQL 16 |
| Vector | pgvector (same Postgres instance) |
| Document | MongoDB 7 |
| Ingestion | Python 3.11+ (yfinance, sentence-transformers) |

## Prerequisites

- Git
- Docker Desktop (running)
- Python 3.11+
- Node.js 20+

## Setup

1. Clone the repo and enter it.
2. Create your environment file and set real passwords:
   ```bash
   cp .env.example .env
   ```
   If you change a password, update `DATABASE_URL` and `MONGO_URL` to match.
3. Start the databases:
   ```bash
   docker compose up -d
   ```
4. Create a Python environment and install dependencies:
   ```bash
   python -m venv .venv
   # macOS/Linux:  source .venv/bin/activate
   # Windows:      .venv\Scripts\activate
   pip install -r ingest/requirements.txt
   ```
5. Verify both databases are reachable:
   ```bash
   python ingest/check_connections.py
   ```

6. Create the schema, views, functions, triggers and seed the company list:
   ```bash
   python ingest/apply_sql.py
   ```
   To wipe everything and start over: `python ingest/apply_sql.py --reset`

7. Load real financials, prices and business descriptions (Yahoo Finance):
   ```bash
   python ingest/load_financials.py
   ```
   Raw downloads are cached in `ingest/cache/` and committed, so anyone can
   rebuild the exact same data without network access:
   `python ingest/load_financials.py --offline`.
   Use `--refresh` to re-download, or `--only TCS.NS INFY.NS` for specific tickers.

Later phases (embeddings, MongoDB deals, web app) will add their own steps below.

## Database files (`db/`)

| File | Contents |
|---|---|
| `01_schema.sql` | Tables, constraints, indexes (incl. GIN full-text and HNSW vector) |
| `02_views.sql` | `latest_multiples` (the comps table) and `sector_summary` |
| `03_functions.sql` | `get_multiples`, `get_sector_comps`, `similar_companies`, `record_financials` (transactional procedure) |
| `04_triggers.sql` | Audit log, financial validation, `updated_at` |
| `05_alter_demo.sql` | ALTER / CREATE INDEX / DROP INDEX examples |
| `06_seed.sql` | 3 sectors, 19 NSE companies |

ER diagram source: `docs/schema.dbml` (paste into dbdiagram.io).
All amounts are in INR crore. Banks use P/E and P/B; EV-based multiples are NULL for them by design.

## Project structure

```
db/        SQL files (schema, views, functions, triggers)
ingest/    Python scripts for data loading and embeddings
web/       Next.js application
docs/      ER diagram, screenshots, report
```
