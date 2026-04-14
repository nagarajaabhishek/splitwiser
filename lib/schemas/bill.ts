import { z } from "zod";

export const itemEnrichmentSchema = z.object({
  source: z.enum(["none", "heuristic", "catalog", "ai"]).default("none"),
  catalogProvider: z.string().optional(),
  catalogProductName: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  needsReview: z.boolean().optional(),
  suggestedLabel: z.string().optional(),
});

export const normalizedBillItemSchema = z.object({
  id: z.string(),
  label: z.string().min(1),
  normalizedLabel: z.string().min(1),
  quantity: z.number().int().positive().default(1),
  unitPriceCents: z.number().int().nonnegative(),
  lineTotalCents: z.number().int().nonnegative(),
  /** Raw OCR / receipt text before enrichment (preserved for audit). */
  originalLabel: z.string().optional(),
  rawLineText: z.string().optional(),
  upc: z.string().nullable().optional(),
  itemCode: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  enrichment: itemEnrichmentSchema.optional(),
});

export const normalizedBillDraftSchema = z.object({
  merchantName: z.string().min(1),
  billDate: z.string().datetime(),
  currency: z.string().length(3).default("USD"),
  subtotalCents: z.number().int().nonnegative(),
  taxCents: z.number().int().nonnegative(),
  totalCents: z.number().int().nonnegative(),
  items: z.array(normalizedBillItemSchema).min(1),
}).superRefine((value, context) => {
  const itemsSubtotal = value.items.reduce((sum, item) => sum + item.lineTotalCents, 0);
  if (Math.abs(itemsSubtotal - value.subtotalCents) > 2) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Subtotal must match summed item totals.",
      path: ["subtotalCents"],
    });
  }
  if (Math.abs(value.subtotalCents + value.taxCents - value.totalCents) > 2) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Total must equal subtotal + tax.",
      path: ["totalCents"],
    });
  }
});

export const billUploadResponseSchema = z.object({
  source: z.string(),
  draft: normalizedBillDraftSchema,
});

export const billUploadBatchResultSchema = z.object({
  fileName: z.string(),
  source: z.string(),
  draft: normalizedBillDraftSchema,
  diagnostics: z
    .object({
      providerUsed: z.string(),
      fallbackReason: z.string().optional(),
      labelNormalization: z
        .object({
          providerUsed: z.string(),
          usedAI: z.boolean(),
          replacedCount: z.number().int().nonnegative(),
          confidenceThreshold: z.number(),
          fallbackReason: z.string().optional(),
          catalogMatches: z.number().int().nonnegative().optional(),
          nameReviewCount: z.number().int().nonnegative().optional(),
        })
        .optional(),
    })
    .optional(),
});

export const billUploadBatchFailureSchema = z.object({
  fileName: z.string(),
  code: z.string(),
  error: z.string(),
});

export const billUploadBatchResponseSchema = z.object({
  successes: z.array(billUploadBatchResultSchema),
  failures: z.array(billUploadBatchFailureSchema),
});

export const memberSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  dietaryStyle: z.string().optional().nullable(),
  allergies: z.preprocess((value) => value ?? [], z.array(z.string())),
  exclusions: z.preprocess((value) => value ?? [], z.array(z.string())),
});

export const itemAssignmentSchema = z.object({
  itemId: z.string(),
  memberIds: z.array(z.string()).min(1),
  mode: z.enum(["single", "equal", "custom", "exact", "percentage", "shares"]).default("single"),
  memberWeights: z
    .array(
      z.object({
        memberId: z.string(),
        weight: z.number().positive(),
      }),
    )
    .optional(),
  payerMemberIds: z.array(z.string()).optional(),
});

export const assignmentProposalSchema = z.object({
  itemId: z.string(),
  suggestedMemberIds: z.array(z.string()),
  mode: z.enum(["single", "equal", "custom", "exact", "percentage", "shares"]).default("single"),
  memberWeights: z
    .array(
      z.object({
        memberId: z.string(),
        weight: z.number().positive(),
      }),
    )
    .optional(),
  confidence: z.number().min(0).max(1),
  reason: z.string().default(""),
  source: z.enum(["deterministic", "openai", "gemini", "fallback"]).default("deterministic"),
  needsReview: z.boolean().default(false),
});

export type ItemEnrichment = z.infer<typeof itemEnrichmentSchema>;
export type NormalizedBillItem = z.infer<typeof normalizedBillItemSchema>;
export type NormalizedBillDraft = z.infer<typeof normalizedBillDraftSchema>;
export type BillUploadResponse = z.infer<typeof billUploadResponseSchema>;
export type BillUploadBatchResponse = z.infer<typeof billUploadBatchResponseSchema>;
export type Member = z.infer<typeof memberSchema>;
export type ItemAssignment = z.infer<typeof itemAssignmentSchema>;
export type AssignmentProposal = z.infer<typeof assignmentProposalSchema>;
