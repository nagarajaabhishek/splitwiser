"use client";

import { useRouter } from "next/navigation";
import { BillUpload } from "@/components/BillUpload";
import { useFlow } from "@/lib/flow/context";

export default function UploadStepPage() {
  const router = useRouter();
  const { activeGroupId, handleParsed, persistStatus } = useFlow();

  if (!activeGroupId) {
    return (
      <section className="glass-card">
        <h2>Select Group First</h2>
        <p className="muted">Create/select a household on dashboard, then start the split wizard.</p>
      </section>
    );
  }

  return (
    <section className="grid">
      <BillUpload
        onParsed={(response) => {
          handleParsed(response);
          router.push("/flow/review");
        }}
      />
      <section className="glass-card">
        <h2>Step Outcome</h2>
        <p className="muted">After parsing, you will review and edit receipt details before suggestions.</p>
        {persistStatus ? <p className="muted">{persistStatus}</p> : null}
      </section>
    </section>
  );
}
