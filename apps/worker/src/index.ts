import { handleInspect } from "./routes/inspect";
import {
  handleAnalyzeInspectionSession,
  handleCreateInspectionSession,
  handleGetInspectionSession,
  handleSubmitInspectionSession,
  handleUpsertInspectionItemObservation,
  handleUploadSessionEvidence,
} from "./routes/inspectionSessions";
import { fetchInspectionReportHistory } from "./services/reportStore";
import { logError } from "./utils/logger";

interface Env {
  MAX_UPLOAD_MB?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  ACTIAN_QUERY_URL?: string;
  ACTIAN_API_KEY?: string;
  ACTIAN_REPORT_URL?: string;
  UPLOADS: R2Bucket;
}

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,authorization",
};

const inspectionSessionPath = /^\/api\/inspection-sessions\/([^/]+)(?:\/(evidence|analyze|submit))?$/;
const inspectionSessionItemPath = /^\/api\/inspection-sessions\/([^/]+)\/items\/([^/]+)$/;
const inspectionReportHistoryPath = /^\/api\/inspection-reports\/([^/]+)$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS" && isCorsPath(url.pathname)) {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    try {
      if (request.method === "POST" && url.pathname === "/api/inspect") {
        return await handleInspect(request, env);
      }

      if (request.method === "POST" && url.pathname === "/api/inspection-sessions") {
        return await handleCreateInspectionSession(request, env);
      }

      const match = url.pathname.match(inspectionSessionPath);
      if (match) {
        const sessionId = match[1];
        const action = match[2];

        if (request.method === "GET" && !action) {
          return await handleGetInspectionSession(request, env, sessionId);
        }

        if (request.method === "POST" && action === "evidence") {
          return await handleUploadSessionEvidence(request, env, sessionId);
        }

        if (request.method === "POST" && action === "analyze") {
          return await handleAnalyzeInspectionSession(request, env, sessionId);
        }

        if (request.method === "POST" && action === "submit") {
          return await handleSubmitInspectionSession(request, env, sessionId);
        }
      }

      const itemMatch = url.pathname.match(inspectionSessionItemPath);
      if (itemMatch) {
        const sessionId = itemMatch[1];
        const itemId = itemMatch[2];

        if (request.method === "POST") {
          return await handleUpsertInspectionItemObservation(request, env, sessionId, itemId);
        }
      }

      const reportHistoryMatch = url.pathname.match(inspectionReportHistoryPath);
      if (reportHistoryMatch && request.method === "GET") {
        const equipmentId = decodeURIComponent(reportHistoryMatch[1]);
        const limit = Number(url.searchParams.get("limit") ?? "20");
        const payload = await fetchInspectionReportHistory({
          config: {
            reportUrl: env.ACTIAN_REPORT_URL,
            queryUrl: env.ACTIAN_QUERY_URL,
            apiKey: env.ACTIAN_API_KEY,
          },
          equipmentId,
          limit: Number.isFinite(limit) && limit > 0 ? limit : 20,
        });
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: {
            "content-type": "application/json",
            ...corsHeaders,
          },
        });
      }
    } catch (error) {
      logError("Worker request failed", error);

      const message = error instanceof Error ? error.message : "Unexpected error";
      const status = toHttpStatus(message);

      return new Response(
        JSON.stringify({
          error: message,
        }),
        {
          status,
          headers: {
            "content-type": "application/json",
            ...corsHeaders,
          },
        },
      );
    }

    return new Response("Not Found", { status: 404 });
  },
};

function isCorsPath(pathname: string): boolean {
  if (pathname === "/api/inspect") {
    return true;
  }

  if (pathname === "/api/inspection-sessions") {
    return true;
  }

  if (inspectionSessionItemPath.test(pathname)) {
    return true;
  }

  if (inspectionReportHistoryPath.test(pathname)) {
    return true;
  }

  return inspectionSessionPath.test(pathname);
}

function toHttpStatus(errorMessage: string): number {
  if (
    errorMessage.startsWith("Missing required") ||
    errorMessage.startsWith("Missing GEMINI") ||
    errorMessage.startsWith("Missing ACTIAN") ||
    errorMessage.startsWith("Invalid") ||
    errorMessage.startsWith("Expected multipart/form-data")
  ) {
    return 400;
  }

  if (errorMessage.includes("exceeds max upload size")) {
    return 413;
  }

  if (errorMessage.startsWith("Session not found")) {
    return 404;
  }

  if (errorMessage.startsWith("Actian query failed")) {
    return 502;
  }

  if (errorMessage.startsWith("Actian report")) {
    return 502;
  }

  if (errorMessage.startsWith("Gemini request failed")) {
    return 502;
  }

  return 500;
}
