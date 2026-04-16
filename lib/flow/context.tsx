"use client";

/* eslint-disable react-hooks/set-state-in-effect -- sessionStorage hydration and client bootstrap fetch on mount */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { normalizeLabel, runSplitAgent, type LearnedDefaultRecord } from "@/lib/engine/agent";
import type { AssignmentProposal, BillUploadResponse, ItemAssignment, Member, NormalizedBillDraft } from "@/lib/schemas/bill";

type HistoryBill = {
  id: string;
  merchantName: string;
  billDate: string;
  totalCents: number;
  status: string;
  category?: string | null;
  memberBreakdown: Array<{ memberId: string; memberName: string; totalCents: number }>;
};

type GroupType = {
  id: string;
  name: string;
  members: Member[];
};

type AgentObservability = {
  providerUsed: string;
  fallbackReason?: string;
  confidenceThreshold: number;
  unresolvedCount: number;
  historyCount: number;
  minHistoryRequired: number;
  aiEligible: boolean;
  aiHiddenReason?: string;
} | null;

type PersistedFlowState = {
  draft: NormalizedBillDraft | null;
  assignments: ItemAssignment[];
  proposals: AssignmentProposal[];
  confirmedReviewItemIds: string[];
  splitLaterBillId: string | null;
  allowOverride: boolean;
  idempotencyKey: string;
  agentObservability: AgentObservability;
};

type FlowContextValue = {
  groups: GroupType[];
  activeGroupId: string | null;
  members: Member[];
  householdId: string;
  history: HistoryBill[];
  showOnboarding: boolean;
  setShowOnboarding: (value: boolean) => void;
  groupMessage: string;
  persistStatus: string;
  draft: NormalizedBillDraft | null;
  assignments: ItemAssignment[];
  proposals: AssignmentProposal[];
  confirmedReviewItemIds: string[];
  allowOverride: boolean;
  setAllowOverride: (value: boolean) => void;
  splitLaterBillId: string | null;
  agentObservability: AgentObservability;
  result: ReturnType<typeof runSplitAgent> | null;
  unresolvedReviewItemIds: string[];
  loadBootstrap: (groupId?: string) => Promise<void>;
  createGroupHandler: (group: { id: string }) => void;
  updateGroup: (groupId: string, payload: Record<string, unknown>) => Promise<void>;
  deleteGroupHandler: (groupId: string) => Promise<void>;
  refreshHistory: () => Promise<void>;
  handleParsed: (response: BillUploadResponse) => void;
  updateDraftTop: (field: "merchantName" | "billDate" | "taxCents", value: string) => void;
  updateDraftItem: (itemId: string, key: "label" | "lineTotalCents", value: string) => void;
  fetchSuggestionsForCurrentDraft: () => Promise<void>;
  setAssignments: (assignments: ItemAssignment[]) => void;
  confirmReviewItem: (itemId: string) => void;
  saveSplitLater: () => Promise<string | null>;
  reopenSplitLater: (billId: string) => Promise<boolean>;
  finalizeBill: () => Promise<string | null>;
  clearFlowDraft: () => void;
};

const FlowContext = createContext<FlowContextValue | null>(null);
const SESSION_KEY = "splitwiser-flow-state-v1";

function randomKey(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function FlowProvider({ children }: { children: React.ReactNode }) {
  const [groups, setGroups] = useState<GroupType[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [householdId, setHouseholdId] = useState("");
  const [history, setHistory] = useState<HistoryBill[]>([]);
  const [learnedDefaults, setLearnedDefaults] = useState<LearnedDefaultRecord[]>([]);
  const [groupMessage, setGroupMessage] = useState("");
  const [persistStatus, setPersistStatus] = useState("");

  const [draft, setDraft] = useState<NormalizedBillDraft | null>(null);
  const [assignments, setAssignmentsState] = useState<ItemAssignment[]>([]);
  const [proposals, setProposals] = useState<AssignmentProposal[]>([]);
  const [confirmedReviewItemIds, setConfirmedReviewItemIds] = useState<string[]>([]);
  const [allowOverride, setAllowOverride] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [splitLaterBillId, setSplitLaterBillId] = useState<string | null>(null);
  const [agentObservability, setAgentObservability] = useState<AgentObservability>(null);

  const result = useMemo(() => {
    if (!draft || members.length === 0) return null;
    return runSplitAgent({
      draft,
      members,
      learnedDefaults,
      manualAssignments: assignments,
    });
  }, [assignments, draft, learnedDefaults, members]);

  const unresolvedReviewItemIds = useMemo(
    () => proposals.filter((proposal) => proposal.needsReview && !confirmedReviewItemIds.includes(proposal.itemId)).map((proposal) => proposal.itemId),
    [confirmedReviewItemIds, proposals],
  );

  const refreshHistory = useCallback(async () => {
    if (!householdId) return;
    const response = await fetch(`/api/bills/history?householdId=${householdId}`);
    const json = await response.json();
    setHistory(json.bills ?? []);
  }, [householdId]);

  const refreshLearnedDefaults = useCallback(async () => {
    if (members.length === 0) return;
    const params = new URLSearchParams();
    members.forEach((member) => params.append("memberId", member.id));
    const response = await fetch(`/api/learned-defaults?${params.toString()}`);
    const json = await response.json();
    setLearnedDefaults(json.entries ?? []);
  }, [members]);

  const loadBootstrap = useCallback(async (groupId?: string) => {
    const params = groupId ? `?activeGroupId=${groupId}` : "";
    const response = await fetch(`/api/bootstrap${params}`);
    const json = await response.json();
    setGroups(json.groups ?? []);
    setShowOnboarding(Boolean(json.needsOnboarding));
    setActiveGroupId(json.activeGroupId ?? null);
    setMembers(json.members ?? []);
    setHouseholdId(json.activeGroupId ?? "");
  }, []);

  useEffect(() => {
    void loadBootstrap();
  }, [loadBootstrap]);

  useEffect(() => {
    void refreshLearnedDefaults();
  }, [refreshLearnedDefaults]);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  useEffect(() => {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as PersistedFlowState;
      setDraft(parsed.draft ?? null);
      setAssignmentsState(parsed.assignments ?? []);
      setProposals(parsed.proposals ?? []);
      setConfirmedReviewItemIds(parsed.confirmedReviewItemIds ?? []);
      setSplitLaterBillId(parsed.splitLaterBillId ?? null);
      setAllowOverride(parsed.allowOverride ?? false);
      setIdempotencyKey(parsed.idempotencyKey ?? randomKey("fin"));
      setAgentObservability(parsed.agentObservability ?? null);
    } catch {
      // Ignore malformed persisted state.
    }
  }, []);

  useEffect(() => {
    const payload: PersistedFlowState = {
      draft,
      assignments,
      proposals,
      confirmedReviewItemIds,
      splitLaterBillId,
      allowOverride,
      idempotencyKey,
      agentObservability,
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  }, [allowOverride, assignments, confirmedReviewItemIds, draft, idempotencyKey, proposals, splitLaterBillId, agentObservability]);

  const fetchSuggestionsForCurrentDraft = useCallback(async () => {
    if (!draft || members.length === 0) return;
    const suggestResponse = await fetch("/api/agent/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft, members, historyCount: history.length }),
    });
    if (!suggestResponse.ok) {
      const fallback = runSplitAgent({ draft, members, learnedDefaults });
      setAssignmentsState(fallback.assignments);
      setProposals(fallback.proposals);
      setAgentObservability(null);
      return;
    }
    const json = await suggestResponse.json();
    setAssignmentsState(json.assignments ?? []);
    setProposals(json.proposals ?? []);
    setAgentObservability(json.observability ?? null);
  }, [draft, history.length, learnedDefaults, members]);

  const handleParsed = useCallback(
    (response: BillUploadResponse) => {
      setPersistStatus("");
      setIdempotencyKey(randomKey("fin"));
      setSplitLaterBillId(null);
      setDraft(response.draft);
      setConfirmedReviewItemIds([]);
      setProposals([]);
      setAssignmentsState([]);
    },
    [],
  );

  const updateDraftTop = useCallback((field: "merchantName" | "billDate" | "taxCents", value: string) => {
    setDraft((prev) => {
      if (!prev) return prev;
      if (field === "taxCents") {
        const taxCents = Math.max(0, Math.round((Number(value) || 0) * 100));
        return {
          ...prev,
          taxCents,
          totalCents: prev.subtotalCents + taxCents,
        };
      }
      return { ...prev, [field]: value };
    });
  }, []);

  const updateDraftItem = useCallback((itemId: string, key: "label" | "lineTotalCents", value: string) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const nextItems = prev.items.map((item) => {
        if (item.id !== itemId) return item;
        if (key === "label") {
          const previousDisplay = item.label;
          return {
            ...item,
            label: value,
            normalizedLabel: normalizeLabel(value || "item"),
            originalLabel: item.originalLabel ?? previousDisplay,
            enrichment: item.enrichment
              ? { ...item.enrichment, source: "none" as const, needsReview: false, confidence: 1, suggestedLabel: value }
              : { source: "none" as const, needsReview: false, confidence: 1, suggestedLabel: value },
          };
        }
        const cents = Math.max(0, Math.round((Number(value) || 0) * 100));
        return {
          ...item,
          unitPriceCents: cents,
          lineTotalCents: cents,
        };
      });
      const subtotalCents = nextItems.reduce((sum, item) => sum + item.lineTotalCents, 0);
      return {
        ...prev,
        items: nextItems,
        subtotalCents,
        totalCents: subtotalCents + prev.taxCents,
      };
    });
  }, []);

  const setAssignments = useCallback((next: ItemAssignment[]) => {
    setAssignmentsState(next);
  }, []);

  const confirmReviewItem = useCallback((itemId: string) => {
    setConfirmedReviewItemIds((prev) => (prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]));
  }, []);

  const saveSplitLater = useCallback(async () => {
    if (!draft || !householdId) return null;
    const response = await fetch("/api/bills/split-later", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ householdId, draft, assignments }),
    });
    const json = await response.json();
    if (!response.ok) {
      setPersistStatus(json.error ?? "Could not save for later.");
      return null;
    }
    setSplitLaterBillId(json.bill?.id ?? null);
    setPersistStatus("Saved for later.");
    await refreshHistory();
    return json.bill?.id ?? null;
  }, [assignments, draft, householdId, refreshHistory]);

  const reopenSplitLater = useCallback(
    async (billId: string) => {
      const response = await fetch(`/api/bills/${billId}/split-later`);
      const json = await response.json();
      if (!response.ok) {
        setPersistStatus(json.error ?? "Could not reopen split-later bill.");
        return false;
      }
      setDraft(json.draft ?? null);
      setMembers(json.members ?? []);
      setAssignmentsState(json.assignments ?? []);
      setProposals(json.proposals ?? []);
      setConfirmedReviewItemIds([]);
      setAgentObservability(json.observability ?? null);
      setSplitLaterBillId(billId);
      setPersistStatus("Draft reopened.");
      return true;
    },
    [],
  );

  const finalizeBill = useCallback(async () => {
    if (!result || !draft || !householdId || members.length === 0) return null;
    const response = await fetch("/api/bills/finalize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        householdId,
        sourceBillId: splitLaterBillId ?? undefined,
        draft,
        assignments,
        members,
        confirmedReviewItemIds,
        allowOverride,
        idempotencyKey,
      }),
    });
    const json = await response.json();
    if (!response.ok) {
      setPersistStatus(json.error ?? "Could not finalize bill.");
      return null;
    }
    setPersistStatus("Bill finalized.");
    setSplitLaterBillId(null);
    await refreshHistory();
    return json.bill?.id ?? null;
  }, [
    allowOverride,
    assignments,
    confirmedReviewItemIds,
    draft,
    householdId,
    idempotencyKey,
    members,
    refreshHistory,
    result,
    splitLaterBillId,
  ]);

  const updateGroup = useCallback(
    async (groupId: string, payload: Record<string, unknown>) => {
      const response = await fetch(`/api/groups/${groupId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json();
      if (!response.ok) {
        setGroupMessage(json.error ?? "Failed to update group");
        return;
      }
      setGroupMessage("Group updated.");
      await loadBootstrap(activeGroupId ?? groupId);
    },
    [activeGroupId, loadBootstrap],
  );

  const clearFlowDraft = useCallback(() => {
    setDraft(null);
    setAssignmentsState([]);
    setProposals([]);
    setConfirmedReviewItemIds([]);
    setSplitLaterBillId(null);
    setPersistStatus("");
    setAgentObservability(null);
    setAllowOverride(false);
    setIdempotencyKey(randomKey("fin"));
  }, []);

  const deleteGroupHandler = useCallback(
    async (groupId: string) => {
      const response = await fetch(`/api/groups/${groupId}`, { method: "DELETE" });
      if (!response.ok) {
        const json = await response.json();
        setGroupMessage(json.error ?? "Failed to delete group");
        return;
      }
      await loadBootstrap();
      clearFlowDraft();
      setGroupMessage("Group deleted.");
    },
    [loadBootstrap, clearFlowDraft],
  );

  const createGroupHandler = useCallback(
    (group: { id: string }) => {
      void loadBootstrap(group.id);
      setShowOnboarding(false);
      clearFlowDraft();
      setHistory([]);
      setPersistStatus("");
      setGroupMessage("Group created.");
    },
    [loadBootstrap, clearFlowDraft],
  );

  const value: FlowContextValue = {
    groups,
    activeGroupId,
    members,
    householdId,
    history,
    showOnboarding,
    setShowOnboarding,
    groupMessage,
    persistStatus,
    draft,
    assignments,
    proposals,
    confirmedReviewItemIds,
    allowOverride,
    setAllowOverride,
    splitLaterBillId,
    agentObservability,
    result,
    unresolvedReviewItemIds,
    loadBootstrap,
    createGroupHandler,
    updateGroup,
    deleteGroupHandler,
    refreshHistory,
    handleParsed,
    updateDraftTop,
    updateDraftItem,
    fetchSuggestionsForCurrentDraft,
    setAssignments,
    confirmReviewItem,
    saveSplitLater,
    reopenSplitLater,
    finalizeBill,
    clearFlowDraft,
  };

  return <FlowContext.Provider value={value}>{children}</FlowContext.Provider>;
}

export function useFlow() {
  const context = useContext(FlowContext);
  if (!context) {
    throw new Error("useFlow must be used inside FlowProvider.");
  }
  return context;
}
