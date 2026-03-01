import { inspectOutputGeminiSchema, inspectOutputSchema, type InspectOutput } from "../schemas/inspectOutput";
import { safeJsonParse } from "../utils/safeJson";

interface GeminiConfig {
  apiKey: string;
  model: string;
}

export async function runGeminiInspection(input: {
  config: GeminiConfig;
  prompt: string;
  images: File[];
  audios: File[];
}): Promise<InspectOutput> {
  if (input.images.length === 0) {
    throw new Error("Missing required field: image evidence");
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${input.config.model}:generateContent?key=${input.config.apiKey}`;

  const mediaParts = [
    ...input.images.map(async (image) => ({
      inlineData: {
        mimeType: image.type,
        data: arrayBufferToBase64(await image.arrayBuffer()),
      },
    })),
    ...input.audios.map(async (audio) => ({
      inlineData: {
        mimeType: audio.type,
        data: arrayBufferToBase64(await audio.arrayBuffer()),
      },
    })),
  ];

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: input.prompt }, ...(await Promise.all(mediaParts))],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: inspectOutputGeminiSchema,
        temperature: 0.2,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini request failed (${response.status}): ${body.slice(0, 500)}`);
  }

  const payload = safeJsonParse<GeminiGenerateResponse>(await response.text());
  const content = payload?.candidates?.[0]?.content?.parts?.find((part) => typeof part.text === "string")?.text;

  if (!content) {
    throw new Error("Gemini response missing JSON content");
  }

  const parsed = safeJsonParse<unknown>(content);
  if (!parsed) {
    throw new Error("Gemini returned invalid JSON");
  }

  const validated = inspectOutputSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(`Gemini JSON failed schema validation: ${validated.error.message}`);
  }

  return validated.data;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

interface GeminiGenerateResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}
