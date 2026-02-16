# TODO

## Q&A and Community Features

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

## Bugs

- [ ] Investigate why this artifact page is in German: http://localhost:3000/british-museum/artifacts/bildnis-leendert-van-der-cooghen-mit-groem-hut
- [ ] Search selection bug: selecting an already-existing museum from Wikidata/location results can show "A museum with a similar name already exists" instead of redirecting to the existing museum page.
