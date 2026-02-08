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

## UI Guidelines

See [docs/ui-guidelines.md](./docs/ui-guidelines.md) for component usage and styling guidelines.
