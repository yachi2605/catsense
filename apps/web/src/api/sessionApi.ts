export interface CreateSessionInput {
  baseUrl: string;
  equipmentId: string;
  checklistId?: string;
  inspectorId?: string;
}

export interface SessionSummary {
  session_id: string;
  equipment_id: string;
  checklist_id: string | null;
  inspector_id: string | null;
  created_at: string;
}

export interface UploadEvidenceInput {
  baseUrl: string;
  sessionId: string;
  checkId: string;
  label?: string;
  file: File;
}

export interface AnalyzeResponse {
  session_id: string;
  equipment_id: string;
  checklist_id: string | null;
  evidence_count: number;
  analyzed_checks: number;
  manual_excerpts_count: number;
  overall_status: "ok" | "needs_attention" | "critical";
  check_results: Array<{
    check_id: string;
    evidence_count: number;
    analysis: {
      summary: string;
      status: "ok" | "needs_attention" | "critical";
      confidence: number;
      findings: Array<{
        component: string;
        issue: string;
        severity: "low" | "medium" | "high";
        evidence: string;
        action: string;
      }>;
      follow_up_questions: string[];
    };
  }>;
}

export interface UpsertItemObservationInput {
  baseUrl: string;
  sessionId: string;
  checkId: string;
  status?: "pass" | "fail" | "na";
  textRemark?: string;
  audioDurationSec?: number;
}

export interface SubmitInspectionResponse {
  session_id: string;
  submitted_at: string;
  summary: {
    total_items_with_status: number;
    pass_count: number;
    fail_count: number;
    na_count: number;
  };
}

export async function createSession(input: CreateSessionInput): Promise<SessionSummary> {
  const response = await fetch(`${stripSlash(input.baseUrl)}/api/inspection-sessions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      equipment_id: input.equipmentId,
      checklist_id: input.checklistId || undefined,
      inspector_id: input.inspectorId || undefined,
    }),
  });

  return parseJsonOrThrow<SessionSummary>(response);
}

export async function uploadEvidence(input: UploadEvidenceInput): Promise<unknown> {
  const form = new FormData();
  form.set("check_id", input.checkId);
  form.set("file", input.file);

  if (input.label) {
    form.set("label", input.label);
  }

  const response = await fetch(
    `${stripSlash(input.baseUrl)}/api/inspection-sessions/${input.sessionId}/evidence`,
    {
      method: "POST",
      body: form,
    },
  );

  return parseJsonOrThrow<unknown>(response);
}

export async function analyzeSession(baseUrl: string, sessionId: string): Promise<AnalyzeResponse> {
  const response = await fetch(`${stripSlash(baseUrl)}/api/inspection-sessions/${sessionId}/analyze`, {
    method: "POST",
  });

  return parseJsonOrThrow<AnalyzeResponse>(response);
}

export async function getSession(baseUrl: string, sessionId: string): Promise<unknown> {
  const response = await fetch(`${stripSlash(baseUrl)}/api/inspection-sessions/${sessionId}`);
  return parseJsonOrThrow<unknown>(response);
}

export async function upsertItemObservation(input: UpsertItemObservationInput): Promise<unknown> {
  const body: Record<string, unknown> = {};
  if (input.status) {
    body.status = input.status;
  }
  if (input.textRemark !== undefined) {
    body.text_remark = input.textRemark;
  }
  if (input.audioDurationSec !== undefined) {
    body.audio_duration_sec = input.audioDurationSec;
  }

  const response = await fetch(
    `${stripSlash(input.baseUrl)}/api/inspection-sessions/${input.sessionId}/items/${encodeURIComponent(input.checkId)}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  return parseJsonOrThrow<unknown>(response);
}

export async function submitInspection(baseUrl: string, sessionId: string): Promise<SubmitInspectionResponse> {
  const response = await fetch(`${stripSlash(baseUrl)}/api/inspection-sessions/${sessionId}/submit`, {
    method: "POST",
  });

  return parseJsonOrThrow<SubmitInspectionResponse>(response);
}

async function parseJsonOrThrow<T>(response: Response): Promise<T> {
  const text = await response.text();
  let data: unknown = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Invalid JSON response (${response.status})`);
    }
  }

  if (!response.ok) {
    const message =
      typeof data === "object" && data && "error" in data && typeof (data as { error?: unknown }).error === "string"
        ? (data as { error: string }).error
        : `Request failed (${response.status})`;
    throw new Error(message);
  }

  return data as T;
}

function stripSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}
