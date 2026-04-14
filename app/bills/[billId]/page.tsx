type BillDetailPageProps = {
  params: Promise<{ billId: string }>;
};

async function getBill(billId: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const response = await fetch(`${baseUrl}/api/bills/${billId}`, { cache: "no-store" });
  if (!response.ok) return null;
  const json = await response.json();
  return json.bill;
}

export default async function BillDetailPage({ params }: BillDetailPageProps) {
  const { billId } = await params;
  const bill = await getBill(billId);
  if (!bill) {
    return (
      <main className="shell">
        <section className="glass-card">
          <h2>Bill Not Found</h2>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="glass-card">
        <h2>{bill.merchantName}</h2>
        <p className="muted">
          {new Date(bill.billDate).toLocaleDateString()} · ${Number(bill.totalCents / 100).toFixed(2)}
        </p>
      </section>

      <section className="glass-card" style={{ marginTop: "1rem" }}>
        <h2>Items</h2>
        <div className="items-table">
          {bill.items.map((item: { id: string; label: string; lineTotalCents: number; assignedMemberName: string | null }) => (
            <article key={item.id} className="item-row">
              <div>
                <p className="item-label">{item.label}</p>
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
