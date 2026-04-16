"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SplitAssignment } from "@/components/SplitAssignment";
import { useFlow } from "@/lib/flow/context";

function SuggestStepContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    draft,
    members,
    assignments,
    proposals,
    confirmedReviewItemIds,
    setAssignments,
    confirmReviewItem,
    fetchSuggestionsForCurrentDraft,
    reopenSplitLater,
    persistStatus,
    agentObservability,
  } = useFlow();
  const showAiSuggestions = Boolean(agentObservability?.aiEligible);

  useEffect(() => {
    const resumeBillId = searchParams.get("resumeBillId");
    if (resumeBillId) {
      void reopenSplitLater(resumeBillId);
      return;
    }
    if (draft && proposals.length === 0) {
      void fetchSuggestionsForCurrentDraft();
    }
  }, [draft, fetchSuggestionsForCurrentDraft, proposals.length, reopenSplitLater, searchParams]);

  if (!draft) {
    return (
      <section className="glass-card">
        <h2>No Draft</h2>
        <p className="muted">Upload and review a receipt first.</p>
      </section>
    );
  }

  return (
    <>
      <SplitAssignment
        draft={draft}
        members={members}
        assignments={assignments}
        proposals={proposals}
        confirmedReviewItemIds={confirmedReviewItemIds}
        onChangeAssignments={setAssignments}
        onConfirmReviewItem={confirmReviewItem}
        showSuggestionDetails={showAiSuggestions}
      />
      <section className="glass-card section-gap">
        <h2>{showAiSuggestions ? "AI Suggestions Enabled" : "Manual Suggestions Mode"}</h2>
        {showAiSuggestions ? (
          <>
            <p className="muted">Provider: {agentObservability?.providerUsed ?? "deterministic"}</p>
            <p className="muted">Unresolved reviews: {agentObservability?.unresolvedCount ?? 0}</p>
          </>
        ) : (
          <p className="muted">
            {agentObservability?.aiHiddenReason ??
              "AI suggestions are hidden until enough order history and member context are available."}
          </p>
        )}
        {persistStatus ? <p className="muted">{persistStatus}</p> : null}
        <div className="chip-row mobile-actions" style={{ marginTop: "0.8rem" }}>
          <button type="button" className="chip chip-active mobile-full-width" onClick={() => router.push("/flow/resolve")}>
            Continue to Resolve
          </button>
        </div>
      </section>
    </>
  );
}

export default function SuggestStepPage() {
  return (
    <Suspense
      fallback={
        <section className="glass-card">
          <h2>Loading Suggestions</h2>
          <p className="muted">Preparing split recommendations...</p>
        </section>
      }
    >
      <SuggestStepContent />
    </Suspense>
  );
}
