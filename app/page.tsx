"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GroupSwitcher } from "@/components/GroupSwitcher";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import type { Member } from "@/lib/schemas/bill";

type HistoryBill = {
  id: string;
  merchantName: string;
  billDate: string;
  totalCents: number;
  status: string;
  memberBreakdown: Array<{ memberId: string; memberName: string; totalCents: number }>;
};

type GroupType = {
  id: string;
  name: string;
  members: Member[];
};

type Ledger = {
  currency: string;
  balances: Array<{ memberId: string; memberName: string; balanceCents: number }>;
  settlements: Array<{ fromMemberId: string; fromMemberName: string; toMemberId: string; toMemberName: string; amountCents: number }>;
};

type ActivityEntry = {
  id: string;
  message: string;
  type: string;
  createdAt: string;
};

type Analytics = {
  budget: { monthlyBudgetCents: number | null; defaultCurrency: string };
  totals: { finalizedBills: number; totalSpendCents: number };
  spendByMonth: Array<{ month: string; totalCents: number }>;
  spendByCategory: Array<{ category: string; totalCents: number }>;
};

export default function Home() {
  const router = useRouter();
  const [groups, setGroups] = useState<GroupType[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [householdId, setHouseholdId] = useState<string>("");
  const [history, setHistory] = useState<HistoryBill[]>([]);
  const [groupMessage, setGroupMessage] = useState("");
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [payments, setPayments] = useState<Array<{ id: string; fromMember: { id: string; name: string }; toMember: { id: string; name: string }; amountCents: number; method: string; paidAt: string }>>([]);
  const [paymentForm, setPaymentForm] = useState({ fromMemberId: "", toMemberId: "", amount: "", method: "other" });
  const [recurringForm, setRecurringForm] = useState({ title: "", amount: "", cadence: "monthly", category: "" });
  const [recurring, setRecurring] = useState<Array<{ id: string; title: string; amountCents: number; cadence: string; nextRunAt: string }>>([]);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  const loadBootstrap = useCallback(async (groupId?: string) => {
    try {
      const params = groupId ? `?activeGroupId=${groupId}` : "";
      const response = await fetch(`/api/bootstrap${params}`);
      const json = (await response.json()) as {
        groups?: GroupType[];
        activeGroupId?: string | null;
        needsOnboarding?: boolean;
        error?: string;
      };
      if (!response.ok) {
        setBootstrapError(typeof json.error === "string" ? json.error : "Could not load your groups. Check the database connection in production.");
        setGroups([]);
        setActiveGroupId(null);
        setHouseholdId("");
        setShowOnboarding(true);
        return;
      }
      setBootstrapError(null);
      const nextGroups = json.groups ?? [];
      setGroups(nextGroups);
      setShowOnboarding(Boolean(json.needsOnboarding));
      setActiveGroupId(json.activeGroupId ?? null);
      setHouseholdId(json.activeGroupId ?? "");
    } catch {
      setBootstrapError("Network error while loading data. Try again in a moment.");
      setGroups([]);
      setActiveGroupId(null);
      setHouseholdId("");
      setShowOnboarding(true);
    }
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      await loadBootstrap();
    };
    void bootstrap();
  }, [loadBootstrap]);

  useEffect(() => {
    const fetchHistory = async () => {
      if (!householdId) return;
      const response = await fetch(`/api/bills/history?householdId=${householdId}`);
      const json = await response.json();
      setHistory(json.bills ?? []);
    };
    void fetchHistory();
  }, [householdId]);

  useEffect(() => {
    const fetchLedgerData = async () => {
      if (!householdId) return;
      const [ledgerRes, activityRes, analyticsRes, paymentsRes, recurringRes] = await Promise.all([
        fetch(`/api/ledger/${householdId}`),
        fetch(`/api/activity/${householdId}`),
        fetch(`/api/analytics/${householdId}`),
        fetch(`/api/payments?householdId=${householdId}`),
        fetch(`/api/recurring?householdId=${householdId}`),
      ]);
      const ledgerJson = await ledgerRes.json();
      const activityJson = await activityRes.json();
      const analyticsJson = await analyticsRes.json();
      const paymentsJson = await paymentsRes.json();
      const recurringJson = await recurringRes.json();
      setLedger(ledgerJson.ledger ?? null);
      setActivity(activityJson.entries ?? []);
      setAnalytics(analyticsJson.analytics ?? null);
      setPayments(paymentsJson.payments ?? []);
      setRecurring(recurringJson.recurringExpenses ?? []);
    };
    void fetchLedgerData();
  }, [householdId, history.length]);

  const createGroupHandler = (group: { id: string }) => {
    void loadBootstrap(group.id);
    setShowOnboarding(false);
    setHistory([]);
    setGroupMessage("Group created.");
  };

  const updateGroup = async (groupId: string, payload: Record<string, unknown>) => {
    const response = await fetch(`/api/groups/${groupId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await response.json();
    if (!response.ok) {
      setGroupMessage(json.error ?? "Failed to update group");
      return;
    }
    setGroupMessage("Group updated.");
    await loadBootstrap(activeGroupId ?? groupId);
  };

  const deleteGroupHandler = async (groupId: string) => {
    const response = await fetch(`/api/groups/${groupId}`, { method: "DELETE" });
    if (!response.ok) {
      const json = await response.json();
      setGroupMessage(json.error ?? "Failed to delete group");
      return;
    }
    await loadBootstrap();
    setGroupMessage("Group deleted.");
  };

  const refreshFinancialData = useCallback(async () => {
    if (!householdId) return;
    const [ledgerRes, activityRes, analyticsRes, paymentsRes, recurringRes] = await Promise.all([
      fetch(`/api/ledger/${householdId}`),
      fetch(`/api/activity/${householdId}`),
      fetch(`/api/analytics/${householdId}`),
      fetch(`/api/payments?householdId=${householdId}`),
      fetch(`/api/recurring?householdId=${householdId}`),
    ]);
    const ledgerJson = await ledgerRes.json();
    const activityJson = await activityRes.json();
    const analyticsJson = await analyticsRes.json();
    const paymentsJson = await paymentsRes.json();
    const recurringJson = await recurringRes.json();
    setLedger(ledgerJson.ledger ?? null);
    setActivity(activityJson.entries ?? []);
    setAnalytics(analyticsJson.analytics ?? null);
    setPayments(paymentsJson.payments ?? []);
    setRecurring(recurringJson.recurringExpenses ?? []);
  }, [householdId]);

  return (
    <main className="shell">
      <section className="chip-row" style={{ justifyContent: "flex-end", marginBottom: "1rem" }}>
        <Link href="https://abhisheknagaraja.com/" className="chip" target="_blank" rel="noopener noreferrer">
          About Me
        </Link>
      </section>
      <section className="hero">
        <h1>Splitwiser AI</h1>
        <p>Use the new guided wizard to parse, review, split, and finalize bills.</p>
      </section>

      {groups.length === 0 || showOnboarding ? (
        <OnboardingWizard onCreated={createGroupHandler} onClose={groups.length > 0 ? () => setShowOnboarding(false) : undefined} />
      ) : null}

      {groups.length > 0 ? (
        <GroupSwitcher
          key={activeGroupId ?? "no-group"}
          groups={groups}
          activeGroupId={activeGroupId}
          onSelect={(groupId) => {
            void loadBootstrap(groupId);
            setGroupMessage("");
          }}
          onOpenManager={() => setShowOnboarding(true)}
          onRename={(groupId, name) => void updateGroup(groupId, { name })}
          onAddMember={(groupId, memberName) => void updateGroup(groupId, { addMemberName: memberName })}
          onRemoveMember={(groupId, memberId) => void updateGroup(groupId, { removeMemberId: memberId })}
          onUpdateMemberProfile={(groupId, memberId, profile) =>
            void updateGroup(groupId, {
              updateMemberProfile: {
                memberId,
                dietaryStyle: profile.dietaryStyle ?? "",
                allergies: profile.allergies ?? [],
                exclusions: profile.exclusions ?? [],
              },
            })
          }
          onDeleteGroup={(groupId) => void deleteGroupHandler(groupId)}
          message={groupMessage}
        />
      ) : null}

      {!activeGroupId ? (
        <section className="glass-card" style={{ marginTop: "1rem" }}>
          <h2>Get Started</h2>
          {bootstrapError ? (
            <p className="muted" style={{ color: "var(--danger, #b42318)", marginTop: "0.5rem" }}>
              {bootstrapError}
            </p>
          ) : null}
          <p className="muted" style={{ marginTop: "0.5rem" }}>
            Production uses its own database (empty until you add data here). Create a household below to unlock the split wizard.
          </p>
          <div className="chip-row" style={{ marginTop: "0.75rem" }}>
            <button type="button" className="chip chip-active" onClick={() => void loadBootstrap()}>
              Retry loading
            </button>
          </div>
        </section>
      ) : null}
      {activeGroupId ? (
        <section className="glass-card section-gap">
          <h2>Start New Split</h2>
          <p className="muted">Launch the 6-step route wizard for upload, review, suggestions, confirmation, and finalize.</p>
          <div className="chip-row" style={{ marginTop: "0.8rem" }}>
            <button type="button" className="chip chip-active" onClick={() => router.push("/flow/upload")}>
              Continue
            </button>
          </div>
        </section>
      ) : null}

      {activeGroupId ? <section className="glass-card section-gap">
        <h2>Bill History</h2>
        <p className="muted">Persisted finalized and split-later bills.</p>
        <div className="items-table" style={{ marginTop: "0.7rem" }}>
          {history.length === 0 ? (
            <p className="muted">No bills yet.</p>
          ) : (
            history.map((bill) => (
              <article key={bill.id} className="item-row">
                <div>
                  <p className="item-label">
                    {bill.status === "finalized" ? <Link href={`/bills/${bill.id}`}>{bill.merchantName}</Link> : bill.merchantName}
                  </p>
                  <p className="muted">{new Date(bill.billDate).toLocaleDateString()} · {bill.status}</p>
                </div>
                <div>
                  <p>${(bill.totalCents / 100).toFixed(2)}</p>
                  <p className="muted">{bill.memberBreakdown.map((m) => `${m.memberName}: $${(m.totalCents / 100).toFixed(2)}`).join(" | ")}</p>
                  {bill.status === "finalized" ? (
                    <Link href={`/bills/${bill.id}`} className="chip" style={{ marginTop: "0.4rem", display: "inline-block" }}>
                      View Details
                    </Link>
                  ) : null}
                  {bill.status === "split_later" ? (
                    <button type="button" className="chip" style={{ marginTop: "0.4rem" }} onClick={() => router.push(`/flow/suggest?resumeBillId=${bill.id}`)}>
                      Reopen Split
                    </button>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </div>
      </section> : null}

      {activeGroupId && ledger ? (
        <section className="glass-card section-gap">
          <h2>Running Balances</h2>
          <p className="muted">Copying Splitwise-style who-owes-whom view.</p>
          <div className="items-table" style={{ marginTop: "0.7rem" }}>
            {ledger.balances.map((entry) => (
              <article key={entry.memberId} className="item-row">
                <p className="item-label">{entry.memberName}</p>
                <p className={entry.balanceCents >= 0 ? "muted" : ""}>
                  {entry.balanceCents >= 0 ? "gets" : "owes"} ${Math.abs(entry.balanceCents / 100).toFixed(2)}
                </p>
              </article>
            ))}
          </div>
          <h3 style={{ marginTop: "0.8rem" }}>Suggested Settlements</h3>
          <div className="items-table">
            {ledger.settlements.length === 0 ? (
              <p className="muted">No transfers needed.</p>
            ) : (
              ledger.settlements.map((transfer, index) => (
                <article key={`${transfer.fromMemberId}-${index}`} className="item-row">
                  <p>{transfer.fromMemberName} pays {transfer.toMemberName}</p>
                  <p>${(transfer.amountCents / 100).toFixed(2)}</p>
                </article>
              ))
            )}
          </div>
        </section>
      ) : null}

      {activeGroupId ? (
        <section className="glass-card section-gap">
          <h2>Settle Up</h2>
          <p className="muted">Record full or partial payments.</p>
          <div className="chip-row" style={{ marginTop: "0.7rem", gap: "0.5rem" }}>
            <select value={paymentForm.fromMemberId} onChange={(event) => setPaymentForm((prev) => ({ ...prev, fromMemberId: event.target.value }))}>
              <option value="">From</option>
              {groups.find((group) => group.id === activeGroupId)?.members.map((member) => (
                <option key={member.id} value={member.id}>{member.name}</option>
              ))}
            </select>
            <select value={paymentForm.toMemberId} onChange={(event) => setPaymentForm((prev) => ({ ...prev, toMemberId: event.target.value }))}>
              <option value="">To</option>
              {groups.find((group) => group.id === activeGroupId)?.members.map((member) => (
                <option key={member.id} value={member.id}>{member.name}</option>
              ))}
            </select>
            <input placeholder="Amount" value={paymentForm.amount} onChange={(event) => setPaymentForm((prev) => ({ ...prev, amount: event.target.value }))} />
            <select value={paymentForm.method} onChange={(event) => setPaymentForm((prev) => ({ ...prev, method: event.target.value }))}>
              {["cash", "bank_transfer", "upi", "venmo", "paypal", "other"].map((method) => (
                <option key={method} value={method}>{method}</option>
              ))}
            </select>
            <button
              type="button"
              className="chip chip-active"
              onClick={async () => {
                await fetch("/api/payments", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    householdId: activeGroupId,
                    fromMemberId: paymentForm.fromMemberId,
                    toMemberId: paymentForm.toMemberId,
                    amountCents: Math.round((Number(paymentForm.amount) || 0) * 100),
                    method: paymentForm.method,
                  }),
                });
                setPaymentForm({ fromMemberId: "", toMemberId: "", amount: "", method: "other" });
                await refreshFinancialData();
              }}
            >
              Record Payment
            </button>
          </div>
          <div className="items-table" style={{ marginTop: "0.7rem" }}>
            {payments.slice(0, 10).map((payment) => (
              <article key={payment.id} className="item-row">
                <p>{payment.fromMember.name} paid {payment.toMember.name}</p>
                <p>${(payment.amountCents / 100).toFixed(2)} · {payment.method}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {activeGroupId ? (
        <section className="glass-card section-gap">
          <h2>Activity Feed</h2>
          <div className="items-table" style={{ marginTop: "0.7rem" }}>
            {activity.slice(0, 10).map((entry) => (
              <article key={entry.id} className="item-row">
                <p>{entry.message}</p>
                <p className="muted">{new Date(entry.createdAt).toLocaleString()}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {activeGroupId && analytics ? (
        <section className="glass-card section-gap">
          <h2>Dashboard & Analytics</h2>
          <p className="muted">Bills: {analytics.totals.finalizedBills} · Spend: ${(analytics.totals.totalSpendCents / 100).toFixed(2)}</p>
          <p className="muted">
            Budget:{" "}
            {analytics.budget.monthlyBudgetCents
              ? `$${(analytics.budget.monthlyBudgetCents / 100).toFixed(2)}`
              : "Not set"}
          </p>
          <h3 style={{ marginTop: "0.8rem" }}>By Category</h3>
          <div className="items-table">
            {analytics.spendByCategory.map((entry) => (
              <article key={entry.category} className="item-row">
                <p>{entry.category}</p>
                <p>${(entry.totalCents / 100).toFixed(2)}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {activeGroupId ? (
        <section className="glass-card section-gap">
          <h2>Recurring Expenses</h2>
          <div className="chip-row" style={{ marginTop: "0.7rem", gap: "0.5rem" }}>
            <input placeholder="Title" value={recurringForm.title} onChange={(event) => setRecurringForm((prev) => ({ ...prev, title: event.target.value }))} />
            <input placeholder="Amount" value={recurringForm.amount} onChange={(event) => setRecurringForm((prev) => ({ ...prev, amount: event.target.value }))} />
            <input placeholder="Category" value={recurringForm.category} onChange={(event) => setRecurringForm((prev) => ({ ...prev, category: event.target.value }))} />
            <select value={recurringForm.cadence} onChange={(event) => setRecurringForm((prev) => ({ ...prev, cadence: event.target.value }))}>
              {["weekly", "monthly", "quarterly"].map((cadence) => <option key={cadence} value={cadence}>{cadence}</option>)}
            </select>
            <button
              type="button"
              className="chip"
              onClick={async () => {
                await fetch("/api/recurring", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    householdId: activeGroupId,
                    title: recurringForm.title,
                    amountCents: Math.round((Number(recurringForm.amount) || 0) * 100),
                    currency: "USD",
                    category: recurringForm.category,
                    cadence: recurringForm.cadence,
                    nextRunAt: new Date().toISOString(),
                  }),
                });
                setRecurringForm({ title: "", amount: "", cadence: "monthly", category: "" });
                await refreshFinancialData();
              }}
            >
              Add Recurring
            </button>
          </div>
          <div className="items-table" style={{ marginTop: "0.7rem" }}>
            {recurring.slice(0, 10).map((entry) => (
              <article key={entry.id} className="item-row">
                <p>{entry.title} · {entry.cadence}</p>
                <p>${(entry.amountCents / 100).toFixed(2)}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
