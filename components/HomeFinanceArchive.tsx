"use client";

/**
 * Archived home sections (Settle Up + Recurring Expenses).
 *
 * These were intentionally hidden from the current product surface but kept in
 * code for quick restoration/reference.
 */
export function HomeFinanceArchive(props: {
  activeGroupId: string;
  groups: Array<{ id: string; members: Array<{ id: string; name: string }> }>;
  paymentForm: { fromMemberId: string; toMemberId: string; amount: string; method: string };
  setPaymentForm: React.Dispatch<
    React.SetStateAction<{ fromMemberId: string; toMemberId: string; amount: string; method: string }>
  >;
  payments: Array<{
    id: string;
    fromMember: { id: string; name: string };
    toMember: { id: string; name: string };
    amountCents: number;
    method: string;
    paidAt: string;
  }>;
  recurringForm: { title: string; amount: string; cadence: string; category: string };
  setRecurringForm: React.Dispatch<React.SetStateAction<{ title: string; amount: string; cadence: string; category: string }>>;
  recurring: Array<{ id: string; title: string; amountCents: number; cadence: string; nextRunAt: string }>;
  refreshFinancialData: () => Promise<void>;
}) {
  const {
    activeGroupId,
    groups,
    paymentForm,
    setPaymentForm,
    payments,
    recurringForm,
    setRecurringForm,
    recurring,
    refreshFinancialData,
  } = props;
  return (
    <>
      <section className="glass-card section-gap">
        <h2>Settle Up</h2>
        <p className="muted">Record full or partial payments.</p>
        <div className="chip-row" style={{ marginTop: "0.7rem", gap: "0.5rem" }}>
          <select value={paymentForm.fromMemberId} onChange={(event) => setPaymentForm((prev) => ({ ...prev, fromMemberId: event.target.value }))}>
            <option value="">From</option>
            {groups.find((group) => group.id === activeGroupId)?.members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
          <select value={paymentForm.toMemberId} onChange={(event) => setPaymentForm((prev) => ({ ...prev, toMemberId: event.target.value }))}>
            <option value="">To</option>
            {groups.find((group) => group.id === activeGroupId)?.members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
          <input placeholder="Amount" value={paymentForm.amount} onChange={(event) => setPaymentForm((prev) => ({ ...prev, amount: event.target.value }))} />
          <select value={paymentForm.method} onChange={(event) => setPaymentForm((prev) => ({ ...prev, method: event.target.value }))}>
            {["cash", "bank_transfer", "upi", "venmo", "paypal", "other"].map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
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
              <p>
                {payment.fromMember.name} paid {payment.toMember.name}
              </p>
              <p>
                ${(payment.amountCents / 100).toFixed(2)} · {payment.method}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="glass-card section-gap">
        <h2>Recurring Expenses</h2>
        <div className="chip-row" style={{ marginTop: "0.7rem", gap: "0.5rem" }}>
          <input placeholder="Title" value={recurringForm.title} onChange={(event) => setRecurringForm((prev) => ({ ...prev, title: event.target.value }))} />
          <input placeholder="Amount" value={recurringForm.amount} onChange={(event) => setRecurringForm((prev) => ({ ...prev, amount: event.target.value }))} />
          <input
            placeholder="Category"
            value={recurringForm.category}
            onChange={(event) => setRecurringForm((prev) => ({ ...prev, category: event.target.value }))}
          />
          <select value={recurringForm.cadence} onChange={(event) => setRecurringForm((prev) => ({ ...prev, cadence: event.target.value }))}>
            {["weekly", "monthly", "quarterly"].map((cadence) => (
              <option key={cadence} value={cadence}>
                {cadence}
              </option>
            ))}
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
              <p>
                {entry.title} · {entry.cadence}
              </p>
              <p>${(entry.amountCents / 100).toFixed(2)}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
