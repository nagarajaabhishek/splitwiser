"use client";

import Link from "next/link";

export default function ProfilePage() {
  return (
    <main className="shell">
      <section className="glass-card">
        <h1>About Me</h1>
        <p className="muted" style={{ marginTop: "0.5rem" }}>
          This is your profile page. You can customize this section with your bio, preferences, and account details.
        </p>
        <Link href="/" className="chip" style={{ display: "inline-flex", marginTop: "1rem" }}>
          Back to Home
        </Link>
      </section>
    </main>
  );
}
