"use client";

import { useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import type { BillUploadResponse } from "@/lib/schemas/bill";

type BillUploadProps = {
  onParsed: (response: BillUploadResponse) => void;
};

export function BillUpload({ onParsed }: BillUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [statusText, setStatusText] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const toFriendlyMessage = (message: string) => {
    if (message.includes("UPLOAD_UNSUPPORTED_MIME")) return "Unsupported file type. Please upload an image or PDF.";
    if (message.includes("UPLOAD_FILE_TOO_LARGE")) return "This file is too large. Try a smaller image/PDF.";
    if (message.includes("VISION_ROUTER_FAILED")) return "Parser provider unavailable. You can retry or use demo parser.";
    return message;
  };

  const handleFile = async (file: File) => {
    setError(null);
    setLastFile(file);
    setIsUploading(true);
    setStatusText("Uploading...");
    try {
      const formData = new FormData();
      formData.set("file", file);
      setStatusText("Parsing with Gemini/OpenAI...");
      const response = await fetch("/api/bills/upload", { method: "POST", body: formData });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error ?? "Could not parse this bill.");
      }
      onParsed(json);
      setStatusText(`Parsed successfully via ${json.diagnostics?.providerUsed ?? "vision"}.`);
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
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void handleFile(file);
          }
        }}
      />
      {statusText ? <p className="muted" style={{ marginTop: "0.55rem" }}>{statusText}</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {error ? (
        <div className="chip-row" style={{ marginTop: "0.55rem" }}>
          {lastFile ? (
            <button type="button" className="chip" onClick={() => void handleFile(lastFile)}>
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
