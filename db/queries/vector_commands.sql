-- =====================================================================
-- vector_commands.sql | pgvector: create, read, update, delete
-- Updates and deletes run in a transaction that is ROLLED BACK.
-- Run with:  docker compose exec -T postgres psql -U comps_admin -d comps_engine < db/queries/vector_commands.sql
-- =====================================================================

-- CREATE (already in 01_schema.sql):
--   embedding vector(384), plus  CREATE INDEX ... USING hnsw (embedding vector_cosine_ops)
SELECT COUNT(*) AS vectors, MIN(vector_dims(embedding)) AS dims,
       ROUND(AVG(vector_norm(embedding))::numeric, 4) AS avg_length
FROM company_embeddings;

-- READ: 5 nearest neighbours of Eternal (Zomato) by cosine distance (<=>)
SELECT c.ticker, ROUND((1 - (e.embedding <=> t.embedding))::numeric, 3) AS similarity
FROM company_embeddings t
JOIN company_embeddings e ON e.company_id <> t.company_id
JOIN companies c ON c.company_id = e.company_id
WHERE t.company_id = (SELECT company_id FROM companies WHERE ticker = 'ETERNAL.NS')
ORDER BY e.embedding <=> t.embedding
LIMIT 5;

-- READ: sector "centroids" (average vector) and how close each sector is to the others
WITH centroid AS (
    SELECT s.name AS sector, AVG(e.embedding) AS v
    FROM company_embeddings e JOIN companies c USING (company_id) JOIN sectors s USING (sector_id)
    GROUP BY s.name
)
SELECT a.sector, b.sector AS other_sector, ROUND((1 - (a.v <=> b.v))::numeric, 3) AS similarity
FROM centroid a JOIN centroid b ON a.sector < b.sector
ORDER BY similarity DESC;

BEGIN;
-- UPDATE: re-normalise one vector and record the change
UPDATE company_embeddings
SET embedding = l2_normalize(embedding), model_name = model_name || ' (renormalised)', created_at = now()
WHERE company_id = (SELECT company_id FROM companies WHERE ticker = 'TCS.NS')
RETURNING company_id, model_name;

-- DELETE: remove a company's vector; it then drops out of similarity results
DELETE FROM company_embeddings
WHERE company_id = (SELECT company_id FROM companies WHERE ticker = 'SWIGGY.NS')
RETURNING company_id;
SELECT COUNT(*) AS vectors_after_delete FROM company_embeddings;
ROLLBACK;  -- undo; re-create vectors any time with: python ingest/embed.py
