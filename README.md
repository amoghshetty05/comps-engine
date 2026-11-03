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
   To wipe everything and start over: `python ingest/apply_sql.py --reset`.
   To add a single new file to an existing database (e.g. the roles file):
   `python ingest/apply_sql.py --only 07_roles.sql`

7. Load real financials, prices and business descriptions (Yahoo Finance):
   ```bash
   python ingest/load_financials.py
   ```
   Raw downloads are cached in `ingest/cache/` and committed, so anyone can
   rebuild the exact same data without network access:
   `python ingest/load_financials.py --offline`.
   Use `--refresh` to re-download, or `--only TCS.NS INFY.NS` for specific tickers.

8. Build the semantic-similarity vectors (first run downloads a ~90 MB model):
   ```bash
   python ingest/embed.py
   ```
   It prints each company's three nearest neighbours. Search by meaning with:
   `python ingest/embed.py --query "online food delivery"`

9. Load deal news (M&A, IPOs, fundraises) into MongoDB:
   ```bash
   python ingest/load_deals.py
   ```
   Deals live in `ingest/deals.json` (hand-compiled from public announcements);
   add more there and re-run. `--stats` prints only the aggregation results.

10. Set up and start the web app (from the `web/` folder):
    ```bash
    cd web
    npm install
    copy env.local.example .env.local       # macOS/Linux: cp
    # edit .env.local: same passwords/ports as the root .env, plus a long AUTH_SECRET
    npm run create-admin -- you@example.com "a-strong-password" "Your Name"
    npm run dev
    ```
    Open http://localhost:3000. Anyone can register as an **analyst** (read-only);
    **admins** are created only with `create-admin` and can record financials.

## Web app

| Page | What it shows | Databases |
|---|---|---|
| `/` | All companies with latest multiples, sortable | Postgres view `latest_multiples` |
| `/company/<ticker>` | Sector comps + sector median, similar businesses, deal history | Postgres, pgvector, MongoDB |
| `/search?q=` | Full-text search over descriptions | Postgres `tsvector` + GIN index |
| `/sectors` | Sector medians and deal activity | Postgres view + MongoDB aggregation |
| `/admin` | Record financials (transactional procedure) and the audit log | Postgres procedure + triggers |

JSON API (all require login): `/api/companies`, `/api/comps?ticker=`, `/api/similar?ticker=`,
`/api/deals?ticker=`, `/api/search?q=`, `/api/sectors`; admin only: `POST /api/admin/financials`,
`/api/admin/audit`. Access rules are enforced three times: in `web/middleware.js` for every
request, again inside each admin route, and by PostgreSQL itself, because every request runs
under the database role `app_analyst` or `app_admin` (see `db/07_roles.sql`).

## Database files (`db/`)

| File | Contents |
|---|---|
| `01_schema.sql` | Tables, constraints, indexes (incl. GIN full-text and HNSW vector) |
| `02_views.sql` | `latest_multiples` (the comps table) and `sector_summary` |
| `03_functions.sql` | `get_multiples`, `get_sector_comps`, `similar_companies`, `record_financials` (transactional procedure) |
| `04_triggers.sql` | Audit log, financial validation, `updated_at` |
| `05_alter_demo.sql` | ALTER / CREATE INDEX / DROP INDEX examples |
| `06_seed.sql` | 3 sectors, 19 NSE companies |
| `07_roles.sql` | Database roles `app_analyst` (read-only) and `app_admin`, with GRANT/REVOKE |

Demo scripts in `db/queries/` (all undo their own changes, so they are safe to run any time):

| File | Run with |
|---|---|
| `demo_queries.sql` | join, nested, correlated, EXISTS, recursive CTE, CTE + window functions, GROUP BY/HAVING: `docker compose exec -T postgres psql -U comps_admin -d comps_engine < db/queries/demo_queries.sql` |
| `demo_dml.sql` | INSERT / UPDATE / DELETE / procedure, rolled back: same command with this file |
| `vector_commands.sql` | pgvector read / update / delete: same command with this file |
| `mongo_commands.js` | MongoDB read / update / delete / aggregate: `docker compose exec -T mongo mongosh -u comps_admin -p <password> --authenticationDatabase admin comps_engine --quiet < db/queries/mongo_commands.js` |

Diagrams: `docs/er.png` (ER, Chen notation) and `docs/schema.png` (relational schema), generated
from `docs/er.dot` and `docs/schema.dot` with Graphviz; `docs/schema.dbml` opens in dbdiagram.io.
Project report: `docs/Comps_Engine_Project_Report.docx`.
All amounts are in INR crore. Banks use P/E and P/B; EV-based multiples are NULL for them by design.

## Project structure

```
db/        SQL files (schema, views, functions, triggers)
ingest/    Python scripts for data loading and embeddings
web/       Next.js application
docs/      ER diagram, screenshots, report
```
