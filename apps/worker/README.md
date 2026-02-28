# Worker Service (`apps/worker`)

Cloudflare Worker API for `POST /api/inspect`.

## 1) Prerequisites

1. Install Node.js 20+.
2. Install pnpm (`npm i -g pnpm`).
3. From repo root, install deps:

```bash
pnpm install
```

## 2) Configure local env

Create `apps/worker/.dev.vars` with these values:

```env
GEMINI_API_KEY=your_gemini_key
GEMINI_MODEL=gemini-2.0-flash
MAX_UPLOAD_MB=15
ACTIAN_QUERY_URL=http://127.0.0.1:8000/query
ACTIAN_API_KEY=optional_if_rag_api_has_key
```

Notes:
- `GEMINI_API_KEY` and `ACTIAN_API_KEY` are secrets.
- `ACTIAN_QUERY_URL` must point to your running RAG API.

## 3) Run locally

From repo root:

```bash
pnpm dev:worker
```

Or directly:

```bash
pnpm --filter worker dev
```

## 4) Test endpoint

Use multipart form with `equipment_id`, `image`, `audio`:

```bash
curl -X POST http://127.0.0.1:8787/api/inspect \
  -F "equipment_id=EQ-1234" \
  -F "image=@/absolute/path/photo.jpg" \
  -F "audio=@/absolute/path/voice.wav"
```

Expected behavior:
- Returns JSON with `equipment_id`, uploaded object keys, and `analysis`.
- Returns `400` if files/types/required fields are invalid.

## 5) Deploy

1. Ensure Cloudflare auth is configured (`wrangler login`).
2. Ensure the R2 bucket in `wrangler.toml` exists (`catsense-uploads`).
3. Set secrets in Cloudflare:

```bash
pnpm --filter worker exec wrangler secret put GEMINI_API_KEY
pnpm --filter worker exec wrangler secret put ACTIAN_API_KEY
```

4. Deploy:

```bash
pnpm deploy:worker
```

## 6) Troubleshooting

- Error `Missing GEMINI_API_KEY environment variable`: set `GEMINI_API_KEY` in `.dev.vars` (local) or Wrangler secrets (deploy).
- Error `Missing ACTIAN_QUERY_URL environment variable`: set `ACTIAN_QUERY_URL` in `.dev.vars` or Cloudflare vars.
- Error `Actian query failed (...)`: verify RAG service is running and API key/url are correct.
