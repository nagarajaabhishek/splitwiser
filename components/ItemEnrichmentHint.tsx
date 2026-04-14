"use client";

export type EnrichmentDisplayItem = {
  label: string;
  originalLabel?: string | null;
  rawLineText?: string | null;
  upc?: string | null;
  enrichment?: { needsReview?: boolean; source?: string } | null;
};

export function ItemEnrichmentHint({ item }: { item: EnrichmentDisplayItem }) {
  const showReceipt =
    Boolean(item.originalLabel?.trim()) && item.originalLabel?.trim() !== item.label.trim();

  return (
    <>
      {showReceipt ? (
        <p className="muted" style={{ marginTop: "0.25rem", fontSize: "0.88rem" }}>
          Receipt line: {item.originalLabel}
        </p>
      ) : null}
      {item.rawLineText ? (
        <p className="muted" style={{ fontSize: "0.82rem" }}>
          {item.rawLineText}
        </p>
      ) : null}
      <div className="chip-row" style={{ marginTop: "0.35rem", flexWrap: "wrap" }}>
        {item.enrichment?.needsReview ? <span className="status-badge status-badge-warn">Verify product name</span> : null}
        {item.enrichment?.source === "catalog" ? <span className="status-badge status-badge-ok">Catalog</span> : null}
        {item.enrichment?.source === "ai" && !item.enrichment?.needsReview ? (
          <span className="status-badge status-badge-ok">Name expanded</span>
        ) : null}
        {item.upc ? (
          <span className="muted" style={{ fontSize: "0.78rem" }}>
            UPC {item.upc}
          </span>
        ) : null}
      </div>
    </>
  );
}
