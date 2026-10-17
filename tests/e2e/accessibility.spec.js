import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.setTimeout(180_000);

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

  for (const route of ['', 'projects', 'inbox', 'settings/security', 'settings/notif-push']) {
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
});
