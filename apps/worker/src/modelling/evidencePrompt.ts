import { CAT325_CHECKLIST } from "./checklist_cat325";

export function buildEvidencePrompt(
  imageDescription: string,
  audioTranscript: string
) {
  return `
You are performing a CAT 325 daily safety inspection.

Image Observations:
${imageDescription}

Audio Transcript:
${audioTranscript}

For each checklist item below, extract ONLY observable evidence.
If you cannot verify the item, write "UNKNOWN".

Checklist:
${CAT325_CHECKLIST.map(
  (c) => `- ${c.item} (looking for: ${c.looking_for.join(", ")})`
).join("\n")}

Return JSON array:
[
  {
    "item": "",
    "evidence": []
  }
]
`;
}