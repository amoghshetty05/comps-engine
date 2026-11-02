"""Apply the SQL files in db/ to the Postgres container, in order.

Run from the repo root:
    python ingest/apply_sql.py            # apply 01..06 (fails if already applied)
    python ingest/apply_sql.py --reset    # wipe the public schema first, then apply
"""
import argparse
import os
import sys
from pathlib import Path

import psycopg
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

parser = argparse.ArgumentParser()
parser.add_argument("--reset", action="store_true",
                    help="DROP SCHEMA public CASCADE first (deletes all data)")
args = parser.parse_args()

files = sorted((ROOT / "db").glob("[0-9][0-9]_*.sql"))
if not files:
    sys.exit("No SQL files found in db/")

with psycopg.connect(os.environ["DATABASE_URL"], autocommit=True) as conn:
    if args.reset:
        if input("This deletes ALL tables and data. Type YES to continue: ") != "YES":
            sys.exit("Aborted.")
        conn.execute("DROP SCHEMA public CASCADE")
        conn.execute("CREATE SCHEMA public")
        print("Schema reset.")

    for f in files:
        try:
            # Each file runs as one transaction: all of it applies, or none.
            with conn.transaction():
                conn.execute(f.read_text(encoding="utf-8"))
            print(f"[OK] {f.name}")
        except Exception as e:
            print(f"[FAIL] {f.name}: {e}")
            sys.exit(1)
