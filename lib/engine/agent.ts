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
const DIETARY_PENALTY = 0.35;

export function normalizeLabel(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ");
}

function getDietaryConflict(member: Member | undefined, normalizedLabel: string): string[] {
  if (!member) return [];

  const conflicts: string[] = [];
  const style = (member.dietaryStyle ?? "").toLowerCase();
  const blockedByStyle: Record<string, string[]> = {
    vegetarian: ["chicken", "beef", "pork", "fish", "shrimp", "meat", "bacon"],
    vegan: ["chicken", "beef", "pork", "fish", "shrimp", "meat", "egg", "milk", "cheese", "butter", "yogurt", "honey"],
    pescatarian: ["chicken", "beef", "pork", "meat", "bacon"],
    halal: ["pork", "bacon", "ham"],
    kosher: ["pork", "bacon", "shellfish", "shrimp"],
  };
  for (const token of blockedByStyle[style] ?? []) {
    if (normalizedLabel.includes(token)) {
      conflicts.push(`dietary style (${style}) conflict: ${token}`);
      break;
    }
  }

  for (const token of member.allergies ?? []) {
    if (normalizedLabel.includes(token.toLowerCase())) {
      conflicts.push(`allergy conflict: ${token}`);
      break;
    }
  }
  for (const token of member.exclusions ?? []) {
    if (normalizedLabel.includes(token.toLowerCase())) {
      conflicts.push(`exclusion conflict: ${token}`);
      break;
    }
  }

  return conflicts;
}

function applyDietaryPenaltyToProposal(
  proposal: AssignmentProposal,
  item: NormalizedBillDraft["items"][number],
  members: Member[],
): AssignmentProposal {
  const targetMember = members.find((member) => member.id === proposal.suggestedMemberIds[0]);
  const conflicts = getDietaryConflict(targetMember, item.normalizedLabel);
  if (conflicts.length === 0) return proposal;
  const confidence = Math.max(0, proposal.confidence - DIETARY_PENALTY);
  const extraReason = `confidence reduced due to dietary mismatch risk (${conflicts.join(", ")})`;
  return {
    ...proposal,
    confidence,
    reason: proposal.reason ? `${proposal.reason}; ${extraReason}` : extraReason,
    needsReview: proposal.needsReview || confidence < Number(process.env.AI_CONFIDENCE_THRESHOLD ?? 0.8),
  };
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
      const proposal: AssignmentProposal = {
        itemId: item.id,
        suggestedMemberIds: [defaultHit.memberId],
        mode: "single",
        confidence: defaultHit.confidence,
        reason: "Learned default match",
        source: "deterministic",
        needsReview: false,
      };
      return applyDietaryPenaltyToProposal(proposal, item, members);
    }

    const proposal: AssignmentProposal = {
      itemId: item.id,
      suggestedMemberIds: members.length > 0 ? [members[0].id] : [],
      mode: "single",
      confidence: 0.2,
      reason: "No learned default, using first member fallback",
      source: "deterministic",
      needsReview: true,
    };
    return applyDietaryPenaltyToProposal(proposal, item, members);
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
  historyCount?: number;
}): Promise<
  SplitAgentResult & {
    unresolvedReviewItemIds: string[];
    observability: {
      providerUsed: "openai" | "gemini" | "fallback" | "deterministic";
      fallbackReason?: string;
      confidenceThreshold: number;
      unresolvedCount: number;
      historyCount: number;
      minHistoryRequired: number;
      aiEligible: boolean;
      aiHiddenReason?: string;
    };
  }
> {
  const { draft, members, learnedDefaults, manualAssignments, confirmedReviewItemIds = [], historyCount = 0 } = params;
  const deterministic = suggestAssignments({ draft, members, learnedDefaults });
  const aiEnabled = (process.env.AI_ENABLED ?? "true") === "true";
  const threshold = Number(process.env.AI_CONFIDENCE_THRESHOLD ?? 0.8);
  const minHistoryRequired = Math.max(1, Number(process.env.AI_MIN_HISTORY_ORDERS ?? 12));
  const hasEnoughHistory = historyCount >= minHistoryRequired;
  const hasMemberContext = members.every(
    (member) =>
      (member.dietaryStyle?.trim().length ?? 0) > 0 ||
      (member.allergies?.length ?? 0) > 0 ||
      (member.exclusions?.length ?? 0) > 0,
  );
  const aiEligible = aiEnabled && hasEnoughHistory && hasMemberContext;
  let aiHiddenReason: string | undefined;
  if (!aiEnabled) aiHiddenReason = "AI is disabled in configuration.";
  else if (!hasEnoughHistory) aiHiddenReason = `Need at least ${minHistoryRequired} past orders before AI suggestions are shown.`;
  else if (!hasMemberContext) aiHiddenReason = "Add dietary style, allergies, or exclusions for each member to unlock AI suggestions.";

  let proposals: AssignmentProposal[] = deterministic;
  let providerUsed: "openai" | "gemini" | "fallback" | "deterministic" = "deterministic";
  let fallbackReason: string | undefined;
  if (aiEligible) {
    const routed = await routeAISuggestions({ draft, members });
    const { suggestions, source } = routed;
    providerUsed = source;
    fallbackReason = routed.fallbackReason;
    const aiByItem = new Map(suggestions.map((suggestion) => [suggestion.itemId, suggestion]));
    proposals = deterministic.map((base) => {
      const item = draft.items.find((entry) => entry.id === base.itemId);
      const ai = aiByItem.get(base.itemId);
      if (!ai) {
        const proposal: AssignmentProposal = {
          ...base,
          source: source === "fallback" ? "fallback" : "deterministic",
          needsReview: base.confidence < threshold,
        };
        return item ? applyDietaryPenaltyToProposal(proposal, item, members) : proposal;
      }
      const proposal: AssignmentProposal = {
        itemId: base.itemId,
        suggestedMemberIds: ai.suggestedMemberIds?.length ? ai.suggestedMemberIds : base.suggestedMemberIds,
        mode: ai.mode ?? "single",
        memberWeights: ai.memberWeights,
        confidence: Math.max(0, Math.min(1, ai.confidence ?? base.confidence)),
        reason: ai.reason ?? "AI suggestion",
        source: source === "fallback" ? "fallback" : source,
        needsReview: (ai.confidence ?? 0) < threshold,
      };
      return item ? applyDietaryPenaltyToProposal(proposal, item, members) : proposal;
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
    observability: {
      providerUsed,
      fallbackReason,
      confidenceThreshold: threshold,
      unresolvedCount: unresolvedReviewItemIds.length,
      historyCount,
      minHistoryRequired,
      aiEligible,
      aiHiddenReason,
    },
  };
}
