import { calculateMemberTotals } from "@/lib/engine/calculator";
import { routeAISuggestions } from "@/lib/ai/router";
import type {
  AssignmentProposal,
  ItemAssignment,
  Member,
  NormalizedBillDraft,
} from "@/lib/schemas/bill";

export type LearnedDefaultRecord = {
  memberId: string;
  normalizedLabel: string;
  confidence: number;
  uses: number;
};

export type SplitAgentResult = {
  assignments: ItemAssignment[];
  proposals: AssignmentProposal[];
  totals: ReturnType<typeof calculateMemberTotals>;
  learnedDefaultsUpserts: LearnedDefaultRecord[];
};

const CONFIDENCE_FLOOR = 0.6;

export function normalizeLabel(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ");
}

export function suggestAssignments(params: {
  draft: NormalizedBillDraft;
  members: Member[];
  learnedDefaults: LearnedDefaultRecord[];
}): AssignmentProposal[] {
  const { draft, members, learnedDefaults } = params;

  return draft.items.map((item) => {
    const defaultHit = learnedDefaults
      .filter((entry) => entry.normalizedLabel === item.normalizedLabel && entry.confidence >= CONFIDENCE_FLOOR)
      .sort((a, b) => b.confidence - a.confidence)[0];

    if (defaultHit) {
      return {
        itemId: item.id,
        suggestedMemberIds: [defaultHit.memberId],
        mode: "single",
        confidence: defaultHit.confidence,
        reason: "Learned default match",
        source: "deterministic",
        needsReview: false,
      };
    }

    return {
      itemId: item.id,
      suggestedMemberIds: members.length > 0 ? [members[0].id] : [],
      mode: "single",
      confidence: 0.2,
      reason: "No learned default, using first member fallback",
      source: "deterministic",
      needsReview: true,
    };
  });
}

export function buildLearnedDefaultsUpserts(
  draft: NormalizedBillDraft,
  assignments: ItemAssignment[],
): LearnedDefaultRecord[] {
  const itemMap = new Map(draft.items.map((item) => [item.id, item]));
  return assignments.flatMap((assignment) => {
    const item = itemMap.get(assignment.itemId);
    if (!item) {
      return [];
    }
    return assignment.memberIds.map((memberId) => ({
      memberId,
      normalizedLabel: item.normalizedLabel,
      confidence: 0.8,
      uses: 1,
    }));
  });
}

export function runSplitAgent(params: {
  draft: NormalizedBillDraft;
  members: Member[];
  learnedDefaults: LearnedDefaultRecord[];
  manualAssignments?: ItemAssignment[];
}): SplitAgentResult {
  const { draft, members, learnedDefaults, manualAssignments } = params;
  const proposals = suggestAssignments({ draft, members, learnedDefaults });

  const assignments =
    manualAssignments ??
    proposals.map((proposal) => ({
      itemId: proposal.itemId,
      memberIds: proposal.suggestedMemberIds.length > 0 ? proposal.suggestedMemberIds : [members[0]?.id].filter(Boolean),
      mode: "single" as const,
    }));

  const totals = calculateMemberTotals({
    items: draft.items,
    assignments,
    members,
    taxCents: draft.taxCents,
    expectedTotalCents: draft.totalCents,
  });

  return {
    assignments,
    proposals,
    totals,
    learnedDefaultsUpserts: buildLearnedDefaultsUpserts(draft, assignments),
  };
}

export async function runSplitAgentAutonomous(params: {
  draft: NormalizedBillDraft;
  members: Member[];
  learnedDefaults: LearnedDefaultRecord[];
  manualAssignments?: ItemAssignment[];
  confirmedReviewItemIds?: string[];
}): Promise<SplitAgentResult & { unresolvedReviewItemIds: string[] }> {
  const { draft, members, learnedDefaults, manualAssignments, confirmedReviewItemIds = [] } = params;
  const deterministic = suggestAssignments({ draft, members, learnedDefaults });
  const aiEnabled = (process.env.AI_ENABLED ?? "true") === "true";
  const threshold = Number(process.env.AI_CONFIDENCE_THRESHOLD ?? 0.8);

  let proposals: AssignmentProposal[] = deterministic;
  if (aiEnabled) {
    const { suggestions, source } = await routeAISuggestions({ draft, members });
    const aiByItem = new Map(suggestions.map((suggestion) => [suggestion.itemId, suggestion]));
    proposals = deterministic.map((base) => {
      const ai = aiByItem.get(base.itemId);
      if (!ai) {
        return { ...base, source: source === "fallback" ? "fallback" : "deterministic", needsReview: base.confidence < threshold };
      }
      return {
        itemId: base.itemId,
        suggestedMemberIds: ai.suggestedMemberIds?.length ? ai.suggestedMemberIds : base.suggestedMemberIds,
        mode: ai.mode ?? "single",
        memberWeights: ai.memberWeights,
        confidence: Math.max(0, Math.min(1, ai.confidence ?? base.confidence)),
        reason: ai.reason ?? "AI suggestion",
        source: source === "fallback" ? "fallback" : source,
        needsReview: (ai.confidence ?? 0) < threshold,
      };
    });
  }

  const unresolvedReviewItemIds = proposals
    .filter((proposal) => proposal.needsReview && !confirmedReviewItemIds.includes(proposal.itemId))
    .map((proposal) => proposal.itemId);

  const assignments =
    manualAssignments ??
    proposals.map((proposal) => ({
      itemId: proposal.itemId,
      memberIds: proposal.suggestedMemberIds.length > 0 ? proposal.suggestedMemberIds : [members[0]?.id].filter(Boolean),
      mode: proposal.mode ?? "single",
      memberWeights: proposal.memberWeights,
    }));

  const totals = calculateMemberTotals({
    items: draft.items,
    assignments,
    members,
    taxCents: draft.taxCents,
    expectedTotalCents: draft.totalCents,
  });

  return {
    assignments,
    proposals,
    totals,
    learnedDefaultsUpserts: buildLearnedDefaultsUpserts(draft, assignments),
    unresolvedReviewItemIds,
  };
}
