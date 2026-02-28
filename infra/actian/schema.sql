-- PostgreSQL-compatible schema for Actian vector retrieval.
-- Adjust extension statements if your Actian deployment provisions vector support differently.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS manual_chunks (
  id TEXT PRIMARY KEY,
  equipment_id TEXT NOT NULL,
  source TEXT NOT NULL,
  chunk_text TEXT NOT NULL,
  embedding vector(768) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS manual_chunks_equipment_idx
  ON manual_chunks (equipment_id);

CREATE INDEX IF NOT EXISTS manual_chunks_embedding_idx
  ON manual_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE OR REPLACE FUNCTION set_manual_chunks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS manual_chunks_set_updated_at ON manual_chunks;

CREATE TRIGGER manual_chunks_set_updated_at
BEFORE UPDATE ON manual_chunks
FOR EACH ROW
EXECUTE FUNCTION set_manual_chunks_updated_at();
