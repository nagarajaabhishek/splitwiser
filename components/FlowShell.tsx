"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useFlow } from "@/lib/flow/context";

const steps = [
  { path: "/flow/upload", label: "Upload & Parse" },
  { path: "/flow/review", label: "Review Receipt" },
  { path: "/flow/suggest", label: "AI Suggestions" },
  { path: "/flow/resolve", label: "Resolve Review" },
  { path: "/flow/decision", label: "Finalize/Split Later" },
];

function canAccess(path: string, hasDraft: boolean, hasAssignments: boolean) {
  if (path === "/flow/upload") return true;
  if (path === "/flow/review") return hasDraft;
  // Allow suggest route to open so split-later resume can hydrate draft state.
  if (path === "/flow/suggest") return true;
  if (path === "/flow/resolve") return hasDraft;
  if (path === "/flow/decision") return hasDraft && hasAssignments;
  return true;
}

export function FlowShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { draft, assignments } = useFlow();
  const hasDraft = Boolean(draft);
  const hasAssignments = assignments.length > 0;

  useEffect(() => {
    if (pathname?.startsWith("/flow/result/")) return;
    if (pathname && !canAccess(pathname, hasDraft, hasAssignments)) {
      router.replace(hasDraft ? "/flow/suggest" : "/flow/upload");
    }
  }, [pathname, hasDraft, hasAssignments, router]);

  const currentStep = useMemo(() => steps.findIndex((step) => step.path === pathname), [pathname]);

  return (
    <main className="shell">
      <section className="chip-row" style={{ justifyContent: "space-between", marginBottom: "1rem" }}>
        <Link href="/" className="chip">
          Back to Dashboard
        </Link>
        <Link href="https://abhisheknagaraja.com/" className="chip" target="_blank" rel="noopener noreferrer">
          About Me
        </Link>
      </section>
      <section className="glass-card flow-card">
        <h2>Split Wizard</h2>
        <div className="flow-steps">
          {steps.map((step, index) => (
            <span key={step.path} className={index <= currentStep ? "status-badge status-badge-ok" : "status-badge"}>
              {index + 1}. {step.label}
            </span>
          ))}
        </div>
      </section>
      <section style={{ marginTop: "1rem" }}>{children}</section>
    </main>
  );
}
