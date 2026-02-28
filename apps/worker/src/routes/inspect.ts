import { queryActianManualExcerpts } from "../services/actian";
import { uploadFileToR2 } from "../services/r2";
import { getRequiredFile, getRequiredString } from "../utils/formData";
import { buildEvidencePrompt, buildInspectionReport } from "../modelling";
import { runGeminiEvidenceExtraction } from "../services/geminiEvidence";

interface Env {
  MAX_UPLOAD_MB?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  ACTIAN_QUERY_URL?: string;
  ACTIAN_API_KEY?: string;
  UPLOADS: R2Bucket;
}

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png"]);
const ALLOWED_AUDIO_TYPES = new Set(["audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp3"]);

export async function handleInspect(request: Request, env: Env): Promise<Response> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    throw new Error("Expected multipart/form-data");
  }

  const form = await request.formData();

  const equipmentId = getRequiredString(form, "equipment_id");
  const image = getRequiredFile(form, "image");
  const audio = getRequiredFile(form, "audio");

  validateFileType(image, ALLOWED_IMAGE_TYPES, "image");
  validateFileType(audio, ALLOWED_AUDIO_TYPES, "audio");

  const maxUploadBytes = getMaxUploadBytes(env.MAX_UPLOAD_MB);
  validateFileSize(image, maxUploadBytes, "image");
  validateFileSize(audio, maxUploadBytes, "audio");

  if (!env.GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY environment variable");
  }

  if (!env.ACTIAN_QUERY_URL) {
    throw new Error("Missing ACTIAN_QUERY_URL environment variable");
  }

  const [imageUpload, audioUpload] = await Promise.all([
    uploadFileToR2({ bucket: env.UPLOADS, equipmentId, kind: "image", file: image }),
    uploadFileToR2({ bucket: env.UPLOADS, equipmentId, kind: "audio", file: audio }),
  ]);

  const manualExcerpts = await queryActianManualExcerpts({
    config: {
      queryUrl: env.ACTIAN_QUERY_URL,
      apiKey: env.ACTIAN_API_KEY,
    },
    equipmentId,
    limit: 5,
  });

  const imageDescription = "N/A (Gemini inspects the image directly)";
  const audioTranscript = "";

  const evidencePrompt =
    buildEvidencePrompt(imageDescription, audioTranscript) +
    "\n\nManual excerpts:\n" +
    manualExcerpts.map((excerpt) => `- ${excerpt}`).join("\n");

  const evidence = await runGeminiEvidenceExtraction({
    config: {
      apiKey: env.GEMINI_API_KEY,
      model: env.GEMINI_MODEL ?? "gemini-2.0-flash",
    },
    prompt: evidencePrompt,
    image,
    audioTranscript,
  });
  const report = buildInspectionReport(evidence);

  return jsonResponse(
    {
      equipment_id: equipmentId,
      uploads: {
        image_key: imageUpload.key,
        audio_key: audioUpload.key,
      },
      manual_excerpts_count: manualExcerpts.length,
      evidence,
      report,
    },
    200,
  );
}

function getMaxUploadBytes(configValue: string | undefined): number {
  const mb = Number(configValue ?? "15");

  if (!Number.isFinite(mb) || mb <= 0) {
    return 15 * 1024 * 1024;
  }

  return Math.floor(mb * 1024 * 1024);
}

function validateFileType(file: File, allowedTypes: Set<string>, fieldName: string): void {
  if (!allowedTypes.has(file.type)) {
    throw new Error(`Invalid ${fieldName} type: ${file.type}`);
  }
}

function validateFileSize(file: File, maxBytes: number, fieldName: string): void {
  if (file.size > maxBytes) {
    throw new Error(`${fieldName} file exceeds max upload size (${Math.round(maxBytes / (1024 * 1024))}MB)`);
  }
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
