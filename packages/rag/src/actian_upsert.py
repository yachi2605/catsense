from __future__ import annotations

import json
import os
import re
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
        rows_list = list(rows)
        if not rows_list:
            return 0

        expected_dim = len(rows_list[0].embedding)
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
            for row in rows_list
        ]

        with psycopg.connect(self._dsn) as conn:
            with conn.cursor() as cur:
                self._ensure_embedding_dimension(cur, expected_dim)
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

    def _ensure_embedding_dimension(self, cur: psycopg.Cursor, expected_dim: int) -> None:
        cur.execute(
            """
            SELECT format_type(a.atttypid, a.atttypmod)
            FROM pg_attribute a
            JOIN pg_class c ON c.oid = a.attrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relname = 'manual_chunks'
              AND a.attname = 'embedding'
              AND NOT a.attisdropped
              AND n.nspname = current_schema()
            """
        )
        row = cur.fetchone()
        if not row:
            return

        type_name = str(row[0])
        match = re.search(r"vector\((\d+)\)", type_name)
        if not match:
            return

        current_dim = int(match.group(1))
        if current_dim == expected_dim:
            return

        cur.execute("SELECT COUNT(*) FROM manual_chunks")
        row_count = int(cur.fetchone()[0])
        if row_count > 0:
            raise RuntimeError(
                f"manual_chunks.embedding is vector({current_dim}) but incoming embeddings are {expected_dim}D. "
                "Table already has data. Either clear and re-ingest, or use the same embedding model as existing data."
            )

        cur.execute("DROP INDEX IF EXISTS manual_chunks_embedding_idx")
        cur.execute(
            f"""
            ALTER TABLE manual_chunks
            ALTER COLUMN embedding TYPE vector({expected_dim})
            USING embedding::text::vector({expected_dim})
            """
        )
        cur.execute(
            """
            CREATE INDEX IF NOT EXISTS manual_chunks_embedding_idx
            ON manual_chunks
            USING ivfflat (embedding vector_cosine_ops)
            WITH (lists = 100)
            """
        )


def _vector_literal(values: list[float]) -> str:
    return json.dumps(values)
