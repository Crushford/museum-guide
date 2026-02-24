# TODO

## Launch and MVP

### Public Questions Disclosure

- [ ] Add inline question-box copy: "Questions are public."
- [ ] Add first-time modal/onboarding note explaining public question archive behavior.
- [ ] Update `/about` (or privacy page) with public Q&A behavior and anonymization policy.
- [ ] Ensure account deletion flow anonymizes prior questions (remove username linkage, keep public content).

### Cookies, Privacy, and Terms

- [ ] Add MVP cookie banner covering session/auth cookies and anonymous analytics cookies.
- [ ] Publish plain-language privacy policy:
  - [ ] What data is collected.
  - [ ] What is public vs private.
  - [ ] Retention basics.
  - [ ] Account deletion/anonymization behavior.
- [ ] Publish lightweight MVP terms of use.

### Product Analytics (Google Analytics)

- [ ] Add GA setup in web app with environment-based configuration.
- [ ] Track only metadata events for funnel visibility:
  - [ ] `scan_started`, `scan_completed`
  - [ ] `duplicate_found`, `duplicate_chosen`, `create_new_confirmed`
  - [ ] `intro_generated`, `audio_played`
  - [ ] `question_asked`, `answer_played`
- [ ] Enforce analytics payload allowlist so sensitive content is never sent to GA.
- [ ] Document GA usage in cookie banner and privacy policy.

### Cost and Usage Tracking

- [ ] Ensure server-side billing telemetry covers OpenAI, Google Vision OCR, Google TTS, and related providers.
- [ ] Verify DB logging fields for billable calls:
  - [ ] `userId` (nullable), `service`, `endpoint`, `model`
  - [ ] Token usage (where applicable)
  - [ ] Estimated `costEur`
  - [ ] Related entity IDs (`artifactId`, `contentId`)
  - [ ] `durationMs`, `status`, `error`
- [ ] Add monthly aggregation jobs and enforcement hooks for tier caps.
- [ ] Implement rule: scan usage counts only when a new artifact is created.
- [ ] Add admin/internal usage dashboard view (month-to-date + remaining quota placeholders).

### Sentry (Web + API)

- [ ] Integrate Sentry SDK in `apps/web` and `apps/api`.
- [ ] Add default data scrubbing rules (no prompts, plaque text, question text, answers, or images).
- [ ] Add useful tags/breadcrumbs:
  - [ ] Route
  - [ ] Entity IDs (`museumId`, `artifactId`, `contentId`) when present
  - [ ] Provider/service tag (`openai`, `google-vision`, `google-tts`, `wikidata`)
  - [ ] Provider request IDs in metadata only

### Admin Prompt Preview and Override (Introductions)

- [ ] Add admin UI preview of final resolved intro prompt before generation.
- [ ] Add context preview in admin UI (sources used, fields included, approximate length).
- [ ] Support one-off prompt override for single generation.
- [ ] Support template update flow for future generations (can be v1.1 if needed).
- [ ] Persist generation provenance:
  - [ ] Prompt text (or template + variables)
  - [ ] `promptVersion`
  - [ ] Provider + model
  - [ ] Timestamp + acting admin/user ID
- [ ] Add prompt override audit logging.
- [ ] Restrict prompt editing to admin users only.
- [ ] Add UX controls: "Reset to default", "Save as new version", "Generate intro now".

### Soon After Launch (Optional)

- [ ] Add content reporting and moderation queue for public question/answer content.
- [ ] Add user account tiers + quotas UI.
- [ ] Add promo codes and premium subscription flow.

## Q&A and Community Features

- [ ] **Username on first sign-up**: When a user signs up for the first time, prompt them to choose a public-facing display name. This name is shown alongside questions they ask (currently the raw Firebase UID is shown, e.g. `hcOVeirownZmcogRN0T6VjvpurV2`). Store it on the user record and use it in place of `askedByUsername` on `ArtifactQuestion`.
- [ ] Add admin moderation tooling for blocked/hidden artifact questions.
- [ ] Add anonymization job to move `ArtifactQuestion.status` to `ANONYMIZED` and scrub usernames.
- [ ] Add stronger semantic dedupe (embeddings) for "similar question" grouping.
- [ ] Add UX to show grouped similar questions under their canonical question.
- [ ] Add per-user vote tracking once auth is implemented (replace `prototype-tester` hardcode).
- [ ] Add community controls (report answer/question, hide from ranking, restore).
- [ ] Move generated suggested follow-up questions from the introduction section into the "Ask a Question" section.

## Prompting and Content Architecture

- [ ] Split prompts into dedicated modules (system goal/tone, tag taxonomy, intro task, question task) and document versioning strategy.
- [ ] Rename legacy `Content` introduction concepts to explicit `Introduction` model/flow in a separate MR.
- [ ] Add migration plan for historical `content.type` values to explicit typed entities.

## Safety and Moderation

- [ ] Tune OpenAI moderation thresholds with real traffic samples.
- [ ] Add policy config so allowed/disallowed moderation categories are environment-driven.
- [ ] Add dashboard for moderation outcomes, block rate, and false-positive review.

## Audio and Analytics

- [ ] Add richer listen analytics (play-start, quartiles, completion) for answer audio.
- [ ] Define ranking score using votes + completion rate + recency decay.
- [ ] Add dashboards for question engagement (asks, votes, listens, completions).

## Scan/Matching Follow-ups

- [ ] Implement museum confidence confirmation flow in plaque scanner (currently TODO in `PlaqueScanner.tsx`).
- [ ] Implement incorrect-match review flow (currently TODO in `IncorrectMatchNotice.tsx`).
- [ ] Add operator tooling to resolve duplicate-match misroutes and retrain duplicate heuristics.

## Localization

- [ ] Add language strategy for full app localization (UI + generated answers).
- [ ] Store answer language consistently and add translation pipeline hooks.

## Search and Discovery

- [ ] Improve museum search relevance with fuzzy matching/synonyms (e.g., "Naples Archaeological Museum" -> "Naples National Archaeological Museum") and better ranking.
- [ ] Add "Did you mean...?" suggestions and typo-tolerant fallback when no strong search match is found.

## Images

- [ ] Replace `<img>` on artifact page with proper `<Image>` from next/image. Needs real intrinsic dimensions (fetch from Wikimedia Commons API server-side) and `remotePatterns` added to `next.config.ts`. See `apps/web/src/app/[museum]/artifacts/[artifact]/page.tsx`.

## Bugs

- [ ] Investigate why this artifact page is in German: http://localhost:3000/british-museum/artifacts/bildnis-leendert-van-der-cooghen-mit-groem-hut
- [ ] Search selection bug: selecting an already-existing museum from Wikidata/location results can show "A museum with a similar name already exists" instead of redirecting to the existing museum page.
