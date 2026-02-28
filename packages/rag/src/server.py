from __future__ import annotations

import os
from typing import Literal

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, status
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
