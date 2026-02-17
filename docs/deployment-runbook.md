# Deployment Runbook (Museum Guide)

This is a practical checklist for deploying **web + API + database** safely, with focus on avoiding surprise Firebase/LLM costs.

## 1. Pre-Deploy Checklist

- Confirm current branch is green locally:
  - `yarn --cwd apps/api build`
  - `yarn --cwd apps/web build`
- Confirm DB migrations are generated and committed.
- Confirm legal/trust pages are published and linked in footer/nav:
  - Privacy policy
  - Terms of use
  - Public questions disclosure
- Confirm cookie banner is enabled in web for production.
- Confirm usage limits in `apps/api/src/lib/usage-limit-constants.ts` are intentional for the target environment.
- Confirm Firebase admin users are known (who should have `admin: true`).
- Confirm `SIGNUP_MODE` is set to the intended mode (`open`, `allowlist`, `cap`).
- Confirm Sentry is configured for both web and API with sensitive-data scrubbing enabled.

## 2. Environment Variables

## Web (`apps/web`)

Required:

- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`

Optional but recommended:

- `NEXT_PUBLIC_FEEDBACK_URL`
- `NEXT_PUBLIC_WAITLIST_URL`

## API (`apps/api`)

Core:

- `PORT`
- `FRONTEND_URL`

Firebase Admin credentials (choose one mode):

1. Service account env vars:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY` (with `\\n` escaped newlines)

2. Application Default Credentials (ADC):

- `GOOGLE_CLOUD_PROJECT` (recommended)

Signup policy and access:

- `SIGNUP_MODE` = `open` | `allowlist` | `cap`
- `SIGNUP_ALLOWLIST` (comma-separated emails for allowlist mode)

Auth rate limiting:

- `AUTH_VERIFY_RATE_LIMIT_WINDOW_MS` (default: `60000`)
- `AUTH_VERIFY_RATE_LIMIT_MAX` (default: `180`)
- `TRUST_PROXY_HOPS` (critical in production behind proxy/LB)

Notes:

- If behind one proxy (typical), set `TRUST_PROXY_HOPS=1`.
- Wrong `TRUST_PROXY_HOPS` can cause bad per-IP rate limiting behavior.

AI providers:

- `OPENAI_API_KEY` and related model vars (if using OpenAI path)
- `GEMINI_API_KEY` (if using Gemini path)

Debug/ops flags:

- `DB_QUERY_BILLING_LOGS` (`1` by default unless set to `0`)
- `DEBUG_USAGE_LIMITS` (`1` to debug usage checks)

Observability and analytics:

- `NEXT_PUBLIC_GA_MEASUREMENT_ID` (if GA is enabled)
- `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` (depending on app runtime wiring)
- Any provider-specific Sentry env flags used in build/runtime setup

## 3. Database + Prisma

Before deploying API code that depends on new tables, run migrations first.

Typical order:

1. Deploy/run DB migration
2. Deploy API
3. Deploy Web

Prisma commands (from repo root):

- `yarn workspace @repo/db prisma migrate deploy`
- Optional status check: `yarn workspace @repo/db prisma migrate status`

Why this matters:

- If usage tables are missing, usage enforcement falls back and logs warnings.
- If prompt/audit/versioning tables are missing, admin prompt override features will not be reproducible.

## 4. Auth and Admin Setup

After deploy:

- Verify `/auth/status` works for signed-in users.
- Grant admin claim to required accounts:
  - `yarn workspace api grant-admin --email you@example.com`
- Verify admin-only routes reject non-admins.

## 5. Cost Guardrails (High Priority)

Before opening traffic, verify:

- User and global limits are set in `apps/api/src/lib/usage-limit-constants.ts`.
- Signup controls are enabled (at least `allowlist` or `cap` during prototype).
- Auth rate limiting is active.
- DB billing telemetry is on unless intentionally disabled.

Recommended prototype posture:

- Keep signups limited (`allowlist`/`cap`)
- Keep low daily global caps
- Review logs daily for spikes in:
  - `FirebaseAuth verifyIdToken`
  - `Database prisma.*`
  - `Wikipedia/Wikidata` calls
  - LLM calls

## 6. Post-Deploy Verification (Smoke Tests)

Run these in order:

1. Open web app and sign in with Google
2. Visit `/account` and verify usage payload loads
3. Create museum/room/artifact as admin
4. Trigger a protected endpoint while signed out and confirm `AUTH_REQUIRED` UI
5. Hit auth endpoint rapidly (script/manual) and confirm `429 RATE_LIMIT_AUTH`
6. Verify waitlist route works when signup policy blocks
7. Verify usage counters increment after real actions
8. Verify cookie banner appears for first-time visitors and links to privacy/terms
9. Verify GA receives allowed metadata events only (no question text/plaque text/prompts/answers/emails/names)
10. Trigger a handled API and web error and verify Sentry event appears with scrubbed payloads
11. If intro prompt override is enabled, run one override generation and verify audit/provenance fields are persisted

## 7. Common Failure Modes

- `500` on `/auth/status`:
  - Check Firebase Admin credentials and project ID alignment.
- Everyone gets rate-limited unexpectedly:
  - Check `TRUST_PROXY_HOPS`; likely misconfigured.
- Limits not enforcing:
  - Check Prisma migration state and `DEBUG_USAGE_LIMITS` logs.
- CORS/auth failures from web:
  - Check `FRONTEND_URL` and `NEXT_PUBLIC_API_URL` mismatch.

## 8. Rollback Plan

If production issues occur:

1. Set `SIGNUP_MODE=allowlist` (or tighten allowlist)
2. Lower global caps in code and redeploy API quickly
3. If needed, temporarily disable costly features at UI layer
4. Revoke problematic admin claims if abuse is from privileged accounts

## 9. Nice-to-Have Next Improvements

- Move `express-rate-limit` store from memory to Redis for multi-instance deployments.
- Move usage limits from constants into DB-backed admin-configurable settings.
- Add structured dashboards/alerts for auth verification spikes and 429 rates.
- Add deploy-time env validation script to fail fast on missing critical vars.
- Add GA event contract tests to prevent accidental sensitive field leakage.
- Add Sentry server-side `beforeSend` test coverage to assert redaction behavior.
