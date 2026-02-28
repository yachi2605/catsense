import { safeJsonParse } from "../utils/safeJson";

export interface ActianConfig {
  queryUrl: string;
  apiKey?: string;
}

export async function queryActianManualExcerpts(input: {
  config: ActianConfig;
  equipmentId: string;
  limit?: number;
}): Promise<string[]> {
  const limit = input.limit ?? 5;
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  if (input.config.apiKey) {
    headers.authorization = `Bearer ${input.config.apiKey}`;
    headers["x-api-key"] = input.config.apiKey;
  }

  const response = await fetch(input.config.queryUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      equipment_id: input.equipmentId,
      limit,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Actian query failed (${response.status}): ${body.slice(0, 400)}`);
  }

  const payload = safeJsonParse<unknown>(await response.text());
  return extractExcerpts(payload).slice(0, limit);
}

function extractExcerpts(payload: unknown): string[] {
  const list = extractList(payload);
  const results: string[] = [];

  for (const item of list) {
    if (typeof item === "string" && item.trim()) {
      results.push(item.trim());
      continue;
    }

    if (!item || typeof item !== "object") {
      continue;
    }

    const candidate =
      valueAsString((item as Record<string, unknown>).excerpt) ??
      valueAsString((item as Record<string, unknown>).text) ??
      valueAsString((item as Record<string, unknown>).content) ??
      valueAsString((item as Record<string, unknown>).chunk);

    if (candidate) {
      results.push(candidate);
    }
  }

  return results;
}

function extractList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const obj = payload as Record<string, unknown>;
  if (Array.isArray(obj.excerpts)) {
    return obj.excerpts;
  }
  if (Array.isArray(obj.results)) {
    return obj.results;
  }
  if (Array.isArray(obj.data)) {
    return obj.data;
  }

  return [];
}

function valueAsString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length ? normalized : null;
}
