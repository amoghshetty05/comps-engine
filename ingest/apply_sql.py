"""Apply the SQL files in db/ to the Postgres container, in order.

Run from the repo root:
    python ingest/apply_sql.py                     # apply 01..07 (fails if already applied)
    python ingest/apply_sql.py --reset             # wipe the public schema first, then apply
    python ingest/apply_sql.py --only 07_roles.sql # apply just one file to an existing database
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
parser.add_argument("--only", metavar="FILE", nargs="+",
                    help="apply only these files from db/ (e.g. 07_roles.sql)")
args = parser.parse_args()

files = sorted((ROOT / "db").glob("[0-9][0-9]_*.sql"))
if args.only:
    wanted = set(args.only)
    files = [f for f in files if f.name in wanted]
    missing = wanted - {f.name for f in files}
    if missing:
        sys.exit(f"Not found in db/: {', '.join(sorted(missing))}")
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
