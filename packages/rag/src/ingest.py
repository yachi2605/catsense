from __future__ import annotations

import argparse
from pathlib import Path

from dotenv import load_dotenv

from src.actian_upsert import ActianVectorStore, ManualChunkRow
from src.chunking import split_text
from src.embed import embed_text

load_dotenv()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Ingest manual text into Actian vector store")
    parser.add_argument("--equipment-id", required=True)
    parser.add_argument("--source", required=True, help="Human-readable source tag, e.g. manual-v1.pdf")
    parser.add_argument("--file", required=True, help="Path to .txt file")
    parser.add_argument("--chunk-size", type=int, default=1200)
    parser.add_argument("--overlap", type=int, default=200)
    parser.add_argument("--model", default=None, help="Embedding model override")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    path = Path(args.file)
    text = path.read_text(encoding="utf-8")

    chunks = split_text(text, chunk_size=args.chunk_size, overlap=args.overlap)
    rows: list[ManualChunkRow] = []

    for chunk in chunks:
        chunk_id = f"{args.equipment_id}:{args.source}:{chunk.index}"
        embedding = embed_text(chunk.text, model=args.model)
        rows.append(
            ManualChunkRow(
                id=chunk_id,
                equipment_id=args.equipment_id,
                source=args.source,
                chunk_text=chunk.text,
                embedding=embedding,
            )
        )

    store = ActianVectorStore()
    store.init_schema()
    count = store.upsert_chunks(rows)
    print(f"Upserted {count} chunks for equipment_id={args.equipment_id}")


if __name__ == "__main__":
    main()
