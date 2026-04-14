import Link from "next/link";
import { BillShareActions } from "@/components/BillShareActions";

type ResultPageProps = {
  params: Promise<{ billId: string }>;
};

async function getBill(billId: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const response = await fetch(`${baseUrl}/api/bills/${billId}`, { cache: "no-store" });
  if (!response.ok) return null;
  const json = await response.json();
  return json.bill;
}

export default async function ResultStepPage({ params }: ResultPageProps) {
  const { billId } = await params;
  const bill = await getBill(billId);
  if (!bill) {
    return (
      <section className="glass-card">
        <h2>Bill Not Found</h2>
      </section>
    );
  }

  return (
    <>
      <section className="glass-card">
        <h2>Completed</h2>
        <p className="muted">
          {bill.merchantName} · {new Date(bill.billDate).toLocaleDateString()} · ${(bill.totalCents / 100).toFixed(2)}
        </p>
        <BillShareActions billId={bill.id} status={bill.status} />
        <div className="chip-row" style={{ marginTop: "0.8rem" }}>
          <Link href={`/bills/${bill.id}`} className="chip chip-active">
            Open Bill Details
          </Link>
        </div>
      </section>
    </>
  );
}
