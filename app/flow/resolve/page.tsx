"use client";

import { useRouter } from "next/navigation";
import { useFlow } from "@/lib/flow/context";

export default function ResolveStepPage() {
  const router = useRouter();
  const { proposals, confirmedReviewItemIds, confirmReviewItem, unresolvedReviewItemIds } = useFlow();

  const needsReview = proposals.filter((proposal) => proposal.needsReview);

  return (
    <section className="glass-card">
      <h2>Resolve Review Items</h2>
      <p className="muted">Confirm low-confidence assignments before finalization.</p>
      <div className="items-table">
        {needsReview.length === 0 ? (
          <p className="muted">No review items detected.</p>
        ) : (
          needsReview.map((proposal) => {
            const confirmed = confirmedReviewItemIds.includes(proposal.itemId);
            return (
              <article key={proposal.itemId} className="item-row">
                <div>
                  <p className="item-label">{proposal.itemId}</p>
                  <p className="muted">
                    {proposal.reason} · confidence {(proposal.confidence * 100).toFixed(0)}%
                  </p>
                </div>
                <button type="button" className={confirmed ? "chip chip-active" : "chip"} onClick={() => confirmReviewItem(proposal.itemId)}>
                  {confirmed ? "Reviewed" : "Mark Reviewed"}
                </button>
              </article>
            );
          })
        )}
      </div>
      <p className="muted" style={{ marginTop: "0.8rem" }}>
        Remaining unresolved items: {unresolvedReviewItemIds.length}
      </p>
      <div className="chip-row" style={{ marginTop: "0.8rem" }}>
        <button type="button" className="chip chip-active" onClick={() => router.push("/flow/decision")}>
          Continue to Decision
        </button>
      </div>
    </section>
  );
}
