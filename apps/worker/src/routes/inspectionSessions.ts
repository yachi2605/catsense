import { queryActianManualExcerpts } from "../services/actian";
import { runGeminiInspection } from "../services/gemini";
import { persistInspectionReport } from "../services/reportStore";
import { buildStructuredInspectionPrompt } from "../modelling/evidencePrompt";
import { normalizeMachineSerial, STATIC_MACHINE_SERIALS, STATIC_MACHINE_SERIAL_SET } from "../constants/machines";
import { getRequiredFile, getRequiredString } from "../utils/formData";

interface Env {
  MAX_UPLOAD_MB?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  ACTIAN_QUERY_URL?: string;
  ACTIAN_API_KEY?: string;
  ACTIAN_REPORT_URL?: string;
  UPLOADS: R2Bucket;
}

interface InspectionSession {
  session_id: string;
  equipment_id: string;
  checklist_id?: string;
  inspector_id?: string;
  created_at: string;
  updated_at: string;
  submitted_at?: string;
  evidence: SessionEvidence[];
  observations: Record<string, InspectionCheckObservation>;
}

interface SessionEvidence {
  evidence_id: string;
  check_id: string;
  media_type: "image" | "audio";
  key: string;
  mime_type: string;
  size: number;
  label?: string;
  created_at: string;
}

interface InspectionCheckObservation {
  text_remark?: string;
  audio_duration_sec?: number;
  updated_at: string;
}

interface JsonObject {
  [key: string]: unknown;
}

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png"]);
const ALLOWED_AUDIO_TYPES = new Set(["audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp3", "audio/webm"]);

export async function handleCreateInspectionSession(request: Request, env: Env): Promise<Response> {
  const payload = (await request.json()) as JsonObject;
  const rawMachineSerial = valueAsString(payload.serial_number) ?? valueAsString(payload.equipment_id);
  const equipmentId = rawMachineSerial ? normalizeMachineSerial(rawMachineSerial) : null;

  if (!equipmentId) {
    throw new Error("Missing required field: serial_number");
  }

  if (!STATIC_MACHINE_SERIAL_SET.has(equipmentId)) {
    throw new Error(
      `Invalid serial_number. Use one of: ${STATIC_MACHINE_SERIALS.join(", ")}`,
    );
  }

  const now = new Date().toISOString();
  const sessionId = crypto.randomUUID();

  const session: InspectionSession = {
    session_id: sessionId,
    equipment_id: equipmentId,
    checklist_id: valueAsString(payload.checklist_id) ?? undefined,
    inspector_id: valueAsString(payload.inspector_id) ?? undefined,
    created_at: now,
    updated_at: now,
    evidence: [],
    observations: {},
  };

  await saveSession(env.UPLOADS, session);

  return jsonResponse(
    {
      session_id: session.session_id,
      equipment_id: session.equipment_id,
      checklist_id: session.checklist_id ?? null,
      inspector_id: session.inspector_id ?? null,
      created_at: session.created_at,
    },
    201,
  );
}

export async function handleUploadSessionEvidence(request: Request, env: Env, sessionId: string): Promise<Response> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    throw new Error("Expected multipart/form-data");
  }

  const session = await loadSession(env.UPLOADS, sessionId);
  if (!session) {
    throw new Error("Session not found");
  }

  const form = await request.formData();
  const checkId = getRequiredString(form, "check_id");
  const file = getRequiredFile(form, "file");
  const label = optionalString(form, "label");

  const mediaType = inferMediaType(file.type);
  if (!mediaType) {
    throw new Error(`Invalid file type: ${file.type}`);
  }

  const maxUploadBytes = getMaxUploadBytes(env.MAX_UPLOAD_MB);
  validateFileSize(file, maxUploadBytes, "file");

  const evidenceId = crypto.randomUUID();
  const key = buildEvidenceKey(session, evidenceId, file.type, mediaType);

  await env.UPLOADS.put(key, await file.arrayBuffer(), {
    httpMetadata: {
      contentType: file.type,
    },
    customMetadata: {
      session_id: session.session_id,
      equipment_id: session.equipment_id,
      check_id: checkId,
      media_type: mediaType,
    },
  });

  const evidence: SessionEvidence = {
    evidence_id: evidenceId,
    check_id: checkId,
    media_type: mediaType,
    key,
    mime_type: file.type,
    size: file.size,
    label: label ?? undefined,
    created_at: new Date().toISOString(),
  };

  const updatedSession: InspectionSession = {
    ...session,
    updated_at: new Date().toISOString(),
    evidence: [...session.evidence, evidence],
  };

  await saveSession(env.UPLOADS, updatedSession);

  return jsonResponse(
    {
      session_id: session.session_id,
      evidence,
      evidence_count: updatedSession.evidence.length,
    },
    201,
  );
}

export async function handleUpsertInspectionItemObservation(
  request: Request,
  env: Env,
  sessionId: string,
  checkId: string,
): Promise<Response> {
  const session = await loadSession(env.UPLOADS, sessionId);
  if (!session) {
    throw new Error("Session not found");
  }

  const payload = (await request.json()) as JsonObject;
  const textRemark = valueAsString(payload.text_remark) ?? undefined;
  const audioDuration = valueAsNumber(payload.audio_duration_sec);

  if (!textRemark && audioDuration === null) {
    throw new Error("Missing required field: observation payload");
  }

  const previous = session.observations[checkId];
  const observation: InspectionCheckObservation = {
    text_remark: textRemark ?? previous?.text_remark,
    audio_duration_sec: audioDuration ?? previous?.audio_duration_sec,
    updated_at: new Date().toISOString(),
  };

  const updatedSession: InspectionSession = {
    ...session,
    updated_at: observation.updated_at,
    observations: {
      ...session.observations,
      [checkId]: observation,
    },
  };

  await saveSession(env.UPLOADS, updatedSession);

  return jsonResponse(
    {
      session_id: session.session_id,
      check_id: checkId,
      observation,
    },
    200,
  );
}

export async function handleAnalyzeInspectionSession(_request: Request, env: Env, sessionId: string): Promise<Response> {
  if (!env.GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY environment variable");
  }

  if (!env.ACTIAN_QUERY_URL) {
    throw new Error("Missing ACTIAN_QUERY_URL environment variable");
  }

  const session = await loadSession(env.UPLOADS, sessionId);
  if (!session) {
    throw new Error("Session not found");
  }

  if (session.evidence.length === 0) {
    const emptyResponse = buildEmptyAnalysisResponse(session);
    const persisted = await persistReportSnapshot(env, session, emptyResponse);
    return jsonResponse(
      {
        ...emptyResponse,
        report_persisted: persisted,
      },
      200,
    );
  }

  const manualExcerpts = await queryActianManualExcerpts({
    config: {
      queryUrl: env.ACTIAN_QUERY_URL,
      apiKey: env.ACTIAN_API_KEY,
    },
    equipmentId: session.equipment_id,
    limit: 5,
  });

  const evidenceByCheck = groupEvidenceByCheck(session.evidence);
  const checkIds = getAllCheckIds(session).sort();

  const checkResults: Array<{
    check_id: string;
    evidence_count: number;
    inspection_input: InspectionCheckObservation | null;
    analysis: Awaited<ReturnType<typeof runGeminiInspection>>;
  }> = [];

  for (const checkId of checkIds) {
    const checkEvidence = evidenceByCheck.get(checkId) ?? [];
    const observation = session.observations[checkId] ?? null;
    const media = await loadEvidenceMedia(env.UPLOADS, checkEvidence);

    if (media.images.length === 0) {
      continue;
    }

    const prompt = buildStructuredInspectionPrompt({
      checkId,
      manualExcerpts,
      textRemark: observation?.text_remark,
      audioDurationSec: observation?.audio_duration_sec,
    });

    const analysis = await runGeminiInspection({
      config: {
        apiKey: env.GEMINI_API_KEY,
        model: env.GEMINI_MODEL ?? "gemini-2.5-flash",
      },
      prompt,
      images: media.images,
      audios: media.audios,
    });

    checkResults.push({
      check_id: checkId,
      evidence_count: checkEvidence.length,
      inspection_input: observation,
      analysis,
    });
  }

  if (checkResults.length === 0) {
    const emptyResponse = {
      ...buildEmptyAnalysisResponse(session),
      manual_excerpts_count: manualExcerpts.length,
    };
    const persisted = await persistReportSnapshot(env, session, emptyResponse);
    return jsonResponse(
      {
        ...emptyResponse,
        report_persisted: persisted,
      },
      200,
    );
  }

  const overallStatus = deriveOverallStatus(checkResults.map((item) => item.analysis.status));

  const responsePayload = {
    session_id: session.session_id,
    equipment_id: session.equipment_id,
    checklist_id: session.checklist_id ?? null,
    evidence_count: session.evidence.length,
    analyzed_checks: checkResults.length,
    manual_excerpts_count: manualExcerpts.length,
    overall_status: overallStatus,
    check_results: checkResults,
  };

  const persisted = await persistReportSnapshot(env, session, responsePayload);

  return jsonResponse(
    {
      ...responsePayload,
      report_persisted: persisted,
    },
    200,
  );
}

export async function handleGetInspectionSession(_request: Request, env: Env, sessionId: string): Promise<Response> {
  const session = await loadSession(env.UPLOADS, sessionId);
  if (!session) {
    throw new Error("Session not found");
  }

  const evidenceByCheck = groupEvidenceByCheck(session.evidence);
  const checks = getAllCheckIds(session).sort().map((checkId) => {
    const evidence = evidenceByCheck.get(checkId) ?? [];
    return {
      check_id: checkId,
      evidence_count: evidence.length,
      image_count: evidence.filter((item) => item.media_type === "image").length,
      audio_count: evidence.filter((item) => item.media_type === "audio").length,
      observation: session.observations[checkId] ?? null,
    };
  });

  return jsonResponse(
    {
      session_id: session.session_id,
      equipment_id: session.equipment_id,
      checklist_id: session.checklist_id ?? null,
      inspector_id: session.inspector_id ?? null,
      created_at: session.created_at,
      updated_at: session.updated_at,
      submitted_at: session.submitted_at ?? null,
      evidence_count: session.evidence.length,
      checks,
    },
    200,
  );
}

export async function handleSubmitInspectionSession(_request: Request, env: Env, sessionId: string): Promise<Response> {
  const session = await loadSession(env.UPLOADS, sessionId);
  if (!session) {
    throw new Error("Session not found");
  }

  const now = new Date().toISOString();
  const updatedSession: InspectionSession = {
    ...session,
    updated_at: now,
    submitted_at: now,
  };
  await saveSession(env.UPLOADS, updatedSession);

  const summary = summarizeObservations(session);
  const persisted = await persistReportSnapshot(env, updatedSession, {
    session_id: updatedSession.session_id,
    equipment_id: updatedSession.equipment_id,
    checklist_id: updatedSession.checklist_id ?? null,
    evidence_count: updatedSession.evidence.length,
    analyzed_checks: 0,
    manual_excerpts_count: 0,
    overall_status: deriveOverallStatusFromObservations(updatedSession.observations),
    check_results: [],
  });

  return jsonResponse(
    {
      session_id: updatedSession.session_id,
      submitted_at: updatedSession.submitted_at,
      summary,
      report_persisted: persisted,
    },
    200,
  );
}

function deriveOverallStatus(statuses: Array<"ok" | "needs_attention" | "critical">): "ok" | "needs_attention" | "critical" {
  if (statuses.includes("critical")) {
    return "critical";
  }

  if (statuses.includes("needs_attention")) {
    return "needs_attention";
  }

  return "ok";
}

function deriveOverallStatusFromObservations(
  _observations: Record<string, InspectionCheckObservation>,
): "ok" | "needs_attention" | "critical" {
  return "ok";
}

function summarizeObservations(session: InspectionSession): {
  total_items_with_observation: number;
  text_remark_count: number;
  audio_remark_count: number;
} {
  const observationEntries = Object.values(session.observations);
  const checkIdsWithEvidence = new Set(session.evidence.map((item) => item.check_id));
  const checkIdsWithObservation = new Set(Object.keys(session.observations));
  const observedCheckIds = new Set<string>([...checkIdsWithEvidence, ...checkIdsWithObservation]);

  return {
    total_items_with_observation: observedCheckIds.size,
    text_remark_count: observationEntries.filter((item) => Boolean(item.text_remark)).length,
    audio_remark_count: observationEntries.filter((item) => typeof item.audio_duration_sec === "number").length,
  };
}

function buildEmptyAnalysisResponse(session: InspectionSession): {
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
    inspection_input: InspectionCheckObservation | null;
    analysis: Awaited<ReturnType<typeof runGeminiInspection>>;
  }>;
} {
  return {
    session_id: session.session_id,
    equipment_id: session.equipment_id,
    checklist_id: session.checklist_id ?? null,
    evidence_count: session.evidence.length,
    analyzed_checks: 0,
    manual_excerpts_count: 0,
    overall_status: deriveOverallStatusFromObservations(session.observations),
    check_results: [],
  };
}

async function persistReportSnapshot(
  env: Env,
  session: InspectionSession,
  reportPayload: {
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
      inspection_input: InspectionCheckObservation | null;
      analysis: Awaited<ReturnType<typeof runGeminiInspection>>;
    }>;
  },
): Promise<boolean> {
  if (!env.ACTIAN_REPORT_URL && !env.ACTIAN_QUERY_URL) {
    return false;
  }

  try {
    const detailedReport = buildPersistedReportSnapshot(session, reportPayload);
    await persistInspectionReport({
      config: {
        reportUrl: env.ACTIAN_REPORT_URL,
        queryUrl: env.ACTIAN_QUERY_URL,
        apiKey: env.ACTIAN_API_KEY,
      },
      sessionId: reportPayload.session_id,
      equipmentId: reportPayload.equipment_id,
      checklistId: reportPayload.checklist_id,
      inspectorId: session.inspector_id ?? null,
      submittedAt: session.submitted_at ?? new Date().toISOString(),
      summary: summarizeObservations(session),
      overallStatus: reportPayload.overall_status,
      analyzedChecks: reportPayload.analyzed_checks,
      evidenceCount: reportPayload.evidence_count,
      manualExcerptsCount: reportPayload.manual_excerpts_count,
      report: detailedReport,
    });
    return true;
  } catch {
    return false;
  }
}

function buildPersistedReportSnapshot(
  session: InspectionSession,
  reportPayload: {
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
      inspection_input: InspectionCheckObservation | null;
      analysis: Awaited<ReturnType<typeof runGeminiInspection>>;
    }>;
  },
): {
  session: {
    session_id: string;
    equipment_id: string;
    checklist_id: string | null;
    inspector_id: string | null;
    created_at: string;
    submitted_at: string | null;
  };
  summary: ReturnType<typeof summarizeObservations>;
  analysis: typeof reportPayload;
  checks: Array<{
    check_id: string;
    text_remark: string | null;
    audio_duration_sec: number | null;
    evidence: SessionEvidence[];
    image_count: number;
    audio_count: number;
  }>;
} {
  const evidenceByCheck = groupEvidenceByCheck(session.evidence);
  const checks = getAllCheckIds(session).sort().map((checkId) => {
    const observation = session.observations[checkId];
    const evidence = evidenceByCheck.get(checkId) ?? [];

    return {
      check_id: checkId,
      text_remark: observation?.text_remark ?? null,
      audio_duration_sec: observation?.audio_duration_sec ?? null,
      evidence,
      image_count: evidence.filter((item) => item.media_type === "image").length,
      audio_count: evidence.filter((item) => item.media_type === "audio").length,
    };
  });

  return {
    session: {
      session_id: session.session_id,
      equipment_id: session.equipment_id,
      checklist_id: session.checklist_id ?? null,
      inspector_id: session.inspector_id ?? null,
      created_at: session.created_at,
      submitted_at: session.submitted_at ?? null,
    },
    summary: summarizeObservations(session),
    analysis: reportPayload,
    checks,
  };
}

function groupEvidenceByCheck(evidence: SessionEvidence[]): Map<string, SessionEvidence[]> {
  const groups = new Map<string, SessionEvidence[]>();

  for (const item of evidence) {
    const list = groups.get(item.check_id) ?? [];
    list.push(item);
    groups.set(item.check_id, list);
  }

  return groups;
}

function getAllCheckIds(session: InspectionSession): string[] {
  const ids = new Set<string>();
  for (const evidence of session.evidence) {
    ids.add(evidence.check_id);
  }
  for (const checkId of Object.keys(session.observations)) {
    ids.add(checkId);
  }
  return Array.from(ids);
}

async function loadEvidenceMedia(bucket: R2Bucket, evidence: SessionEvidence[]): Promise<{ images: File[]; audios: File[] }> {
  const images: File[] = [];
  const audios: File[] = [];

  for (const item of evidence) {
    const object = await bucket.get(item.key);
    if (!object) {
      continue;
    }

    const file = new File([await object.arrayBuffer()], fileNameFromKey(item.key), {
      type: item.mime_type,
    });

    if (item.media_type === "image") {
      images.push(file);
    } else {
      audios.push(file);
    }
  }

  return { images, audios };
}

function fileNameFromKey(key: string): string {
  const parts = key.split("/");
  return parts[parts.length - 1] ?? key;
}

function buildEvidenceKey(
  session: InspectionSession,
  evidenceId: string,
  mimeType: string,
  mediaType: "image" | "audio",
): string {
  const extension = extensionFromMimeType(mimeType);
  return `sessions/${session.session_id}/checks/${sanitizePathSegment(session.equipment_id)}/${evidenceId}-${mediaType}.${extension}`;
}

function extensionFromMimeType(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "audio/mpeg":
    case "audio/mp3":
      return "mp3";
    case "audio/wav":
    case "audio/x-wav":
      return "wav";
    case "audio/webm":
      return "webm";
    default:
      return "bin";
  }
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function inferMediaType(mimeType: string): "image" | "audio" | null {
  if (ALLOWED_IMAGE_TYPES.has(mimeType)) {
    return "image";
  }

  if (ALLOWED_AUDIO_TYPES.has(mimeType)) {
    return "audio";
  }

  return null;
}

function optionalString(form: FormData, name: string): string | null {
  const value = form.get(name);
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length ? normalized : null;
}

function getMaxUploadBytes(configValue: string | undefined): number {
  const mb = Number(configValue ?? "15");

  if (!Number.isFinite(mb) || mb <= 0) {
    return 15 * 1024 * 1024;
  }

  return Math.floor(mb * 1024 * 1024);
}

function validateFileSize(file: File, maxBytes: number, fieldName: string): void {
  if (file.size > maxBytes) {
    throw new Error(`${fieldName} file exceeds max upload size (${Math.round(maxBytes / (1024 * 1024))}MB)`);
  }
}

function valueAsString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length ? normalized : null;
}

function valueAsNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return value;
}

function sessionKey(sessionId: string): string {
  return `sessions/${sessionId}/session.json`;
}

async function loadSession(bucket: R2Bucket, sessionId: string): Promise<InspectionSession | null> {
  const object = await bucket.get(sessionKey(sessionId));
  if (!object) {
    return null;
  }

  let parsed: InspectionSession;
  try {
    parsed = JSON.parse(await object.text()) as InspectionSession;
  } catch {
    return null;
  }

  if (!parsed || parsed.session_id !== sessionId || !Array.isArray(parsed.evidence)) {
    return null;
  }

  if (!parsed.observations || typeof parsed.observations !== "object") {
    parsed.observations = {};
  }

  return parsed;
}

async function saveSession(bucket: R2Bucket, session: InspectionSession): Promise<void> {
  await bucket.put(sessionKey(session.session_id), JSON.stringify(session), {
    httpMetadata: {
      contentType: "application/json",
    },
    customMetadata: {
      session_id: session.session_id,
      equipment_id: session.equipment_id,
    },
  });
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    },
  });
}
