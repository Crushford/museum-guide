# API

## Auth Model

The API authenticates callers by verifying Firebase ID tokens from the
`Authorization: Bearer <idToken>` header. Admin-only routes require the
Firebase custom claim `admin: true`.

## Credentials

The API supports two credential modes for Firebase Admin:

1. Service account env vars (explicit key):

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

2. Application Default Credentials (ADC), useful for local dev:

```bash
gcloud auth login
gcloud config set project <your-project-id>
gcloud auth application-default login
gcloud auth application-default set-quota-project <your-project-id>
```

Optional but recommended with ADC:

- `GOOGLE_CLOUD_PROJECT=<your-project-id>`

Also required for API CORS:

- `FRONTEND_URL`

## Admin Claim Bootstrap

Grant admin:

```bash
yarn workspace api grant-admin --email you@example.com
```

Revoke admin:

```bash
yarn workspace api grant-admin --uid <firebase_uid> --revoke
```
