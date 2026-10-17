import { expect, test } from '@playwright/test';

test.setTimeout(120_000);

async function finishOnboarding(page) {
  const outcome = page.locator('#o-ws:visible, .shell:visible, [role="alert"]:visible').first();
  await outcome.waitFor({ state: 'visible' });
  if ((await outcome.getAttribute('role')) === 'alert') throw new Error(`Sign in failed: ${(await outcome.textContent())?.trim()}`);
  if (!(await page.locator('#o-ws').isVisible().catch(() => false))) return;
  await page.locator('#o-ws').fill('E2E Команда');
  await page.locator('#o-url').fill('e2e-team');
  await page.locator('#onb-next').click();
  await page.locator('#onb-next').click();
  await page.locator('#o-proj').fill('Проверка интерфейса');
  await page.locator('#onb-next').click();
  await page.locator('[data-a="onbNext"][data-skip="1"]').click();
  await page.locator('[data-a="onbFinish"]').click();
}

async function signIn(page, accessId) {
  await page.goto('/');
  await page.locator('#l-access').fill(accessId);
  await page.locator('#login-btn').click();
  await finishOnboarding(page);
  await expect(page.locator('.shell')).toBeVisible();
}

async function waitForSaved(page) {
  await page.waitForTimeout(700);
  await expect(page.locator('#sync-indicator')).toHaveAttribute('data-state', 'saved', { timeout: 15_000 });
}

test('two users exchange assignment and mention notifications in Russian and English', async ({ browser }) => {
  const adminContext = await browser.newContext({ locale: 'ru-RU', timezoneId: 'Europe/Saratov' });
  const editorContext = await browser.newContext({ locale: 'en-US', timezoneId: 'Europe/Saratov' });
  const admin = await adminContext.newPage();
  const editor = await editorContext.newPage();

  await signIn(admin, 'e2e-access-id-2026-secure');
  await signIn(editor, 'e2e-editor-access-id-2026-secure');

  await editor.goto('/e2e-team/settings/language');
  await editor.locator('select[data-k="lang"]').selectOption('English (US)');
  await expect(editor.locator('html')).toHaveAttribute('lang', 'en');
  await expect(editor.locator('#main-content')).toContainText('Language and regional formats.');
  await expect(admin.locator('html')).toHaveAttribute('lang', 'ru');

  const taskTitle = `E2E уведомление ${Date.now()}`;
  await admin.goto('/e2e-team/tasks');
  await admin.locator('button[data-a="newTask"]:visible').first().click();
  await admin.locator('#f-title').fill(taskTitle);
  await admin.locator('.modal [data-pop="assignee"]').click();
  await admin.locator('.pop .mi', { hasText: 'E2E Редактор' }).click();
  await admin.locator('#f-submit').click();
  await waitForSaved(admin);

  await editor.reload();
  await expect(editor.locator('.shell')).toBeVisible();
  await editor.goto('/e2e-team/notifications');
  await expect(editor.locator('.nrow', { hasText: taskTitle })).toContainText('assigned you');

  await editor.goto('/e2e-team/inbox');
  await editor.locator('.inbox-list [data-a="selNotif"]', { hasText: taskTitle }).click();
  await expect(editor.locator('.inbox-prev h2')).toHaveText(taskTitle);
  await editor.locator('.inbox-prev [data-a="insertAt"]').click();
  const inboxMentionPicker = editor.locator('.inbox-prev .mention-picker');
  await expect(inboxMentionPicker).toBeVisible();
  await inboxMentionPicker.locator('[data-name="Тестовый администратор"]').click();
  await expect(editor.locator('#inbox-reply')).toHaveValue('@Тестовый администратор ');
  await editor.locator('#inbox-reply').fill('@Тестовый администратор Проверьте результат.');
  await editor.locator('.inbox-prev [data-a="postComment"]').click();
  await waitForSaved(editor);
  await editor.locator('.inbox-tabs [data-v="assign"]').click();
  await expect(editor.locator('.inbox-prev h2')).toHaveText('Select a notification');

  await admin.reload();
  await expect(admin.locator('.shell')).toBeVisible();
  await admin.goto('/e2e-team/notifications');
  const mention = admin.locator('.nrow', { hasText: taskTitle });
  await expect(mention).toContainText('упомянул');
  await expect(mention).toContainText('Проверьте результат.');

  for (const [page, width, height] of [
    [admin, 390, 844],
    [editor, 1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto('/e2e-team/notifications');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(2);
    await expect(page.locator('body')).not.toContainText('Something went wrong');
  }

  await editor.setViewportSize({ width: 390, height: 844 });
  await editor.goto('/e2e-team/mytasks');
  await editor.getByText(taskTitle, { exact: true }).first().click();
  const mobileAssignee = editor.locator('.drawer [data-pop="assignee"]');
  await mobileAssignee.click();
  const assigneeMenu = editor.locator('.pop[data-pop-type="assignee"]');
  await expect(assigneeMenu).toBeVisible();
  const menuBox = await assigneeMenu.boundingBox();
  expect(menuBox?.x).toBeGreaterThanOrEqual(8);
  expect((menuBox?.x || 0) + (menuBox?.width || 0)).toBeLessThanOrEqual(382);
  await assigneeMenu.getByText('Unassigned', { exact: true }).click();
  await waitForSaved(editor);
  await expect(mobileAssignee).toContainText('Unassigned');
  await mobileAssignee.click();
  await assigneeMenu.getByText('E2E Редактор (you)', { exact: true }).click();
  await waitForSaved(editor);
  await expect(mobileAssignee).toContainText('E2E Редактор');

  await editor.setViewportSize({ width: 1440, height: 900 });
  await editor.locator('.drawer [data-a="toggleDrawerFull"]').click();
  const fullDrawer = editor.locator('.drawer.full');
  await expect(fullDrawer).toBeVisible();
  await editor.waitForTimeout(350);
  const drawerBox = await fullDrawer.boundingBox();
  expect(Math.abs((drawerBox?.x || 0) + (drawerBox?.width || 0) / 2 - 720)).toBeLessThanOrEqual(1);

  for (const [route, heading] of [
    ['inbox', 'Inbox'],
    ['mytasks', 'My Tasks'],
    ['notifications', 'Notifications'],
    ['settings/notif-push', 'Settings'],
  ]) {
    await editor.goto(`/e2e-team/${route}`);
    await expect(editor.locator('html')).toHaveAttribute('lang', 'en');
    await expect(editor.locator('.crumbs .cur')).toHaveText(heading);
    if (route === 'settings/notif-push') await expect(editor.locator('#main-content h1')).toHaveText('Browser notifications');
    const overflow = await editor.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `English mobile route ${route} has horizontal overflow`).toBeLessThanOrEqual(2);
  }

  await adminContext.close();
  await editorContext.close();
});
