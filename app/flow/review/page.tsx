"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ItemEnrichmentHint } from "@/components/ItemEnrichmentHint";
import { useFlow } from "@/lib/flow/context";
import { verifyParsedDraft } from "@/lib/vision/verification";

export default function ReviewStepPage() {
  const router = useRouter();
  const { draft, updateDraftItem, updateDraftTop } = useFlow();
  const [highRiskConfirmed, setHighRiskConfirmed] = useState(false);
  const verification = useMemo(
    () =>
      draft
        ? verifyParsedDraft(draft).diagnostics
        : {
            hardReviewRequired: false,
            reasons: [],
            itemCountDelta: 0,
            subtotalDeltaCents: 0,
          },
    [draft],
  );
  const requiresConfirmation = verification.hardReviewRequired;
  const canContinue = !requiresConfirmation || highRiskConfirmed;

  if (!draft) {
    return (
      <section className="glass-card">
        <h2>No Draft</h2>
        <p className="muted">Upload a receipt first.</p>
      </section>
    );
  }

  return (
    <section className="glass-card">
      <h2>Review Receipt</h2>
      <p className="muted">Review OCR output before split suggestions.</p>
      {requiresConfirmation ? (
        <div className="glass-card" style={{ marginTop: "0.7rem", borderColor: "var(--danger, #b42318)" }}>
          <p className="muted" style={{ color: "var(--danger, #b42318)" }}>
            High-risk parse detected. Please verify all line items and totals before proceeding.
          </p>
          <ul className="muted" style={{ marginTop: "0.45rem", paddingLeft: "1rem" }}>
            {verification.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          <label className="muted" style={{ display: "block", marginTop: "0.55rem" }}>
            <input
              type="checkbox"
              checked={highRiskConfirmed}
              onChange={(event) => setHighRiskConfirmed(event.target.checked)}
            />{" "}
            I reviewed item count and totals, and want to continue.
          </label>
        </div>
      ) : null}
      <div className="editor-grid">
        <label>
          Merchant
          <input className="text-input" value={draft.merchantName} onChange={(event) => updateDraftTop("merchantName", event.target.value)} />
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
            defaultValue={(draft.taxCents / 100).toFixed(2)}
            key={`tax-${draft.taxCents}`}
            onBlur={(event) => updateDraftTop("taxCents", event.target.value)}
          />
        </label>
      </div>
      <div className="items-table">
        {draft.items.map((item) => (
          <article key={item.id} className="item-row">
            <label className="item-edit">
              Item Label
              <input className="text-input" value={item.label} onChange={(event) => updateDraftItem(item.id, "label", event.target.value)} />
              <ItemEnrichmentHint item={item} />
            </label>
            <label className="item-edit">
              Amount ($)
              <input
                className="text-input"
                type="number"
                min={0}
                step={0.01}
                defaultValue={(item.lineTotalCents / 100).toFixed(2)}
                key={`${item.id}-${item.lineTotalCents}`}
                onBlur={(event) => updateDraftItem(item.id, "lineTotalCents", event.target.value)}
              />
            </label>
          </article>
        ))}
      </div>
      <div className="chip-row mobile-actions" style={{ marginTop: "1rem" }}>
        <button type="button" className="chip chip-active mobile-full-width" onClick={() => router.push("/flow/suggest")} disabled={!canContinue}>
          Continue
        </button>
      </div>
    </section>
  );
}
