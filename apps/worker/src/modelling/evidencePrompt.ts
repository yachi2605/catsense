import { CAT325_CHECKLIST } from "./checklist_cat325";

export function buildStructuredInspectionPrompt(input: {
  checkId: string;
  manualExcerpts: string[];
  textRemark?: string;
  audioDurationSec?: number;
}): string {
  const excerpts = input.manualExcerpts.length
    ? input.manualExcerpts.map((excerpt, index) => `(${index + 1}) ${excerpt}`).join("\n")
    : "No relevant manual excerpts were found for this equipment.";
  const checklistContext = resolveChecklistContext(input.checkId);

  return [
    "You are a maintenance inspection assistant for CAT equipment.",
    "Analyze the uploaded photo(s) and audio for this single checklist check_id.",
    `Checklist check_id: ${input.checkId}`,
    `Checklist item: ${checklistContext.item}`,
    `Look for: ${checklistContext.lookingFor}`,
    `Inspector text remarks: ${input.textRemark ?? "none"}`,
    `Audio duration (seconds): ${input.audioDurationSec ?? "unknown"}`,
    "",
    "Use image/audio evidence as primary source. Use manual excerpts as constraints.",
    "Do not invent facts not supported by evidence or excerpts.",
    'If no actionable issue is found, set "findings" to [].',
    'If a required string field cannot be determined from evidence, use "UNKNOWN".',
    'If there are no follow-up questions, set "follow_up_questions" to [].',
    "Return JSON only and strictly follow this structure:",
    "{",
    '  "summary": "string",',
    '  "status": "ok | needs_attention | critical",',
    '  "confidence": 0.0,',
    '  "findings": [',
    "    {",
    '      "component": "string",',
    '      "issue": "string",',
    '      "severity": "low | medium | high",',
    '      "evidence": "string",',
    '      "action": "string"',
    "    }",
    "  ],",
    '  "follow_up_questions": ["string"]',
    "}",
    "",
    "Manual excerpts:",
    excerpts,
  ].join("\n");
}

function resolveChecklistContext(checkId: string): { item: string; lookingFor: string } {
  const sectionPrefix = checkId.charAt(0).toLowerCase();
  const numericPart = Number.parseInt(checkId.slice(1), 10);

  const sectionOffsets: Record<string, number> = {
    g: 0,
    e: 3,
    c: 6,
  };

  const sectionOffset = sectionOffsets[sectionPrefix];
  const index =
    typeof sectionOffset === "number" && Number.isFinite(numericPart) && numericPart > 0
      ? sectionOffset + (numericPart - 1)
      : -1;
  const entry = index >= 0 ? CAT325_CHECKLIST[index] : undefined;

  if (!entry) {
    return {
      item: "UNKNOWN",
      lookingFor: "UNKNOWN",
    };
  }

  return {
    item: entry.item,
    lookingFor: entry.looking_for.join(", "),
  };
}
