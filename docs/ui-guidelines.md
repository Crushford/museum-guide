# UI Guidelines

## Component Library: shadcn/ui

This project uses [shadcn/ui](https://ui.shadcn.com/) as the component library. All UI primitives should use shadcn components.

## Hard Rules

### 1. Use shadcn/ui Primitives

**Always use shadcn components for:**

- Buttons → `<Button>` from `@/components/ui/button`
- Inputs → `<Input>` from `@/components/ui/input`
- Textareas → `<Textarea>` from `@/components/ui/textarea`
- Cards → `<Card>`, `<CardHeader>`, `<CardContent>` from `@/components/ui/card`
- Tabs → `<Tabs>`, `<TabsList>`, `<TabsTrigger>`, `<TabsContent>` from `@/components/ui/tabs`
- Badges → `<Badge>` from `@/components/ui/badge`
- Select → `<Select>` from `@/components/ui/select` (when added)
- Dialog → `<Dialog>` from `@/components/ui/dialog` (when added)

**Never use:**

- Raw `<button>` elements (except inside shadcn Button implementation)
- Raw `<input>` elements (except inside shadcn Input implementation)
- Raw `<textarea>` elements (except inside shadcn Textarea implementation)

### 2. Use shadcn Semantic Classes Only

**Allowed classes (shadcn semantic tokens):**

- `bg-background` - Page background
- `bg-card` - Card/panel backgrounds
- `bg-primary` - Primary actions
- `bg-secondary` - Secondary backgrounds
- `bg-muted` - Muted backgrounds
- `bg-destructive` - Error/danger states
- `text-foreground` - Primary text
- `text-card-foreground` - Text on cards
- `text-primary-foreground` - Text on primary buttons
- `text-muted-foreground` - Secondary/muted text
- `text-destructive-foreground` - Text on destructive actions
- `border-border` - Standard borders
- `ring-ring` - Focus rings

**Banned classes:**

- `bg-blue-*`, `text-white`, `border-gray-*`, `text-gray-*` - Hardcoded colors
- `bg-panel`, `bg-bg`, `text-fg`, `text-muted` (without `-foreground`) - Legacy BM classes
- `ring-accent` - Use `ring-ring` instead

### 3. Theme Token System

**Single Source of Truth:**

- shadcn CSS variables (`--background`, `--foreground`, `--primary`, etc.) are canonical
- BM tokens (`--bm-bg`, `--bm-fg`, etc.) exist only to express the palette
- Components should reference shadcn tokens, not BM tokens directly

**Theme Structure:**

```
:root {
  /* BM palette (namespaced) */
  --bm-bg: 220 14% 10%;
  --bm-fg: 40 20% 92%;
  --bm-accent: 36 45% 58%;
  /* ... */

  /* shadcn canonical tokens */
  --background: hsl(var(--bm-bg));
  --foreground: hsl(var(--bm-fg));
  --primary: hsl(var(--bm-accent));
  /* ... */
}
```

### 4. Component Composition

**Prefer composition:**

- Wrap shadcn primitives into domain components when patterns repeat
- Example: `SectionCard` wraps `Card`, `CardHeader`, `CardContent`
- Example: `TypePill` wraps `Badge` with custom colors

**Domain components should:**

- Use shadcn primitives internally
- Maintain their own business logic
- Not duplicate shadcn functionality

### 5. Storybook Stories

**All components must have:**

- At least one Storybook story
- Stories should import shadcn primitives where used
- Stories should demonstrate variants and states

## Examples

### ✅ Good: Using shadcn Button

```tsx
import { Button } from '@/components/ui/button';

<Button variant="default" size="sm">
  Save Changes
</Button>;
```

### ❌ Bad: Raw button with utility classes

```tsx
<button className="px-4 py-2 bg-accent text-white rounded-md">
  Save Changes
</button>
```

### ✅ Good: Using shadcn semantic classes

```tsx
<div className="bg-card border border-border">
  <h2 className="text-foreground">Title</h2>
  <p className="text-muted-foreground">Description</p>
</div>
```

### ❌ Bad: Using legacy or hardcoded classes

```tsx
<div className="bg-panel border border-gray-300">
  <h2 className="text-fg">Title</h2>
  <p className="text-gray-500">Description</p>
</div>
```

## Migration Status

**Completed:**

- ✅ Button, Input, Textarea, Badge, Tabs, Card primitives migrated
- ✅ Theme tokens refactored to single source of truth
- ✅ Shared components updated to use shadcn classes

**Pending:**

- ⏳ Select/Combobox components for admin filtering
- ⏳ Dialog component for modals (if needed)
- ⏳ Table component for data display (if needed)

## Enforcement

**Linting (Future):**

- ESLint rules to block raw `<button>`, `<input>`, `<textarea>`
- ESLint rules to block hardcoded color utilities (`bg-blue-*`, `text-white`, etc.)

**Code Review:**

- All PRs should follow these guidelines
- Legacy classes should be flagged for migration

## Resources

- [shadcn/ui Documentation](https://ui.shadcn.com/)
- [shadcn/ui Components](https://ui.shadcn.com/docs/components)
- Theme tokens: `apps/web/src/styles/theme.css`
