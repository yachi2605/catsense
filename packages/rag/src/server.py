from __future__ import annotations

import os
import sys
from typing import Literal

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Query, status
from pydantic import BaseModel, Field

from src.actian_upsert import ActianVectorStore
from src.embed import embed_text

load_dotenv()

TOP_K_DEFAULT = int(os.getenv("TOP_K_DEFAULT", "5"))
MAX_EXCERPT_CHARS = int(os.getenv("MAX_EXCERPT_CHARS", "500"))
API_KEY = os.getenv("ACTIAN_QUERY_API_KEY", "").strip()

app = FastAPI(title="catsense-rag", version="1.0.0")
store = ActianVectorStore()


class QueryRequest(BaseModel):
    equipment_id: str = Field(min_length=1)
    limit: int = Field(default=TOP_K_DEFAULT, ge=1, le=20)


class QueryResult(BaseModel):
    excerpt: str
    source: str
    similarity: float


class QueryResponse(BaseModel):
    results: list[QueryResult]

class InspectionSummary(BaseModel):
    total_items_with_status: int = Field(default=0, ge=0)
    pass_count: int = Field(default=0, ge=0)
    fail_count: int = Field(default=0, ge=0)
    na_count: int = Field(default=0, ge=0)


class InspectionReportUpsertRequest(BaseModel):
    session_id: str = Field(min_length=1)
    equipment_id: str = Field(min_length=1)
    checklist_id: str | None = None
    inspector_id: str | None = None
    submitted_at: str = Field(min_length=1)
    overall_status: Literal["ok", "needs_attention", "critical"] = "ok"
    analyzed_checks: int = Field(default=0, ge=0)
    evidence_count: int = Field(default=0, ge=0)
    manual_excerpts_count: int = Field(default=0, ge=0)
    summary: InspectionSummary
    report: dict


class InspectionReportUpsertResponse(BaseModel):
    session_id: str
    stored: bool


class InspectionReportHistoryItem(BaseModel):
    session_id: str
    equipment_id: str
    checklist_id: str | None
    inspector_id: str | None
    submitted_at: str
    overall_status: str
    analyzed_checks: int
    evidence_count: int
    summary: InspectionSummary
    report: dict


class InspectionReportHistoryResponse(BaseModel):
    equipment_id: str
    reports: list[InspectionReportHistoryItem]


@app.on_event("startup")
def bootstrap_schema() -> None:
    if os.getenv("AUTO_INIT_SCHEMA", "1").strip().lower() in {"0", "false", "no"}:
        return

    try:
        store.init_schema()
    except Exception as exc:  # pragma: no cover
        print(f"[rag] schema initialization warning: {exc}", file=sys.stderr)


def check_api_key(x_api_key: str | None = Header(default=None)) -> Literal[True]:
    if not API_KEY:
        return True

    if x_api_key == API_KEY:
        return True

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/query", response_model=QueryResponse)
def query_manual_excerpts(payload: QueryRequest, _: Literal[True] = Depends(check_api_key)) -> QueryResponse:
    query_text = f"maintenance inspection checklist for equipment {payload.equipment_id}"
    query_embedding = embed_text(query_text)

    try:
        rows = store.query(
            equipment_id=payload.equipment_id,
            query_embedding=query_embedding,
            limit=payload.limit,
        )
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"Actian query failed: {exc}") from exc

    results: list[QueryResult] = []
    for row in rows:
        raw_text = str(row.get("chunk_text", "")).strip()
        if not raw_text:
            continue

        results.append(
            QueryResult(
                excerpt=raw_text[:MAX_EXCERPT_CHARS],
                source=str(row.get("source", "")),
                similarity=float(row.get("similarity", 0.0)),
            )
        )

    return QueryResponse(results=results)


@app.post("/inspection-reports", response_model=InspectionReportUpsertResponse)
def upsert_inspection_report(
    payload: InspectionReportUpsertRequest,
    _: Literal[True] = Depends(check_api_key),
) -> InspectionReportUpsertResponse:
    try:
        store.upsert_inspection_report(
            {
                "session_id": payload.session_id,
                "equipment_id": payload.equipment_id,
                "checklist_id": payload.checklist_id,
                "inspector_id": payload.inspector_id,
                "submitted_at": payload.submitted_at,
                "total_items_with_status": payload.summary.total_items_with_status,
                "pass_count": payload.summary.pass_count,
                "fail_count": payload.summary.fail_count,
                "na_count": payload.summary.na_count,
                "overall_status": payload.overall_status,
                "analyzed_checks": payload.analyzed_checks,
                "evidence_count": payload.evidence_count,
                "manual_excerpts_count": payload.manual_excerpts_count,
                "report_json": payload.report,
            }
        )
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"Actian report upsert failed: {exc}") from exc

    return InspectionReportUpsertResponse(session_id=payload.session_id, stored=True)


@app.get("/inspection-reports/{equipment_id}", response_model=InspectionReportHistoryResponse)
def get_inspection_report_history(
    equipment_id: str,
    limit: int = Query(default=20, ge=1, le=100),
    _: Literal[True] = Depends(check_api_key),
) -> InspectionReportHistoryResponse:
    try:
        rows = store.list_inspection_reports(equipment_id=equipment_id, limit=limit)
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"Actian report history failed: {exc}") from exc

    reports: list[InspectionReportHistoryItem] = []
    for row in rows:
        reports.append(
            InspectionReportHistoryItem(
                session_id=str(row.get("session_id", "")),
                equipment_id=str(row.get("equipment_id", "")),
                checklist_id=row.get("checklist_id"),
                inspector_id=row.get("inspector_id"),
                submitted_at=str(row.get("submitted_at", "")),
                overall_status=str(row.get("overall_status", "ok")),
                analyzed_checks=int(row.get("analyzed_checks", 0) or 0),
                evidence_count=int(row.get("evidence_count", 0) or 0),
                summary=InspectionSummary(
                    total_items_with_status=int(row.get("total_items_with_status", 0) or 0),
                    pass_count=int(row.get("pass_count", 0) or 0),
                    fail_count=int(row.get("fail_count", 0) or 0),
                    na_count=int(row.get("na_count", 0) or 0),
                ),
                report=row.get("report_json") or {},
            )
        )

    return InspectionReportHistoryResponse(equipment_id=equipment_id, reports=reports)
