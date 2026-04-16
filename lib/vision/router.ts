import { GeminiVisionProvider } from "@/lib/vision/gemini-provider";
import { OpenAIVisionProvider } from "@/lib/vision/openai-provider";
import type { VisionProviderName } from "@/lib/vision/provider";
import type { NormalizedBillDraft } from "@/lib/schemas/bill";
import { StubVisionProvider } from "@/lib/vision/stub-provider";

const providers = {
  stub: new StubVisionProvider(),
  gemini: new GeminiVisionProvider(),
  openai: new OpenAIVisionProvider(),
};

function shouldRunHybrid(draft: NormalizedBillDraft, deltaThreshold: number): boolean {
  return Boolean(draft.receiptItemCount && draft.receiptItemCount - draft.items.length >= deltaThreshold);
}

function itemKey(item: NormalizedBillDraft["items"][number]): string {
  return `${(item.originalLabel ?? item.label).toLowerCase()}|${item.lineTotalCents}|${item.quantity}`;
}

export function mergeDraftItemsKeepingTrueRepeats(
  base: NormalizedBillDraft,
  incoming: NormalizedBillDraft,
): { merged: NormalizedBillDraft; kept: number; dropped: number } {
  const grouped = new Map<string, Array<NormalizedBillDraft["items"][number]>>();
  const pushToGroup = (item: NormalizedBillDraft["items"][number]) => {
    const key = itemKey(item);
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  };
  base.items.forEach(pushToGroup);
  const before = Array.from(grouped.values()).reduce((sum, list) => sum + list.length, 0);
  const incomingGroups = new Map<string, Array<NormalizedBillDraft["items"][number]>>();
  for (const item of incoming.items) {
    const key = itemKey(item);
    incomingGroups.set(key, [...(incomingGroups.get(key) ?? []), item]);
  }
  for (const [key, incItems] of incomingGroups.entries()) {
    const baseItems = grouped.get(key) ?? [];
    if (incItems.length > baseItems.length) {
      grouped.set(key, [...baseItems, ...incItems.slice(baseItems.length)]);
    }
  }
  const mergedItems = Array.from(grouped.values()).flat();
  const kept = mergedItems.length;
  const dropped = Math.max(0, before + incoming.items.length - kept);
  const subtotalCents = mergedItems.reduce((sum, item) => sum + item.lineTotalCents, 0);
  const taxCents = Math.max(0, base.totalCents - subtotalCents);
  return {
    merged: {
      ...base,
      subtotalCents,
      taxCents,
      totalCents: subtotalCents + taxCents,
      items: mergedItems.map((item, idx) => ({ ...item, id: `item-${idx + 1}` })),
    },
    kept,
    dropped,
  };
}

type HybridPassTrace = {
  pass: "primary" | "secondary" | "retry";
  provider: VisionProviderName;
  itemCount: number;
};

type HybridDiagnostics = {
  enabled: boolean;
  passCount: number;
  postPassItemCounts: number[];
  secondaryProviderUsed: boolean;
  retryTriggered: boolean;
  remainingDelta?: number;
  mergeKept: number;
  mergeDropped: number;
  traces: HybridPassTrace[];
};

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("VISION_TIMEOUT")), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

export async function extractWithVisionRouter(file: File): Promise<{
  draft: Awaited<ReturnType<typeof providers.stub.extractBill>>;
  providerUsed: VisionProviderName | "fallback";
  fallbackReason?: string;
  hybridDiagnostics?: HybridDiagnostics;
}> {
  const mode = (process.env.VISION_PROVIDER_MODE ?? "router") as "router" | "stub";
  if (mode === "stub") {
    const draft = await providers.stub.extractBill(file);
    return { draft, providerUsed: "stub" };
  }

  const primary = (process.env.VISION_PRIMARY_PROVIDER ?? "gemini") as VisionProviderName;
  const fallback = (process.env.VISION_FALLBACK_PROVIDER ?? "openai") as VisionProviderName;
  const timeoutMs = Number(process.env.VISION_TIMEOUT_MS ?? 30000);
  const hybridEnabled = (process.env.VISION_RECALL_HYBRID_ENABLED ?? "true") === "true";
  const deltaThreshold = Number(process.env.VISION_RECALL_ITEM_DELTA_THRESHOLD ?? 3);
  const maxExtraPasses = Math.max(0, Number(process.env.VISION_RECALL_MAX_EXTRA_PASSES ?? 2));

  function knownLineHintsFromDraft(draft: NormalizedBillDraft): string[] {
    return draft.items.map((item) => `${item.originalLabel ?? item.label}|${item.lineTotalCents}`);
  }

  const traces: HybridPassTrace[] = [];
  const postPassItemCounts: number[] = [];
  let mergeKept = 0;
  let mergeDropped = 0;
  let retryTriggered = false;
  let secondaryProviderUsed = false;

  try {
    let draft = await withTimeout(providers[primary].extractBill(file), timeoutMs);
    traces.push({ pass: "primary", provider: primary, itemCount: draft.items.length });
    postPassItemCounts.push(draft.items.length);

    if (hybridEnabled && maxExtraPasses > 0 && shouldRunHybrid(draft, deltaThreshold)) {
      const secondary = fallback;
      secondaryProviderUsed = true;
      const secondaryDraft = await withTimeout(providers[secondary].extractBill(file), timeoutMs);
      traces.push({ pass: "secondary", provider: secondary, itemCount: secondaryDraft.items.length });
      const mergedSecondary = mergeDraftItemsKeepingTrueRepeats(draft, secondaryDraft);
      draft = mergedSecondary.merged;
      mergeKept += mergedSecondary.kept;
      mergeDropped += mergedSecondary.dropped;
      postPassItemCounts.push(draft.items.length);

      if (maxExtraPasses > 1 && shouldRunHybrid(draft, deltaThreshold)) {
        retryTriggered = true;
        const retryDraft = await withTimeout(
          providers[primary].extractBill(file, {
            retryMissingOnly: true,
            knownLineHints: knownLineHintsFromDraft(draft),
          }),
          timeoutMs,
        );
        traces.push({ pass: "retry", provider: primary, itemCount: retryDraft.items.length });
        const mergedRetry = mergeDraftItemsKeepingTrueRepeats(draft, retryDraft);
        draft = mergedRetry.merged;
        mergeKept += mergedRetry.kept;
        mergeDropped += mergedRetry.dropped;
        postPassItemCounts.push(draft.items.length);
      }
    }

    return {
      draft,
      providerUsed: primary,
      hybridDiagnostics: {
        enabled: hybridEnabled,
        passCount: traces.length,
        postPassItemCounts,
        secondaryProviderUsed,
        retryTriggered,
        remainingDelta: draft.receiptItemCount ? Math.max(0, draft.receiptItemCount - draft.items.length) : undefined,
        mergeKept,
        mergeDropped,
        traces,
      },
    };
  } catch (primaryError) {
    try {
      let draft = await withTimeout(providers[fallback].extractBill(file), timeoutMs);
      const traces: HybridPassTrace[] = [{ pass: "primary", provider: fallback, itemCount: draft.items.length }];
      const postPassItemCounts = [draft.items.length];
      let mergeKept = 0;
      let mergeDropped = 0;
      let retryTriggered = false;
      if (
        hybridEnabled &&
        maxExtraPasses > 0 &&
        shouldRunHybrid(draft, deltaThreshold)
      ) {
        retryTriggered = true;
        const retryDraft = await withTimeout(
          providers[fallback].extractBill(file, {
            retryMissingOnly: true,
            knownLineHints: knownLineHintsFromDraft(draft),
          }),
          timeoutMs,
        );
        traces.push({ pass: "retry", provider: fallback, itemCount: retryDraft.items.length });
        const mergedRetry = mergeDraftItemsKeepingTrueRepeats(draft, retryDraft);
        draft = mergedRetry.merged;
        mergeKept += mergedRetry.kept;
        mergeDropped += mergedRetry.dropped;
        postPassItemCounts.push(draft.items.length);
      }
      return {
        draft,
        providerUsed: fallback,
        fallbackReason: `${primary}:${String(primaryError)}`,
        hybridDiagnostics: {
          enabled: hybridEnabled,
          passCount: traces.length,
          postPassItemCounts,
          secondaryProviderUsed: false,
          retryTriggered,
          remainingDelta: draft.receiptItemCount ? Math.max(0, draft.receiptItemCount - draft.items.length) : undefined,
          mergeKept,
          mergeDropped,
          traces,
        },
      };
    } catch (fallbackError) {
      throw new Error(`VISION_ROUTER_FAILED:${primary}:${String(primaryError)}|${fallback}:${String(fallbackError)}`);
    }
  }
}
