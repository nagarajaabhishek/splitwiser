import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getBootstrapData } from "@/lib/db/bootstrap";
import { schemaDriftMigrateHint } from "@/lib/db/schema-drift";

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
    const prismaMeta = error instanceof Prisma.PrismaClientKnownRequestError ? error.meta : undefined;
    console.error("[api/bootstrap]", prismaCode ?? message, prismaMeta ? JSON.stringify(prismaMeta) : "", error);
    const schemaHint = schemaDriftMigrateHint(message);
    const hint =
      schemaHint ??
      "App uses Prisma + Neon WebSocket driver: set DATABASE_URL and DIRECT_URL on Vercel Production (see .env.example). If the DB is new or old, run: npx prisma migrate deploy";
    return NextResponse.json(
      {
        error: message,
        prismaCode,
        hint,
        groups: [],
        activeGroupId: null,
        members: [],
        needsOnboarding: true,
      },
      { status: 503 },
    );
  }
}
