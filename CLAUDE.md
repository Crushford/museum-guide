# Claude Code Instructions

## Project Structure

Yarn workspaces monorepo with:

- `apps/web` — Next.js 16 frontend (App Router)
- `apps/api` — Express API server
- `packages/db` — Prisma database package
- `packages/types` — Shared TypeScript types

## Commands

All commands run from the repo root using `yarn`:

| Task              | Command                   |
| ----------------- | ------------------------- |
| Format (Prettier) | `yarn format`             |
| Build web         | `yarn build:web`          |
| Build API         | `yarn build:api`          |
| Lint web          | `yarn workspace web lint` |
| Dev web           | `yarn dev:web`            |
| Dev API           | `yarn dev:api`            |
| Storybook         | `yarn storybook`          |
| Start DB          | `yarn db:start`           |

## After Making Changes

1. Run `yarn format` to format all changed files
2. Run `yarn build:api` to check for API type errors
3. Run `yarn build:web` to check for web type/build errors
4. Run `yarn workspace web lint` to check for ESLint errors
5. If there are lint or type errors, fix them before considering the task done

## Database

- Postgres runs in Docker (`yarn db:start`)
- Schema lives in `packages/db/prisma/schema.prisma`
- After schema changes: `cd packages/db && npx prisma db push` (dev) then `npx prisma generate`
- Access DB directly: `docker exec museum-guide-db-1 psql -U postgres -d museum`

## Code Style

- Uses Prettier for formatting — do not manually adjust formatting
- Uses ESLint with eslint-config-prettier
- TailwindCSS v4 for styling
- Shadcn/ui components in `apps/web/src/components/ui/`
