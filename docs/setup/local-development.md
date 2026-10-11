# Local development

## 1. Clone the repo

```bash
git clone https://github.com/thepracticalengineer/nextjs-blog-cms.git
cd nextjs-blog-cms
```

## 2. Install dependencies

Use Node **24.21.0** (`.nvmrc`) and pnpm **10.29.3** (`packageManager` in
`package.json`). pnpm 10 is supported by Vercel and was verified against the
existing dependency graph. See the upgrade notes for current versions and deferred compatibility work.

```bash
nvm install
nvm use
corepack enable
pnpm --version             # must print 10.29.3
pnpm install --frozen-lockfile
```

If Corepack is unavailable, install the pinned package manager with
`npm install --global pnpm@10.29.3`, then run the same pnpm commands.

See [dependency upgrade notes](../dependency-upgrade.md) for migrations, image host configuration, verification, and tracked compatibility blockers.

Commit `package.json` and `pnpm-lock.yaml` together when changing dependencies.
Use `pnpm add <package>` / `pnpm add -D <package>`; do not generate an npm lockfile.
CI installs pnpm from the manifest before enabling the pnpm cache and uses the
Node patch in `.nvmrc`. Required peers are checked strictly without blanket bypasses.

Dependency build scripts are reviewed in `pnpm-workspace.yaml`: only
`unrs-resolver` is allowed to bootstrap/check its native resolver; `msw`'s optional
browser-worker copy script is ignored because no worker directory is configured.
Review new scripts before adding an approval; do not enable all dependency scripts.
The root `prepare` script installs Husky hooks normally.

For Vercel, set the project Node runtime to **24.x** and enable
`ENABLE_EXPERIMENTAL_COREPACK=1` in the project environment (Preview and
Production). `vercel.json` uses
`corepack pnpm` for frozen installation and build, so Corepack reads the exact
manifest pin instead of relying on Vercel's default pnpm version. The committed
pnpm lockfile also provides package-manager detection. Vercel manages the Node
24 patch; local development and CI pin `.nvmrc`. See [Vercel package managers](https://vercel.com/docs/package-managers).
Historical plans under `docs/superpowers/` retain their original npm commands.

## 3. Set up environment variables

Create a `.env.local` file:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_GA_MEASUREMENT_ID= # optional public Google Analytics measurement ID
LLM_KEY_ENCRYPTION_SECRET=   # exactly 32 UTF-8 bytes; 32 ASCII characters work

# Optional server-side provider fallbacks (used by legacy provider lookup)
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_GENERATIVE_AI_KEY=

# Newsletter
RESEND_API_KEY=
RESEND_FROM_EMAIL=            # verified sender address, e.g. noreply@yourdomain.com
NEWSLETTER_DELAY_MINUTES=60   # delay between publish and send (default: 60)
CRON_SECRET=                  # Vercel Cron bearer secret (production)
WEBHOOK_SECRET=               # optional shared secret for external POST schedulers
```

## 4. Set up the database

Use the complete ordered migrations in `supabase/migrations/`, not the historical `database/schema.sql` snapshot alone. Docker is required for the local stack:

```bash
pnpm dlx supabase@2.119.0 start
pnpm dlx supabase@2.119.0 status
```

Copy the local API URL, anon key and service-role key into `.env.local`. Never use production credentials for local testing. Existing local stacks need `pnpm dlx supabase@2.119.0 migration up --local`. `db reset --local` destroys local data; use it only for disposable databases. For hosted projects, verify the linked target and review migration history before `pnpm dlx supabase@2.119.0 db push`. Do not reset a shared or production database.

`database/` contains historical snapshots, policies, seed material and SQL verification. The migrations are the deployment source of truth. See [migration prerequisites](migrations.md).

## 5. Run the app

```bash
pnpm run dev
```

Supabase URL/anon key, trusted site URL and the optional Google Analytics measurement ID are public configuration and may use `NEXT_PUBLIC_`. Provider fallback keys are optional and server-only; they do not replace per-user provider key setup in Developer Settings. Keep service-role, provider encryption, Resend, cron and webhook secrets server-only and out of Git. Configure `NEXT_PUBLIC_SITE_URL=http://localhost:3000`. Optional confirmation alerts use `ADMIN_EMAIL`, `RESEND_FROM_EMAIL` and `SLACK_WEBHOOK_URL`; see [webhooks](webhooks.md). See [password recovery](../features/password-recovery.md) for redirect/template/SMTP setup.

## Social sign-in

See [Google and GitHub authentication](social-auth.md) for provider applications, exact callback allowlists, environment-specific configuration, identity policy, and rollout verification. The committed local providers remain disabled until their credentials are configured.
