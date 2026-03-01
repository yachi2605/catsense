# CatSense

## Prerequisites
- Node.js 20+
- pnpm 9+
- Python 3.11+
- `uv` (Python package manager)

## Installation
1. Install JavaScript dependencies from the repo root:
   ```bash
   pnpm install
   ```
2. Set up the RAG Python environment:
   ```bash
   cd packages/rag
   python3 -m venv .venv
   source .venv/bin/activate
   uv pip install -r requirements.txt
   ```

## Run the Project
Start each service in a separate terminal.

### Terminal 1: Rag
```bash
cd packages/rag
source .venv/bin/activate
uvicorn src.server:app --host 0.0.0.0 --port 8000 --reload
```

### Terminal 2: Backend
```bash
pnpm --filter worker dev
```

### Terminal 3: Frontend
```bash
pnpm dev:web
```
