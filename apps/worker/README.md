# Worker Service (`apps/worker`)

Cloudflare Worker API for:
- `POST /api/inspection-sessions` (create session)
- `POST /api/inspection-sessions/:session_id/evidence` (upload image/audio per check; supports `audio/webm`)
- `POST /api/inspection-sessions/:session_id/items/:check_id` (upsert item remarks metadata)
- `POST /api/inspection-sessions/:session_id/analyze` (analyze all checks)
- `POST /api/inspection-sessions/:session_id/submit` (finalize inspection summary)
- `GET /api/inspection-sessions/:session_id` (session status)
- `GET /api/inspection-reports/:equipment_id?limit=20` (inspection history from DB)

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
GEMINI_MODEL=gemini-2.5-flash
MAX_UPLOAD_MB=15
ACTIAN_QUERY_URL=http://127.0.0.1:8000/query
ACTIAN_REPORT_URL=http://127.0.0.1:8000/inspection-reports
ACTIAN_API_KEY=optional_if_rag_api_has_key
```

Notes:
- `GEMINI_API_KEY` and `ACTIAN_API_KEY` are secrets.
- `ACTIAN_QUERY_URL` must point to your running RAG API.
- `ACTIAN_REPORT_URL` is optional; if omitted the worker derives it from `ACTIAN_QUERY_URL`.

## 3) Run locally

From repo root:

```bash
pnpm dev:worker
```

Or directly:

```bash
pnpm --filter worker dev
```

## 4) Session-based flow (multi-photo + multi-audio)

Supported machine serial numbers for session creation:
- `ZAR00512`
- `DKS01847`
- `FMG02291`

1. Create session:

```bash
curl -X POST http://127.0.0.1:8787/api/inspection-sessions \
  -H "content-type: application/json" \
  -d '{"serial_number":"ZAR00512","checklist_id":"safety-v1","inspector_id":"officer-01"}'
```

2. Upload evidence for a check (`file` can be image or audio):

```bash
curl -X POST http://127.0.0.1:8787/api/inspection-sessions/<SESSION_ID>/evidence \
  -F "check_id=fluid_level" \
  -F "label=tank_sight_glass_closeup" \
  -F "file=@test/HydraulicFluidTank.jpg;type=image/jpeg"
```

```bash
curl -X POST http://127.0.0.1:8787/api/inspection-sessions/<SESSION_ID>/evidence \
  -F "check_id=fluid_level" \
  -F "label=pump_audio_idle" \
  -F "file=@test/fluid.wav;type=audio/wav"
```

3. Analyze session:

```bash
curl -X POST http://127.0.0.1:8787/api/inspection-sessions/<SESSION_ID>/analyze
```

4. Get session status:

```bash
curl http://127.0.0.1:8787/api/inspection-sessions/<SESSION_ID>
```

5. Save item text remarks:

```bash
curl -X POST http://127.0.0.1:8787/api/inspection-sessions/<SESSION_ID>/items/fluid_level \
  -H "content-type: application/json" \
  -d '{"text_remark":"Leak near lower hose clamp."}'
```

6. Save audio duration metadata for the same item:

```bash
curl -X POST http://127.0.0.1:8787/api/inspection-sessions/<SESSION_ID>/items/fluid_level \
  -H "content-type: application/json" \
  -d '{"audio_duration_sec":18}'
```

7. Submit inspection:

```bash
curl -X POST http://127.0.0.1:8787/api/inspection-sessions/<SESSION_ID>/submit
```

8. Get historical reports for the machine:

```bash
curl http://127.0.0.1:8787/api/inspection-reports/EQ-1234?limit=20
```

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
