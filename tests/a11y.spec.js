const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const IMPACT_LEVELS = new Set(['critical', 'serious']);

function formatViolations(violations) {
    return violations
        .filter((violation) => IMPACT_LEVELS.has(violation.impact))
        .map((violation) => {
            const nodes = violation.nodes
                .slice(0, 3)
                .map((node) => node.target.join(' '))
                .join('; ');
            return `[${violation.impact}] ${violation.id}: ${violation.help} (${nodes})`;
        })
        .join('\n');
}

async function getCompanionTitleMetrics(page) {
    return page.evaluate(() => {
        const label = document.querySelector('.companion-panel > .companion-panel-label');
        const panel = document.querySelector('.companion-panel');
        if (!label || !panel) {
            return { fontSizePx: 0, fitsPanel: false, centered: false };
        }
        const labelRect = label.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        return {
            fontSizePx: Number.parseFloat(window.getComputedStyle(label).fontSize),
            fitsPanel: label.scrollWidth <= panel.clientWidth + 2,
            centered:
                Math.abs(labelRect.left + labelRect.width / 2 - (panelRect.left + panelRect.width / 2)) < 3,
        };
    });
}

test.describe('accessibility', () => {
    test('home page passes axe (WCAG A/AA)', async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('.app-shell');
        await page.waitForSelector('#message-list');

        const results = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
            .analyze();

        const serious = results.violations.filter((v) => IMPACT_LEVELS.has(v.impact));
        expect(serious, formatViolations(serious)).toEqual([]);
    });

    test('guest shell exposes sign-in affordances', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('.app-shell')).toHaveClass(/requires-auth/);
        await expect(page.locator('#message-word-hint')).toBeVisible();
        await expect(page.locator('#message-word-hint')).toHaveText(/100 words/);
        await expect(page.locator('#text-input')).toBeDisabled();
        await expect(page.locator('#new-chat-button')).toBeDisabled();
        await expect(page.locator('#google-sign-in-button')).toBeVisible();
        await expect(page.locator('.auth-callout')).toBeVisible();
        await expect(page.locator('.message-empty-cta')).toBeVisible();
        await expect(page.locator('.message-empty-cta')).toHaveAttribute('type', 'button');
    });

    test('wide short viewport keeps desktop chat layout (Nest Hub)', async ({ page }) => {
        await page.setViewportSize({ width: 1024, height: 600 });
        await page.goto('/');
        await page.waitForSelector('.app-shell');

        await expect(page.locator('.chat-input-area')).toBeVisible();
        await expect(page.locator('#text-input')).toBeVisible();
        await expect(page.locator('.companion-panel')).toBeVisible();
        await expect(page.locator('.companion-panel-label')).toBeVisible();

        const companionColumn = await page.locator('.companion-panel').evaluate(
            (el) => window.getComputedStyle(el).gridColumn
        );
        expect(companionColumn).toBe('2');

        const chatColumns = await page.locator('.chat-stage').evaluate(
            (el) => window.getComputedStyle(el).gridTemplateColumns
        );
        expect(chatColumns).not.toBe('none');
        expect(chatColumns.split(' ').length).toBeGreaterThanOrEqual(2);

        const fillRatio = await page.evaluate(() => {
            const panel = document.querySelector('.companion-panel');
            const viewer = document.querySelector('.character-viewer');
            if (!panel || !viewer) {
                return 0;
            }
            return viewer.clientHeight / panel.clientHeight;
        });
        expect(fillRatio).toBeGreaterThan(0.55);

        const titleMetrics = await getCompanionTitleMetrics(page);
        expect(titleMetrics.fitsPanel).toBe(true);
        expect(titleMetrics.centered).toBe(true);
    });

    test('1920px viewport uses large centered companion title', async ({ page }) => {
        await page.setViewportSize({ width: 1920, height: 1080 });
        await page.goto('/');
        await page.waitForSelector('.companion-panel-label');

        const metrics = await getCompanionTitleMetrics(page);
        expect(metrics.fontSizePx).toBeGreaterThanOrEqual(48);
        expect(metrics.fitsPanel).toBe(true);
        expect(metrics.centered).toBe(true);
    });

    test('mobile viewport keeps companion title inside panel', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto('/');
        await page.waitForSelector('.companion-panel-label');

        const metrics = await getCompanionTitleMetrics(page);
        expect(metrics.fitsPanel).toBe(true);
        expect(metrics.centered).toBe(true);
        expect(metrics.fontSizePx).toBeGreaterThan(14);
        expect(metrics.fontSizePx).toBeLessThan(40);
    });

    test('skip link focuses main chat region', async ({ page }) => {
        await page.goto('/');
        await page.keyboard.press('Tab');
        const skip = page.locator('.skip-link');
        await expect(skip).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(page.locator('#chat-main')).toBeVisible();
    });

    test('convex auth test page passes axe (WCAG A/AA)', async ({ page }) => {
        await page.goto('/convex-auth-test');
        await page.waitForSelector('.auth-test');

        const results = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
            .analyze();

        const serious = results.violations.filter((v) => IMPACT_LEVELS.has(v.impact));
        expect(serious, formatViolations(serious)).toEqual([]);
    });

    test('convex auth test exposes sign-in and profile region', async ({ page }) => {
        await page.goto('/convex-auth-test');
        await expect(page.locator('h1')).toContainText(/Convex auth/i);
        const signIn = page.getByRole('link', { name: /Sign in with Google/i });
        const hasSignIn = (await signIn.count()) > 0;
        const hasSetupAlert = (await page.locator('.auth-test .missing[role="alert"]').count()) > 0;
        expect(hasSignIn || hasSetupAlert).toBe(true);
    });
});
