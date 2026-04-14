# Splitwiser AI

Splitwiser AI helps households upload receipts, assign line items to members, and finalize settlement totals.

## Local Development

1. Copy env template and set values:

```bash
cp .env.example .env
```

2. Install deps and prepare Prisma:

```bash
npm install
npm run prisma:generate
```

3. Run app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Production Database Strategy

Use a managed Postgres database in production (Neon, Supabase, RDS, Render, etc.).

- Do not use SQLite for Vercel production runtime.
- Set `DATABASE_URL` to your managed Postgres connection string.
- Keep SSL enabled if required by your provider (for example `?sslmode=require`).

## Neon Branch Contract

This repo uses one Neon project with branch isolation:

- Local development and CLI migration work: Neon `dev` branch
- Vercel production runtime: Neon `main` branch

Keep these branch URLs separate so local schema/data experiments never affect production.

## Vercel Deployment

This repo includes `vercel.json` with a minimal Next.js framework config.

Build flow is handled by `npm run build`:

- `npm run prisma:generate`
- `next build`

### Vercel Setup Steps

1. Import the repo into Vercel.
2. Set Framework Preset to `Next.js` (auto-detected in most cases).
3. Add production environment variables (below) in Vercel Project Settings.
4. Deploy.
5. Run migrations against production DB:

```bash
npm run prisma:migrate:deploy
```

## Prisma Migration Workflow

Use migration files as the source of truth for schema changes.

### Local development (Neon `dev` branch)

```bash
npx prisma migrate dev
```

- Review generated SQL migration files in `prisma/migrations`
- Commit migration files with your code changes

### Production rollout (Neon `main` branch)

```bash
npm run prisma:migrate:deploy
```

- Run this against production DB during release
- Avoid `prisma db push` for production schema evolution

## Environment Variables

### Required

- `DATABASE_URL`

### DATABASE_URL Mapping

- Local `.env`: Neon `dev` branch connection string
- Vercel Production env: Neon `main` branch connection string
- Use `postgresql://...?...sslmode=require` format for Neon

### Recommended Agent/Vision Controls

- `AI_ENABLED` (default: `true`)
- `AI_PRIMARY_PROVIDER` (default: `openai`)
- `AI_FALLBACK_PROVIDER` (default: `gemini`)
- `AI_TIMEOUT_MS` (default: `5000`)
- `AI_CONFIDENCE_THRESHOLD` (default: `0.8`)
- `VISION_PROVIDER_MODE` (default: `router`)
- `VISION_PRIMARY_PROVIDER` (default: `gemini`)
- `VISION_FALLBACK_PROVIDER` (default: `openai`)
- `VISION_TIMEOUT_MS` (default: `12000`)
- `VISION_MAX_UPLOAD_MB` (default: `12`)
- `VISION_LABEL_AI_ENABLED` (default: `true`, applies AI label cleanup after OCR)
- `VISION_LABEL_CONFIDENCE_THRESHOLD` (default: `0.8`, minimum confidence for AI label replacement)

### Provider Credentials (at least one provider should be fully configured)

- `OPENAI_API_KEY`
- `OPENAI_MODEL` (default: `gpt-4o-mini`)
- `OPENAI_VISION_MODEL` (default: `gpt-4o-mini`)
- `GEMINI_API_KEY`
- `GEMINI_MODEL` (default: `gemini-1.5-flash`)
- `GEMINI_VISION_MODEL` (default: `gemini-1.5-flash`)

## Secrets Safety Checklist

- Keep `.env` untracked (already ignored by `.gitignore`)
- Never paste real API keys in docs, commits, or PR comments
- Rotate provider keys immediately if exposed
- Verify Vercel env values have no extra quotes/newlines
- Before push, run:

```bash
git status --short
git diff -- .env .env.example
```

## Deployment Smoke Test Checklist

After each production deploy, validate:

1. Create a household/group from the home page.
2. Upload a bill image.
3. Run suggestions (`/api/agent/suggest`) and confirm proposals return.
4. Confirm low-confidence items appear in review flow.
5. Finalize bill (`/api/bills/finalize`) and verify transactions are created.
6. Reload and confirm data persists (DB persistence check).

## Rollback Runbook

If production fails:

1. In Vercel, redeploy the most recent successful deployment.
2. Verify app loads and API routes respond.
3. If failure is schema-related:
   - Inspect migration status and DB logs.
   - Re-run `prisma migrate deploy` against production DB.
4. If failure is env-related:
   - Compare current Vercel env vars against `.env.example`.
   - Restore missing or invalid keys and redeploy.
5. Log incident details: deploy id, root cause, fix, prevention action.

## Operations Baseline

- Review Vercel function logs after each deploy.
- Add uptime monitoring for the site URL.
- Track recurring API errors and provider timeouts.
