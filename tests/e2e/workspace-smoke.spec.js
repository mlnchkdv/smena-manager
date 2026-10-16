import { expect, test } from '@playwright/test';

test.setTimeout(120_000);

async function finishOnboarding(page) {
  await page.locator('#o-ws, .shell').first().waitFor({ state: 'visible' });
  if (
    !(await page
      .locator('#o-ws')
      .isVisible()
      .catch(() => false))
  )
    return;
  await page.locator('#o-ws').fill('E2E Команда');
  await page.locator('#o-url').fill('e2e-team');
  await page.locator('#onb-next').click();
  await page.locator('#onb-next').click();
  await page.locator('#o-proj').fill('Проверка интерфейса');
  await page.locator('#onb-next').click();
  await page.locator('[data-a="onbNext"][data-skip="1"]').click();
  await page.locator('[data-a="onbFinish"]').click();
}

async function signIn(page) {
  await page.goto('/');
  await page.locator('#l-access').fill('e2e-access-id-2026-secure');
  await page.locator('#login-btn').click();
  await finishOnboarding(page);
  await expect(page.locator('.shell')).toBeVisible();
}

test('Russian workspace remains usable and responsive across breakpoints', async ({ page }) => {
  await signIn(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');

  await page.locator('button[data-a="newTask"]:visible').first().click();
  await page.locator('#f-title').fill('Сквозная проверка сохранения');
  await page.locator('#f-submit').click();
  await expect(page.getByText('Сквозная проверка сохранения', { exact: true }).first()).toBeVisible();
  await expect(page.locator('#sync-indicator')).toContainText('Сохранено');

  await page.reload();
  await expect(page.locator('.shell')).toBeVisible();
  await expect(page.getByText('Сквозная проверка сохранения', { exact: true }).first()).toBeVisible();
  await page.getByText('Сквозная проверка сохранения', { exact: true }).first().click();
  const taskKey = (await page.locator('.drawer .mono').first().textContent()).trim();
  await page.goto(`/e2e-team/task/${encodeURIComponent(taskKey)}`);
  await expect(page.locator('.drawer')).toContainText('Сквозная проверка сохранения');

  const routes = [
    ['', 'Главная'],
    ['inbox', 'Входящие'],
    ['mytasks', 'Мои задачи'],
    ['favorites', 'Избранное'],
    ['notifications', 'Уведомления'],
    ['search', 'Поиск'],
    ['overview', 'Обзор'],
    ['projects', 'Проекты'],
    ['tasks', 'Задачи'],
    ['calendar', 'Календарь'],
    ['timeline', 'Хронология'],
    ['members', 'Участники'],
    ['teams', 'Команды'],
    ['activity', 'Активность'],
    ['knowledge', 'База знаний'],
    ['bookmarks', 'Закладки'],
    ['settings', 'Настройки'],
    ['archive', 'Архив'],
  ];
  const viewports = [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'tablet', width: 834, height: 1112 },
    { name: 'mobile', width: 390, height: 844 },
  ];
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const [route, heading] of routes) {
      await page.goto(`/e2e-team${route ? `/${route}` : ''}`);
      await expect(page.locator('#main-content')).toBeVisible();
      await expect(page.locator('.crumbs .cur')).toHaveText(heading);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${viewport.name}/${route || 'home'} has horizontal page overflow`).toBeLessThanOrEqual(2);
      await expect(page.locator('body')).not.toContainText('Something went wrong');
    }
  }
});
