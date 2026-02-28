import { handleInspect } from "./routes/inspect";
import { logError } from "./utils/logger";

interface Env {
  MAX_UPLOAD_MB?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  ACTIAN_QUERY_URL?: string;
  ACTIAN_API_KEY?: string;
  UPLOADS: R2Bucket;
}

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST,OPTIONS",
  "access-control-allow-headers": "content-type,authorization",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS" && url.pathname === "/api/inspect") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    if (request.method === "POST" && url.pathname === "/api/inspect") {
      try {
        return await handleInspect(request, env);
      } catch (error) {
        logError("Inspect route failed", error);

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
    }

    return new Response("Not Found", { status: 404 });
  },
};

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

  if (errorMessage.startsWith("Actian query failed")) {
    return 502;
  }

  if (errorMessage.startsWith("Gemini request failed")) {
    return 502;
  }

  return 500;
}
