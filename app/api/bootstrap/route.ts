import { NextResponse } from "next/server";
import { getBootstrapData } from "@/lib/db/bootstrap";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const activeGroupId = searchParams.get("activeGroupId") ?? undefined;
    const bootstrap = await getBootstrapData(activeGroupId);
    return NextResponse.json(bootstrap);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bootstrap failed";
    console.error("[api/bootstrap]", message, error);
    return NextResponse.json(
      {
        error: message,
        hint: "Confirm DATABASE_URL on Vercel (Production) and run prisma migrate deploy against that Neon database. Use the pooled connection string; add ?connect_timeout=15 if timeouts occur.",
        groups: [],
        activeGroupId: null,
        members: [],
        needsOnboarding: true,
      },
      { status: 503 },
    );
  }
}
