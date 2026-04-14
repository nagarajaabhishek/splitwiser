"use client";

import { useRouter } from "next/navigation";
import { ItemEnrichmentHint } from "@/components/ItemEnrichmentHint";
import { useFlow } from "@/lib/flow/context";

export default function ReviewStepPage() {
  const router = useRouter();
  const { draft, updateDraftItem, updateDraftTop } = useFlow();

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
                value={(item.lineTotalCents / 100).toFixed(2)}
                onChange={(event) => updateDraftItem(item.id, "lineTotalCents", event.target.value)}
              />
            </label>
          </article>
        ))}
      </div>
      <div className="chip-row" style={{ marginTop: "1rem" }}>
        <button type="button" className="chip chip-active" onClick={() => router.push("/flow/suggest")}>
          Continue to Suggestions
        </button>
      </div>
    </section>
  );
}
