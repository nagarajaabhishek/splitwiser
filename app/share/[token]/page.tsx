type SharedBillPageProps = {
  params: Promise<{ token: string }>;
};

async function getSharedBill(token: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const response = await fetch(`${baseUrl}/api/share/${token}`, { cache: "no-store" });
  if (!response.ok) return null;
  const json = await response.json();
  return json.bill;
}

export default async function SharedBillPage({ params }: SharedBillPageProps) {
  const { token } = await params;
  const bill = await getSharedBill(token);
  if (!bill) {
    return (
      <main className="shell">
        <section className="glass-card">
          <h2>Shared Bill Not Found</h2>
          <p className="muted">This shared link is invalid or no longer available.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="glass-card">
        <h2>{bill.merchantName}</h2>
        <p className="muted">
          Read-only shared view · {new Date(bill.billDate).toLocaleDateString()} · ${(bill.totalCents / 100).toFixed(2)}
          {bill.category ? ` · ${bill.category}` : ""}
        </p>
      </section>

      <section className="glass-card" style={{ marginTop: "1rem" }}>
        <h2>Items</h2>
        <div className="items-table">
          {bill.items.map(
            (item: {
              id: string;
              label: string;
              lineTotalCents: number;
              assignedMemberName: string | null;
              productCategory?: string | null;
            }) => (
            <article key={item.id} className="item-row">
              <div>
                <p className="item-label">{item.label}</p>
                {item.productCategory ? (
                  <span className="chip" style={{ marginTop: "0.25rem", display: "inline-block" }}>
                    {item.productCategory}
                  </span>
                ) : null}
                <p className="muted">{item.assignedMemberName ?? "Unassigned"}</p>
              </div>
              <p>${(item.lineTotalCents / 100).toFixed(2)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="glass-card" style={{ marginTop: "1rem" }}>
        <h2>Settlements</h2>
        <div className="items-table">
          {bill.settlements.length === 0 ? (
            <p className="muted">No transfers needed.</p>
          ) : (
            bill.settlements.map(
              (transfer: { fromMemberName: string; toMemberName: string; amountCents: number }, index: number) => (
                <article key={`${transfer.fromMemberName}-${index}`} className="item-row">
                  <p className="item-label">
                    {transfer.fromMemberName} pays {transfer.toMemberName}
                  </p>
                  <p>${(transfer.amountCents / 100).toFixed(2)}</p>
                </article>
              ),
            )
          )}
        </div>
      </section>
    </main>
  );
}
