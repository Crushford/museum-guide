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

Run these steps **every time**, in order, before considering any task complete:

1. `yarn format` — format all changed files
2. `yarn build:web` — check for type/build errors _(if any `apps/web/**` files changed)_
3. `yarn build:api` — check for API type errors _(if any `apps/api/**` or `packages/db/**` files changed)_
4. `yarn workspace web lint` — check for ESLint errors _(if any `apps/web/**` files changed)_

### Required Verification Rules

These are **non-negotiable** — the task is not done until all pass:

| Changed area        | Must run                                                     |
| ------------------- | ------------------------------------------------------------ |
| `apps/web/**`       | `yarn format` + `yarn build:web` + `yarn workspace web lint` |
| `apps/api/**`       | `yarn format` + `yarn build:api`                             |
| `packages/db/**`    | `yarn format` + `yarn build:api`                             |
| Both web and API/db | All three build commands                                     |

### Handling lint output

- **Errors** introduced by your changes must be fixed before the task is done.
- **Warnings** introduced by your changes should be fixed unless doing so requires changes well outside the task scope — call them out explicitly if you leave them.
- **Pre-existing** errors/warnings (in files you did not touch) do not need to be fixed, but note them if they are relevant.
- To distinguish new from pre-existing: only count issues in files you modified.

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

The theme is defined in `apps/web/src/styles/theme.css`. Colors flow through three layers:

1. **Semantic tokens** (`--fg`, `--canvas`, `--brand`, etc.) — purpose-named CSS vars with light/dark values
2. **Shadcn aliases** (`--background`, `--primary`, etc.) — map to semantic tokens for component compat
3. **Tailwind `@theme`** — registers both layers as Tailwind utilities

**Prefer semantic classes in new code.** Shadcn aliases still work but are considered legacy aliases.

Themes are applied automatically via `prefers-color-scheme`. To force a theme, set `data-theme="dark"` or `data-theme="light"` on `<html>`. Never use raw Tailwind color scales (`red-*`, `amber-*`, `green-*`, `blue-*`, `zinc-*`, etc.).

### Text Colors

| Class              | Use for                                   |
| ------------------ | ----------------------------------------- |
| _(inherited)_      | Default body text — set via `@layer base` |
| `text-fg`          | Emphasized text, active nav items         |
| `text-fg-subtle`   | Secondary/helper text, descriptions       |
| `text-fg-disabled` | Placeholder, disabled states              |
| `text-brand`       | Accent/highlight text (bronze)            |
| `text-brand-fg`    | Text on brand-coloured backgrounds        |
| `text-error`       | Error/danger text                         |
| `text-warning`     | Warning text                              |
| `text-success`     | Success text                              |

Do **not** use `text-foreground` for explicit styling — the body inherits the foreground color via `@layer base` in `globals.css`. Do **not** confuse `text-base` (font size) with a text color class.

### Backgrounds

| Class        | Use for                        |
| ------------ | ------------------------------ |
| `bg-canvas`  | Page background                |
| `bg-surface` | Card/panel surfaces            |
| `bg-overlay` | Dialog/popover backgrounds     |
| `bg-brand`   | Accent/highlight backgrounds   |
| `bg-error`   | Destructive action backgrounds |
| `bg-warning` | Warning backgrounds            |
| `bg-success` | Success backgrounds            |

### Borders

| Class                | Use for                     |
| -------------------- | --------------------------- |
| `border-line`        | Default borders             |
| `border-line-subtle` | Dividers, softer separators |

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
- **Descriptions**: `text-sm text-fg-subtle`
- **Cards**: Use the `<Card>` component — styling is built into the component
- **Nav links**: Use the `<NavLink>` component (`components/ui/nav-link.tsx`) — muted text that brightens on hover
- **Active nav**: `bg-brand/10 text-brand`
- **Error text**: Use the `<ErrorText>` component (`components/ui/error-text.tsx`)
- **Error/warning boxes**: Use the `<Alert>` component (`components/ui/alert.tsx`) — `variant="destructive"` (default) or `variant="warning"`
- **Focus rings**: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`
- **Hover on rows**: `hover:bg-surface/50`

### Audio Playback

- Do **not** use raw HTML `<audio>` elements in `apps/web`.
- Use the shared Howler-based player: `HowlerAudioPlayer` from `apps/web/src/components/shared/HowlerAudioPlayer.tsx`.
- Use the shared hook `useHowlerAudio` (`apps/web/src/hooks/useHowlerAudio.ts`) only when custom audio UI/state is required.
- Always pass absolute API-backed URLs (typically `${API_URL}${audioUrl}`) into the player.
- For analytics on answer playback, use `onPauseProgress` and `onPlaybackComplete` props on `HowlerAudioPlayer`.
- For generated audio that may be invalid/empty, react to player status via `onStatusChange` and show regenerate actions in the parent UI.

### Mobile-First UI Patterns (Important)

Public browsing flows (`Search` -> `Museum` -> `Room` -> `Artifact`) are used primarily on mobile. Treat horizontal overflow as a UX bug, not a cosmetic issue.

- **Use `<PageLayout>` and `<SectionCard>` for page/card shells**: These components already stack headers and action areas on mobile. Prefer them over custom page wrappers.
- **Use `<ActionRow>` (`apps/web/src/components/shared/ActionRow.tsx`) for action groups** instead of ad hoc `flex items-center justify-between` rows:
  - `mobileLayout="stack"` for primary action bars (buttons stack on mobile, row on larger screens)
  - `mobileLayout="wrap"` for chips / small toggle buttons / compact controls
  - `mobileLayout="grid-2"` for paired actions like `Search` / `Near Me`
  - When actions should fill mobile width, set child buttons to `className="w-full sm:w-auto"`
- **Use `<ContentImage>` (`apps/web/src/components/shared/ContentImage.tsx`) for remote/detail images** (artifact/museum content images):
  - Prevents overflow by enforcing `max-w-full`
  - Uses sane mobile-safe height constraints (`max-h-[60vh]` by default)
  - Prefer this over hand-written `<img>` wrappers in content/detail cards unless you explicitly need a fixed aspect crop
- **Use `<InfoBox>` for text + controls / media rows**: It now stacks on mobile and becomes a row on `sm+`. Do not assume horizontal space for audio controls or secondary buttons.
- **Avoid raw `justify-between` rows when one side contains unbounded text** (titles, IDs, usernames, translated text). Use stacked mobile layouts (`flex-col`, `min-w-0`, `break-words`) and only switch to row layout at `sm+`.
- **Avoid fixing overflow by hiding it** (e.g. global `overflow-x-hidden`). Fix the layout so content wraps/stacks correctly.
- **Be careful with `autoFocus` on mobile** (especially search inputs): it can open the keyboard on page load and hide layout issues.

### Navigation / Scroll Behavior

- The app layout mounts a shared route scroll manager (`RouteScrollReset`) to scroll to top on forward client-side navigation while preserving browser scroll restoration for back/forward.
- Do **not** add page-level unconditional `window.scrollTo(0, 0)` handlers unless there is a route-specific exception.
- Prefer Next.js navigation with normal scroll behavior (`<Link>` default / `router.push(..., { scroll: true })`) for forward navigation in browsing flows.

### Shadcn Aliases — Legacy, Still Supported

These classes work via the shadcn alias layer. Prefer the semantic equivalents above in new code.

| Legacy class             | Semantic equivalent |
| ------------------------ | ------------------- |
| `text-primary`           | `text-fg`           |
| `text-muted-foreground`  | `text-fg-subtle`    |
| `text-accent`            | `text-brand`        |
| `text-accent-foreground` | `text-brand-fg`     |
| `text-destructive`       | `text-error`        |
| `bg-background`          | `bg-canvas`         |
| `bg-card`                | `bg-surface`        |
| `bg-muted`               | `bg-surface`        |
| `bg-accent`              | `bg-brand`          |
| `bg-destructive`         | `bg-error`          |
| `bg-popover`             | `bg-overlay`        |
| `border-border`          | `border-line`       |
| `border-input`           | `border-line`       |
