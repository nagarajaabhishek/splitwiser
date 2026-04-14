import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

/**
 * Minimal DB probe for production debugging. Does not return connection strings.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true as const });
  } catch (error) {
    const prismaCode =
      error instanceof Prisma.PrismaClientKnownRequestError
        ? error.code
        : error instanceof Prisma.PrismaClientInitializationError
          ? error.errorCode
          : undefined;
    const message = error instanceof Error ? error.message : "Database unreachable";
    console.error("[api/health/db]", prismaCode ?? message, error);
    return NextResponse.json(
      {
        ok: false as const,
        prismaCode,
        message,
      },
      { status: 503 },
    );
  }
}
