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
    return NextResponse.json(
      {
        error: message,
        hint: "Confirm DATABASE_URL on Vercel and run prisma migrate deploy against the production database.",
        groups: [],
        activeGroupId: null,
        members: [],
        needsOnboarding: true,
      },
      { status: 500 },
    );
  }
}
