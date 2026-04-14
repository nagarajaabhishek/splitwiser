import { NextResponse } from "next/server";
import { z } from "zod";
import { listLearnedDefaults, upsertLearnedDefaults } from "@/lib/db/learned-defaults";

const upsertSchema = z.object({
  entries: z.array(
    z.object({
      memberId: z.string().min(1),
      normalizedLabel: z.string().min(1),
      confidence: z.number().min(0).max(1),
      uses: z.number().int().positive().default(1),
    }),
  ),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const memberIds = searchParams.getAll("memberId").filter(Boolean);

  if (memberIds.length === 0) {
    return NextResponse.json({ entries: [] });
  }

  const entries = await listLearnedDefaults(memberIds);
  return NextResponse.json({ entries });
}

export async function POST(request: Request) {
  try {
    const payload = upsertSchema.parse(await request.json());
    await upsertLearnedDefaults(payload.entries);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid learned defaults payload";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
