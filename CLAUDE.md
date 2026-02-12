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

## Design System

The theme is defined in `apps/web/src/styles/theme.css`. All colors flow through two layers:

1. **BM palette variables** (`--bm-bg`, `--bm-fg`, etc.) — raw HSL values
2. **Shadcn semantic tokens** (`--background`, `--primary`, etc.) — mapped to BM palette

Always use Tailwind classes that reference the shadcn tokens. Never use raw Tailwind color scales (`red-*`, `amber-*`, `green-*`, `blue-*`, `zinc-*`, etc.) or legacy BM utility classes.

### Text Colors

| Class                    | Use for                                   |
| ------------------------ | ----------------------------------------- |
| _(inherited)_            | Default body text — set via `@layer base` |
| `text-primary`           | Emphasized text, active nav items         |
| `text-muted-foreground`  | Secondary/helper text, descriptions       |
| `text-accent`            | Accent/highlight text (bronze)            |
| `text-accent-foreground` | Text on accent-colored backgrounds        |
| `text-destructive`       | Error/danger text                         |
| `text-card-foreground`   | Text inside cards                         |

Do **not** use `text-foreground` for explicit styling — the body inherits the foreground color via `@layer base` in `globals.css`. Do **not** confuse `text-base` (font size) with a text color class.

### Backgrounds

| Class            | Use for                        |
| ---------------- | ------------------------------ |
| `bg-background`  | Page background                |
| `bg-card`        | Card/panel surfaces            |
| `bg-muted`       | Secondary/subtle backgrounds   |
| `bg-secondary`   | Secondary element backgrounds  |
| `bg-accent`      | Accent/highlight backgrounds   |
| `bg-destructive` | Destructive action backgrounds |
| `bg-popover`     | Popover/tooltip backgrounds    |

### Borders

| Class              | Use for                           |
| ------------------ | --------------------------------- |
| `border-border`    | Default borders                   |
| `border-border/70` | Subtle separators (header/footer) |
| `border-input`     | Input field borders               |

### Button Variants (via `<Button>` component)

| Variant       | Appearance                              |
| ------------- | --------------------------------------- |
| `default`     | Accent bg, light text — primary actions |
| `destructive` | Red bg — delete/danger actions          |
| `secondary`   | Muted bg — secondary actions            |
| `link`        | Accent text, underline on hover         |

### Badge Variants (via `<Badge>` component)

| Variant       | Appearance                                    |
| ------------- | --------------------------------------------- |
| `default`     | Accent bg — general tags                      |
| `secondary`   | Muted bg — neutral tags                       |
| `destructive` | Red bg — error/danger tags                    |
| `warning`     | Warning bg/border/text — sensitive topic tags |
| `outline`     | Border only, primary text                     |

### Common Patterns

- **Page titles**: Use semantic heading tags (`<h1>`, `<h2>`, etc.) — color is inherited from the body
- **Descriptions**: `text-sm text-muted-foreground`
- **Cards**: Use the `<Card>` component — styling is built into the component
- **Nav links**: Use the `<NavLink>` component (`components/ui/nav-link.tsx`) — muted text that brightens on hover
- **Active nav**: `bg-primary/10 text-primary`
- **Error text**: Use the `<ErrorText>` component (`components/ui/error-text.tsx`)
- **Error/warning boxes**: Use the `<Alert>` component (`components/ui/alert.tsx`) — `variant="destructive"` (default) or `variant="warning"`
- **Focus rings**: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`
- **Hover on rows**: `hover:bg-muted/50`

### Legacy Tokens — DO NOT USE

The following classes exist in `theme.css` for backward compatibility but must not be used in new code:

`text-fg`, `text-muted` (legacy), `text-subtle`, `text-accent-2`, `text-danger`, `text-warning`, `text-success`, `bg-bg`, `bg-bg-2`, `bg-panel`, `bg-accent-2`, `border-divider`
