import { prisma } from "@/lib/db/prisma";
import type { LearnedDefaultRecord } from "@/lib/engine/agent";

export async function listLearnedDefaults(memberIds: string[]): Promise<LearnedDefaultRecord[]> {
  const records = await prisma.learnedDefault.findMany({
    where: { memberId: { in: memberIds } },
  });

  return records.map((record) => ({
    memberId: record.memberId,
    normalizedLabel: record.normalizedLabel,
    confidence: record.confidence,
    uses: record.uses,
  }));
}

export async function upsertLearnedDefaults(entries: LearnedDefaultRecord[]): Promise<void> {
  for (const entry of entries) {
    await prisma.learnedDefault.upsert({
      where: {
        memberId_normalizedLabel: {
          memberId: entry.memberId,
          normalizedLabel: entry.normalizedLabel,
        },
      },
      create: {
        memberId: entry.memberId,
        normalizedLabel: entry.normalizedLabel,
        confidence: entry.confidence,
        uses: entry.uses,
      },
      update: {
        confidence: Math.min(0.98, entry.confidence),
        uses: { increment: 1 },
        lastUsedAt: new Date(),
      },
    });
  }
}
