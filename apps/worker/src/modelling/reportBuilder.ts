import { classifyItem } from "./rulesEngine";
import {
  EvidenceItem,
  InspectionReport,
  InspectionItemResult,
} from "./types";

export function buildInspectionReport(
  evidenceResults: EvidenceItem[]
): InspectionReport {
  let overall: "PASS" | "MONITOR" | "FAIL" = "PASS";

  const items: InspectionItemResult[] = evidenceResults.map((result) => {
    const status = classifyItem(result.evidence);

    if (status === "FAIL") overall = "FAIL";
    else if (status === "MONITOR" && overall !== "FAIL")
      overall = "MONITOR";

    return {
      item: result.item,
      evidence: result.evidence,
      status,
    };
  });

  return {
    machine: { model: "CAT 325" },
    overall_status: overall,
    items,
  };
}