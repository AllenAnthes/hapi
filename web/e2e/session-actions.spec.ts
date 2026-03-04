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

test.describe('session list inline actions (desktop)', () => {
    test.use({
        viewport: { width: 1280, height: 800 },
    })

    test('no drag handle or kebab menu on session rows', async ({ page }) => {
        await page.goto(authUrl('/sessions'))
        await page.waitForSelector('.session-list-item', { timeout: 10_000 })

        // No drag handle buttons
        const dragHandles = page.locator('[data-drag-handle]')
        await expect(dragHandles).toHaveCount(0)

        // No kebab/more-actions buttons inside session rows
        const sessionRows = page.locator('.session-list-item')
        const rowCount = await sessionRows.count()
        expect(rowCount).toBeGreaterThan(0)

        for (let i = 0; i < rowCount; i++) {
            const row = sessionRows.nth(i)
            const moreBtn = row.locator('button[aria-label*="More"]')
            await expect(moreBtn).toHaveCount(0)
        }
    })

    test('rename button opens rename dialog', async ({ page }) => {
        await page.goto(authUrl('/sessions'))
        await page.waitForSelector('.session-list-item', { timeout: 10_000 })

        // Click the rename button on the first session row
        const firstRow = page.locator('.session-list-item').first()
        const renameBtn = firstRow.locator('button[aria-label="Rename"]')
        await expect(renameBtn).toBeVisible()
        await renameBtn.click()

        // Rename dialog should appear with an input
        const dialog = page.getByRole('dialog')
        await expect(dialog).toBeVisible()
        const nameInput = dialog.locator('input')
        await expect(nameInput).toBeVisible()
        // Input should be pre-filled with the current session name
        const value = await nameInput.inputValue()
        expect(value.length).toBeGreaterThan(0)

        // Close by pressing Escape
        await page.keyboard.press('Escape')
        await expect(dialog).not.toBeVisible()
    })

    test('trash button opens archive dialog for active session', async ({ page }) => {
        await page.goto(authUrl('/sessions'))
        await page.waitForSelector('.session-list-item', { timeout: 10_000 })

        // Find an active session (has a status label like "idle" or "thinking")
        const firstRow = page.locator('.session-list-item').first()
        const trashBtn = firstRow.locator('button[aria-label="Archive"], button[aria-label="Delete"]')
        await expect(trashBtn).toBeVisible()

        const label = await trashBtn.getAttribute('aria-label')
        await trashBtn.click()

        // A confirmation dialog should appear
        const dialog = page.getByRole('dialog')
        await expect(dialog).toBeVisible()

        if (label === 'Archive') {
            await expect(dialog).toContainText('Archive')
        } else {
            await expect(dialog).toContainText('Delete')
        }

        // Cancel without actually archiving/deleting
        await page.keyboard.press('Escape')
        await expect(dialog).not.toBeVisible()
    })

    test('session row is clickable to navigate', async ({ page }) => {
        await page.goto(authUrl('/sessions'))
        await page.waitForSelector('.session-list-item', { timeout: 10_000 })

        // Click the session row itself (not an action button)
        const firstRow = page.locator('.session-list-item').first()
        // Click in the middle of the row content area
        await firstRow.locator('button.flex-1').first().click()

        await page.waitForURL(/\/sessions\/[^/]+/, { timeout: 5000 })
        expect(page.url()).toMatch(/\/sessions\/[^/]+/)
    })

    test('entire session row is draggable', async ({ page }) => {
        await page.goto(authUrl('/sessions'))
        await page.waitForSelector('.session-list-item', { timeout: 10_000 })

        // Each session should be wrapped in a draggable container
        const draggableItems = page.locator('[data-session-dragging]')
        const count = await draggableItems.count()
        expect(count).toBeGreaterThan(0)

        // The wrapper should have cursor: grab style
        const firstDraggable = draggableItems.first()
        const cursor = await firstDraggable.evaluate(el => getComputedStyle(el).cursor)
        expect(cursor).toBe('grab')
    })
})

test.describe('session list inline actions (mobile)', () => {
    test.use({
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
    })

    test('rename and trash buttons visible on mobile', async ({ page }) => {
        await page.goto(authUrl('/sessions'))
        await page.waitForSelector('.session-list-item', { timeout: 10_000 })

        const firstRow = page.locator('.session-list-item').first()
        const renameBtn = firstRow.locator('button[aria-label="Rename"]')
        const trashBtn = firstRow.locator('button[aria-label="Archive"], button[aria-label="Delete"]')

        await expect(renameBtn).toBeVisible()
        await expect(trashBtn).toBeVisible()
    })
})
