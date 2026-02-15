# User, Auth, Membership, and Quota Plan

This document tracks the implementation path for:

- Google OAuth login
- User-owned contributions
- Membership tiers and monthly limits
- Question privacy/anonymization
- Promo-code premium grants

## Current Status

Completed in schema:

- Added `User`, `AuthAccount`, `UserSession`.
- Added user roles (`USER`, `ADMIN`) for admin authorization.
- Added `Subscription`, `UsageMonthly`.
- Added `PromoCode`, `PromoRedemption`.
- Added creator ownership links:
  - `Museum.createdByUserId`
  - `Room.createdByUserId`
  - `Artifact.createdByUserId`
  - `PlaqueScan.createdByUserId`
- Added question identity links:
  - `ArtifactQuestion.askedByUserId`
  - `ArtifactQuestionVote.userId`
  - `ArtifactQuestionListenEvent.userId`

Backward compatibility note:

- Existing `username` fields are still present on question vote/listen and `askedByUsername` is still present on question rows.
- This allows a gradual rollout from prototype identity to real auth.

## Product Rules

### Tiers

- Guest (not logged in):
  - Can read existing museum/artifact content.
  - Cannot create museums.
  - Cannot scan artifacts.
  - Cannot ask questions.
- Member (logged in):
  - Can create museums (limit: 5/month).
  - Can scan new artifacts (limit: 50/month).
  - If scan maps to existing artifact, it does not count against limit.
  - Can listen to introductions and existing Q&A.
  - Cannot ask new questions.
- Premium:
  - Can create museums (limit: 20/month).
  - Can scan new artifacts (limit: 200/month).
  - Can ask questions (limit: 400/month).

### Question Identity and Deletion

- User can post question with visible name or anonymously.
- User can remove their account.
- On account deletion, historical questions remain but author becomes `null` and UI renders `anonymous`.
- On account deletion, that user's votes are deleted.

## Implementation Phases

1. Auth plumbing

- Add Google OAuth in web app.
- Create/update user row on sign-in.
- Add API auth middleware that resolves current user for protected routes.

2. Ownership and identity writes

- On create museum/room/artifact/plaque scan, set `createdByUserId`.
- On ask/vote/listen, set `askedByUserId`/`userId`.
- Continue writing legacy username fields temporarily.

3. Membership and quotas

- Add central quota service:
  - `museums_created`
  - `new_artifacts_scanned`
  - `questions_asked`
- Use monthly bucket (`monthStart`) with transactional check-and-increment.
- Block action with clear 429 payload when quota exceeded.

4. Dashboard and account pages

- Add `/dashboard` with:
  - contribution counts (museums, rooms, artifacts, scans)
  - monthly usage and remaining quotas
  - question list with score (`upvotes - downvotes`)
- Add account settings:
  - profile visibility defaults
  - delete account action

5. Promo-based premium (no payments yet)

- Add promo redemption endpoint with transaction and max-redemption enforcement.
- Derive effective tier from active promo grant.
- Keep subscription schema for future use, but do not integrate payments yet.

6. Cleanup and migration

- Backfill `askedByUserId` from prototype usernames where possible.
- Switch reads/writes to user ID as source of truth.
- Remove dependency on legacy username fields.

## Security and Privacy Requirements

- Validate Google ID token server-side before trust.
- Use secure cookies (`HttpOnly`, `Secure`, `SameSite=Lax` or stricter).
- Enforce route authorization in API (do not rely on client checks).
- Store minimal PII (email, display name, avatar, provider subject).
- Add soft-delete marker (`User.deletedAt`) before hard-delete workflow rollout.
- Protect promo redemption from race conditions with transactional updates.
