export type SettlementBalance = {
  memberId: string;
  memberName: string;
  balanceCents: number;
};

export type SettlementTransfer = {
  fromMemberId: string;
  fromMemberName: string;
  toMemberId: string;
  toMemberName: string;
  amountCents: number;
};

export function computeSettlements(balances: SettlementBalance[]): SettlementTransfer[] {
  const debtors = balances
    .filter((entry) => entry.balanceCents < 0)
    .map((entry) => ({ ...entry, remaining: Math.abs(entry.balanceCents) }))
    .sort((a, b) => b.remaining - a.remaining);
  const creditors = balances
    .filter((entry) => entry.balanceCents > 0)
    .map((entry) => ({ ...entry, remaining: entry.balanceCents }))
    .sort((a, b) => b.remaining - a.remaining);

  const transfers: SettlementTransfer[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const amount = Math.min(debtor.remaining, creditor.remaining);
    if (amount > 0) {
      transfers.push({
        fromMemberId: debtor.memberId,
        fromMemberName: debtor.memberName,
        toMemberId: creditor.memberId,
        toMemberName: creditor.memberName,
        amountCents: amount,
      });
      debtor.remaining -= amount;
      creditor.remaining -= amount;
    }
    if (debtor.remaining === 0) i += 1;
    if (creditor.remaining === 0) j += 1;
  }

  return transfers;
}
