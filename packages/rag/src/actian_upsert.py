from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from datetime import datetime
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

    def upsert_inspection_report(self, payload: dict) -> None:
        query = """
            INSERT INTO inspection_reports (
                session_id,
                equipment_id,
                checklist_id,
                inspector_id,
                submitted_at,
                total_items_with_status,
                pass_count,
                fail_count,
                na_count,
                overall_status,
                analyzed_checks,
                evidence_count,
                manual_excerpts_count,
                report_json
            )
            VALUES (
                %(session_id)s,
                %(equipment_id)s,
                %(checklist_id)s,
                %(inspector_id)s,
                %(submitted_at)s,
                %(total_items_with_status)s,
                %(pass_count)s,
                %(fail_count)s,
                %(na_count)s,
                %(overall_status)s,
                %(analyzed_checks)s,
                %(evidence_count)s,
                %(manual_excerpts_count)s,
                %(report_json)s::jsonb
            )
            ON CONFLICT (session_id) DO UPDATE SET
                equipment_id = EXCLUDED.equipment_id,
                checklist_id = EXCLUDED.checklist_id,
                inspector_id = EXCLUDED.inspector_id,
                submitted_at = EXCLUDED.submitted_at,
                total_items_with_status = EXCLUDED.total_items_with_status,
                pass_count = EXCLUDED.pass_count,
                fail_count = EXCLUDED.fail_count,
                na_count = EXCLUDED.na_count,
                overall_status = EXCLUDED.overall_status,
                analyzed_checks = EXCLUDED.analyzed_checks,
                evidence_count = EXCLUDED.evidence_count,
                manual_excerpts_count = EXCLUDED.manual_excerpts_count,
                report_json = EXCLUDED.report_json,
                updated_at = NOW();
        """

        db_payload = {
            "session_id": str(payload.get("session_id") or "").strip(),
            "equipment_id": str(payload.get("equipment_id") or "").strip(),
            "checklist_id": _nullable_str(payload.get("checklist_id")),
            "inspector_id": _nullable_str(payload.get("inspector_id")),
            "submitted_at": _parse_iso_datetime(payload.get("submitted_at")),
            "total_items_with_status": _as_int(payload.get("total_items_with_status")),
            "pass_count": _as_int(payload.get("pass_count")),
            "fail_count": _as_int(payload.get("fail_count")),
            "na_count": _as_int(payload.get("na_count")),
            "overall_status": str(payload.get("overall_status") or "ok"),
            "analyzed_checks": _as_int(payload.get("analyzed_checks")),
            "evidence_count": _as_int(payload.get("evidence_count")),
            "manual_excerpts_count": _as_int(payload.get("manual_excerpts_count")),
            "report_json": json.dumps(payload.get("report_json") or {}),
        }

        if not db_payload["session_id"]:
            raise RuntimeError("session_id is required")
        if not db_payload["equipment_id"]:
            raise RuntimeError("equipment_id is required")

        with psycopg.connect(self._dsn) as conn:
            with conn.cursor() as cur:
                cur.execute(query, db_payload)
            conn.commit()

    def list_inspection_reports(self, *, equipment_id: str, limit: int = 20) -> list[dict]:
        query = """
            SELECT
                session_id,
                equipment_id,
                checklist_id,
                inspector_id,
                submitted_at,
                total_items_with_status,
                pass_count,
                fail_count,
                na_count,
                overall_status,
                analyzed_checks,
                evidence_count,
                manual_excerpts_count,
                report_json,
                created_at,
                updated_at
            FROM inspection_reports
            WHERE equipment_id = %s
            ORDER BY submitted_at DESC
            LIMIT %s;
        """

        with psycopg.connect(self._dsn, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute(query, (equipment_id, limit))
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


def _nullable_str(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text if text else None


def _as_int(value: object) -> int:
    try:
        parsed = int(value)  # type: ignore[arg-type]
    except Exception:
        return 0
    return max(parsed, 0)


def _parse_iso_datetime(value: object) -> datetime:
    if isinstance(value, datetime):
        return value

    text = str(value or "").strip()
    if not text:
        return datetime.utcnow()

    normalized = text.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        return datetime.utcnow()
