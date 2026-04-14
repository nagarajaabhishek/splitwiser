/** Prisma reports this when the DB was never migrated (or is behind `schema.prisma`). */
export function schemaDriftMigrateHint(errorMessage: string): string | undefined {
  if (errorMessage.includes("does not exist in the current database")) {
    return "Apply pending migrations: set DIRECT_URL and DATABASE_URL (Neon), then run `npx prisma migrate deploy`. Redeploying to Vercel runs migrate automatically during `npm run build` if those vars are available at build time.";
  }
  return undefined;
}
