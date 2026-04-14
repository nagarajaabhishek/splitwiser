import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getBootstrapData } from "@/lib/db/bootstrap";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const activeGroupId = searchParams.get("activeGroupId") ?? undefined;
    const bootstrap = await getBootstrapData(activeGroupId);
    return NextResponse.json(bootstrap);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bootstrap failed";
    const prismaCode =
      error instanceof Prisma.PrismaClientKnownRequestError
        ? error.code
        : error instanceof Prisma.PrismaClientInitializationError
          ? error.errorCode
          : undefined;
    console.error("[api/bootstrap]", prismaCode ?? message, error);
    return NextResponse.json(
      {
        error: message,
        prismaCode,
        hint: "App uses Prisma + Neon WebSocket driver: set DATABASE_URL (Neon pooled or direct) and DIRECT_URL (direct, for migrations) on Vercel Production. See .env.example. Run: DIRECT_URL=… npx prisma migrate deploy",
        groups: [],
        activeGroupId: null,
        members: [],
        needsOnboarding: true,
      },
      { status: 503 },
    );
  }
}
