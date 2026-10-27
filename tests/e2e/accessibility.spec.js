import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.setTimeout(180_000);
test.use({ trace: 'on-first-retry', video: 'on-first-retry' });

async function signIn(page) {
  await page.goto('/');
  await page.locator('#l-access').fill('e2e-access-id-2026-secure');
  await page.locator('#login-btn').click();
  await page.locator('#o-ws:visible, .shell:visible').first().waitFor({ state: 'visible' });
  if (
    await page
      .locator('#o-ws')
      .isVisible()
      .catch(() => false)
  ) {
    await page.locator('#o-ws').fill('E2E Команда');
    await page.locator('#o-url').fill('e2e-team');
    await page.locator('#onb-next').click();
    await page.locator('#onb-next').click();
    await page.locator('#o-proj').fill('Проверка интерфейса');
    await page.locator('#onb-next').click();
    await page.locator('[data-a="onbNext"][data-skip="1"]').click();
    await page.locator('[data-a="onbFinish"]').click();
  }
  await expect(page.locator('.shell')).toBeVisible();
}

async function expectNoWcagViolations(page, context) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(
    result.violations.map(violation => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.map(node => ({ target: node.target.join(' '), html: node.html, summary: node.failureSummary })),
    })),
    `${context} has WCAG violations`,
  ).toEqual([]);
}

test('key Russian and English workflows pass automated WCAG checks', async ({ page }) => {
  await signIn(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/e2e-team');
  const homeTabs = page.getByRole('tablist').first();
  await homeTabs.getByRole('tab').first().focus();
  await page.keyboard.press('End');
  await expect(homeTabs.getByRole('tab').last()).toBeFocused();
  await page.keyboard.press('Space');
  await expect(homeTabs.getByRole('tab').last()).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Home');
  await page.keyboard.press('Enter');
  await expect(homeTabs.getByRole('tab').first()).toHaveAttribute('aria-selected', 'true');

  for (const route of ['', 'projects', 'files', 'inbox', 'settings/security', 'settings/notif-push']) {
    await page.goto(`/e2e-team${route ? `/${route}` : ''}`);
    await expect(page.locator('#main-content')).toBeVisible();
    await expectNoWcagViolations(page, `Russian route ${route || 'home'}`);
  }

  await page.goto('/e2e-team');
  await page.locator('button[data-a="newTask"]:visible').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expectNoWcagViolations(page, 'Russian task dialog');
  await page.locator('button[data-a="closeModal"]:visible').first().click();

  await page.goto('/e2e-team/settings/language');
  await page.locator('select[data-k="lang"]').selectOption('English (US)', { force: true });
  await page.waitForTimeout(700);
  await page.goto('/e2e-team/settings/security');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expectNoWcagViolations(page, 'English security settings');

  await page.goto('/e2e-team/settings/language');
  await page.locator('select[data-k="lang"]').selectOption('Русский', { force: true });
  for (const language of ['Русский', 'English (US)']) {
    await page.goto('/e2e-team/settings/language');
    await page.locator('select[data-k="lang"]').selectOption(language);
    await page.waitForTimeout(700);
    await page.goto('/e2e-team/activity');
    const activityFilters = page.locator('.seg:has([data-k="actFilter"])');
    await expect(activityFilters).toHaveAccessibleName(language === 'Русский' ? 'Фильтры активности' : 'Activity filters');
    await activityFilters.locator('[data-v="comments"]').focus();
    await page.keyboard.press('Space');
    await expect(activityFilters.locator('[aria-pressed="true"]')).toHaveCount(1);
    await expect(activityFilters.locator('[data-v="comments"]')).toHaveAttribute('aria-pressed', 'true');
    await page.goto('/e2e-team/settings/appearance');
    await page.locator('[data-k="side"][data-v="compact"]').click();
    await expect(page.locator('[data-k="side"][aria-pressed="true"]')).toHaveCount(1);
    await expect(page.locator('[data-k="side"][data-v="compact"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('[data-k="side"][data-v="comfortable"]').click();
    for (const theme of ['light', 'dark']) {
      await page.goto('/e2e-team/settings/appearance');
      await page.locator(`[data-a="setTheme"][data-v="${theme}"]`).click();
      await page.waitForTimeout(700);
      await page.setViewportSize({ width: 390, height: 844 });
      for (const route of ['files', 'knowledge', 'bookmarks', 'inbox', 'search', 'settings/appearance']) {
        await page.goto(`/e2e-team/${route}`);
        await expect(page.locator('#main-content')).toBeVisible();
        await expect(page.locator('#main-content [aria-busy="true"]')).toHaveCount(0);
        await expectNoWcagViolations(page, `${language}/${theme}/390/${route}`);
      }
    }
  }
});

test('settings remain usable at 200% zoom on a narrow viewport in both locales', async ({ page }) => {
  await signIn(page);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const language of ['Русский', 'English (US)']) {
    await page.goto('/e2e-team/settings/language');
    await page.locator('select[data-k="lang"]').selectOption(language, { force: true });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      document.documentElement.style.zoom = '2';
    });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${language} settings overflow at 200% zoom`).toBeLessThanOrEqual(2);
    await expect(page.locator('#main-content')).toBeVisible();
    await page.evaluate(() => {
      document.documentElement.style.zoom = '';
    });
  }
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto('/e2e-team/files');
  await expect(page.locator('.files-page')).toBeVisible();
  await page.keyboard.press('Tab');
  await page.locator('.topsearch').focus();
  await expect.poll(async () => page.locator('.topsearch').evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe('none');
  await expect.poll(async () => page.locator('.topsearch').evaluate(el => parseFloat(getComputedStyle(el).outlineWidth))).toBeGreaterThanOrEqual(2);
  await page.locator('.files-folder-tools > summary').click();
  await expect(page.locator('[data-a="newFileFolder"]')).toBeVisible();
  expect(await page.locator('[data-a="newFileFolder"]').evaluate(el => parseFloat(getComputedStyle(el).borderTopWidth))).toBeGreaterThanOrEqual(1);
  await page.screenshot({ path: 'output/playwright/ux18-forced-colors-mobile.png' });
  await page.emulateMedia({ forcedColors: 'none' });
});
