import { safeJsonParse } from "../utils/safeJson";

export interface ReportStoreConfig {
  reportUrl?: string;
  queryUrl?: string;
  apiKey?: string;
}

export interface PersistInspectionReportInput {
  config: ReportStoreConfig;
  sessionId: string;
  equipmentId: string;
  checklistId: string | null;
  inspectorId: string | null;
  submittedAt: string;
  summary: {
    total_items_with_observation: number;
    text_remark_count: number;
    audio_remark_count: number;
  };
  overallStatus: "ok" | "needs_attention" | "critical";
  analyzedChecks: number;
  evidenceCount: number;
  manualExcerptsCount: number;
  report: unknown;
}

export async function persistInspectionReport(input: PersistInspectionReportInput): Promise<void> {
  const url = resolveReportUrl(input.config);
  if (!url) {
    throw new Error("Missing ACTIAN_REPORT_URL and unable to derive from ACTIAN_QUERY_URL");
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  if (input.config.apiKey) {
    headers.authorization = `Bearer ${input.config.apiKey}`;
    headers["x-api-key"] = input.config.apiKey;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      session_id: input.sessionId,
      equipment_id: input.equipmentId,
      checklist_id: input.checklistId,
      inspector_id: input.inspectorId,
      submitted_at: input.submittedAt,
      summary: input.summary,
      overall_status: input.overallStatus,
      analyzed_checks: input.analyzedChecks,
      evidence_count: input.evidenceCount,
      manual_excerpts_count: input.manualExcerptsCount,
      report: input.report ?? {},
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Actian report persist failed (${response.status}): ${body.slice(0, 400)}`);
  }

  const parsed = safeJsonParse<unknown>(await response.text());
  if (!parsed) {
    throw new Error("Actian report persist failed: invalid JSON response");
  }
}

export async function fetchInspectionReportHistory(input: {
  config: ReportStoreConfig;
  equipmentId: string;
  limit?: number;
}): Promise<unknown> {
  const baseUrl = resolveReportUrl(input.config);
  if (!baseUrl) {
    throw new Error("Missing ACTIAN_REPORT_URL and unable to derive from ACTIAN_QUERY_URL");
  }

  const requestUrl = new URL(`${baseUrl.replace(/\/$/, "")}/${encodeURIComponent(input.equipmentId)}`);
  if (input.limit !== undefined) {
    requestUrl.searchParams.set("limit", String(input.limit));
  }

  const headers: Record<string, string> = {};
  if (input.config.apiKey) {
    headers.authorization = `Bearer ${input.config.apiKey}`;
    headers["x-api-key"] = input.config.apiKey;
  }

  const response = await fetch(requestUrl.toString(), {
    method: "GET",
    headers,
  });

  const text = await response.text();
  const payload = safeJsonParse<unknown>(text);

  if (!response.ok) {
    throw new Error(`Actian report history failed (${response.status}): ${text.slice(0, 400)}`);
  }

  if (!payload) {
    throw new Error("Actian report history failed: invalid JSON response");
  }

  return payload;
}

function resolveReportUrl(config: ReportStoreConfig): string | null {
  if (config.reportUrl) {
    return config.reportUrl;
  }

  if (!config.queryUrl) {
    return null;
  }

  return config.queryUrl.replace(/\/query\/?$/, "/inspection-reports");
}
