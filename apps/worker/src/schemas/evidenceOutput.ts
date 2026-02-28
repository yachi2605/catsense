import { z } from "zod";

export const evidenceOutputSchema = z.array(
  z.object({
    item: z.string().min(1),
    evidence: z.array(z.string().min(1)).default([]),
  })
);

export type EvidenceOutput = z.infer<typeof evidenceOutputSchema>;

export const evidenceOutputGeminiSchema = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    required: ["item", "evidence"],
    properties: {
      item: { type: "STRING" },
      evidence: { type: "ARRAY", items: { type: "STRING" } }
    }
  }
} as const;