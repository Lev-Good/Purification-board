/**
 * E2E smoke test — one continuous critical-path walkthrough (not four
 * independent tests) through the app's most important flows, in the order
 * a real first-time user hits them: set up a PIN, record a sighting,
 * move between tabs, then lock and unlock again (wrong PIN, then right).
 *
 * Run with: npm run test:e2e
 */
import { test, expect } from '@playwright/test';

const PIN = '482913';
const WRONG_PIN = '000000';

async function typePin(page, containerId, pin) {
    await page.locator(`#${containerId} .pin-digit`).first().click();
    await page.keyboard.type(pin);
}

test('setup PIN, record a sighting, navigate tabs, then lock and unlock', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await test.step('setup screen: create a new PIN', async () => {
        await expect(page.locator('#setup-screen')).toBeVisible();
        await typePin(page, 'setup-pin-container', PIN);
        await page.locator('#setup-screen button.btn-primary').click();

        await expect(page.locator('#setup-screen')).toBeHidden();
        await expect(page.locator('#lock-screen')).toBeHidden();
    });

    await test.step('record a sighting on today\'s day', async () => {
        await page.locator('.day-today').click();
        await expect(page.locator('#modal')).toBeVisible();

        await page.getByRole('button', { name: 'תחילת ראייה (עונת יום)' }).click();
        await expect(page.locator('#reiyah-details-modal')).toBeVisible();

        await page.getByRole('button', { name: 'שמור את הראייה' }).click();
        await expect(page.locator('#reiyah-details-modal')).toBeHidden();

        // The calendar re-renders with a marker on today's cell for the
        // sighting just recorded - this is also an implicit check that the
        // encrypted database (Task 1) round-trips correctly in-session.
        await expect(page.locator('.day-today .marker.bg-red')).toHaveCount(1);
    });

    await test.step('navigate between tabs', async () => {
        await page.locator('#desktop-nav-table').click();
        await expect(page.locator('#view-table')).toHaveClass(/active/);

        await page.locator('#desktop-nav-about').click();
        await expect(page.locator('#view-about')).toHaveClass(/active/);

        await page.locator('#desktop-nav-settings').click();
        await expect(page.locator('#view-settings')).toHaveClass(/active/);

        await page.locator('#desktop-nav-cal').click();
        await expect(page.locator('#view-calendar')).toHaveClass(/active/);
    });

    await test.step('lock (reload) and unlock: wrong PIN then correct PIN', async () => {
        await page.reload();
        await expect(page.locator('#lock-screen')).toBeVisible();
        await expect(page.locator('#setup-screen')).toBeHidden();

        await typePin(page, 'unlock-pin-container', WRONG_PIN);
        await expect(page.locator('#pin-error')).toHaveText('קוד שגוי. נסה שוב.');
        await expect(page.locator('#lock-screen')).toBeVisible();

        await typePin(page, 'unlock-pin-container', PIN);
        await expect(page.locator('#lock-screen')).toBeHidden();

        // The sighting recorded before locking is still there after
        // unlocking - the encrypted database round-tripped through a full
        // lock/unlock cycle, not just an in-memory session.
        await expect(page.locator('.day-today .marker.bg-red')).toHaveCount(1);
    });
});
