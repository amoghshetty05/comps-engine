"""Phase 5: load deal news (M&A, IPOs, fundraises) into MongoDB.

Why MongoDB for this: every deal type carries different fields. An acquisition
has a target and consideration, a merger has a swap ratio, an IPO has an
issue size and listing date. In SQL that means many mostly-NULL columns or
one table per type; as documents, each deal simply stores what it has.

Source data: ingest/deals.json (hand-compiled from public announcements).

Run from the repo root (Postgres must already have the companies loaded):
    python ingest/load_deals.py            # load/refresh deals, then print stats
    python ingest/load_deals.py --stats    # only run the aggregation pipelines
"""
from __future__ import annotations

import argparse
import copy
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import psycopg
from dotenv import load_dotenv
from pymongo import ASCENDING, DESCENDING, TEXT, MongoClient, UpdateOne
from pymongo.errors import BulkWriteError, CollectionInvalid

ROOT = Path(__file__).resolve().parent.parent
DEALS_FILE = Path(__file__).resolve().parent / "deals.json"
load_dotenv(ROOT / ".env")

DEAL_TYPES = ["acquisition", "merger", "ipo", "fundraise", "delisting", "stake_sale"]

# MongoDB is schema-flexible, but not schema-less: the server rejects any
# document missing the core fields or using an unknown deal type. Fields
# that differ by deal type (deal / merger / ipo / raise) stay free-form.
VALIDATOR = {
    "$jsonSchema": {
        "bsonType": "object",
        "required": ["ticker", "company_name", "sector", "date", "type", "headline"],
        "properties": {
            "ticker":       {"bsonType": "string"},
            "company_name": {"bsonType": "string"},
            "sector":       {"bsonType": "string"},
            "date":         {"bsonType": "date"},
            "type":         {"enum": DEAL_TYPES},
            "headline":     {"bsonType": "string", "minLength": 5},
            "summary":      {"bsonType": "string"},
            "tags":         {"bsonType": "array", "items": {"bsonType": "string"}},
            "source_url":   {"bsonType": "string"},
        },
    }
}


def get_collection(client):
    db = client[os.environ.get("MONGO_DB", "comps_engine")]
    try:
        db.create_collection("deals", validator=VALIDATOR, validationLevel="strict")
    except CollectionInvalid:
        # Already exists: re-apply so validator changes take effect.
        db.command("collMod", "deals", validator=VALIDATOR, validationLevel="strict")
    deals = db["deals"]
    deals.create_index([("ticker", ASCENDING), ("headline", ASCENDING)],
                       unique=True, name="uq_ticker_headline")
    deals.create_index([("ticker", ASCENDING), ("date", DESCENDING)], name="ix_ticker_date")
    deals.create_index([("headline", TEXT), ("summary", TEXT), ("tags", TEXT)], name="ix_text")
    return deals


def to_date(s: str) -> datetime:
    return datetime.strptime(s, "%Y-%m-%d").replace(tzinfo=timezone.utc)


def prepare(records: list[dict], companies: dict) -> tuple[list[dict], list[str]]:
    """Attach company name + sector from Postgres and convert dates.

    There is no foreign key across two databases, so referential integrity is
    enforced here, in the application: a deal for an unknown ticker is rejected.
    Copying the sector into each document (denormalisation) is a normal
    document-database choice: it lets aggregations group by sector without a
    cross-database join.
    """
    docs, errors = [], []
    for i, r in enumerate(records, 1):
        info = companies.get(r.get("ticker"))
        if not info:
            errors.append(f"record {i}: unknown ticker {r.get('ticker')!r} (not in Postgres)")
            continue
        doc = copy.deepcopy(r)  # deep copy: nested dicts get their dates converted
        doc["company_name"], doc["sector"] = info
        try:
            doc["date"] = to_date(r["date"])
            for section in ("deal", "merger", "ipo"):
                for key in ("effective_date", "listing_date", "completed_date"):
                    if key in doc.get(section, {}):
                        doc[section][key] = to_date(doc[section][key])
        except (KeyError, ValueError) as e:
            errors.append(f"record {i} ({r.get('ticker')}): bad or missing date ({e})")
            continue
        docs.append(doc)
    return docs, errors


def load(deals, docs: list[dict]) -> None:
    # Upsert on (ticker, headline) so re-running never creates duplicates.
    ops = [UpdateOne({"ticker": d["ticker"], "headline": d["headline"]},
                     {"$set": d}, upsert=True) for d in docs]
    if not ops:
        return
    try:
        res = deals.bulk_write(ops, ordered=False)
        print(f"Deals: {res.upserted_count} inserted, {res.modified_count} updated, "
              f"{len(docs) - res.upserted_count - res.modified_count} unchanged.")
    except BulkWriteError as e:
        for err in e.details.get("writeErrors", []):
            print(f"[REJECTED by validator] {err.get('op', {}).get('q')}: {err.get('errmsg')}")
        raise SystemExit(1)


# ------------------------------------------------------------ aggregations
def deals_by_sector_year(deals) -> list[dict]:
    """Deal count and disclosed INR value per sector per year."""
    return list(deals.aggregate([
        {"$group": {
            "_id": {"sector": "$sector", "year": {"$year": "$date"}},
            "deals": {"$sum": 1},
            "disclosed_value_inr_cr": {"$sum": {"$ifNull": ["$deal.value_inr_cr", 0]}},
            "types": {"$addToSet": "$type"},
        }},
        {"$sort": {"_id.sector": 1, "_id.year": 1}},
    ]))


def top_tags(deals, limit: int = 8) -> list[dict]:
    """Most common deal themes: $unwind the tags array, then count."""
    return list(deals.aggregate([
        {"$unwind": "$tags"},
        {"$group": {"_id": "$tags", "count": {"$sum": 1}}},
        {"$sort": {"count": -1, "_id": 1}},
        {"$limit": limit},
    ]))


def print_stats(deals) -> None:
    print("\nDeals by sector and year (aggregation pipeline 1):")
    for r in deals_by_sector_year(deals):
        v = r["disclosed_value_inr_cr"]
        print(f"  {r['_id']['sector']:18} {r['_id']['year']}  {r['deals']} deal(s)"
              f"  {('Rs ' + format(v, ',') + ' cr disclosed') if v else '':24} {sorted(r['types'])}")
    print("\nMost common deal themes (aggregation pipeline 2):")
    for r in top_tags(deals):
        print(f"  {r['count']}x  {r['_id']}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--stats", action="store_true", help="only print aggregation results")
    args = ap.parse_args()

    client = MongoClient(os.environ["MONGO_URL"], serverSelectionTimeoutMS=5000)
    deals = get_collection(client)

    if not args.stats:
        with psycopg.connect(os.environ["DATABASE_URL"]) as pg:
            companies = {t: (n, s) for t, n, s in pg.execute(
                "SELECT c.ticker, c.name, s.name FROM companies c JOIN sectors s USING (sector_id)")}
        records = json.loads(DEALS_FILE.read_text(encoding="utf-8"))
        docs, errors = prepare(records, companies)
        for e in errors:
            print(f"[SKIP] {e}")
        load(deals, docs)
        if errors:
            print(f"{len(errors)} record(s) skipped - fix them in ingest/deals.json")

    print(f"Total deals in MongoDB: {deals.count_documents({})}")
    print_stats(deals)


if __name__ == "__main__":
    sys.exit(main())
