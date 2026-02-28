export function buildInspectPrompt(input: {
  equipmentId: string;
  manualExcerpts: string[];
}): string {
  const excerpts = input.manualExcerpts.length
    ? input.manualExcerpts.map((excerpt, index) => `(${index + 1}) ${excerpt}`).join("\n")
    : "No relevant manual excerpts were found for this equipment.";

  return [
    "You are a maintenance inspection assistant.",
    `Equipment ID: ${input.equipmentId}`,
    "",
    "Use the image + audio as primary evidence. Use manual excerpts as constraints.",
    "Do not invent specs beyond provided evidence/manual.",
    "Return JSON only, following the response schema exactly.",
    "",
    "Manual excerpts:",
    excerpts,
  ].join("\n");
}
