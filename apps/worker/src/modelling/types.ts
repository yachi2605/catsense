export type InspectionStatus = "PASS" | "MONITOR" | "FAIL";

export interface EvidenceItem {
  item: string;
  evidence: string[];
}

export interface InspectionItemResult {
  item: string;
  evidence: string[];
  status: InspectionStatus;
}

export interface InspectionReport {
  machine: { model: string };
  overall_status: InspectionStatus;
  items: InspectionItemResult[];
}