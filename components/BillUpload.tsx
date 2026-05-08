"use client";

import { useRef, useState } from "react";
import { Camera, FileText, Image as ImageIcon, Loader2, UploadCloud, X } from "lucide-react";
import { applyCategorizationToDraft } from "@/lib/categorization/infer";
import type { BillUploadBatchResponse, BillUploadResponse } from "@/lib/schemas/bill";

type BillUploadProps = {
  onParsed: (response: BillUploadResponse) => void;
};

const MAX_FILES = 10;
const CAMERA_ACCEPT = /^image\//i;

function formatBytes(bytes: number) {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(0)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function BillUpload({ onParsed }: BillUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [statusText, setStatusText] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [batchResult, setBatchResult] = useState<BillUploadBatchResponse | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const toFriendlyMessage = (message: string) => {
    if (message.includes("UPLOAD_UNSUPPORTED_MIME")) return "Unsupported file type. Please upload a JPEG, PNG, HEIC, or PDF.";
    if (message.includes("UPLOAD_FILE_TOO_LARGE")) return "This file is too large. Try a smaller image/PDF.";
    if (message.includes("VISION_ROUTER_FAILED")) return "Parser provider unavailable. You can retry or use demo parser.";
    return message;
  };

  const addFiles = (incoming: File[]) => {
    setPendingFiles((prev) => {
      const merged = [...prev, ...incoming];
      return merged.slice(0, MAX_FILES);
    });
    setError(null);
    setBatchResult(null);
    setStatusText("");
  };

  const removeFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleFiles = async (files: File[], source: "upload" | "camera" = "upload") => {
    setError(null);
    setBatchResult(null);
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
      setPendingFiles([]);
      const singleDiagnostics = payload.successes[0]?.diagnostics;
      const hardGate = singleDiagnostics?.parseVerification?.hardReviewRequired;
      const isStub = (s: (typeof payload.successes)[number]) =>
        s.diagnostics?.providerUsed === "stub" && !!s.diagnostics?.fallbackReason;
      const allStub = payload.successes.length > 0 && payload.successes.every(isStub);
      const isEmergencyStub = payload.successes.length === 1 && isStub(payload.successes[0]!);
      if (payload.successes.length === 1) {
        const single = payload.successes[0];
        onParsed({ source: single.source, draft: single.draft });
      }
      const catalogFallback = singleDiagnostics?.labelNormalization?.catalogFallbackReason;
      const fallbackSuffix = catalogFallback ? " Catalog fallback was used." : "";
      setStatusText(
        allStub && payload.successes.length > 1
          ? "AI parsing failed for all files. Demo data loaded — please enter bill details manually."
          : payload.successes.length > 1
            ? `Parsed ${payload.successes.length} files. Choose one draft to continue.`
            : isEmergencyStub
              ? "AI parsing failed. Demo data loaded — please enter bill details manually."
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

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isUploading) setIsDragOver(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (isUploading) return;
    const dropped = Array.from(e.dataTransfer.files);
    addFiles(dropped);
  };

  const emergencyStubActive =
    batchResult !== null &&
    batchResult.successes.length > 0 &&
    batchResult.successes.every(
      (s) => s.diagnostics?.providerUsed === "stub" && !!s.diagnostics?.fallbackReason,
    );

  const dropzoneClass = [
    "upload-dropzone",
    isDragOver ? "upload-dropzone-dragover" : "",
    isUploading ? "upload-dropzone-uploading" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section className="glass-card">
      <h2>Ingest Bill</h2>
      <p className="muted">Drop your receipts below, or click to browse. Mix PDFs and images freely — up to {MAX_FILES} files at once.</p>

      <div
        className={dropzoneClass}
        onClick={() => !isUploading && uploadInputRef.current?.click()}
        onDragOver={onDragOver}
        onDragEnter={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && !isUploading && uploadInputRef.current?.click()}
        aria-label="Upload bill files"
      >
        {isUploading ? (
          <>
            <Loader2 size={28} className="upload-spinner" style={{ animation: "spin 1s linear infinite" }} />
            <span style={{ fontWeight: 600 }}>Parsing with AI…</span>
            <span className="muted" style={{ fontSize: "0.85rem" }}>{statusText}</span>
          </>
        ) : (
          <>
            <UploadCloud size={28} style={{ color: "#4caf6e" }} />
            <span style={{ fontWeight: 600 }}>
              {isDragOver ? "Release to add files" : "Drop bills here, or click to browse"}
            </span>
            <span className="muted" style={{ fontSize: "0.85rem" }}>JPEG, PNG, WebP, HEIC, PDF supported</span>
          </>
        )}
      </div>

      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*,.pdf,.heic,.heif"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) addFiles(files);
          e.target.value = "";
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) void handleFiles(files, "camera");
        }}
      />

      {pendingFiles.length > 0 ? (
        <div className="file-preview-list">
          {pendingFiles.map((file, i) => (
            <div key={`${file.name}-${i}`} className="file-preview-item">
              <span className="file-preview-icon">
                {file.type === "application/pdf" ? <FileText size={18} /> : <ImageIcon size={18} />}
              </span>
              <span className="file-preview-name">{file.name}</span>
              <span className="file-preview-size">{formatBytes(file.size)}</span>
              <button
                type="button"
                className="file-preview-remove"
                onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                aria-label={`Remove ${file.name}`}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="upload-actions">
        <button
          type="button"
          className="chip chip-active"
          disabled={pendingFiles.length === 0 || isUploading}
          onClick={() => void handleFiles(pendingFiles)}
        >
          Parse {pendingFiles.length > 0 ? `${pendingFiles.length} ` : ""}Bill{pendingFiles.length !== 1 ? "s" : ""}
        </button>
        <button
          type="button"
          className="chip"
          onClick={() => cameraInputRef.current?.click()}
          disabled={isUploading}
          style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}
        >
          <Camera size={14} />
          Scan with Camera
        </button>
      </div>

      {statusText && !isUploading ? (
        <p
          className="muted"
          style={{
            marginTop: "0.55rem",
            ...(emergencyStubActive ? { color: "var(--warning, #b45309)" } : {}),
          }}
        >
          {statusText}
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
          {pendingFiles.length > 0 ? (
            <button type="button" className="chip mobile-full-width" onClick={() => void handleFiles(pendingFiles)}>
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
