import { safeJsonParse } from "../utils/safeJson";
import { evidenceOutputSchema, evidenceOutputGeminiSchema, type EvidenceOutput } from "../schemas/evidenceOutput";

interface GeminiConfig {
  apiKey: string;
  model: string;
}

export async function runGeminiEvidenceExtraction(input: {
  config: GeminiConfig;
  prompt: string;
  image: File;
  audioTranscript: string; // text only, easier & cheaper
}): Promise<EvidenceOutput> {
  const imageBuffer = await input.image.arrayBuffer();
  const imageBase64 = arrayBufferToBase64(imageBuffer);

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${input.config.model}:generateContent?key=${input.config.apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: input.prompt },
              { inline_data: { mime_type: input.image.type, data: imageBase64 } },
            ],
          },
        ],
        generationConfig: {
          response_mime_type: "application/json",
          response_schema: evidenceOutputGeminiSchema,
          temperature: 0.2
        },
      }),
    }
  );

  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const parsed = safeJsonParse(text);
  return evidenceOutputSchema.parse(parsed);
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}