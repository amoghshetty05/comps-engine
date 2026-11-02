"""Phase 4: turn each company's business description into a vector and store it.

Model: sentence-transformers/all-MiniLM-L6-v2 (free, runs locally, 384 dims).
The first run downloads the model (~90 MB) to your Hugging Face cache.

Run from the repo root (after load_financials.py, so descriptions exist):
    python ingest/embed.py                      # embed every company, then report
    python ingest/embed.py --query "online food delivery"   # free-text search

How a description becomes one vector:
  MiniLM only reads the first ~256 word pieces of its input, and some
  descriptions are longer. So each description is split into sentence-aligned
  chunks of about 120 words, every chunk is embedded, and the chunk vectors
  are averaged and re-normalised to unit length. Unit length means cosine
  similarity is just a dot product, which is what the HNSW index
  (vector_cosine_ops) is built for.
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

import psycopg
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
DIMS = 384
CHUNK_WORDS = 120

_model = None


def get_model():
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer  # slow import, so lazy

        _model = SentenceTransformer(MODEL_NAME)
    return _model


def encode(texts: list[str]):
    """Unit-length embeddings, one row per text (numpy array)."""
    return get_model().encode(texts, normalize_embeddings=True, show_progress_bar=False)


def chunk(text: str, max_words: int = CHUNK_WORDS) -> list[str]:
    """Split on sentence boundaries into chunks of at most ~max_words words."""
    sentences = re.split(r"(?<=[.!?])\s+", " ".join(text.split()))
    chunks, current, count = [], [], 0
    for s in sentences:
        n = len(s.split())
        if current and count + n > max_words:
            chunks.append(" ".join(current))
            current, count = [], 0
        current.append(s)
        count += n
    if current:
        chunks.append(" ".join(current))
    return chunks


def embed_description(text: str):
    import numpy as np

    vecs = encode(chunk(text))
    mean = vecs.mean(axis=0)
    return mean / np.linalg.norm(mean)


def to_pgvector(vec) -> str:
    """pgvector accepts the text form '[0.1,0.2,...]'."""
    return "[" + ",".join(f"{float(x):.6f}" for x in vec) + "]"


def embed_all(conn) -> int:
    rows = conn.execute(
        "SELECT company_id, ticker, description FROM companies ORDER BY ticker").fetchall()
    missing = [t for _, t, d in rows if not d]
    for t in missing:
        print(f"[SKIP] {t:15} no description (run load_financials.py first)")

    done = 0
    for company_id, ticker, description in rows:
        if not description:
            continue
        vec = embed_description(description)
        with conn.transaction():
            conn.execute(
                """INSERT INTO company_embeddings (company_id, model_name, embedding)
                   VALUES (%s, %s, %s::vector)
                   ON CONFLICT (company_id) DO UPDATE SET
                       model_name = EXCLUDED.model_name,
                       embedding  = EXCLUDED.embedding,
                       created_at = now()""",
                (company_id, MODEL_NAME, to_pgvector(vec)))
        done += 1
    print(f"Embedded {done} of {len(rows)} companies with {MODEL_NAME}.")
    return done


def report(conn) -> None:
    """Top-3 neighbours per company, via the similar_companies() SQL function.

    'Same-sector hits' is a quick quality check: if embeddings capture what a
    business does, most nearest neighbours should share its sector.
    """
    rows = conn.execute(
        """SELECT c.company_id, c.ticker, s.name
           FROM companies c JOIN sectors s USING (sector_id)
           JOIN company_embeddings e USING (company_id)
           ORDER BY s.name, c.ticker""").fetchall()
    if not rows:
        return
    hits = total = 0
    print("\nNearest neighbours (cosine similarity):")
    for company_id, ticker, sector in rows:
        nbrs = conn.execute(
            "SELECT ticker, sector, similarity FROM similar_companies(%s, 3)",
            (company_id,)).fetchall()
        hits += sum(1 for _, s, _ in nbrs if s == sector)
        total += len(nbrs)
        shown = ", ".join(f"{t} {sim:.2f}" + ("" if s == sector else " *") for t, s, sim in nbrs)
        print(f"  {ticker:15} -> {shown}")
    print(f"\nSame-sector hits in top 3: {hits}/{total} ({100 * hits / total:.0f}%)."
          "  * = neighbour from a different sector")


def query(conn, text: str, limit: int = 5) -> None:
    vec = to_pgvector(embed_description(text))
    rows = conn.execute(
        """SELECT c.ticker, c.name, s.name,
                  ROUND((1 - (e.embedding <=> %s::vector))::numeric, 3) AS similarity
           FROM company_embeddings e
           JOIN companies c USING (company_id)
           JOIN sectors s USING (sector_id)
           ORDER BY e.embedding <=> %s::vector
           LIMIT %s""", (vec, vec, limit)).fetchall()
    print(f'Companies most similar to: "{text}"')
    for ticker, name, sector, sim in rows:
        print(f"  {sim:.3f}  {ticker:15} {name}  ({sector})")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--query", metavar="TEXT", help="search companies by meaning instead of embedding")
    ap.add_argument("--no-report", action="store_true", help="skip the neighbour report")
    args = ap.parse_args()

    with psycopg.connect(os.environ["DATABASE_URL"], autocommit=True) as conn:
        if args.query:
            query(conn, args.query)
            return
        if embed_all(conn) == 0:
            sys.exit("Nothing embedded.")
        if not args.no_report:
            report(conn)


if __name__ == "__main__":
    main()
