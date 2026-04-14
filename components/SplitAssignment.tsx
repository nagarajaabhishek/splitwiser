"use client";

import { ItemEnrichmentHint } from "@/components/ItemEnrichmentHint";
import type { AssignmentProposal, ItemAssignment, Member, NormalizedBillDraft } from "@/lib/schemas/bill";
import { calculateMemberTotals } from "@/lib/engine/calculator";

type SplitAssignmentProps = {
  draft: NormalizedBillDraft;
  members: Member[];
  assignments: ItemAssignment[];
  proposals: AssignmentProposal[];
  confirmedReviewItemIds: string[];
  onChangeAssignments: (next: ItemAssignment[]) => void;
  onConfirmReviewItem: (itemId: string) => void;
};

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

function setMode(
  assignment: ItemAssignment,
  mode: "single" | "equal" | "custom" | "percentage" | "shares" | "exact",
  members: Member[],
): ItemAssignment {
  if (mode === "single") {
    return updateSingle(assignment, assignment.memberIds[0] ?? members[0].id);
  }
  if (mode === "equal") {
    const ids = assignment.memberIds.length > 0 ? assignment.memberIds : [members[0].id];
    return {
      ...assignment,
      mode,
      memberIds: ids,
      memberWeights: ids.map((id) => ({ memberId: id, weight: 100 / ids.length })),
    };
  }
  if (mode === "exact") {
    const ids = assignment.memberIds.length > 0 ? assignment.memberIds : members.map((member) => member.id);
    return {
      ...assignment,
      mode,
      memberIds: ids,
      memberWeights: ids.map((id) => ({ memberId: id, weight: 0 })),
    };
  }
  const ids = assignment.memberIds.length > 0 ? assignment.memberIds : members.map((member) => member.id);
  const evenWeight = Number((100 / ids.length).toFixed(2));
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

function itemBreakdown(draft: NormalizedBillDraft, itemId: string, members: Member[], assignments: ItemAssignment[]) {
  const item = draft.items.find((entry) => entry.id === itemId);
  if (!item) return [];
  const totals = calculateMemberTotals({
    items: [item],
    assignments: assignments.filter((entry) => entry.itemId === itemId),
    members,
    taxCents: 0,
    expectedTotalCents: item.lineTotalCents,
  });
  return totals.memberTotals.filter((entry) => entry.subtotalCents > 0);
}

export function SplitAssignment({
  draft,
  members,
  assignments,
  proposals,
  confirmedReviewItemIds,
  onChangeAssignments,
  onConfirmReviewItem,
}: SplitAssignmentProps) {
  const totals = calculateMemberTotals({
    items: draft.items,
    assignments,
    members,
    taxCents: draft.taxCents,
    expectedTotalCents: draft.totalCents,
  });

  return (
    <section className="glass-card">
      <h2>Assign Items</h2>
      <p className="muted">Select split mode per item: single, equal, percentage, shares, exact amount, or custom.</p>
      <p className="muted" style={{ marginTop: "0.45rem" }}>
        Tax split by subtotal share, then cent reconciliation to exactly match bill total.
      </p>
      <div className="items-table">
        {draft.items.map((item) => {
          const assignment = assignments.find((entry) => entry.itemId === item.id);
          if (!assignment) return null;
          const breakdown = itemBreakdown(draft, item.id, members, assignments);
          const proposal = proposals.find((entry) => entry.itemId === item.id);
          const confirmed = confirmedReviewItemIds.includes(item.id);
          const unresolved = proposal?.needsReview && !confirmed;
          return (
            <article key={item.id} className="item-row">
              <div className="item-left">
                <p className="item-label">{item.label}</p>
                <ItemEnrichmentHint item={item} />
                <p className="muted">${(item.lineTotalCents / 100).toFixed(2)}</p>
                {proposal ? (
                  <>
                    <span className={unresolved ? "status-badge status-badge-warn" : "status-badge status-badge-ok"}>
                      {unresolved ? "Needs review" : "Auto-assigned"}
                    </span>
                    <p className="muted item-breakdown">
                      {`${Math.round(proposal.confidence * 100)}% · ${proposal.source}`}
                      {proposal.reason ? ` · ${proposal.reason}` : ""}
                    </p>
                  </>
                ) : null}
              </div>
              <div className="item-right">
                <details className="collapsible">
                  <summary>
                    <span className="summary-action">{`Edit split details ${assignment.mode ? `(${assignment.mode})` : ""}`}</span>
                  </summary>
                  <div className="chip-row" style={{ marginTop: "0.45rem" }}>
                    {(["single", "equal", "percentage", "shares", "exact", "custom"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        className={assignment.mode === mode ? "chip chip-active" : "chip"}
                        onClick={() =>
                          onChangeAssignments(
                            assignments.map((entry) =>
                              entry.itemId === item.id ? setMode(entry, mode, members) : entry,
                            ),
                          )
                        }
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                  <div className="chip-row" style={{ marginTop: "0.5rem" }}>
                    {members.map((member) => (
                      <button
                        key={member.id}
                        type="button"
                        className={assignment.memberIds.includes(member.id) ? "chip chip-active member-chip" : "chip member-chip"}
                        onClick={() =>
                          onChangeAssignments(
                            assignments.map((entry) => {
                              if (entry.itemId !== item.id) return entry;
                              if ((entry.mode ?? "single") === "single") return updateSingle(entry, member.id);
                              if ((entry.mode ?? "single") === "equal") return toggleEqual(entry, member.id);
                              return {
                                ...entry,
                                memberIds: entry.memberIds.includes(member.id)
                                  ? entry.memberIds
                                  : [...entry.memberIds, member.id],
                                memberWeights: entry.memberWeights ?? [{ memberId: member.id, weight: 0 }],
                              };
                            }),
                          )
                        }
                      >
                        {member.name}
                      </button>
                    ))}
                  </div>

                  {(assignment.mode ?? "single") === "custom" ||
                  (assignment.mode ?? "single") === "percentage" ||
                  (assignment.mode ?? "single") === "shares" ||
                  (assignment.mode ?? "single") === "exact" ? (
                    <div className="custom-grid">
                      {members
                        .filter((member) => assignment.memberIds.includes(member.id))
                        .map((member) => (
                          <label key={member.id} className="weight-input">
                            <span>{member.name} {(assignment.mode ?? "single") === "exact" ? "$" : "%"}</span>
                            <input
                              type="number"
                              min={0}
                              max={(assignment.mode ?? "single") === "exact" ? 1000000 : 100}
                              step={0.5}
                              value={
                                (assignment.mode ?? "single") === "exact"
                                  ? ((assignment.memberWeights?.find((entry) => entry.memberId === member.id)?.weight ?? 0) / 100).toFixed(2)
                                  : (assignment.memberWeights?.find((entry) => entry.memberId === member.id)?.weight ?? 0)
                              }
                              onChange={(event) =>
                                onChangeAssignments(
                                  assignments.map((entry) =>
                                    entry.itemId === item.id
                                      ? setCustomWeight(
                                          entry,
                                          member.id,
                                          (entry.mode ?? "single") === "exact"
                                            ? Math.round((Number(event.target.value) || 0) * 100)
                                            : Number(event.target.value),
                                        )
                                      : entry,
                                  ),
                                )
                              }
                            />
                          </label>
                        ))}
                    </div>
                  ) : null}
                </details>

                <p className="muted item-breakdown">
                  {breakdown
                    .map((entry) => {
                      const memberName = members.find((member) => member.id === entry.memberId)?.name ?? entry.memberId;
                      return `${memberName}: $${(entry.subtotalCents / 100).toFixed(2)}`;
                    })
                    .join(" | ")}
                </p>
                {proposal?.needsReview ? (
                  <button
                    type="button"
                    className={unresolved ? "chip chip-active review-toggle" : "chip review-toggle"}
                    style={{ marginTop: "0.4rem" }}
                    onClick={() => onConfirmReviewItem(item.id)}
                  >
                    {unresolved ? "Mark Reviewed" : "Reviewed (Undo)"}
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>

      <div className="summary-grid">
        {totals.memberTotals.map((total) => {
          const memberName = members.find((member) => member.id === total.memberId)?.name ?? total.memberId;
          return (
            <div key={total.memberId} className="summary-card">
              <h3>{memberName}</h3>
              <p>Subtotal: ${(total.subtotalCents / 100).toFixed(2)}</p>
              <p>Tax: ${(total.taxCents / 100).toFixed(2)}</p>
              <p className="muted">Tax share {draft.taxCents > 0 ? Math.round((total.taxCents / draft.taxCents) * 100) : 0}%</p>
              <p className="summary-total">Total: ${(total.totalCents / 100).toFixed(2)}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
