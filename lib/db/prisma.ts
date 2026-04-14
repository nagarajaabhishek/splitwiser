import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Reuse one client per serverless isolate (Vercel / Node). Caching only in dev
 * can exhaust Neon connections because every invocation created a new PrismaClient.
 */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["error"],
  });

globalForPrisma.prisma = prisma;
