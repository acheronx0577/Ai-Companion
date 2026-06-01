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
        await expect(page.locator('#text-input')).toBeDisabled();
        await expect(page.locator('#new-chat-button')).toBeDisabled();
        await expect(page.locator('#google-sign-in-button')).toBeVisible();
        await expect(page.locator('.auth-callout')).toBeVisible();
        await expect(page.locator('.message-empty-cta')).toBeVisible();
        await expect(page.locator('.message-empty-cta')).toHaveAttribute('type', 'button');
    });

    test('skip link focuses main chat region', async ({ page }) => {
        await page.goto('/');
        await page.keyboard.press('Tab');
        const skip = page.locator('.skip-link');
        await expect(skip).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(page.locator('#chat-main')).toBeVisible();
    });
});
