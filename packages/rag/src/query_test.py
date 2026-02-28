from __future__ import annotations

import argparse

from dotenv import load_dotenv

from src.actian_upsert import ActianVectorStore
from src.embed import embed_text

load_dotenv()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Manual query test against Actian vector DB")
    parser.add_argument("--equipment-id", required=True)
    parser.add_argument("--query", required=True)
    parser.add_argument("--limit", type=int, default=5)
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    store = ActianVectorStore()
    query_embedding = embed_text(args.query)
    rows = store.query(
        equipment_id=args.equipment_id,
        query_embedding=query_embedding,
        limit=args.limit,
    )

    for index, row in enumerate(rows, start=1):
        text = str(row.get("chunk_text", "")).replace("\n", " ")
        similarity = row.get("similarity")
        print(f"{index}. sim={similarity} source={row.get('source')} text={text[:240]}")


if __name__ == "__main__":
    main()
