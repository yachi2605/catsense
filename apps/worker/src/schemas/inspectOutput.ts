import { z } from "zod";
export const inspectOutputSchema = z.object({
  summary: z.string().min(1),
  status: z.enum(["ok", "needs_attention", "critical"]),
  confidence: z.number().min(0).max(1),
  findings: z.array(
    z.object({
      component: z.string().min(1),
      issue: z.string().min(1),
      severity: z.enum(["low", "medium", "high"]),
      evidence: z.string().min(1),
      action: z.string().min(1),
    }),
  ),
  follow_up_questions: z.array(z.string().min(1)).max(5),
});

export type InspectOutput = z.infer<typeof inspectOutputSchema>;

export const inspectOutputGeminiSchema = {
  type: "OBJECT",
  required: ["summary", "status", "confidence", "findings", "follow_up_questions"],
  properties: {
    summary: { type: "STRING" },
    status: { type: "STRING", enum: ["ok", "needs_attention", "critical"] },
    confidence: { type: "NUMBER" },
    findings: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        required: ["component", "issue", "severity", "evidence", "action"],
        properties: {
          component: { type: "STRING" },
          issue: { type: "STRING" },
          severity: { type: "STRING", enum: ["low", "medium", "high"] },
          evidence: { type: "STRING" },
          action: { type: "STRING" },
        },
      },
    },
    follow_up_questions: {
      type: "ARRAY",
      items: { type: "STRING" },
    },
  },
} as const;
