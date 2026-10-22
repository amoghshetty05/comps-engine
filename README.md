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

Later phases (schema, data load, embeddings, web app) will add their own steps below.

## Project structure

```
db/        SQL files (schema, views, functions, triggers)
ingest/    Python scripts for data loading and embeddings
web/       Next.js application
docs/      ER diagram, screenshots, report
```
