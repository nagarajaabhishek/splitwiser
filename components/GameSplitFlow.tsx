"use client";

import { useMemo, useState } from "react";
import { calculateMemberTotals } from "@/lib/engine/calculator";
import type { AssignmentProposal, ItemAssignment, Member, NormalizedBillDraft } from "@/lib/schemas/bill";

type GameSplitFlowProps = {
  draft: NormalizedBillDraft;
  members: Member[];
  assignments: ItemAssignment[];
  proposals: AssignmentProposal[];
  confirmedReviewItemIds: string[];
  onChangeAssignments: (next: ItemAssignment[]) => void;
  onConfirmReviewItem: (itemId: string) => void;
};

type SplitMode = "single" | "equal" | "custom";

function ensureAssignment(itemId: string, members: Member[], assignments: ItemAssignment[]): ItemAssignment {
  const existing = assignments.find((entry) => entry.itemId === itemId);
  if (existing) return existing;
  const firstMemberId = members[0]?.id ?? "";
  return {
    itemId,
    mode: "single",
    memberIds: firstMemberId ? [firstMemberId] : [],
    memberWeights: firstMemberId ? [{ memberId: firstMemberId, weight: 100 }] : [],
  };
}

function updateSingle(assignment: ItemAssignment, memberId: string): ItemAssignment {
  return {
    ...assignment,
    mode: "single",
    memberIds: [memberId],
    memberWeights: [{ memberId, weight: 100 }],
  };
}

function toggleEqual(assignment: ItemAssignment, memberId: string): ItemAssignment {
  const active = new Set(assignment.memberIds);
  if (active.has(memberId) && assignment.memberIds.length > 1) active.delete(memberId);
  else active.add(memberId);
  const nextIds = [...active];
  return {
    ...assignment,
    mode: "equal",
    memberIds: nextIds,
    memberWeights: nextIds.map((id) => ({ memberId: id, weight: 100 / nextIds.length })),
  };
}

function setMode(assignment: ItemAssignment, mode: SplitMode, members: Member[]): ItemAssignment {
  if (mode === "single") {
    return updateSingle(assignment, assignment.memberIds[0] ?? members[0]?.id ?? "");
  }
  if (mode === "equal") {
    const ids = assignment.memberIds.length > 0 ? assignment.memberIds : [members[0]?.id ?? ""].filter(Boolean);
    return {
      ...assignment,
      mode,
      memberIds: ids,
      memberWeights: ids.map((id) => ({ memberId: id, weight: 100 / ids.length })),
    };
  }
  const ids = assignment.memberIds.length > 0 ? assignment.memberIds : members.map((member) => member.id);
  const evenWeight = ids.length > 0 ? Number((100 / ids.length).toFixed(2)) : 100;
  return {
    ...assignment,
    mode,
    memberIds: ids,
    memberWeights: ids.map((id) => ({ memberId: id, weight: evenWeight })),
  };
}

function setCustomWeight(assignment: ItemAssignment, memberId: string, weight: number): ItemAssignment {
  const active = new Set(assignment.memberIds);
  active.add(memberId);
  const memberIds = [...active];
  const weights = memberIds.map((id) => ({
    memberId: id,
    weight:
      id === memberId
        ? Math.max(0, weight)
        : assignment.memberWeights?.find((entry) => entry.memberId === id)?.weight ?? 0,
  }));
  return { ...assignment, mode: "custom", memberIds, memberWeights: weights };
}

export function GameSplitFlow({
  draft,
  members,
  assignments,
  proposals,
  confirmedReviewItemIds,
  onChangeAssignments,
  onConfirmReviewItem,
}: GameSplitFlowProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showReport, setShowReport] = useState(false);

  const totalItems = draft.items.length;
  const currentItem = draft.items[currentIndex];
  const currentAssignment = currentItem
    ? ensureAssignment(currentItem.id, members, assignments)
    : null;

  const totals = useMemo(
    () =>
      calculateMemberTotals({
        items: draft.items,
        assignments,
        members,
        taxCents: draft.taxCents,
        expectedTotalCents: draft.totalCents,
      }),
    [assignments, draft.items, draft.taxCents, draft.totalCents, members],
  );

  const progress = totalItems > 0 ? ((currentIndex + 1) / totalItems) * 100 : 0;

  const proposal = currentItem ? proposals.find((entry) => entry.itemId === currentItem.id) : undefined;
  const confirmed = Boolean(currentItem && confirmedReviewItemIds.includes(currentItem.id));
  const unresolved = Boolean(proposal?.needsReview && currentItem && !confirmed);

  const customWeightTotal =
    (currentAssignment?.memberWeights ?? []).reduce((sum, entry) => sum + entry.weight, 0);

  const updateCurrentAssignment = (nextAssignment: ItemAssignment) => {
    if (!currentItem) return;
    const exists = assignments.some((entry) => entry.itemId === currentItem.id);
    if (exists) {
      onChangeAssignments(assignments.map((entry) => (entry.itemId === currentItem.id ? nextAssignment : entry)));
      return;
    }
    onChangeAssignments([...assignments, nextAssignment]);
  };

  const moveNext = () => {
    if (currentIndex >= totalItems - 1) {
      setShowReport(true);
      return;
    }
    setCurrentIndex((prev) => Math.min(totalItems - 1, prev + 1));
  };

  const moveBack = () => {
    setShowReport(false);
    setCurrentIndex((prev) => Math.max(0, prev - 1));
  };

  if (!currentItem || !currentAssignment) return null;

  return (
    <section className="glass-card section-gap game-shell">
      <h2>Game Mode Assignment</h2>
      <p className="muted">Pick owners one item at a time, then review the final scorecard.</p>

      <div className="game-progress-header">
        <p className="muted">
          Item {currentIndex + 1} of {totalItems}
        </p>
        <p className="item-label">${(currentItem.lineTotalCents / 100).toFixed(2)}</p>
      </div>
      <div className="game-progress-track">
        <span className="game-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      {!showReport ? (
        <>
          <article className="game-item-card">
            <p className="item-label">{currentItem.label}</p>
            {proposal ? (
              <p className="muted item-breakdown">
                {unresolved ? "Needs review" : "Auto-assigned"} · {Math.round(proposal.confidence * 100)}% · {proposal.source}
              </p>
            ) : null}
            {proposal?.needsReview ? (
              <button
                type="button"
                className={unresolved ? "chip chip-active review-toggle" : "chip review-toggle"}
                style={{ marginTop: "0.45rem" }}
                onClick={() => onConfirmReviewItem(currentItem.id)}
              >
                {unresolved ? "Mark Reviewed" : "Reviewed (Undo)"}
              </button>
            ) : null}
          </article>

          <div className="chip-row section-gap-tight">
            {(["single", "equal", "custom"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className={currentAssignment.mode === mode ? "chip chip-active" : "chip"}
                onClick={() => updateCurrentAssignment(setMode(currentAssignment, mode, members))}
              >
                {mode === "custom" ? "custom %" : mode}
              </button>
            ))}
          </div>

          <div className="game-member-grid section-gap-tight">
            {members.map((member) => {
              const selected = currentAssignment.memberIds.includes(member.id);
              return (
                <button
                  key={member.id}
                  type="button"
                  className={selected ? "game-member-card game-member-card-active" : "game-member-card"}
                  onClick={() => {
                    if ((currentAssignment.mode ?? "single") === "single") {
                      updateCurrentAssignment(updateSingle(currentAssignment, member.id));
                      return;
                    }
                    if ((currentAssignment.mode ?? "single") === "equal") {
                      updateCurrentAssignment(toggleEqual(currentAssignment, member.id));
                      return;
                    }
                    if (!selected) {
                      updateCurrentAssignment({
                        ...currentAssignment,
                        memberIds: [...currentAssignment.memberIds, member.id],
                        memberWeights: [...(currentAssignment.memberWeights ?? []), { memberId: member.id, weight: 0 }],
                      });
                    }
                  }}
                >
                  <span>{member.name}</span>
                  {(currentAssignment.mode ?? "single") === "custom" && selected ? (
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      className="text-input"
                      value={currentAssignment.memberWeights?.find((entry) => entry.memberId === member.id)?.weight ?? 0}
                      onChange={(event) => updateCurrentAssignment(setCustomWeight(currentAssignment, member.id, Number(event.target.value)))}
                      onClick={(event) => event.stopPropagation()}
                    />
                  ) : null}
                </button>
              );
            })}
          </div>

          {(currentAssignment.mode ?? "single") === "custom" ? (
            <p className={Math.abs(customWeightTotal - 100) > 0.5 ? "error" : "muted"} style={{ marginTop: "0.5rem" }}>
              Custom total: {customWeightTotal.toFixed(1)}% (must be close to 100%)
            </p>
          ) : null}
        </>
      ) : (
        <div className="section-gap-tight">
          <h3>Final Report</h3>
          <div className="summary-grid" style={{ marginTop: "0.5rem" }}>
            {totals.memberTotals.map((total) => {
              const memberName = members.find((member) => member.id === total.memberId)?.name ?? total.memberId;
              return (
                <div key={total.memberId} className="summary-card">
                  <h3>{memberName}</h3>
                  <p>Subtotal: ${(total.subtotalCents / 100).toFixed(2)}</p>
                  <p>Tax: ${(total.taxCents / 100).toFixed(2)}</p>
                  <p className="summary-total">Total: ${(total.totalCents / 100).toFixed(2)}</p>
                </div>
              );
            })}
          </div>

          <div className="items-table">
            {draft.items.map((item) => {
              const assignment = ensureAssignment(item.id, members, assignments);
              const itemProposal = proposals.find((entry) => entry.itemId === item.id);
              const itemUnresolved = itemProposal?.needsReview && !confirmedReviewItemIds.includes(item.id);
              const owners = assignment.memberIds
                .map((memberId) => members.find((member) => member.id === memberId)?.name ?? memberId)
                .join(", ");
              return (
                <article key={item.id} className="item-row">
                  <div>
                    <p className="item-label">{item.label}</p>
                    <p className="muted">
                      {assignment.mode ?? "single"} · {owners}
                    </p>
                    {itemProposal ? (
                      <p className="muted">
                        {itemUnresolved ? "Needs review" : "Reviewed"} · {Math.round(itemProposal.confidence * 100)}%
                      </p>
                    ) : null}
                  </div>
                  <p>${(item.lineTotalCents / 100).toFixed(2)}</p>
                </article>
              );
            })}
          </div>
        </div>
      )}

      <div className="chip-row section-gap-tight">
        <button type="button" className="chip" onClick={moveBack} disabled={currentIndex === 0 && !showReport}>
          Back
        </button>
        <button
          type="button"
          className="chip"
          onClick={() => setCurrentIndex((prev) => Math.min(totalItems - 1, prev + 1))}
          disabled={currentIndex >= totalItems - 1 || showReport}
        >
          Skip
        </button>
        <button type="button" className="chip chip-active" onClick={moveNext}>
          {currentIndex >= totalItems - 1 ? "Finish" : "Next"}
        </button>
      </div>
    </section>
  );
}
