"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BillUpload } from "@/components/BillUpload";
import { SplitAssignment } from "@/components/SplitAssignment";
import { GroupSwitcher } from "@/components/GroupSwitcher";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import { normalizeLabel, runSplitAgent, type LearnedDefaultRecord } from "@/lib/engine/agent";
import type { AssignmentProposal, BillUploadResponse, ItemAssignment, Member, NormalizedBillDraft } from "@/lib/schemas/bill";

type HistoryBill = {
  id: string;
  merchantName: string;
  billDate: string;
  totalCents: number;
  status: string;
  memberBreakdown: Array<{ memberId: string; memberName: string; totalCents: number }>;
};

type GroupType = {
  id: string;
  name: string;
  members: Member[];
};

export default function Home() {
  const [groups, setGroups] = useState<GroupType[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [draft, setDraft] = useState<NormalizedBillDraft | null>(null);
  const [assignments, setAssignments] = useState<ItemAssignment[]>([]);
  const [learnedDefaults, setLearnedDefaults] = useState<LearnedDefaultRecord[]>([]);
  const [persistStatus, setPersistStatus] = useState<string>("");
  const [members, setMembers] = useState<Member[]>([]);
  const [householdId, setHouseholdId] = useState<string>("");
  const [history, setHistory] = useState<HistoryBill[]>([]);
  const [proposals, setProposals] = useState<AssignmentProposal[]>([]);
  const [confirmedReviewItemIds, setConfirmedReviewItemIds] = useState<string[]>([]);
  const [allowOverride, setAllowOverride] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [groupMessage, setGroupMessage] = useState("");
  const [agentObservability, setAgentObservability] = useState<{
    providerUsed: string;
    fallbackReason?: string;
    confidenceThreshold: number;
    unresolvedCount: number;
  } | null>(null);

  const result = useMemo(() => {
    if (!draft || members.length === 0) return null;
    return runSplitAgent({
      draft,
      members,
      learnedDefaults,
      manualAssignments: assignments,
    });
  }, [assignments, draft, learnedDefaults, members]);

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
    const bootstrap = async () => {
      await loadBootstrap();
    };
    void bootstrap();
  }, [loadBootstrap]);

  useEffect(() => {
    const fetchDefaults = async () => {
      if (members.length === 0) return;
      const params = new URLSearchParams();
      members.forEach((member) => params.append("memberId", member.id));
      const response = await fetch(`/api/learned-defaults?${params.toString()}`);
      const json = await response.json();
      setLearnedDefaults(json.entries ?? []);
    };
    void fetchDefaults();
  }, [members]);

  useEffect(() => {
    const fetchHistory = async () => {
      if (!householdId) return;
      const response = await fetch(`/api/bills/history?householdId=${householdId}`);
      const json = await response.json();
      setHistory(json.bills ?? []);
    };
    void fetchHistory();
  }, [householdId]);

  const handleParsed = (response: BillUploadResponse) => {
    setPersistStatus("");
    setIdempotencyKey(`fin-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
    setDraft(response.draft);
    setConfirmedReviewItemIds([]);
    const fetchSuggestions = async () => {
      const suggestResponse = await fetch("/api/agent/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: response.draft, members }),
      });
      if (!suggestResponse.ok) {
        const fallback = runSplitAgent({ draft: response.draft, members, learnedDefaults });
        setAssignments(fallback.assignments);
        setProposals(fallback.proposals);
        return;
      }
      const json = await suggestResponse.json();
      setAssignments(json.assignments ?? []);
      setProposals(json.proposals ?? []);
      setAgentObservability(json.observability ?? null);
    };
    void fetchSuggestions();
  };

  const updateDraftItem = (itemId: string, key: "label" | "lineTotalCents", value: string) => {
    if (!draft) return;
    const nextItems = draft.items.map((item) => {
      if (item.id !== itemId) return item;
      if (key === "label") {
        return {
          ...item,
          label: value,
          normalizedLabel: normalizeLabel(value || "item"),
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
    setDraft({
      ...draft,
      items: nextItems,
      subtotalCents,
      totalCents: subtotalCents + draft.taxCents,
    });
  };

  const updateDraftTop = (field: "merchantName" | "billDate" | "taxCents", value: string) => {
    if (!draft) return;
    if (field === "taxCents") {
      const taxCents = Math.max(0, Math.round((Number(value) || 0) * 100));
      setDraft({
        ...draft,
        taxCents,
        totalCents: draft.subtotalCents + taxCents,
      });
      return;
    }
    setDraft({ ...draft, [field]: value });
  };

  const persistDefaults = async () => {
    if (!result || !draft || !householdId || members.length === 0) return;
    const unresolved = proposals
      .filter((proposal) => proposal.needsReview && !confirmedReviewItemIds.includes(proposal.itemId))
      .map((proposal) => proposal.itemId);
    if (unresolved.length > 0 && !allowOverride) {
      setPersistStatus("Review required items before finalizing, or allow override.");
      return;
    }
    const response = await fetch("/api/bills/finalize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        householdId,
        draft,
        assignments,
        members,
        confirmedReviewItemIds,
        allowOverride,
        idempotencyKey,
      }),
    });
    if (!response.ok) {
      setPersistStatus("Could not finalize bill.");
      return;
    }
    setPersistStatus("Bill finalized and defaults learned.");
    const historyResponse = await fetch(`/api/bills/history?householdId=${householdId}`);
    const historyJson = await historyResponse.json();
    setHistory(historyJson.bills ?? []);
  };

  const createGroupHandler = (group: { id: string }) => {
    void loadBootstrap(group.id);
    setShowOnboarding(false);
    setDraft(null);
    setAssignments([]);
    setProposals([]);
    setHistory([]);
    setPersistStatus("");
    setGroupMessage("Group created.");
  };

  const updateGroup = async (groupId: string, payload: Record<string, unknown>) => {
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
  };

  const deleteGroupHandler = async (groupId: string) => {
    const response = await fetch(`/api/groups/${groupId}`, { method: "DELETE" });
    if (!response.ok) {
      const json = await response.json();
      setGroupMessage(json.error ?? "Failed to delete group");
      return;
    }
    await loadBootstrap();
    setDraft(null);
    setAssignments([]);
    setProposals([]);
    setGroupMessage("Group deleted.");
  };

  return (
    <main className="shell">
      <section className="chip-row" style={{ justifyContent: "flex-end", marginBottom: "1rem" }}>
        <Link href="/profile" className="chip">
          About Me
        </Link>
      </section>
      <section className="hero">
        <h1>Splitwiser AI</h1>
        <p>Upload receipts, assign items, and reconcile every member total down to the cent.</p>
      </section>

      {showOnboarding ? (
        <OnboardingWizard onCreated={createGroupHandler} onClose={groups.length > 0 ? () => setShowOnboarding(false) : undefined} />
      ) : null}

      {groups.length > 0 ? (
        <GroupSwitcher
          key={activeGroupId ?? "no-group"}
          groups={groups}
          activeGroupId={activeGroupId}
          onSelect={(groupId) => {
            void loadBootstrap(groupId);
            setDraft(null);
            setAssignments([]);
            setProposals([]);
            setPersistStatus("");
            setGroupMessage("");
          }}
          onOpenManager={() => setShowOnboarding(true)}
          onRename={(groupId, name) => void updateGroup(groupId, { name })}
          onAddMember={(groupId, memberName) => void updateGroup(groupId, { addMemberName: memberName })}
          onRemoveMember={(groupId, memberId) => void updateGroup(groupId, { removeMemberId: memberId })}
          onUpdateMemberProfile={(groupId, memberId, profile) =>
            void updateGroup(groupId, {
              updateMemberProfile: {
                memberId,
                dietaryStyle: profile.dietaryStyle ?? "",
                allergies: profile.allergies ?? [],
                exclusions: profile.exclusions ?? [],
              },
            })
          }
          onDeleteGroup={(groupId) => void deleteGroupHandler(groupId)}
          message={groupMessage}
        />
      ) : null}

      {!activeGroupId ? (
        <section className="glass-card" style={{ marginTop: "1rem" }}>
          <h2>Get Started</h2>
          <p className="muted">Create your first household/group to enable bill uploads and agentic splits.</p>
        </section>
      ) : null}

      {activeGroupId ? (
      <section className="grid">
        <BillUpload onParsed={handleParsed} />

        {draft ? (
          <section className="glass-card">
            <h2>{draft.merchantName}</h2>
            <p className="muted">Draft parsed from vision provider.</p>
            <div className="kpi-row">
              <div className="kpi-card">
                <p className="muted">Subtotal</p>
                <p>${(draft.subtotalCents / 100).toFixed(2)}</p>
              </div>
              <div className="kpi-card">
                <p className="muted">Tax</p>
                <p>${(draft.taxCents / 100).toFixed(2)}</p>
              </div>
              <div className="kpi-card">
                <p className="muted">Total</p>
                <p>${(draft.totalCents / 100).toFixed(2)}</p>
              </div>
            </div>
          </section>
        ) : (
          <section className="glass-card">
            <h2>No Active Bill</h2>
            <p className="muted">Upload any receipt image to start assignment and split calculation.</p>
          </section>
        )}
      </section>
      ) : null}

      {activeGroupId && draft ? (
        <section className="glass-card" style={{ marginTop: "1rem" }}>
          <h2>Edit Draft</h2>
          <p className="muted">Review OCR output before split assignment and finalization.</p>
          <div className="editor-grid">
            <label>
              Merchant
              <input
                className="text-input"
                value={draft.merchantName}
                onChange={(event) => updateDraftTop("merchantName", event.target.value)}
              />
            </label>
            <label>
              Bill Date
              <input
                className="text-input"
                type="datetime-local"
                value={draft.billDate.slice(0, 16)}
                onChange={(event) => updateDraftTop("billDate", new Date(event.target.value).toISOString())}
              />
            </label>
            <label>
              Tax ($)
              <input
                className="text-input"
                type="number"
                min={0}
                step={0.01}
                value={(draft.taxCents / 100).toFixed(2)}
                onChange={(event) => updateDraftTop("taxCents", event.target.value)}
              />
            </label>
          </div>
          <div className="items-table">
            {draft.items.map((item) => (
              <article key={item.id} className="item-row">
                <label className="item-edit">
                  Item Label
                  <input
                    className="text-input"
                    value={item.label}
                    onChange={(event) => updateDraftItem(item.id, "label", event.target.value)}
                  />
                </label>
                <label className="item-edit">
                  Amount ($)
                  <input
                    className="text-input"
                    type="number"
                    min={0}
                    step={0.01}
                    value={(item.lineTotalCents / 100).toFixed(2)}
                    onChange={(event) => updateDraftItem(item.id, "lineTotalCents", event.target.value)}
                  />
                </label>
              </article>
            ))}
          </div>
          {draft.items.some((item) => item.label.trim().length === 0) ? (
            <p className="error">Item labels cannot be empty.</p>
          ) : null}
        </section>
      ) : null}

      {activeGroupId && draft ? (
        <SplitAssignment
          draft={draft}
          members={members}
          assignments={assignments}
          proposals={proposals}
          confirmedReviewItemIds={confirmedReviewItemIds}
          onChangeAssignments={setAssignments}
          onConfirmReviewItem={(itemId) =>
            setConfirmedReviewItemIds((prev) => (prev.includes(itemId) ? prev : [...prev, itemId]))
          }
        />
      ) : null}

      {activeGroupId && result ? (
        <section className="glass-card" style={{ marginTop: "1rem" }}>
          <h2>Agent Output</h2>
          <p className="muted">
            Suggested assignments are blended with manual edits. Learned defaults will persist after final approval.
          </p>
          <div className="kpi-row">
            <div className="kpi-card">
              <p className="muted">Member Totals Sum</p>
              <p>${(result.totals.totalCents / 100).toFixed(2)}</p>
            </div>
            <div className="kpi-card">
              <p className="muted">Bill Total</p>
              <p>${((draft?.totalCents ?? 0) / 100).toFixed(2)}</p>
            </div>
            <div className="kpi-card">
              <p className="muted">Defaults Upserts</p>
              <p>{result.learnedDefaultsUpserts.length}</p>
            </div>
            <div className="kpi-card">
              <p className="muted">AI Provider</p>
              <p>{agentObservability?.providerUsed ?? "deterministic"}</p>
            </div>
            <div className="kpi-card">
              <p className="muted">Unresolved Reviews</p>
              <p>{agentObservability?.unresolvedCount ?? 0}</p>
            </div>
          </div>
          {agentObservability?.fallbackReason ? (
            <p className="muted" style={{ marginTop: "0.5rem" }}>
              Fallback reason: {agentObservability.fallbackReason}
            </p>
          ) : null}
          <button type="button" className="chip chip-active" style={{ marginTop: "1rem" }} onClick={persistDefaults}>
            Finalize & Learn
          </button>
          <label className="muted" style={{ display: "block", marginTop: "0.6rem" }}>
            <input type="checkbox" checked={allowOverride} onChange={(event) => setAllowOverride(event.target.checked)} />{" "}
            Allow finalize override for unresolved review items
          </label>
          {persistStatus ? <p className="muted" style={{ marginTop: "0.6rem" }}>{persistStatus}</p> : null}
        </section>
      ) : null}

      {activeGroupId ? <section className="glass-card" style={{ marginTop: "1rem" }}>
        <h2>Bill History</h2>
        <p className="muted">Persisted finalized bills from SQLite.</p>
        <div className="items-table" style={{ marginTop: "0.7rem" }}>
          {history.length === 0 ? (
            <p className="muted">No finalized bills yet.</p>
          ) : (
            history.map((bill) => (
              <article key={bill.id} className="item-row">
                <div>
                  <p className="item-label">
                    <Link href={`/bills/${bill.id}`}>{bill.merchantName}</Link>
                  </p>
                  <p className="muted">{new Date(bill.billDate).toLocaleDateString()}</p>
                </div>
                <div>
                  <p>${(bill.totalCents / 100).toFixed(2)}</p>
                  <p className="muted">{bill.memberBreakdown.map((m) => `${m.memberName}: $${(m.totalCents / 100).toFixed(2)}`).join(" | ")}</p>
                </div>
              </article>
            ))
          )}
        </div>
      </section> : null}
    </main>
  );
}
