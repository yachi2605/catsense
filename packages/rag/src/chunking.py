from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Chunk:
    index: int
    text: str


def split_text(text: str, *, chunk_size: int = 1200, overlap: int = 200) -> list[Chunk]:
    normalized = " ".join(text.split())
    if not normalized:
        return []

    if overlap >= chunk_size:
        raise ValueError("overlap must be smaller than chunk_size")

    chunks: list[Chunk] = []
    start = 0
    index = 0

    while start < len(normalized):
        end = min(len(normalized), start + chunk_size)
        chunk_text = normalized[start:end].strip()
        if chunk_text:
            chunks.append(Chunk(index=index, text=chunk_text))
            index += 1

        if end >= len(normalized):
            break

        start = end - overlap

    return chunks
