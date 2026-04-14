"use client";

import { useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import type { BillUploadBatchResponse, BillUploadResponse } from "@/lib/schemas/bill";

type BillUploadProps = {
  onParsed: (response: BillUploadResponse) => void;
};

export function BillUpload({ onParsed }: BillUploadProps) {
  const MAX_FILES = 10;
  const [isUploading, setIsUploading] = useState(false);
  const [statusText, setStatusText] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [lastFiles, setLastFiles] = useState<File[]>([]);
  const [batchResult, setBatchResult] = useState<BillUploadBatchResponse | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const toFriendlyMessage = (message: string) => {
    if (message.includes("UPLOAD_UNSUPPORTED_MIME")) return "Unsupported file type. Please upload an image or PDF.";
    if (message.includes("UPLOAD_FILE_TOO_LARGE")) return "This file is too large. Try a smaller image/PDF.";
    if (message.includes("VISION_ROUTER_FAILED")) return "Parser provider unavailable. You can retry or use demo parser.";
    return message;
  };

  const handleFiles = async (files: File[]) => {
    setError(null);
    setBatchResult(null);
    setLastFiles(files);
    setIsUploading(true);
    setStatusText("Uploading...");
    try {
      if (files.length > MAX_FILES) {
        throw new Error(`Too many files selected. Maximum is ${MAX_FILES}.`);
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
      if (payload.successes.length === 1) {
        const single = payload.successes[0];
        onParsed({ source: single.source, draft: single.draft });
      }
      setStatusText(
        payload.successes.length > 1
          ? `Parsed ${payload.successes.length} files. Choose one draft to continue.`
          : `Parsed successfully via ${payload.successes[0]?.diagnostics?.providerUsed ?? "vision"}.`,
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
      draft: {
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
      },
    });
    setError(null);
    setStatusText("Demo parser loaded.");
  };

  return (
    <section className="glass-card">
      <h2>Ingest Bill</h2>
      <p className="muted">Upload an image/PDF receipt to run the vision parser into a review-ready draft.</p>
      <button
        type="button"
        className="upload-zone"
        onClick={() => inputRef.current?.click()}
        disabled={isUploading}
      >
        <UploadCloud size={20} />
        <span>{isUploading ? "Extracting line items..." : "Drop or click to upload a receipt"}</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.pdf"
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length > 0) {
            void handleFiles(files);
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
              </div>
              <button
                type="button"
                className="chip chip-active"
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
        <div className="chip-row" style={{ marginTop: "0.55rem" }}>
          {lastFiles.length > 0 ? (
            <button type="button" className="chip" onClick={() => void handleFiles(lastFiles)}>
              Try Again
            </button>
          ) : null}
          <button type="button" className="chip" onClick={useDemoParser}>
            Use Demo Parser
          </button>
        </div>
      ) : null}
    </section>
  );
}
