import { expect, test } from '@playwright/test';

test.setTimeout(120_000);

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

async function expectNoPageOverflow(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(2);
}

async function checkNarrowTeamDialog(page, language, browserName) {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/e2e-team/teams');
  await page.locator('#main-content [data-a="newTeam"]').first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: language === 'ru' ? 'Новая команда' : 'New team', exact: true })).toBeVisible();
  await dialog.locator('#tm-name').fill('Review · Очень длинное название команды / A long team name');
  await expectNoPageOverflow(page);
  for (const selector of ['.modal-b', '.modal-f']) {
    expect(
      await dialog.locator(selector).evaluate(element => element.scrollWidth - element.clientWidth),
      `${language} team dialog ${selector} overflow`,
    ).toBeLessThanOrEqual(2);
  }
  await page.screenshot({ path: `output/playwright/team-dialog-${language}-320-${browserName}.png` });
  await dialog.getByRole('button', { name: language === 'ru' ? 'Отмена' : 'Cancel', exact: true }).click();
}

test('core task flow and responsive shell work across browser engines', async ({ page, browserName }) => {
  await signIn(page);
  await page.setViewportSize({ width: 1366, height: 850 });
  await page.goto('/e2e-team');
  const accountTrigger = page.locator('.topbar .account-menu-trigger:visible');
  const connectionDot = accountTrigger.locator('.account-connection-badge');
  await expect(connectionDot).toBeVisible();
  await expect(connectionDot.locator('svg')).toHaveCount(0);
  const avatarBox = await accountTrigger.locator('.account-avatar-status').boundingBox();
  const dotBox = await connectionDot.boundingBox();
  expect(dotBox.x + dotBox.width / 2).toBeGreaterThan(avatarBox.x + avatarBox.width / 2);
  expect(dotBox.y + dotBox.height / 2).toBeGreaterThan(avatarBox.y + avatarBox.height / 2);

  await accountTrigger.click();
  await page.locator('.account-system-summary').click();
  await expect(page.locator('.account-system-grid > div')).toHaveCount(3);
  await page.keyboard.press('Escape');

  await page.locator('button[data-a="newTask"]:visible').first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(Math.abs(box.x + box.width / 2 - 1366 / 2)).toBeLessThanOrEqual(3);

  await dialog.locator('[data-pop="assignee"]').click();
  await expect(page.locator('.pop:visible')).toBeVisible();
  await page.keyboard.press('Escape');
  await dialog.locator('#f-title').fill('Review');
  await dialog.locator('#f-submit').click();
  await expect(page.getByText('Review', { exact: true }).first()).toBeVisible();
  await page.getByText('Review', { exact: true }).first().click();
  const drawerAssignee = page.locator('.drawer [data-pop="assignee"]');
  await expect(drawerAssignee).toBeVisible();
  await drawerAssignee.click();
  await expect(page.locator('.pop:visible')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawerAssignee).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.drawer')).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ['projects', 'files', 'inbox', 'settings/security']) {
    await page.goto(`/e2e-team/${route}`);
    await expect(page.locator('#main-content')).toBeVisible();
    await expectNoPageOverflow(page);
  }

  await checkNarrowTeamDialog(page, 'ru', browserName);
  await page.goto('/e2e-team/settings/language');
  await page.locator('select[data-k="lang"]').selectOption('English (US)', { force: true });
  await page.waitForTimeout(700);
  await page.goto('/e2e-team/projects');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();
  await expectNoPageOverflow(page);
  await page.goto('/e2e-team/files');
  await expect(page.getByRole('heading', { name: 'Files', exact: true })).toBeVisible();
  await expectNoPageOverflow(page);
  await checkNarrowTeamDialog(page, 'en', browserName);
  await page.goto('/e2e-team/settings/language');
  await page.locator('select[data-k="lang"]').selectOption('Русский', { force: true });
});
