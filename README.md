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

### App Name

The application name is stored in `apps/web/src/lib/constants.ts` as `APP_NAME`. This allows the name to be easily changed in one place if we decide on a different name later. Import and use it anywhere the app name is displayed:

```typescript
import { APP_NAME } from '@/lib/constants';
```

### Google OAuth (Web)

Add these variables to `apps/web/.env.local`:

```bash
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=replace-with-a-long-random-string
GOOGLE_CLIENT_ID=your-google-oauth-client-id
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret
API_INTERNAL_TOKEN=shared-secret-used-between-next-and-api
```

Set Google OAuth authorized URLs:

- Authorized JavaScript origin: `http://localhost:3000`
- Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`

Add this variable to your API env (`.env` used by `apps/api`):

```bash
API_INTERNAL_TOKEN=shared-secret-used-between-next-and-api
```

`API_INTERNAL_TOKEN` must match between web and api so admin proxy routes can authenticate to the API.

### Bootstrap First Admin

Promote an existing signed-in user (or create one if `ADMIN_GOOGLE_SUB` is provided):

```bash
ADMIN_EMAIL=you@example.com \
ADMIN_GOOGLE_SUB=google-sub-if-creating-new-user \
ADMIN_DISPLAY_NAME="Your Name" \
yarn workspace @repo/db seed:admin
```

## UI Guidelines

See [docs/ui-guidelines.md](./docs/ui-guidelines.md) for component usage and styling guidelines.
