# Actian Vector DB Service

This package provides a minimal RAG backend for the worker endpoint `/api/inspect`.

## What it does
- Stores manual chunks + embeddings in Actian Vector DB (`manual_chunks` table)
- Exposes `POST /query` for retrieval by `equipment_id`
- Returns excerpt data in a format accepted by `apps/worker/src/services/actian.ts`

## 1) Configure environment
Copy `.env.example` to `.env` and fill values:

- `ACTIAN_DSN` (required)
- `GEMINI_API_KEY` (optional, recommended for real embeddings)
- `ACTIAN_QUERY_API_KEY` (optional)

### Local DB with Docker (pgvector)
Start local Postgres+pgvector:
```bash
cd packages/rag
docker compose up -d
```

Then set this in `.env`:
```env
ACTIAN_DSN=postgresql://catsense:catsense@localhost:5432/catsense
```

Stop DB:
```bash
docker compose down
```

Reset DB data:
```bash
docker compose down -v
```

## 2) Install dependencies
```bash
cd packages/rag
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 3) Ingest manuals
Use plaintext manuals (`.txt`) for minimum setup:
```bash
python -m src.ingest \
  --equipment-id EQ-1234 \
  --source hydraulic-manual-v1 \
  --file /absolute/path/manual.txt
```

## 4) Run query API
```bash
uvicorn src.server:app --host 0.0.0.0 --port 8000 --reload
```

Health check:
```bash
curl http://127.0.0.1:8000/health
```

Query test:
```bash
curl -X POST http://127.0.0.1:8000/query \
  -H 'content-type: application/json' \
  -d '{"equipment_id":"EQ-1234","limit":5}'
```

## 5) Connect worker
In `apps/worker/.dev.vars`:
```env
ACTIAN_QUERY_URL=http://127.0.0.1:8000/query
ACTIAN_API_KEY=your_optional_api_key
```

Worker then fetches excerpts via `queryActianManualExcerpts`.

## Notes
- SQL schema is in `infra/actian/schema.sql`.
- Vector ops use PostgreSQL `pgvector` syntax; if your Actian deployment uses different DDL/operator syntax, adapt only `schema.sql` and `src/actian_upsert.py` SQL statements.
