"use client";

import { useState } from "react";

type BillShareActionsProps = {
  billId: string;
  status: string;
};

export function BillShareActions({ billId, status }: BillShareActionsProps) {
  const [shareUrl, setShareUrl] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const createShareLink = async () => {
    setLoading(true);
    setMessage("");
    const response = await fetch(`/api/bills/${billId}/share`, { method: "POST" });
    const json = await response.json();
    setLoading(false);

    if (!response.ok) {
      setMessage(json.error ?? "Could not create share link.");
      return;
    }
    setShareUrl(json.shareUrl);
    setMessage("Share link ready.");
  };

  const copyShareLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setMessage("Share link copied.");
    } catch {
      setMessage("Could not copy link.");
    }
  };

  if (status !== "finalized") {
    return <p className="muted">Share link is available after bill finalization.</p>;
  }

  return (
    <div style={{ marginTop: "0.8rem" }}>
      <div className="chip-row">
        <button type="button" className="chip chip-active" onClick={createShareLink} disabled={loading}>
          {loading ? "Creating..." : "Create Share Link"}
        </button>
        {shareUrl ? (
          <button type="button" className="chip" onClick={copyShareLink}>
            Copy Link
          </button>
        ) : null}
      </div>
      {shareUrl ? (
        <p className="muted" style={{ marginTop: "0.5rem", wordBreak: "break-all" }}>
          {shareUrl}
        </p>
      ) : null}
      {message ? <p className="muted" style={{ marginTop: "0.4rem" }}>{message}</p> : null}
    </div>
  );
}
