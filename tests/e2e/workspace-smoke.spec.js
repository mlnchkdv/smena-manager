import { expect, test } from '@playwright/test';

test.setTimeout(180_000);

async function finishOnboarding(page) {
  const outcome = page.locator('#o-ws:visible, .shell:visible, [role="alert"]:visible').first();
  await outcome.waitFor({ state: 'visible' });
  if ((await outcome.getAttribute('role')) === 'alert') throw new Error(`Sign in failed: ${(await outcome.textContent())?.trim()}`);
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

async function waitForSaved(page) {
  // Workspace writes are coalesced for 150 ms, while a few form actions finish
  // their button feedback before committing (up to 600 ms).
  await page.waitForTimeout(650);
  await expect(page.locator('#sync-indicator')).toHaveAttribute('data-state', 'saved', { timeout: 15_000 });
}

async function confirmDialog(page) {
  await page.locator('[data-a="confirmOk"]:visible').last().click();
}

async function openTrash(page) {
  await page.goto('/e2e-team/archive');
  await page.locator('[data-a="set"][data-k="archTab"][data-v="trash"]').click();
}

async function visibleUntranslatedUi(page) {
  return page.evaluate(() => {
    const allowed =
      /Smena Manager|KMS Brain|E2E|CtrlK|Ctrl|Shift|Esc|Tab|GMT|Gmail|Web Push|Push|Windows|macOS|ChromeOS|Linux|Android|iPhone|iPad|Chrome|Edge|Firefox|Safari|https?|URL|JSON|Markdown|Google(?: Drive)?|OAuth|\bPRJ-\d+\b|\b[^\s@]+@[^\s@]+\.[^\s@]+\b|\b[\w.-]+\.(?:app|com|net|org|ru|test|txt|pdf|csv|zip|docx?|xlsx?|png|jpe?g|gif|webp)\b|\b(?:MB|GB|PDF|CSV|TXT|ZIP|DOCX?|XLSX?|PNG|JPE?G|GIF|WebP|HTML|CSS|API)\b/giu;
    const visible = element => Boolean(element?.offsetWidth || element?.offsetHeight || element?.getClientRects().length);
    return [
      ...new Set(
        [...document.querySelectorAll('body *')]
          .filter(element => visible(element) && !element.children.length)
          .map(element => element.textContent?.replace(/\s+/g, ' ').trim() || '')
          .filter(text => /[A-Za-z]{3}/u.test(text.replace(allowed, ''))),
      ),
    ];
  });
}

async function expectRussianUi(page, context) {
  expect(await visibleUntranslatedUi(page), `${context} contains untranslated English UI text`).toEqual([]);
}

test('Russian workspace remains usable and responsive across breakpoints', async ({ page }) => {
  await signIn(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  const untranslatedByRoute = [];

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
    ['settings/workspace', 'Настройки'],
    ['settings/appearance', 'Настройки'],
    ['settings/language', 'Настройки'],
    ['settings/datetime', 'Настройки'],
    ['settings/data-transfer', 'Настройки'],
    ['settings/members', 'Настройки'],
    ['settings/teams', 'Настройки'],
    ['settings/projects', 'Настройки'],
    ['settings/permissions', 'Настройки'],
    ['settings/notif-mentions', 'Настройки'],
    ['settings/notif-assign', 'Настройки'],
    ['settings/notif-push', 'Настройки'],
    ['settings/profile', 'Настройки'],
    ['settings/security', 'Настройки'],
    ['settings/preferences', 'Настройки'],
    ['settings/shortcuts', 'Настройки'],
    ['archive', 'Архив'],
  ];
  const viewports = [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'tablet-wide', width: 1024, height: 900 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'mobile', width: 390, height: 844 },
  ];
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const [route, heading] of routes) {
      await page.goto(`/e2e-team${route ? `/${route}` : ''}`);
      await expect(page.locator('#main-content')).toBeVisible();
      await expect(page.locator('.crumbs .cur')).toHaveText(heading);
      await expect(page.locator('#main-content [aria-busy="true"]')).toHaveCount(0);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${viewport.name}/${route || 'home'} has horizontal page overflow`).toBeLessThanOrEqual(2);
      await expect(page.locator('body')).not.toContainText('Something went wrong');
      const accessibilityIssues = await page.evaluate(() => {
        const visible = element => Boolean(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
        const accessibleName = element => {
          const labelledBy = element.getAttribute('aria-labelledby');
          const labelledText = labelledBy
            ? labelledBy
                .split(/\s+/)
                .map(id => document.getElementById(id)?.textContent || '')
                .join(' ')
            : '';
          const label = element.id ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`)?.textContent : '';
          return [
            element.getAttribute('aria-label'),
            labelledText,
            label,
            element.closest('label')?.textContent,
            element.title,
            element.placeholder,
            element.textContent,
          ]
            .join(' ')
            .trim();
        };
        const duplicates = [...document.querySelectorAll('[id]')].map(element => element.id).filter((id, index, ids) => id && ids.indexOf(id) !== index);
        const unnamed = [...document.querySelectorAll('button, [role="button"], input:not([type="hidden"]), select, textarea')]
          .filter(element => visible(element) && !accessibleName(element))
          .map(
            element =>
              `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${element.className ? `.${String(element.className).trim().replace(/\s+/g, '.')}` : ''}`,
          );
        return [...new Set([...duplicates.map(id => `duplicate-id:${id}`), ...unnamed.map(value => `unnamed:${value}`)])];
      });
      expect(accessibilityIssues, `${viewport.name}/${route || 'home'} has basic accessibility issues`).toEqual([]);
      if (viewport.name === 'desktop') {
        const untranslated = await visibleUntranslatedUi(page);
        if (untranslated.length) untranslatedByRoute.push({ route: route || 'home', untranslated });
      }
    }
  }
  expect(untranslatedByRoute, 'visible Russian routes contain untranslated English UI text').toEqual([]);
});

test('shared content, files, settings, and backups persist through core workflows', async ({ page }) => {
  await signIn(page);
  await page.setViewportSize({ width: 1440, height: 900 });

  const noteTitle = 'Регламент сквозной проверки';
  await page.goto('/e2e-team/knowledge');
  await page.locator('[data-a="newKnowledgeNote"]').first().click();
  await page.locator('#knowledge-title').fill(noteTitle);
  await page.locator('#knowledge-summary').fill('Проверка сохранения общей базы знаний');
  await page.locator('#knowledge-body').fill('Содержимое заметки сохраняется между сеансами.');
  await expectRussianUi(page, 'knowledge editor');
  await waitForSaved(page);
  await page.reload();
  await expect(page.locator('#knowledge-title')).toHaveValue(noteTitle);
  await page.locator('[data-a="deleteKnowledgeNote"]').click();
  await expectRussianUi(page, 'knowledge delete confirmation');
  await confirmDialog(page);
  await waitForSaved(page);
  await openTrash(page);
  const noteTrashRow = page.locator('.mini', { hasText: noteTitle });
  await expect(noteTrashRow).toBeVisible();
  await noteTrashRow.locator('[data-a="restoreTrash"]').click();
  await waitForSaved(page);
  await page.goto('/e2e-team/knowledge');
  await expect(page.getByText(noteTitle, { exact: true }).first()).toBeVisible();

  const bookmarkTitle = 'Справочник для команды';
  await page.goto('/e2e-team/bookmarks');
  await page.locator('[data-a="newBookmark"]').first().click();
  await page.locator('#bookmark-url').fill('https://example.com/team-guide');
  await page.locator('#bookmark-title').fill(bookmarkTitle);
  await page.locator('#bookmark-description').fill('Проверка общей коллекции ссылок');
  await expectRussianUi(page, 'bookmark editor');
  await page.locator('[data-a="saveBookmark"]').click();
  await waitForSaved(page);
  await page.reload();
  const bookmarkCard = page.locator('.bookmark-card', { hasText: bookmarkTitle });
  await expect(bookmarkCard).toBeVisible();
  await bookmarkCard.locator('[data-a="deleteBookmark"]').click();
  await expectRussianUi(page, 'bookmark delete confirmation');
  await confirmDialog(page);
  await waitForSaved(page);
  await openTrash(page);
  const bookmarkTrashRow = page.locator('.mini', { hasText: bookmarkTitle });
  await expect(bookmarkTrashRow).toBeVisible();
  await bookmarkTrashRow.locator('[data-a="restoreTrash"]').click();
  await waitForSaved(page);
  await page.goto('/e2e-team/bookmarks');
  await expect(page.getByText(bookmarkTitle, { exact: true })).toBeVisible();

  const fileName = 'e2e-team-note.txt';
  await page.goto('/e2e-team/projects');
  await page.locator('[data-a="go"][data-r="project"][aria-label="Проверка интерфейса"]').click();
  await page.locator('.proj-h [data-a="go"][data-r="project"][data-tab="files"]').click();
  await page
    .locator('input[data-in="uploadFiles"]')
    .first()
    .setInputFiles({
      name: fileName,
      mimeType: 'text/plain',
      buffer: Buffer.from('Файл для сквозной проверки общего хранилища.', 'utf8'),
    });
  await expect(page.getByText(fileName, { exact: true })).toBeVisible({ timeout: 15_000 });
  await waitForSaved(page);
  await page.reload();
  const fileCard = page.locator('.fcard', { hasText: fileName });
  await expect(fileCard).toBeVisible();
  await fileCard.locator('[data-a="ctxBtn"]').click();
  await expectRussianUi(page, 'file context menu');
  await page.locator('[data-a="delFile"]:visible').click();
  await expectRussianUi(page, 'file delete confirmation');
  await confirmDialog(page);
  await waitForSaved(page);
  await openTrash(page);
  const fileTrashRow = page.locator('.mini', { hasText: fileName });
  await expect(fileTrashRow).toBeVisible();
  await fileTrashRow.locator('[data-a="restoreTrash"]').click();
  await waitForSaved(page);

  await page.goto('/e2e-team/settings/workspace');
  await expectRussianUi(page, 'workspace settings');
  await page.locator('#ws-name').fill('E2E Команда — сохранено');
  await page.locator('#ws-save').click();
  await waitForSaved(page);
  await page.reload();
  await expect(page.locator('#ws-name')).toHaveValue('E2E Команда — сохранено');
  await page.locator('#ws-name').fill('E2E Команда');
  await page.locator('#ws-save').click();
  await waitForSaved(page);

  await page.goto('/e2e-team/settings/data-transfer');
  await expectRussianUi(page, 'data transfer settings');
  await page.locator('[data-a="createWorkspaceBackup"]').click();
  await expect(page.locator('.toast')).toContainText('Резервная копия сохранена.', { timeout: 15_000 });
  await expect(page.getByText('Ручная копия', { exact: true }).first()).toBeVisible();

  await page.goto('/e2e-team/settings/security');
  await expect(page.getByRole('heading', { name: 'Безопасность аккаунта', exact: true })).toBeVisible();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Открыть настройки Google' })).toHaveAttribute('href', 'https://myaccount.google.com/security');
  await expect(page.getByRole('heading', { name: 'Активные сеансы', exact: true })).toBeVisible();
  await expect(page.locator('.auth-session-row[data-current="true"]')).toContainText('Это устройство');
  await expect(page.locator('.auth-session-row[data-current="true"]')).toContainText('Windows');
  await expectRussianUi(page, 'account security settings');

  await page.goto('/e2e-team/settings/language');
  await page.locator('select[data-k="lang"]').selectOption('English (US)', { force: true });
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await waitForSaved(page);
  await page.goto('/e2e-team/settings/security');
  await expect(page.getByRole('heading', { name: 'Account security', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Google security' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Active sessions', exact: true })).toBeVisible();
  await expect(page.locator('.auth-session-row[data-current="true"]')).toContainText('This device');
  await page.goto('/e2e-team/settings/data-transfer');
  await expect(page.getByRole('heading', { name: 'Backups', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create backup' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'KMS Brain data transfer', exact: true })).toBeVisible();
  await page.goto('/e2e-team/settings/members');
  await page.locator('[data-a="invite"]').first().click();
  await expect(page.getByRole('heading', { name: /Add access to E2E/u })).toBeVisible();
  await expect(page.getByText('Google account addresses', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.goto('/e2e-team/archive');
  await expect(page.getByRole('tab', { name: /Trash/u })).toBeVisible();
  await page.locator('[data-a="pop"][data-pop="help"]').click();
  await expect(page.locator('.pop')).toContainText('Keyboard shortcuts');
  await expect(page.locator('.pop')).toContainText('Command menu');
  await page.goto('/e2e-team/settings/language');
  await page.locator('select[data-k="lang"]').selectOption('English (UK)', { force: true });
  await waitForSaved(page);
  await page.goto('/e2e-team/settings/security');
  await expect(page.locator('.auth-session-row[data-current="true"] time').first()).toHaveText(/\d{1,2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2}/u);
  await page.goto('/e2e-team/settings/language');
  await page.locator('select[data-k="lang"]').selectOption('Русский', { force: true });
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await waitForSaved(page);
});

test('signing out is synchronized across browser tabs', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'ru-RU', timezoneId: 'Europe/Saratov' });
  const firstPage = await context.newPage();
  await signIn(firstPage);

  const secondPage = await context.newPage();
  await secondPage.goto('/e2e-team');
  await expect(secondPage.locator('.shell')).toBeVisible();

  await firstPage.locator('.account-menu-trigger:visible').first().click();
  await firstPage.locator('[data-a="signOut"]:visible').click();

  await expect(firstPage.locator('#login-btn')).toBeVisible();
  await expect(secondPage.locator('#login-btn')).toBeVisible();
  await expect(secondPage.getByRole('alert')).toContainText(/You signed out in another tab|В другой вкладке выполнен выход/u);
  await context.close();
});
