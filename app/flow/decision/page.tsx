"use client";

import { useRouter } from "next/navigation";
import { useFlow } from "@/lib/flow/context";

export default function DecisionStepPage() {
  const router = useRouter();
  const { result, draft, unresolvedReviewItemIds, splitLaterBillId, allowOverride, setAllowOverride, saveSplitLater, finalizeBill, persistStatus } =
    useFlow();

  if (!result || !draft) {
    return (
      <section className="glass-card">
        <h2>No Active Split</h2>
        <p className="muted">Complete previous steps before finalization.</p>
      </section>
    );
  }

  return (
    <section className="glass-card">
      <h2>Finalize or Split Later</h2>
      <p className="muted">Member total sum ${(result.totals.totalCents / 100).toFixed(2)} · Bill total ${(draft.totalCents / 100).toFixed(2)}</p>
      <p className="muted">Unresolved review items: {unresolvedReviewItemIds.length}</p>
      <div className="chip-row" style={{ marginTop: "1rem" }}>
        <button
          type="button"
          className="chip chip-active"
          onClick={async () => {
            const billId = await finalizeBill();
            if (billId) router.push(`/flow/result/${billId}`);
          }}
        >
          {splitLaterBillId ? "Finalize Saved Bill" : "Finalize"}
        </button>
        <button
          type="button"
          className="chip"
          onClick={async () => {
            const billId = await saveSplitLater();
            if (billId) router.push("/");
          }}
        >
          Split Later
        </button>
      </div>
      {!splitLaterBillId ? (
        <label className="muted" style={{ display: "block", marginTop: "0.7rem" }}>
          <input type="checkbox" checked={allowOverride} onChange={(event) => setAllowOverride(event.target.checked)} /> Allow finalize override for
          unresolved review items
        </label>
      ) : (
        <p className="muted" style={{ marginTop: "0.7rem" }}>
          Reopened split-later bills require unresolved items to be reviewed.
        </p>
      )}
      {persistStatus ? <p className="muted" style={{ marginTop: "0.7rem" }}>{persistStatus}</p> : null}
    </section>
  );
}
