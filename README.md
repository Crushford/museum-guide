# Museum Guide

An interactive guide to museums, rooms, and artifacts.

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE) for details.

## Development

```bash
# Install dependencies
yarn install

# Run web app
yarn dev:web

# Run API server
yarn dev:api

# Run Storybook
yarn storybook

# Format code
yarn format
```

## Project Structure

- `apps/web` - Next.js web application
- `apps/api` - Express API server
- `packages/db` - Prisma database package
- `packages/types` - Shared TypeScript types

## Configuration

### Firebase Auth

Web auth and admin API access now use Firebase ID tokens.

- Web env vars:
  - `NEXT_PUBLIC_FIREBASE_API_KEY`
  - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
  - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
  - `NEXT_PUBLIC_API_URL`
- API env vars:
  - `FRONTEND_URL`
  - credentials via one of:
    - service account env vars:
      - `FIREBASE_PROJECT_ID`
      - `FIREBASE_CLIENT_EMAIL`
      - `FIREBASE_PRIVATE_KEY`
    - or ADC (local dev), after:
      - `gcloud auth login`
      - `gcloud config set project <your-project-id>`
      - `gcloud auth application-default login`
      - `gcloud auth application-default set-quota-project <your-project-id>`
      - optional `GOOGLE_CLOUD_PROJECT=<your-project-id>`

Admin access is enforced server-side via Firebase custom claims (`admin: true`).

Bootstrap or update admin claim:

```bash
yarn workspace api grant-admin --email you@example.com
# or
yarn workspace api grant-admin --uid <firebase_uid>
# revoke
yarn workspace api grant-admin --uid <firebase_uid> --revoke
```

### App Name

The application name is stored in `apps/web/src/lib/constants.ts` as `APP_NAME`. This allows the name to be easily changed in one place if we decide on a different name later. Import and use it anywhere the app name is displayed:

```typescript
import { APP_NAME } from '@/lib/constants';
```

## UI Guidelines

See [docs/ui-guidelines.md](./docs/ui-guidelines.md) for component usage and styling guidelines.
