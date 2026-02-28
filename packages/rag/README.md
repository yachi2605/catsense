# RAG Service (`packages/rag`)

RAG backend for the Worker `POST /api/inspect` flow.

## 1) What this service does

1. Splits manual text into chunks.
2. Creates embeddings for chunks.
3. Stores chunks + vectors in `manual_chunks`.
4. Serves `POST /query` to retrieve relevant excerpts by `equipment_id`.

## 2) Prerequisites

1. Python 3.11+.
2. `pip` available.
3. Optional: Docker (for local Postgres+pgvector via `docker-compose.yml`).

## 3) Set environment variables

From `packages/rag`:

```bash
cp .env.example .env
```

Set required values in `.env`:

```env
ACTIAN_DSN=postgresql://user:password@host:5432/database
GEMINI_API_KEY=your_gemini_key
ACTIAN_QUERY_API_KEY=optional
EMBEDDING_MODEL=models/text-embedding-004
HOST=0.0.0.0
PORT=8000
TOP_K_DEFAULT=5
MAX_EXCERPT_CHARS=500
```

Notes:
- `ACTIAN_DSN` is required.
- `ACTIAN_QUERY_API_KEY` is optional. If set, clients must send `x-api-key`.

## 4) Optional local database (Docker)

Start local DB:

```bash
cd packages/rag
docker compose up -d
```

Use this DSN in `.env`:

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

## 5) Install Python dependencies

```bash
cd packages/rag
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 6) Ingest manual files

Manuals should be `.txt` files.

Example:

```bash
python -m src.ingest \
  --equipment-id EQ-1234 \
  --source hydraulic-manual-v1 \
  --file manuals/EQ-1234-hydraulic.txt
```

What this does:
- Initializes schema if needed.
- Embeds chunks.
- Upserts chunks to the vector table.

## 7) Run API server

```bash
uvicorn src.server:app --host 0.0.0.0 --port 8000 --reload
```

Health check:

```bash
curl http://127.0.0.1:8000/health
```

Query endpoint test:

```bash
curl -X POST http://127.0.0.1:8000/query \
  -H "content-type: application/json" \
  -d '{"equipment_id":"EQ-1234","limit":5}'
```

If API key is enabled:

```bash
curl -X POST http://127.0.0.1:8000/query \
  -H "content-type: application/json" \
  -H "x-api-key: your_key" \
  -d '{"equipment_id":"EQ-1234","limit":5}'
```

## 8) Connect Worker to RAG

In `apps/worker/.dev.vars`:

```env
ACTIAN_QUERY_URL=http://127.0.0.1:8000/query
ACTIAN_API_KEY=your_optional_rag_api_key
```

Then run Worker:

```bash
pnpm dev:worker
```

## 9) Useful direct query test

```bash
python -m src.query_test \
  --equipment-id EQ-1234 \
  --query "maintenance inspection checklist" \
  --limit 5
```

## 10) Troubleshooting

- `Actian query failed`: verify `ACTIAN_DSN`, DB reachability, and schema.
- `Invalid API key`: update `ACTIAN_QUERY_API_KEY` or request headers.
- Empty query results: ensure ingestion ran with matching `equipment_id`.
