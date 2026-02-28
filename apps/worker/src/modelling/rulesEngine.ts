export function classifyItem(evidence: string[]) {
  const text = evidence.join(" ").toLowerCase();

  if (
    text.includes("leak") ||
    text.includes("dripping") ||
    text.includes("crack") ||
    text.includes("broken") ||
    text.includes("missing") ||
    text.includes("loose bolt")
  ) {
    return "FAIL";
  }

  if (
    text.includes("wear") ||
    text.includes("minor") ||
    text.includes("debris") ||
    text.includes("partially blocked") ||
    text.includes("unknown")
  ) {
    return "MONITOR";
  }

  return "PASS";
}