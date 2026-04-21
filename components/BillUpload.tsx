"use client";

import { useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { applyCategorizationToDraft } from "@/lib/categorization/infer";
import type { BillUploadBatchResponse, BillUploadResponse } from "@/lib/schemas/bill";

type BillUploadProps = {
  onParsed: (response: BillUploadResponse) => void;
};

export function BillUpload({ onParsed }: BillUploadProps) {
  const MAX_FILES = 10;
  const CAMERA_ACCEPT = /^image\//i;
  const [isUploading, setIsUploading] = useState(false);
  const [statusText, setStatusText] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [lastFiles, setLastFiles] = useState<File[]>([]);
  const [batchResult, setBatchResult] = useState<BillUploadBatchResponse | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const toFriendlyMessage = (message: string) => {
    if (message.includes("UPLOAD_UNSUPPORTED_MIME")) return "Unsupported file type. Please upload an image or PDF.";
    if (message.includes("UPLOAD_FILE_TOO_LARGE")) return "This file is too large. Try a smaller image/PDF.";
    if (message.includes("VISION_ROUTER_FAILED")) return "Parser provider unavailable. You can retry or use demo parser.";
    return message;
  };

  const handleFiles = async (files: File[], source: "upload" | "camera" = "upload") => {
    setError(null);
    setBatchResult(null);
    setLastFiles(files);
    setIsUploading(true);
    setStatusText(source === "camera" ? "Processing camera capture..." : "Uploading...");
    try {
      if (files.length > MAX_FILES) {
        throw new Error(`Too many files selected. Maximum is ${MAX_FILES}.`);
      }
      if (source === "camera" && files.some((file) => !CAMERA_ACCEPT.test(file.type))) {
        throw new Error("Camera capture only supports images. Use Upload File for PDFs.");
      }
      if (files.length === 0) {
        throw new Error("No file selected. Please try again.");
      }
      const formData = new FormData();
      files.forEach((file) => formData.append("files", file));
      setStatusText("Parsing with Gemini/OpenAI...");
      const response = await fetch("/api/bills/upload", { method: "POST", body: formData });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error ?? "Could not parse this bill.");
      }
      const payload = json as BillUploadBatchResponse;
      setBatchResult(payload);
      const singleDiagnostics = payload.successes[0]?.diagnostics;
      const hardGate = singleDiagnostics?.parseVerification?.hardReviewRequired;
      if (payload.successes.length === 1) {
        const single = payload.successes[0];
        onParsed({ source: single.source, draft: single.draft });
      }
      const catalogFallback = singleDiagnostics?.labelNormalization?.catalogFallbackReason;
      const fallbackSuffix = catalogFallback ? " Catalog fallback was used." : "";
      setStatusText(
        payload.successes.length > 1
          ? `Parsed ${payload.successes.length} files. Choose one draft to continue.`
          : hardGate
            ? `Parsed via ${payload.successes[0]?.diagnostics?.providerUsed ?? "vision"} and flagged as high-risk. Review all line items before continuing.${fallbackSuffix}`
          : payload.successes[0]?.diagnostics?.parseVerification?.needsReview
            ? `Parsed via ${payload.successes[0]?.diagnostics?.providerUsed ?? "vision"} with verification warnings. Please review item list and totals.${fallbackSuffix}`
            : `Parsed successfully via ${payload.successes[0]?.diagnostics?.providerUsed ?? "vision"}.${fallbackSuffix}`,
      );
    } catch (err) {
      setError(toFriendlyMessage(err instanceof Error ? err.message : "Unknown upload error"));
      setStatusText("");
    } finally {
      setIsUploading(false);
    }
  };

  const useDemoParser = () => {
    onParsed({
      source: "demo",
      draft: applyCategorizationToDraft({
        merchantName: "Demo Cafe",
        billDate: new Date().toISOString(),
        currency: "USD",
        subtotalCents: 2198,
        taxCents: 202,
        totalCents: 2400,
        items: [
          { id: "item-1", label: "Veg Bowl", normalizedLabel: "veg bowl", quantity: 1, unitPriceCents: 1299, lineTotalCents: 1299 },
          { id: "item-2", label: "Iced Tea", normalizedLabel: "iced tea", quantity: 1, unitPriceCents: 899, lineTotalCents: 899 },
        ],
      }),
    });
    setError(null);
    setStatusText("Demo parser loaded.");
  };

  return (
    <section className="glass-card">
      <h2>Ingest Bill</h2>
      <p className="muted">Scan with your phone camera or upload an image/PDF receipt to create a review-ready draft.</p>
      <div className="upload-cta-grid" style={{ marginTop: "0.8rem" }}>
        <button
          type="button"
          className="upload-zone upload-zone-secondary"
          onClick={() => cameraInputRef.current?.click()}
          disabled={isUploading}
        >
          <UploadCloud size={20} />
          <span>{isUploading ? "Extracting line items..." : "Scan Bill (Camera)"}</span>
        </button>
        <button
          type="button"
          className="upload-zone"
          onClick={() => uploadInputRef.current?.click()}
          disabled={isUploading}
        >
          <UploadCloud size={20} />
          <span>{isUploading ? "Extracting line items..." : "Upload File (Image/PDF)"}</span>
        </button>
      </div>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length > 0) {
            void handleFiles(files, "camera");
          }
        }}
      />
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*,.pdf"
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length > 0) {
            void handleFiles(files, "upload");
          }
        }}
      />
      {statusText ? <p className="muted" style={{ marginTop: "0.55rem" }}>{statusText}</p> : null}
      {lastFiles.length > 0 ? (
        <p className="muted" style={{ marginTop: "0.4rem" }}>
          Selected {lastFiles.length} file{lastFiles.length === 1 ? "" : "s"} (max {MAX_FILES})
        </p>
      ) : null}
      {batchResult && batchResult.successes.length > 1 ? (
        <div className="items-table" style={{ marginTop: "0.55rem" }}>
          {batchResult.successes.map((entry) => (
            <article key={entry.fileName} className="item-row">
              <div>
                <p className="item-label">{entry.fileName}</p>
                <p className="muted">
                  {entry.draft.merchantName} · ${(entry.draft.totalCents / 100).toFixed(2)}
                </p>
                {entry.diagnostics?.parseVerification?.needsReview ? (
                  <p className="muted" style={{ color: "var(--danger, #b42318)" }}>
                    {entry.diagnostics.parseVerification.reasons[0] ?? "Verification flagged this parse for manual review."}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                className="chip chip-active mobile-full-width"
                onClick={() => onParsed({ source: entry.source, draft: entry.draft })}
              >
                Use This Draft
              </button>
            </article>
          ))}
        </div>
      ) : null}
      {batchResult && batchResult.failures.length > 0 ? (
        <div style={{ marginTop: "0.55rem" }}>
          {batchResult.failures.map((failure) => (
            <p key={`${failure.fileName}-${failure.code}`} className="muted">
              {failure.fileName}: {toFriendlyMessage(failure.error)}
            </p>
          ))}
        </div>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
      {error ? (
        <div className="chip-row mobile-actions stack-mobile" style={{ marginTop: "0.55rem" }}>
          {lastFiles.length > 0 ? (
            <button type="button" className="chip mobile-full-width" onClick={() => void handleFiles(lastFiles)}>
              Try Again
            </button>
          ) : null}
          <button type="button" className="chip mobile-full-width" onClick={useDemoParser}>
            Use Demo Parser
          </button>
        </div>
      ) : null}
    </section>
  );
}
