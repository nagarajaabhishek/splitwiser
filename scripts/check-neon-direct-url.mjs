/**
 * Prisma `migrate deploy` uses DIRECT_URL. It must be Neon's **direct** endpoint (host must not
 * contain `-pooler`). Using the pooler URL for both vars breaks migrations and confuses Prisma.
 *
 * Loads `.env` from cwd and **applies every key** (overwrites `process.env`) so values in `.env`
 * win over stale exports from your shell (e.g. an old `export DIRECT_URL=…-pooler…`).
 * On Vercel there is usually no `.env` file, so platform env is unchanged.
 */
import fs from "node:fs";
import path from "node:path";

function loadEnvFile() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

loadEnvFile();

if (process.env.SKIP_DIRECT_URL_CHECK === "1") {
  process.exit(0);
}

const d = process.env.DIRECT_URL ?? "";
if (!d.trim()) {
  console.error(
    "check-neon-direct-url: DIRECT_URL is empty. Set it to Neon’s direct connection (non-pooler).",
  );
  process.exit(1);
}
if (d.includes("-pooler")) {
  console.error(
    "check-neon-direct-url: DIRECT_URL must NOT use the pooler host (-pooler in the hostname).\n" +
      "In Neon: Dashboard → your project → Connection details → copy **Direct connection** for DIRECT_URL.\n" +
      "Keep DATABASE_URL as **Connection pooling** (pooler) with ?pgbouncer=true if needed.",
  );
  process.exit(1);
}
