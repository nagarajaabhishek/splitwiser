import type { AssignmentProposal, Member, NormalizedBillDraft } from "@/lib/schemas/bill";

export type AIProviderName = "openai" | "gemini";

export type AISuggestion = Pick<
  AssignmentProposal,
  "itemId" | "suggestedMemberIds" | "mode" | "memberWeights" | "confidence" | "reason"
>;

export interface AIProvider {
  readonly name: AIProviderName;
  suggestAssignments(input: {
    draft: NormalizedBillDraft;
    members: Member[];
  }): Promise<AISuggestion[]>;
}
