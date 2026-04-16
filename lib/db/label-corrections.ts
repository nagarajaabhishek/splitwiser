import { prisma } from "@/lib/db/prisma";
import { normalizeLabel } from "@/lib/engine/agent";

type LabelCorrectionInput = {
  householdId?: string;
  merchantName: string;
  sourceLabel: string;
  correctedLabel: string;
  confidence?: number;
};

export function normalizeMerchantKey(merchantName: string): string {
  return normalizeLabel(merchantName);
}

export async function listLabelCorrections(params: {
  merchantName: string;
  sourceLabels: string[];
}): Promise<Map<string, { correctedLabel: string; confidence: number; uses: number }>> {
  const merchantNormalized = normalizeMerchantKey(params.merchantName);
  const sourceNormalized = params.sourceLabels.map((entry) => normalizeLabel(entry)).filter(Boolean);
  if (!merchantNormalized || sourceNormalized.length === 0) return new Map();

  const records = await prisma.labelCorrection.findMany({
    where: {
      merchantNormalized,
      sourceNormalized: { in: sourceNormalized },
    },
  });

  return new Map(records.map((row) => [row.sourceNormalized, { correctedLabel: row.correctedLabel, confidence: row.confidence, uses: row.uses }]));
}

export async function upsertLabelCorrections(entries: LabelCorrectionInput[]): Promise<void> {
  for (const entry of entries) {
    const merchantNormalized = normalizeMerchantKey(entry.merchantName);
    const sourceNormalized = normalizeLabel(entry.sourceLabel);
    const correctedLabel = entry.correctedLabel.trim();
    if (!merchantNormalized || !sourceNormalized || !correctedLabel) continue;
    if (sourceNormalized === normalizeLabel(correctedLabel)) continue;

    await prisma.labelCorrection.upsert({
      where: {
        merchantNormalized_sourceNormalized: {
          merchantNormalized,
          sourceNormalized,
        },
      },
      create: {
        householdId: entry.householdId,
        merchantNormalized,
        sourceNormalized,
        correctedLabel,
        confidence: Math.max(0.5, Math.min(0.99, entry.confidence ?? 0.92)),
        uses: 1,
      },
      update: {
        correctedLabel,
        confidence: Math.max(0.5, Math.min(0.99, entry.confidence ?? 0.92)),
        uses: { increment: 1 },
        lastUsedAt: new Date(),
      },
    });
  }
}
