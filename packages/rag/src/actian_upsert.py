from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import psycopg
from psycopg.rows import dict_row


@dataclass(frozen=True)
class ManualChunkRow:
    id: str
    equipment_id: str
    source: str
    chunk_text: str
    embedding: list[float]


class ActianVectorStore:
    def __init__(self, dsn: str | None = None) -> None:
        self._dsn = dsn or os.getenv("ACTIAN_DSN")
        if not self._dsn:
            raise RuntimeError("ACTIAN_DSN is required")

    def init_schema(self, schema_path: str | Path | None = None) -> None:
        default_path = Path(__file__).resolve().parents[3] / "infra" / "actian" / "schema.sql"
        path = Path(schema_path) if schema_path else default_path

        sql = path.read_text(encoding="utf-8")
        with psycopg.connect(self._dsn, autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute(sql)

    def upsert_chunks(self, rows: Iterable[ManualChunkRow]) -> int:
        query = """
            INSERT INTO manual_chunks (id, equipment_id, source, chunk_text, embedding)
            VALUES (%s, %s, %s, %s, %s::vector)
            ON CONFLICT (id) DO UPDATE SET
              equipment_id = EXCLUDED.equipment_id,
              source = EXCLUDED.source,
              chunk_text = EXCLUDED.chunk_text,
              embedding = EXCLUDED.embedding,
              updated_at = NOW();
        """

        data = [
            (row.id, row.equipment_id, row.source, row.chunk_text, _vector_literal(row.embedding))
            for row in rows
        ]

        if not data:
            return 0

        with psycopg.connect(self._dsn) as conn:
            with conn.cursor() as cur:
                cur.executemany(query, data)
            conn.commit()

        return len(data)

    def query(self, *, equipment_id: str, query_embedding: list[float], limit: int = 5) -> list[dict]:
        query = """
            SELECT id, equipment_id, source, chunk_text,
                   1 - (embedding <=> %s::vector) AS similarity
            FROM manual_chunks
            WHERE equipment_id = %s
            ORDER BY embedding <=> %s::vector
            LIMIT %s;
        """

        vector_literal = _vector_literal(query_embedding)
        with psycopg.connect(self._dsn, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute(query, (vector_literal, equipment_id, vector_literal, limit))
                rows = cur.fetchall()

        return [dict(row) for row in rows]


def _vector_literal(values: list[float]) -> str:
    return json.dumps(values)
