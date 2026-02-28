#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR/packages/rag"

python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

uvicorn src.server:app --host "${HOST:-0.0.0.0}" --port "${PORT:-8000}" --reload
