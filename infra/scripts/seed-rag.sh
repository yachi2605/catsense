#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <equipment_id> <source> <text_file>"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR/packages/rag"

python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

python -m src.ingest \
  --equipment-id "$1" \
  --source "$2" \
  --file "$3"
