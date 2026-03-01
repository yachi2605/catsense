from __future__ import annotations

import hashlib
import os
import sys
from typing import Final

import numpy as np
import requests

_GEMINI_EMBED_URL: Final[str] = "https://generativelanguage.googleapis.com/v1beta/models/{model}:embedContent"
_FALLBACK_MODELS: Final[tuple[str, ...]] = ("gemini-embedding-001", "text-embedding-004")


def embed_text(text: str, *, model: str | None = None, api_key: str | None = None, fallback_dim: int = 768) -> list[float]:
    model_name = _normalize_gemini_model(model or os.getenv("EMBEDDING_MODEL", "text-embedding-004"))
    gemini_key = api_key or os.getenv("GEMINI_API_KEY")
    expected_dim = _embedding_dim_or_none()
    target_dim = expected_dim or fallback_dim

    if gemini_key:
        candidates = _candidate_models(model_name)
        errors: list[str] = []

        for candidate in candidates:
            try:
                values = _embed_with_gemini(text, candidate, gemini_key)
                if expected_dim and len(values) != expected_dim:
                    errors.append(f"{candidate} -> dim {len(values)} != expected {expected_dim}")
                    continue
                return values
            except requests.HTTPError as exc:
                status = getattr(exc.response, "status_code", "unknown")
                errors.append(f"{candidate} -> HTTP {status}")
            except Exception as exc:  # pragma: no cover
                errors.append(f"{candidate} -> {type(exc).__name__}: {exc}")

        _warn(
            "Gemini embeddings unavailable; falling back to deterministic hash embeddings. "
            f"Tried: {', '.join(errors)}"
        )

    return _embed_with_hash(text, target_dim)


def _embed_with_gemini(text: str, model: str, api_key: str) -> list[float]:
    url = _GEMINI_EMBED_URL.format(model=model)
    response = requests.post(
        f"{url}?key={api_key}",
        headers={"content-type": "application/json"},
        json={"content": {"parts": [{"text": text}]}, "taskType": "RETRIEVAL_DOCUMENT"},
        timeout=30,
    )
    response.raise_for_status()

    payload = response.json()
    values = payload.get("embedding", {}).get("values")
    if not isinstance(values, list) or not values:
        raise RuntimeError("Gemini embedding response missing embedding.values")

    return [float(x) for x in values]


def _normalize_gemini_model(value: str) -> str:
    model = value.strip()
    if model.startswith("models/"):
        return model[len("models/") :]
    return model


def _candidate_models(primary: str) -> list[str]:
    models: list[str] = [primary]
    for fallback in _FALLBACK_MODELS:
        if fallback not in models:
            models.append(fallback)
    return models


def _warn(message: str) -> None:
    print(f"[embed] {message}", file=sys.stderr)


def _embedding_dim_or_none() -> int | None:
    raw = os.getenv("EMBEDDING_DIM", "").strip()
    if not raw:
        return None
    try:
        value = int(raw)
    except ValueError:
        _warn(f"Invalid EMBEDDING_DIM={raw!r}; ignoring.")
        return None
    if value <= 0:
        _warn(f"Invalid EMBEDDING_DIM={raw!r}; must be > 0. Ignoring.")
        return None
    return value


def _embed_with_hash(text: str, dim: int) -> list[float]:
    if dim <= 0:
        raise ValueError("dim must be > 0")

    vector = np.zeros(dim, dtype=np.float32)
    for token in text.lower().split():
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        bucket = int.from_bytes(digest[:4], byteorder="big", signed=False) % dim
        sign = -1.0 if digest[4] % 2 else 1.0
        vector[bucket] += sign

    norm = float(np.linalg.norm(vector))
    if norm == 0:
        return vector.tolist()

    return (vector / norm).tolist()
