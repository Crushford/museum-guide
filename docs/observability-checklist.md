# Observability Checklist

This is a starter checklist for logging/monitoring in production. It focuses on the current scan, LLM, OCR, and TTS flows.

## Principles

- Use structured logs (JSON fields) instead of free text where possible.
- Include a request correlation id on every log line for a request.
- Never log secrets (API keys, auth headers, tokens).
- Add enough context to debug without exposing full user content.

## Global fields to include

- `timestamp`
- `level` (`info`, `warn`, `error`)
- `service` (`api`, `ocr`, `tts`, `llm`, `web`)
- `event`
- `requestId` / `traceId`
- `userId` (if authenticated)
- `museumId`, `artifactId`, `contentId`, `questionId` when applicable
- `provider` and `model` when provider-based APIs are used
- `durationMs` for external API calls

## TTS events to log

- `tts.request.start`
  - Fields: `provider`, `modelId`, `voiceId`, `textLength`, `originalTextLength`, `wasTruncated`
- `tts.request.success`
  - Fields: above + `durationMs`, `statusCode`, `audioBytes`, `processedCharactersCount`
- `tts.request.error`
  - Fields: above + `statusCode`, `errorCode`, `errorMessage`, `errorBodyPreview`
- `tts.input.truncated`
  - Fields: `provider`, `limit`, `originalTextLength`, `truncatedLength`, `modelId`, `voiceId`

### Current known TTS failure modes

- Inworld HTTP `400` when `text` exceeds 2000 chars.
- Missing Inworld credentials (`INWORLD_TTS_BASIC_AUTH` / `INWORLD_RUNTIME_BASE64_CREDENTIAL`).
- Missing/invalid provider selection in request payload.

## OCR events to log

- `ocr.request.start` (`provider`, image size, mime type)
- `ocr.request.success` (`provider`, `durationMs`, `blockCount`, `textLength`)
- `ocr.request.error` (`provider`, `statusCode`, `errorMessage`)

## LLM events to log

- `llm.request.start` (`provider`, `model`, prompt size)
- `llm.request.success` (`inputTokens`, `outputTokens`, `durationMs`)
- `llm.request.error` (`provider`, `model`, `statusCode`, `errorMessage`)
- moderation events (`blocked`, categories, source)

## API route outcomes to log

- Route start/end for key flows:
  - plaque scan pipeline (`/scan/ocr`, `/scan/draft`, `/scan/create`)
  - intro generation (sync + stream)
  - question ask flow
  - audio generation endpoints
- Log both success and failure with route params and provider selections.

## Metrics/alerts to add later

- Error rate by provider (`tts`, `ocr`, `llm`).
- P95/P99 latency by provider.
- Daily cost by provider.
- TTS truncation rate (signal of oversized content).
- Alert when provider-specific error spikes above threshold.

## Rollout plan

1. Add request ids and consistent structured logging format.
2. Send logs to centralized sink (e.g., Datadog, Sentry logs, ELK, Cloud Logging).
3. Create dashboards for TTS/OCR/LLM provider health.
4. Add alerts on error rate and latency regressions.
