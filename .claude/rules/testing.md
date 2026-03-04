---
description: Testing conventions and patterns
globs: "**/*.test.*, **/*.spec.*, web/src/components/**, web/src/routes/**"
---

# Testing Conventions

## Test Commands

```bash
bun run test         # all packages (vitest unit/component)
bun run test:hub     # hub only
bun run test:web     # web only
bun run test:cli     # cli only
bun run typecheck    # tsc --noEmit across all packages

# E2E (Playwright against sandbox hub)
cd web && bunx playwright test --config e2e/playwright.config.ts
cd web && bunx playwright test e2e/some-file.spec.ts --config e2e/playwright.config.ts --project desktop
```

## Unit / Component Tests (vitest)

- Test files live alongside source files (e.g., `store.test.ts` next to `store/index.ts`)
- Name test files `*.test.ts` or `*.test.tsx`
- Use descriptive test names that explain the expected behavior
- Run the package-specific test command when working in one package, full suite before completing work

## E2E Tests (Playwright)

### When to write E2E tests

Write Playwright E2E tests for **any web UI change that involves user interaction** — clicks, navigation, dialogs, drag-and-drop, gestures, responsive layout. Vitest component tests verify the React tree in jsdom; Playwright tests verify the real browser behavior against a running hub with seed data.

**Write E2E tests when:**
- Adding or removing interactive elements (buttons, menus, dialogs, drawers)
- Changing navigation behavior (click routes, URL changes)
- Changing gesture behavior (drag, swipe, long-press)
- Adding responsive/mobile-specific behavior
- Modifying how the session list, chat, or sidebar works

**Skip E2E tests when:**
- Changes are purely logic/data (sorting algorithms, query key changes, type refactors)
- Changes are API-only with no UI impact
- Changes are CSS-only cosmetic tweaks with no interaction changes

### Where E2E tests live

```
web/e2e/
├── playwright.config.ts    # Config: desktop + mobile projects, sandbox URL
├── drawer.spec.ts          # Mobile drawer gestures and desktop sidebar
└── session-actions.spec.ts # Session list inline buttons, drag, navigation
```

Group tests by **feature area**, not by page. One spec file per feature. Name files `<feature>.spec.ts`.

### How to write E2E tests

Every spec file follows this structure:

```typescript
import { test, expect } from '@playwright/test'
import { execSync } from 'child_process'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

let sandboxUrl: string
let sandboxHome: string
let sandboxToken: string

test.beforeAll(async () => {
    const output = execSync('bun scripts/sandbox-hub.ts start --seed', {
        cwd: join(__dirname, '../..'),
        encoding: 'utf8',
        timeout: 30_000,
    })
    const urlMatch = output.match(/SANDBOX_URL=(http:\/\/[^\s]+)/)
    const homeMatch = output.match(/SANDBOX_HOME=([^\s]+)/)
    const tokenMatch = output.match(/SANDBOX_TOKEN=([^\s]+)/)
    if (!urlMatch || !homeMatch || !tokenMatch) {
        throw new Error(`Failed to parse sandbox output:\n${output}`)
    }
    sandboxUrl = urlMatch[1]!
    sandboxHome = homeMatch[1]!
    sandboxToken = tokenMatch[1]!
})

test.afterAll(async () => {
    execSync('bun scripts/sandbox-hub.ts stop', {
        cwd: join(__dirname, '../..'),
        encoding: 'utf8',
        timeout: 10_000,
    })
})

function authUrl(path: string): string {
    return `${sandboxUrl}${path}?token=${sandboxToken}`
}
```

### E2E test quality rules

1. **Always use the sandbox** — never hit the live hub (port 3006). The `beforeAll` block starts a sandbox with `--seed`.
2. **Test both viewports** — use `test.describe` blocks with `test.use()` for desktop (1280x800) and mobile (390x844, `hasTouch: true, isMobile: true`).
3. **Use semantic locators** — prefer `aria-label`, `role`, `data-testid`, and `.session-list-item` class over fragile CSS selectors. Examples:
   - `page.getByRole('dialog')` over `page.locator('.dialog-class')`
   - `row.locator('button[aria-label="Rename"]')` over `row.locator('button:nth-child(2)')`
   - `page.locator('[data-session-dragging]')` over positional selectors
4. **Wait properly** — use `waitForSelector`, `waitForURL`, or Playwright auto-waiting assertions (`await expect(x).toBeVisible()`). Avoid `waitForTimeout` except after animations.
5. **Clean up after interactions** — if a test opens a dialog, close it (Escape or click cancel) so subsequent tests start clean.
6. **Don't mutate seed data** — tests should open dialogs and cancel, not actually delete/rename sessions. Keep the sandbox state stable for parallel test runs.
7. **Reference seed data from screenshots.md** — the sandbox seeds specific sessions with known names, states, and teams. See `.claude/rules/screenshots.md` for the seed reference table.
