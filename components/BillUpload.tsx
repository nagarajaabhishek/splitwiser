"use client";

import { useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import type { BillUploadResponse } from "@/lib/schemas/bill";

type BillUploadProps = {
  onParsed: (response: BillUploadResponse) => void;
};

export function BillUpload({ onParsed }: BillUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setError(null);
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/api/bills/upload", { method: "POST", body: formData });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error ?? "Could not parse this bill.");
      }
      onParsed(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown upload error");
    } finally {
      setIsUploading(false);
    }
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
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
