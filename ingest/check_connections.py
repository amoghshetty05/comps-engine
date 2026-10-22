"""Phase 0 sanity check: confirms Postgres (+pgvector) and MongoDB are reachable.

Run from the repo root:  python ingest/check_connections.py
"""
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

ok = True

# --- PostgreSQL + pgvector ---
try:
    import psycopg

    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        version = conn.execute("SELECT version()").fetchone()[0]
        ext = conn.execute(
            "SELECT extversion FROM pg_extension WHERE extname = 'vector'"
        ).fetchone()
        print(f"[OK] Postgres: {version.split(',')[0]}")
        if ext:
            print(f"[OK] pgvector extension installed (v{ext[0]})")
        else:
            ok = False
            print("[FAIL] pgvector extension missing. Run: CREATE EXTENSION vector;")
except Exception as e:
    ok = False
    print(f"[FAIL] Postgres: {e}")

# --- MongoDB ---
try:
    from pymongo import MongoClient

    client = MongoClient(os.environ["MONGO_URL"], serverSelectionTimeoutMS=4000)
    client.admin.command("ping")
    print(f"[OK] MongoDB: server {client.server_info()['version']}")
except Exception as e:
    ok = False
    print(f"[FAIL] MongoDB: {e}")

sys.exit(0 if ok else 1)
