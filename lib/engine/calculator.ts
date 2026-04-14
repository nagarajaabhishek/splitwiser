import type { ItemAssignment, Member, NormalizedBillItem } from "@/lib/schemas/bill";

export type MemberTotals = {
  memberId: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
};

export type CalculationResult = {
  memberTotals: MemberTotals[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
};

function allocateByWeights(totalCents: number, weights: number[]): number[] {
  if (weights.length === 0) {
    return [];
  }

  const safeWeights = weights.map((weight) => Math.max(0, weight));
  const denominator = safeWeights.reduce((sum, weight) => sum + weight, 0);

  if (denominator === 0) {
    const equal = Array.from({ length: safeWeights.length }, () => 0);
    for (let i = 0; i < totalCents; i += 1) {
      equal[i % safeWeights.length] += 1;
    }
    return equal;
  }

  const exact = safeWeights.map((weight) => (weight / denominator) * totalCents);
  const floored = exact.map((value) => Math.floor(value));
  let remaining = totalCents - floored.reduce((sum, value) => sum + value, 0);

  const ranked = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);

  for (let i = 0; i < ranked.length && remaining > 0; i += 1) {
    floored[ranked[i].index] += 1;
    remaining -= 1;
  }

  return floored;
}

function splitLineAcrossMembers(lineTotalCents: number, memberIds: string[]): Map<string, number> {
  const allocation = new Map<string, number>();
  const uniqueMembers = [...new Set(memberIds)];
  if (uniqueMembers.length === 0) {
    return allocation;
  }

  const base = Math.floor(lineTotalCents / uniqueMembers.length);
  let remainder = lineTotalCents - base * uniqueMembers.length;

  uniqueMembers.forEach((memberId, index) => {
    const bonus = remainder > 0 ? 1 : 0;
    if (remainder > 0) {
      remainder -= 1;
    }
    allocation.set(memberId, base + bonus + (index === 0 ? 0 : 0));
  });

  return allocation;
}

function splitLineCustom(lineTotalCents: number, memberWeights: Array<{ memberId: string; weight: number }>) {
  const allocation = new Map<string, number>();
  if (memberWeights.length === 0) {
    return allocation;
  }
  const centsByWeight = allocateByWeights(
    lineTotalCents,
    memberWeights.map((entry) => entry.weight),
  );
  memberWeights.forEach((entry, index) => {
    allocation.set(entry.memberId, centsByWeight[index] ?? 0);
  });
  return allocation;
}

function splitLineExact(lineTotalCents: number, memberWeights: Array<{ memberId: string; weight: number }>) {
  const allocation = new Map<string, number>();
  if (memberWeights.length === 0) return allocation;
  const floored = memberWeights.map((entry) => ({
    memberId: entry.memberId,
    cents: Math.max(0, Math.floor(entry.weight)),
    remainder: Math.max(0, entry.weight) - Math.floor(Math.max(0, entry.weight)),
  }));
  let assigned = floored.reduce((sum, entry) => sum + entry.cents, 0);
  if (assigned > lineTotalCents) {
    let over = assigned - lineTotalCents;
    floored.sort((a, b) => b.cents - a.cents);
    for (const entry of floored) {
      if (over <= 0) break;
      const delta = Math.min(entry.cents, over);
      entry.cents -= delta;
      over -= delta;
    }
  } else if (assigned < lineTotalCents) {
    let remaining = lineTotalCents - assigned;
    floored.sort((a, b) => b.remainder - a.remainder);
    let cursor = 0;
    while (remaining > 0) {
      floored[cursor % floored.length].cents += 1;
      remaining -= 1;
      cursor += 1;
    }
  }
  assigned = floored.reduce((sum, entry) => sum + entry.cents, 0);
  if (assigned !== lineTotalCents && floored.length > 0) {
    floored[0].cents += lineTotalCents - assigned;
  }
  for (const entry of floored) allocation.set(entry.memberId, entry.cents);
  return allocation;
}

export function calculateMemberTotals(params: {
  items: NormalizedBillItem[];
  assignments: ItemAssignment[];
  members: Member[];
  taxCents: number;
  expectedTotalCents?: number;
}): CalculationResult {
  const { items, assignments, members, taxCents, expectedTotalCents } = params;
  const memberOrder = members.map((member) => member.id);
  const subtotalByMember = new Map<string, number>(memberOrder.map((id) => [id, 0]));

  const assignmentByItem = new Map(assignments.map((assignment) => [assignment.itemId, assignment]));

  for (const item of items) {
    const assignment = assignmentByItem.get(item.id);
    const mode = assignment?.mode ?? "single";
    const memberIds = assignment?.memberIds?.length ? assignment.memberIds : [memberOrder[0]];

    let lineSplit = splitLineAcrossMembers(item.lineTotalCents, memberIds);
    if (mode === "single") {
      lineSplit = splitLineAcrossMembers(item.lineTotalCents, [memberIds[0]]);
    } else if (mode === "custom" || mode === "percentage" || mode === "shares") {
      const weights =
        assignment?.memberWeights?.filter((entry) => memberIds.includes(entry.memberId)) ??
        memberIds.map((memberId) => ({ memberId, weight: 1 }));
      lineSplit = splitLineCustom(item.lineTotalCents, weights);
    } else if (mode === "exact") {
      const exact =
        assignment?.memberWeights?.filter((entry) => memberIds.includes(entry.memberId)) ??
        memberIds.map((memberId) => ({ memberId, weight: 0 }));
      lineSplit = splitLineExact(item.lineTotalCents, exact);
    } else {
      lineSplit = splitLineAcrossMembers(item.lineTotalCents, memberIds);
    }

    for (const [memberId, cents] of lineSplit) {
      subtotalByMember.set(memberId, (subtotalByMember.get(memberId) ?? 0) + cents);
    }
  }

  const subtotalVector = memberOrder.map((memberId) => subtotalByMember.get(memberId) ?? 0);
  const taxVector = allocateByWeights(taxCents, subtotalVector);

  const memberTotals = memberOrder.map((memberId, index) => {
    const subtotalCents = subtotalVector[index];
    const memberTaxCents = taxVector[index];
    return {
      memberId,
      subtotalCents,
      taxCents: memberTaxCents,
      totalCents: subtotalCents + memberTaxCents,
    };
  });

  const currentTotalCents = memberTotals.reduce((sum, entry) => sum + entry.totalCents, 0);
  const targetTotalCents =
    expectedTotalCents ?? items.reduce((sum, item) => sum + item.lineTotalCents, 0) + taxCents;
  let reconciliation = targetTotalCents - currentTotalCents;

  if (reconciliation !== 0 && memberTotals.length > 0) {
    const ranked = [...memberTotals].sort((a, b) => b.totalCents - a.totalCents || a.memberId.localeCompare(b.memberId));
    let cursor = 0;
    while (reconciliation !== 0) {
      const pick = ranked[cursor % ranked.length];
      pick.totalCents += reconciliation > 0 ? 1 : -1;
      pick.taxCents += reconciliation > 0 ? 1 : -1;
      reconciliation += reconciliation > 0 ? -1 : 1;
      cursor += 1;
    }
  }

  return {
    memberTotals,
    subtotalCents: memberTotals.reduce((sum, member) => sum + member.subtotalCents, 0),
    taxCents: memberTotals.reduce((sum, member) => sum + member.taxCents, 0),
    totalCents: memberTotals.reduce((sum, member) => sum + member.totalCents, 0),
  };
}
