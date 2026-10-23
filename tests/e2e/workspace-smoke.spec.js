import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { unzipSync, strFromU8 } from 'fflate';

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

async function signIn(page, accessId = 'e2e-access-id-2026-secure') {
  await page.goto('/');
  await page.locator('#l-access').fill(accessId);
  await page.locator('#login-btn').click();
  await finishOnboarding(page);
  await expect(page.locator('.shell')).toBeVisible();
  await waitForSaved(page);
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
          .filter(element => visible(element) && !element.children.length && !element.closest('[translate="no"]'))
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
  // This sweep navigates every workspace section at four viewport sizes.
  // Keep individual assertions bounded, but allow the complete sweep to finish on slower hosts.
  test.setTimeout(360_000);
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
    ['files', 'Файлы'],
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

  await page.goto('/e2e-team/teams');
  await page.locator('[data-a="newTeam"]:visible').first().click();
  const teamName = 'Команда регрессии <strong>Review</strong>';
  await page.locator('#tm-name').fill(teamName);
  await page.locator('label.mi', { hasText: 'Тестовый администратор' }).locator('[data-a="tformMember"]').check();
  await page.locator('label.mi', { hasText: 'Проверка интерфейса' }).locator('[data-a="tformProject"]').check();
  await page.locator('[data-a="submitTeam"]').click();
  await waitForSaved(page);
  await expect(page.locator('.grid2').getByText('Тестовый администратор', { exact: true })).toBeVisible();
  await expect(page.locator('.grid2 .stack > section.panel').first().getByText('Проверка интерфейса', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('.grid2').getByText('Тестовый администратор', { exact: true })).toBeVisible();
  await expect(page.locator('.grid2 .stack > section.panel').first().getByText('Проверка интерфейса', { exact: true })).toBeVisible();

  await page.goto('/e2e-team/teams');
  await page.locator('[data-a="newTeam"]:visible').first().click();
  await page.setViewportSize({ width: 320, height: 720 });
  for (const panel of await page.locator('.team-form .panel').all()) {
    expect(await panel.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(2);
  }
  await page.locator('#tm-name').fill(teamName);
  await page.locator('[data-a="submitTeam"]').click();
  await expect(page.locator('#tm-name-err')).toHaveText(`Команда с названием «${teamName}» уже существует.`);
  await expect(page.locator('#tm-name-err strong')).toHaveCount(0);
  await page.getByRole('dialog').getByRole('button', { name: 'Отмена', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 900 });

  const noteTitle = 'Регламент сквозной проверки';
  await page.goto('/e2e-team/knowledge');
  await page.locator('[data-a="newKnowledgeNote"]').first().click();
  await page.locator('#knowledge-title').fill(noteTitle);
  await page.locator('.knowledge-properties>summary').click();
  await page.locator('#knowledge-summary').fill('Проверка сохранения общей базы знаний');
  await page.locator('#knowledge-body').fill('Содержимое заметки сохраняется между сеансами.');
  await expectRussianUi(page, 'knowledge editor');
  await waitForSaved(page);
  await page.reload();
  await page.locator('[data-a="openKnowledgeNote"][data-id]').filter({ hasText: noteTitle }).click();
  await expect(page.locator('.knowledge-drawer')).toBeVisible();
  await page.locator('[data-a="editKnowledgeNote"]').click();
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
  await page.goto('/e2e-team/files');
  await expect(page.getByRole('heading', { name: 'Файлы', exact: true })).toBeVisible();
  await page.locator('#workspace-file-q').fill('e2e-team-note');
  const fileCard = page.locator('.workspace-file-card', { hasText: fileName });
  await expect(fileCard).toBeVisible();
  await expect(fileCard).toContainText('Проверка интерфейса');
  await fileCard.locator('[data-a="ctxBtn"]').click();
  await expectRussianUi(page, 'file context menu');
  await page.locator('[data-a="delFile"]:visible').click();
  await expectRussianUi(page, 'file delete confirmation');
  await confirmDialog(page);
  await expect(page.locator('.toast').filter({ hasText: `«${fileName}» перемещено в корзину` })).toBeVisible();
  await expect(page.locator('.toast').filter({ hasText: fileName }).getByRole('button', { name: 'Отменить', exact: true })).toBeVisible();
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
  await page.goto('/e2e-team/settings/data-transfer');
  await page.getByRole('button', { name: 'Restore', exact: true }).first().click();
  await expect(page.getByRole('dialog')).toContainText(/\d{1,2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2}/u);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
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

test('unsaved task drafts survive reload and synchronize after write connectivity returns', async ({ page }) => {
  await signIn(page);
  await page.goto('/e2e-team/tasks');
  const title = `Офлайн-копия ${Date.now()}`;
  await page.route('**/api/workspace', route => (route.request().method() === 'PUT' ? route.abort('internetdisconnected') : route.continue()));
  await page.locator('button[data-a="newTask"]:visible').first().click();
  await page.locator('#f-title').fill(title);
  await page.locator('#f-submit').click();
  await expect(page.locator('#sync-indicator')).toHaveAttribute('data-state', 'offline', { timeout: 15000 });
  await page.reload();
  await expect(page.locator('.shell')).toBeVisible();
  await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
  await expect(page.locator('#sync-indicator')).toHaveAttribute('data-state', 'offline', { timeout: 15000 });
  await page.unroute('**/api/workspace');
  await page.locator('[data-a="retryOnline"]:visible').first().click();
  await waitForSaved(page);
  await page.reload();
  await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
});

test('large task views keep bounded pages and allow reaching later tasks', async ({ page }) => {
  await signIn(page);
  const snapshot = (await (await page.request.get('/api/workspace')).json()).data;
  const prefix = `page-check-${Date.now()}-`;
  const tasks = Array.from({ length: 105 }, (_, index) => ({
    id: `${prefix}${index}`,
    project: snapshot.projects[0].id,
    title: `${prefix}${index}`,
    status: 'todo',
    priority: 'none',
    assignee: snapshot.me,
    order: index + 1,
    labels: [],
    subtasks: [],
    attachments: [],
    deps: [],
    desc: '',
    created: Date.now(),
    updated: Date.now(),
  }));
  const saved = await page.request.put('/api/workspace', {
    data: { revision: snapshot.revision, data: { ...snapshot, tasks: [...snapshot.tasks, ...tasks] } },
  });
  expect(saved.status()).toBe(200);
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/e2e-team/tasks');
    await page.locator('[data-a="setViewMode"][data-v="board"]').click();
    const column = page.locator('.bcol[data-drop-col="todo"]');
    await expect(column.locator('.kcard')).toHaveCount(100);
    await column.locator('[data-a="listPage"][data-page="1"]').click();
    await expect(column.getByText(`${prefix}104`, { exact: true })).toBeVisible();
    for (const language of ['Русский', 'English (US)']) {
      await page.goto('/e2e-team/settings/language');
      await page.locator('select[data-k="lang"]').selectOption(language);
      await waitForSaved(page);
      await page.goto('/e2e-team/tasks');
      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        const assignee = page.locator(`.kcard[data-drag-card^="${prefix}"] .board-assignee`).first();
        await assignee.hover();
        await expect(assignee).toHaveAttribute('data-tip', snapshot.members.find(member => member.id === snapshot.me).name);
        expect(await assignee.locator('.av').getAttribute('data-tip')).toBeNull();
        const hint = await assignee.evaluate(el => {
          const style = getComputedStyle(el, '::after');
          return { top: style.top, right: style.right, bottom: style.bottom, height: style.height, cardLayer: getComputedStyle(el.closest('.kcard')).zIndex };
        });
        expect(hint.right).toBe('0px');
        expect(parseFloat(hint.bottom)).toBeGreaterThan(0);
        expect(parseFloat(hint.top) + parseFloat(hint.height)).toBeLessThan(0);
        expect(hint.cardLayer).toBe('1');
        await assignee.focus();
        await page.mouse.move(0, 0);
        expect(await assignee.evaluate(el => getComputedStyle(el, '::after').content)).not.toBe('none');
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('[data-a="setViewMode"][data-v="table"]').click();
    expect(await page.locator('table tr [data-a="openTask"]').count()).toBeLessThanOrEqual(100);
    await expect(page.locator('[data-a="listPage"][data-page="1"]').first()).toBeVisible();
  } finally {
    const latest = (await (await page.request.get('/api/workspace')).json()).data;
    latest.tasks = latest.tasks.filter(task => !task.id.startsWith(prefix));
    expect((await page.request.put('/api/workspace', { data: { revision: latest.revision, data: latest } })).status()).toBe(200);
  }
});

test('file folders preserve uploads and moves through reload and archive on mobile in both languages', async ({ page }) => {
  await signIn(page);
  await page.goto('/e2e-team/files');
  const createFolder = async name => {
    await page.locator('[data-a="newFileFolder"]').click();
    await page.locator('#file-folder-name').fill(name);
    await page.locator('[data-a="saveFileFolder"]').click();
    await waitForSaved(page);
  };
  await createFolder('E2E Files A');
  await expect(page.getByRole('heading', { name: 'В этой папке пока нет файлов', exact: true })).toBeVisible();
  const pickerEvent = page.waitForEvent('filechooser');
  await page.locator('[data-a="chooseStoredFiles"]').click();
  await (await pickerEvent).setFiles({ name: 'e2e-folder-file.txt', mimeType: 'text/plain', buffer: Buffer.from('Folder upload / Загрузка в папку') });
  await expect(page.locator('.workspace-file-card', { hasText: 'e2e-folder-file.txt' })).toBeVisible();
  await waitForSaved(page);
  await page.reload();
  await expect(page.locator('.workspace-file-card', { hasText: 'e2e-folder-file.txt' })).toContainText('E2E Files A');
  await page.locator('.files-folder-crumbs [data-project="all"]').click();
  await expect(page.locator('#workspace-file-project')).toHaveValue('all');
  await createFolder('E2E Files B');
  await page.locator('.files-folder-crumbs [data-project="all"]').click();
  await page.locator('.workspace-file-card', { hasText: 'e2e-folder-file.txt' }).locator('[data-a="ctxBtn"]').click();
  await page.locator('[data-a="moveFileToFolder"]').click();
  await page.locator('.file-move-row', { hasText: 'E2E Files B' }).click();
  await page.locator('[data-a="confirmFileMove"]').click();
  await waitForSaved(page);
  await page.reload();
  await expect(page.locator('.workspace-file-card', { hasText: 'e2e-folder-file.txt' })).toContainText('E2E Files B');
  for (const language of ['English (US)', 'Русский']) {
    await page.goto('/e2e-team/settings/language');
    await page.locator('select[data-k="lang"]').selectOption(language);
    await page.goto('/e2e-team/files');
    await page.setViewportSize({ width: 320, height: 844 });
    const folder = page.locator('.files-folder-tile', { hasText: 'E2E Files A' });
    await folder.locator('summary').click();
    await folder.locator('[data-a="archiveFileFolder"]').click();
    await waitForSaved(page);
    await page.locator('[data-a="toggleFileFolderArchive"]').click();
    await expect(page.locator('.files-folder-tile', { hasText: 'E2E Files A' })).toBeVisible();
    await page.locator('.files-folder-tile', { hasText: 'E2E Files A' }).locator('[data-a="restoreFileFolder"]').click();
    await waitForSaved(page);
    await page.locator('.files-folder-crumbs [data-project="all"]').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    if (language === 'Русский') await expectRussianUi(page, 'File folder browser');
    await page.screenshot({ path: `output/playwright/file-folders-${language === 'Русский' ? 'ru' : 'en'}-320.png`, fullPage: true });
  }
});

test('file actions follow project view comment edit permissions', async ({ page, browser }) => {
  await signIn(page);
  const editorContext = await browser.newContext();
  try {
    const editorPage = await editorContext.newPage();
    await signIn(editorPage, 'e2e-editor-access-id-2026-secure');
    let current = (await (await page.request.get('/api/workspace')).json()).data;
    const editor = current.members.find(member => member.email === 'editor@example.test');
    expect(editor).toBeTruthy();
    const projectId = current.projects[0].id;
    const response = await page.request.post('/api/files/upload', {
      multipart: {
        file: { name: 'acl-file.txt', mimeType: 'text/plain', buffer: Buffer.from('ACL test') },
        revision: String(current.revision),
        project: projectId,
      },
    });
    expect(response.status()).toBe(201);
    const file = (await response.json()).file;
    for (const permission of ['Can view', 'Can comment', 'Can edit']) {
      current = (await (await page.request.get('/api/workspace')).json()).data;
      for (const project of current.projects) {
        project.members = [...new Set([...(project.members || []), editor.id])];
        project.perms = { ...project.perms, [editor.id]: project.id === projectId ? permission : 'Can view' };
      }
      expect((await page.request.put('/api/workspace', { data: { revision: current.revision, data: current } })).ok()).toBeTruthy();
      await editorPage.setViewportSize({ width: 320, height: 844 });
      await editorPage.goto('/e2e-team/files');
      await expect(editorPage.locator('.files-page')).toBeVisible();
      await expect(editorPage.locator('[data-a="chooseStoredFiles"]')).toHaveCount(permission === 'Can edit' ? 1 : 0);
      await expect(editorPage.locator('[data-a="newFileFolder"]')).toHaveCount(permission === 'Can edit' ? 1 : 0);
      if (permission === 'Can edit') await expect(editorPage.locator('#files-upload-project option')).toHaveCount(1);
      await editorPage.locator(`.workspace-file-card[data-id="${file.id}"] [data-a="ctxBtn"]`).click();
      await expect(editorPage.locator('[data-a="renameFile"]')).toHaveCount(permission === 'Can edit' ? 1 : 0);
      await expect(editorPage.locator('[data-a="moveFileToFolder"]')).toHaveCount(permission === 'Can edit' ? 1 : 0);
      await expect(editorPage.locator('[data-a="delFile"]')).toHaveCount(0);
      await expect(editorPage.locator('[data-a="downloadStoredFile"]')).toBeVisible();
      await editorPage.goto('/e2e-team/files');
      await editorPage.locator(`.workspace-file-card[data-id="${file.id}"] .workspace-file-project`).click();
      await expect(editorPage.locator('.files-toolbar')).toBeVisible();
      await expect(editorPage.locator('[data-a="chooseStoredFiles"]')).toHaveCount(permission === 'Can edit' ? 1 : 0);
    }
  } finally {
    await editorContext.close();
  }
});

test('bulk files move atomically across searchable folder pages and go to recoverable trash in both languages', async ({ page, browserName }) => {
  await signIn(page);
  let current = (await (await page.request.get('/api/workspace')).json()).data;
  const project = { id: `bulk-project-${browserName}`, name: `E2E bulk ${browserName}`, members: [current.me] };
  current.projects.push(project);
  current.projOrder.push(project.id);
  const fileName = i => `e2e-batch-${browserName}-${i}.txt`;
  project.fileFolders = [
    ...(project.fileFolders || []),
    { id: 'batch-a', name: 'Массовый перенос A' },
    { id: 'batch-b', name: 'Массовый перенос B' },
    ...Array.from({ length: 65 }, (_, i) => ({
      id: `page-folder-${i}`,
      name: `Папка / Folder ${String(i).padStart(3, '0')} — длинное название для мобильной проверки`,
    })),
  ];
  expect((await page.request.put('/api/workspace', { data: { revision: current.revision, data: current } })).ok()).toBeTruthy();
  const ids = [];
  for (let i = 1; i <= 3; i++) {
    current = (await (await page.request.get('/api/workspace')).json()).data;
    const upload = await page.request.post('/api/files/upload', {
      multipart: {
        file: { name: fileName(i), mimeType: 'text/plain', buffer: Buffer.from(`Batch ${i}`) },
        revision: String(current.revision),
        project: project.id,
        folderId: 'batch-a',
      },
    });
    expect(upload.status()).toBe(201);
    ids.push((await upload.json()).file.id);
  }
  for (const [language, target] of [
    ['English (US)', 'batch-b'],
    ['Русский', 'batch-a'],
  ]) {
    await page.goto('/e2e-team/settings/language');
    await page.locator('select[data-k="lang"]').selectOption(language);
    await page.goto('/e2e-team/files');
    await page.locator('#workspace-file-project').selectOption(project.id);
    await page.setViewportSize({ width: 320, height: 844 });
    await expect(page.locator('.files-folder-tile')).toHaveCount(4);
    await page.locator('#files-folder-query').fill('Массовый перенос');
    await expect(page.locator('.files-folder-tile')).toHaveCount(2);
    await page.locator(`.files-folder-open[data-folder="${target === 'batch-b' ? 'batch-a' : 'batch-b'}"]`).click();
    await expect(page.locator('.workspace-file-card')).toHaveCount(3);
    await page.locator('[data-a="selectFilePage"]').click();
    await expect(page.locator('.files-selected-count b')).toHaveText('3');
    await page.locator('.files-view-switch [data-v="list"]').click();
    await expect(page.locator('.workspace-file-table .file-select[aria-pressed="true"]')).toHaveCount(3);
    await page.locator('.files-selection-bar [data-a="moveFileToFolder"]').click();
    await page.locator('#file-move-query').fill(target === 'batch-b' ? 'перенос B' : 'перенос A');
    await page.locator(`[data-a="selectFileMoveTarget"][data-folder="${target}"]`).click();
    if (language === 'Русский') await expectRussianUi(page, 'Bulk move dialog');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `output/playwright/file-bulk-picker-${language === 'Русский' ? 'ru' : 'en'}-320.png`, fullPage: true });
    await page.locator('[data-a="confirmFileMove"]').click();
    await waitForSaved(page);
    await page.reload();
    current = (await (await page.request.get('/api/workspace')).json()).data;
    expect(current.files.filter(file => ids.includes(file.id)).map(file => file.folderId)).toEqual([target, target, target]);
    await expect(page.locator('.files-view-switch [data-v="list"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('.files-view-switch [data-v="grid"]').click();
    await page.locator('#workspace-file-q').fill(`e2e-batch-${browserName}-`);
    await expect(page.locator('.workspace-file-card')).toHaveCount(3);
    if (language === 'Русский') await expectRussianUi(page, 'Bulk file browser');
    for (const width of [320, 768, 1366]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    }
  }
  await page.locator('[data-a="selectFilePage"]').click();
  await page.locator('[data-a="trashSelectedFiles"]').click();
  await confirmDialog(page);
  await waitForSaved(page);
  await page.reload();
  current = (await (await page.request.get('/api/workspace')).json()).data;
  expect(current.files.some(file => ids.includes(file.id))).toBeFalsy();
  expect(current.trash.filter(item => ids.includes(item.data?.file?.id))).toHaveLength(3);
  await openTrash(page);
  await page
    .locator('.mini', { hasText: fileName(1) })
    .locator('[data-a="restoreTrash"]')
    .click();
  await waitForSaved(page);
  await page.goto('/e2e-team/files');
  await expect(page.locator('.workspace-file-card', { hasText: fileName(1) })).toContainText('Массовый перенос A');
});

test('file ZIP downloads preserve Unicode and duplicates and never publish failed or cancelled batches', async ({ page, browserName }) => {
  // Eight real downloads plus two reloads/locales under video/trace are slower
  // on WebKit. This is only a test budget, not a server/transfer deadline.
  if (browserName === 'webkit') test.setTimeout(300_000);
  await signIn(page);
  let current = (await (await page.request.get('/api/workspace')).json()).data;
  const project = current.projects[0];
  const folderId = `zip-folder-${browserName}`,
    folderName = `E2E ZIP folder ${browserName}`;
  project.fileFolders = [...(project.fileFolders || []), { id: folderId, name: folderName }];
  expect((await page.request.put('/api/workspace', { data: { revision: current.revision, data: current } })).ok()).toBeTruthy();
  const ids = [];
  for (const [i, name] of ['архив.txt', 'АРХИВ.txt', 'Дополнение.md'].entries()) {
    current = (await (await page.request.get('/api/workspace')).json()).data;
    const upload = await page.request.post('/api/files/upload', {
      multipart: {
        file: { name, mimeType: 'text/plain', buffer: Buffer.from(`ZIP fixture ${i} / русский текст`) },
        revision: String(current.revision),
        project: project.id,
        folderId,
      },
    });
    expect(upload.status()).toBe(201);
    ids.push((await upload.json()).file.id);
  }
  let downloads = 0;
  page.on('download', () => downloads++);
  for (const language of ['English (US)', 'Русский']) {
    await page.goto('/e2e-team/settings/language');
    await page.locator('select[data-k="lang"]').selectOption(language);
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto('/e2e-team/files');
    await page.locator('#workspace-file-q').fill(folderName);
    await expect(page.locator('.workspace-file-card')).toHaveCount(3);
    await page.locator('[data-a="selectFilePage"]').click();
    if (language === 'Русский') await expectRussianUi(page, 'ZIP selection toolbar');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    const event = page.waitForEvent('download');
    await page.locator('[data-a="downloadSelectedFiles"]').click();
    const download = await event;
    const unpacked = unzipSync(new Uint8Array(await readFile(await download.path())));
    const names = Object.keys(unpacked);
    expect(names).toHaveLength(3);
    expect(new Set(names.map(name => name.toLocaleLowerCase())).size).toBe(3);
    expect(names.some(name => name.endsWith('АРХИВ (2).txt') || name.endsWith('архив (2).txt'))).toBeTruthy();
    expect(names.every(name => name.includes(`/${folderName}/`))).toBeTruthy();
    expect(
      Object.values(unpacked)
        .map(bytes => strFromU8(bytes))
        .sort(),
    ).toEqual([0, 1, 2].map(i => `ZIP fixture ${i} / русский текст`));
    await expect(page.locator('.files-download-progress')).toHaveCount(0);
    await expect(page.locator('.files-download-ready')).toBeVisible();
    if (language === 'Русский') await expectRussianUi(page, 'Prepared ZIP fallback');
    const manualEvent = page.waitForEvent('download');
    await page.locator('.files-download-ready a[download]').click();
    const manual = unzipSync(new Uint8Array(await readFile(await (await manualEvent).path())));
    expect(Object.keys(manual)).toEqual(names);
    await page.locator('[data-a="streamSelectedFiles"]').click();
    await expect(page.locator('[data-a="startPreparedFileStream"]')).toBeVisible();
    if (language === 'Русский') await expectRussianUi(page, 'Native ZIP preflight');
    const streamedEvent = page.waitForEvent('download');
    await page.locator('[data-a="startPreparedFileStream"]').click();
    const streamed = unzipSync(new Uint8Array(await readFile(await (await streamedEvent).path())));
    expect(Object.keys(streamed)).toEqual(names);
    expect(Object.values(streamed).map(bytes => strFromU8(bytes))).toEqual(Object.values(unpacked).map(bytes => strFromU8(bytes)));
    if (!(await page.locator('.files-exports').getAttribute('open'))) await page.locator('.files-exports summary').click();
    await page.locator('[data-a="createFileExport"]').click();
    await expect(page.locator('.files-export-job a[download]')).toBeVisible();
    const exportId = await page.locator('.files-export-job').first().getAttribute('data-export');
    await page.reload();
    const exportRow = page.locator(`.files-export-job[data-export="${exportId}"]`);
    await expect(exportRow.locator('a[download]')).toBeVisible();
    if (language === 'Русский') await expectRussianUi(page, 'Resumable export after reload');
    const persistentEvent = page.waitForEvent('download');
    await exportRow.locator('a[download]').click();
    const persistent = unzipSync(new Uint8Array(await readFile(await (await persistentEvent).path())));
    expect(Object.keys(persistent)).toEqual(names);
    expect(Object.values(persistent).map(bytes => strFromU8(bytes))).toEqual(Object.values(unpacked).map(bytes => strFromU8(bytes)));
    await exportRow.locator('[data-a="cancelFileExport"]').click();
    await page.locator('#workspace-file-q').fill(folderName);
    await page.locator('[data-a="selectFilePage"]').click();
    await expect(page.locator('.files-page')).toBeVisible();
    await page.screenshot({ path: `output/playwright/files-zip-${language === 'Русский' ? 'ru' : 'en'}-320.png`, fullPage: true });
  }
  const endpoint = `**/api/files/${ids[0]}/content?download=1`;
  await page.route(endpoint, route =>
    route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Unable to create the ZIP.', code: 'FILE_UNAVAILABLE' }) }),
  );
  await page.locator('[data-a="downloadSelectedFiles"]').click();
  await expect(page.locator('.toast').filter({ hasText: 'Не удалось создать ZIP.' })).toBeVisible();
  expect(downloads).toBe(8);
  await page.unroute(endpoint);
  let releaseDownload;
  const blockedDownload = new Promise(resolve => {
    releaseDownload = resolve;
  });
  await page.route(endpoint, async route => {
    await blockedDownload;
    await route.fulfill({ status: 200, body: 'late' }).catch(() => {});
  });
  await page.locator('[data-a="downloadSelectedFiles"]').click();
  await expect(page.locator('.files-download-progress')).toBeVisible();
  await page.locator('[data-a="cancelFileZip"]').click();
  await expect(page.locator('.files-download-progress')).toHaveCount(0);
  releaseDownload();
  expect(downloads).toBe(8);
  await page.unroute(endpoint);
});

test('large file collections keep bounded pages and remember device view preferences in both languages', async ({ page }) => {
  await signIn(page);
  let current = (await (await page.request.get('/api/workspace')).json()).data;
  current.projects.push({
    id: 'scale-files',
    name: 'Большая коллекция',
    members: [current.me],
    fileFolders: Array.from({ length: 600 }, (_, i) => ({ id: `scale-folder-${i}`, name: `Папка ${String(i).padStart(3, '0')}` })),
  });
  current.projOrder.push('scale-files');
  current.files.push(
    ...Array.from({ length: 1200 }, (_, i) => ({
      id: `scale-file-${i}`,
      name: `Большой файл ${i}.txt`,
      project: 'scale-files',
      folderId: `scale-folder-${i % 600}`,
      type: 'doc',
      by: current.me,
      at: i,
    })),
  );
  expect((await page.request.put('/api/workspace', { data: { revision: current.revision, data: current } })).ok()).toBeTruthy();
  const catalogRequests = [];
  const observeCatalog = request => {
    if (new URL(request.url()).pathname.startsWith('/api/files/catalog')) catalogRequests.push(request);
  };
  page.on('request', observeCatalog);
  try {
    await page.goto('/e2e-team/home');
    await expect(page.locator('.shell')).toBeVisible();
    await waitForSaved(page);
    expect(catalogRequests, 'Home bootstrap must not hydrate the file catalog').toHaveLength(0);
    const firstQuery = page.waitForResponse(response => response.url().includes('/api/files/catalog/query') && response.ok());
    await page.goto('/e2e-team/files');
    expect((await (await firstQuery).json()).files.length).toBeLessThanOrEqual(100);
    await expect(page.locator('#workspace-file-project option[value="scale-files"]')).toHaveCount(1);
    await page.locator('#workspace-file-project').selectOption('scale-files');
    await page.locator('#files-page-size').selectOption('25');
    await page.locator('#workspace-file-sort').selectOption('name');
    await page.locator('.files-view-switch [data-v="list"]').click();
    await expect(page.locator('.workspace-file-table tbody tr')).toHaveCount(25);
    await page.locator('#files-page-jump').fill('48');
    await page.locator('#files-page-jump').press('Enter');
    await expect(page.locator('#files-page-jump')).toHaveValue('48');
    await expect(page.locator('.files-pagination nav .hint')).toContainText('48 / 48');
    await page.locator('[data-a="toggleFileFolderLayout"]').click();
    await expect(page.locator('.files-folder-tile')).toHaveCount(16);
    await page.locator('#files-folder-page-jump').fill('38');
    await page.locator('#files-folder-page-jump').press('Enter');
    await expect(page.locator('.files-folder-tile')).toHaveCount(8);
    await page.reload();
    await expect(page.locator('.files-view-switch [data-v="list"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#files-page-size')).toHaveValue('25');
    await expect(page.locator('#workspace-file-sort')).toHaveValue('name');
    await expect(page.locator('.files-folder-grid')).toHaveClass(/compact/);
    for (const language of ['English (US)', 'Русский']) {
      await page.goto('/e2e-team/settings/language');
      await page.locator('select[data-k="lang"]').selectOption(language);
      await page.setViewportSize({ width: 320, height: 844 });
      await page.goto('/e2e-team/files');
      await page.locator('#workspace-file-project').selectOption('scale-files');
      await expect(page.locator('.files-folder-tile')).toHaveCount(8);
      await page.locator('#files-folder-query').fill('ПАПКА 599');
      await expect(page.locator('.files-folder-tile')).toHaveCount(1);
      await page.locator('#workspace-file-q').fill('Большой ПАПКА 599');
      await expect(page.locator('.workspace-file-table tbody tr')).toHaveCount(2);
      await page.locator('[data-a="toggleFileFolders"]').click();
      await expect(page.locator('.files-folder-tile')).toHaveCount(0);
      if (language === 'Русский') await expectRussianUi(page, 'Large file collections');
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: `output/playwright/files-scale-${language === 'Русский' ? 'ru' : 'en'}-320.png`, fullPage: true });
      await page.reload();
      await expect(page.locator('[data-a="toggleFileFolders"]')).toHaveAttribute('aria-expanded', 'false');
      await page.locator('[data-a="toggleFileFolders"]').click();
    }
  } finally {
    page.off('request', observeCatalog);
    await page.goto('/e2e-team/files');
    await page.locator('#files-page-size').selectOption('100');
    await page.locator('#workspace-file-sort').selectOption('date');
    await page.locator('.files-view-switch [data-v="grid"]').click();
    if (await page.locator('.files-folder-grid.compact').count()) await page.locator('[data-a="toggleFileFolderLayout"]').click();
    current = (await (await page.request.get('/api/workspace')).json()).data;
    current.projects = current.projects.filter(project => project.id !== 'scale-files');
    current.projOrder = current.projOrder.filter(id => id !== 'scale-files');
    current.files = current.files.filter(file => file.project !== 'scale-files');
    expect((await page.request.put('/api/workspace', { data: { revision: current.revision, data: current } })).ok()).toBeTruthy();
  }
});

test('folder trees move safely and saved recursive filters survive reload in both languages on mobile', async ({ page }) => {
  await signIn(page);
  let current = (await (await page.request.get('/api/workspace')).json()).data;
  const project = { id: 'tree-project', name: 'E2E tree project', members: [current.me] };
  current.projects.push(project);
  current.projOrder.push(project.id);
  project.fileFolders = [
    ...(project.fileFolders || []),
    { id: 'tree-a', name: 'E2E Tree A' },
    { id: 'tree-child', name: 'E2E Child', parentId: 'tree-a' },
    { id: 'tree-b', name: 'E2E Tree B' },
  ];
  current.files.push(
    ...['tree-a', 'tree-child'].map((folderId, i) => ({
      id: `tree-file-${i}`,
      project: project.id,
      name: `Tree file ${i}.txt`,
      folderId,
      type: 'doc',
      by: current.me,
      at: i,
    })),
  );
  expect((await page.request.put('/api/workspace', { data: { revision: current.revision, data: current } })).ok()).toBeTruthy();
  try {
    for (const language of ['English (US)', 'Русский']) {
      await page.goto('/e2e-team/settings/language');
      await page.locator('select[data-k="lang"]').selectOption(language);
      await page.setViewportSize({ width: 320, height: 844 });
      // Direct project entry must load all file handlers without visiting workspace Files first.
      await page.goto(`/e2e-team/project/${project.id}/files`);
      await expect(page.locator('#workspace-file-project')).toHaveCount(0);
      await expect(page.locator('.files-context-summary')).toBeVisible();
      await page.locator('.files-folder-tile', { hasText: 'E2E Tree A' }).locator('summary').click();
      await page.locator('[data-a="moveFileFolder"][data-folder="tree-a"]').click();
      await expect(page.locator('.file-move-row', { hasText: 'E2E Child' })).toHaveCount(0);
      await page.locator('.file-move-row', { hasText: 'E2E Tree B' }).click();
      await page.locator('[data-a="confirmFileMove"]').click();
      await waitForSaved(page);
      await page.reload();
      await page.locator('.files-folder-tile', { hasText: 'E2E Tree B' }).locator('[data-a="openFileFolder"]').click();
      await page.locator('.files-folder-tile', { hasText: 'E2E Tree A' }).locator('[data-a="openFileFolder"]').click();
      await expect(page.locator('.workspace-file-card')).toHaveCount(1);
      await page.locator('[data-a="toggleFileRecursive"]').click();
      await expect(page.locator('.workspace-file-card')).toHaveCount(2);
      await page.locator('[data-a="saveFileFilter"]').click();
      await page.locator('#prompt-in').fill('E2E saved tree');
      await page.locator('[data-a="promptSubmit"]').click();
      await page.reload();
      await page.locator('[data-in="fileFilterPreset"]').selectOption({ label: 'E2E saved tree' });
      await expect(page.locator('.workspace-file-card')).toHaveCount(2);
      await page.locator('.files-selection-bar [data-a="selectFileResults"]').click();
      await expect(page.locator('.files-selected-count b')).toHaveText('2');
      if (language === 'Русский') await expectRussianUi(page, 'Recursive folder filters');
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      await page.locator('.files-preset-manage summary').click();
      await page.locator('[data-a="removeFileFilter"]').click();
      // Move A back to the project root through the same picker for the next locale.
      await page.locator('.files-folder-crumbs [data-project="all"]').click();
      await page.locator('.files-folder-tile', { hasText: 'E2E Tree B' }).locator('[data-a="openFileFolder"]').click();
      await page.locator('.files-folder-tile', { hasText: 'E2E Tree A' }).locator('summary').click();
      await page.locator('[data-a="moveFileFolder"][data-folder="tree-a"]').click();
      await page.locator('.file-move-row[data-folder=""]').click();
      await page.locator('[data-a="confirmFileMove"]').click();
      await waitForSaved(page);
    }
  } finally {
    current = (await (await page.request.get('/api/workspace')).json()).data;
    current.projects = current.projects.filter(item => item.id !== project.id);
    current.projOrder = current.projOrder.filter(id => id !== project.id);
    current.files = current.files.filter(file => !file.id.startsWith('tree-file-'));
    expect((await page.request.put('/api/workspace', { data: { revision: current.revision, data: current } })).ok()).toBeTruthy();
  }
});

test('PDF previews render pages locally without document scripts in Russian and English on mobile', async ({ page }) => {
  await signIn(page);
  const current = (await (await page.request.get('/api/workspace')).json()).data;
  const expectedFileCount = current.files.length + 3;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R /OpenAction << /S /JavaScript /JS (globalThis.__pdfPreviewExecuted=true;) >> >>',
    '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 320 200] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>',
    null,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 320 200] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>',
    null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  for (const [index, text] of [
    [3, 'Page One'],
    [5, 'Page Two'],
  ]) {
    const stream = `BT /F1 20 Tf 30 120 Td (${text}) Tj ET\n`;
    objects[index] = `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`;
  }
  let pdf = '%PDF-1.7\n';
  const offsets = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 8\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const upload = await page.request.post('/api/files/upload', {
    multipart: {
      file: { name: 'e2e-safe-preview.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdf) },
      revision: String(current.revision),
      project: current.projects[0].id,
    },
  });
  expect(upload.status()).toBe(201);
  const file = (await upload.json()).file;
  const nextRevision = (await (await page.request.get('/api/workspace')).json()).data.revision;
  const thumbnailUpload = await page.request.post('/api/files/upload', {
    multipart: {
      file: {
        name: 'e2e-thumbnail.png',
        mimeType: 'image/png',
        buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aBn8AAAAASUVORK5CYII=', 'base64'),
      },
      revision: String(nextRevision),
      project: current.projects[0].id,
    },
  });
  expect(thumbnailUpload.status()).toBe(201);
  const thumbnail = (await thumbnailUpload.json()).file;
  await page.goto('/e2e-team/files');
  const originalPickerInput = await page.locator('input[type="file"][data-in="uploadFiles"]').elementHandle();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('[data-a="chooseStoredFiles"]').press('Enter');
  const picker = await chooser;
  expect(picker.isMultiple()).toBeTruthy();
  // Resizing causes the same render as an arriving catalog response while the
  // OS picker is open. Its original input must still deliver exactly one upload.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => originalPickerInput.evaluate(el => el.isConnected)).toBe(false);
  await picker.setFiles({ name: 'e2e-keyboard-upload.txt', mimeType: 'text/plain', buffer: Buffer.from('Keyboard upload / Загрузка с клавиатуры') });
  await originalPickerInput.dispose();
  await expect(page.locator('.workspace-file-card', { hasText: 'e2e-keyboard-upload.txt' })).toBeVisible();
  await waitForSaved(page);
  await page.reload();
  await expect(page.locator('.workspace-file-card', { hasText: 'e2e-keyboard-upload.txt' })).toBeVisible();
  for (const language of ['Русский', 'English (US)']) {
    await page.goto('/e2e-team/settings/language');
    await page.locator('select[data-k="lang"]').selectOption(language);
    await waitForSaved(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/e2e-team/files');
    await page.locator('.files-view-switch [data-v="grid"]').click();
    // Folder pages can place file cards below the fold; thumbnails load on visibility.
    await page.locator(`[data-file-thumb="${thumbnail.id}"]`).scrollIntoViewIfNeeded();
    await expect(page.locator(`[data-file-thumb="${thumbnail.id}"] .file-thumbnail`)).toHaveJSProperty('naturalWidth', 1);
    await page.locator('#workspace-file-q').fill(language === 'Русский' ? 'изображение' : 'image');
    await expect(page.locator('.workspace-file-card')).toHaveCount(1);
    await expect(page.locator('.files-filter-summary b')).toHaveText('1');
    await page.locator('[data-a="clearFileQuery"]').click();
    await expect(page.locator('#workspace-file-q')).toBeFocused();
    await expect(page.locator('.workspace-file-card')).toHaveCount(expectedFileCount);
    await page.locator('#workspace-file-type').selectOption('pdf');
    await expect(page.locator('.workspace-file-card')).toHaveCount(1);
    await page.locator('[data-a="clearFileFilters"]').click();
    await expect(page.locator('#workspace-file-type')).toHaveValue('all');
    await expect(page.locator('#workspace-file-q')).toBeFocused();
    await expect(page.locator('.workspace-file-card')).toHaveCount(expectedFileCount);
    await page.locator('.files-view-switch [data-v="list"]').click();
    for (const width of [320, 768, 941, 1024, 1366]) {
      await page.setViewportSize({ width, height: 844 });
      const geometry = await page.locator('.files-page').evaluate(el => ({
        page: el.scrollWidth - el.clientWidth,
        toolbar: document.querySelector('.workspace-files-toolbar').scrollWidth - document.querySelector('.workspace-files-toolbar').clientWidth,
        rows: [...document.querySelectorAll('.workspace-file-table tbody tr')].map(row => row.scrollWidth - row.clientWidth),
      }));
      expect(Math.max(geometry.page, geometry.toolbar, ...geometry.rows), `${language} at ${width}px: ${JSON.stringify(geometry)}`).toBeLessThanOrEqual(2);
    }
    await expect(page.locator('.workspace-file-table tbody tr').first().locator('td').nth(1)).toHaveAttribute(
      'data-label',
      language === 'Русский' ? 'Проект' : 'Project',
    );
    await page.setViewportSize({ width: 320, height: 844 });
    await page.locator('.workspace-file-table').scrollIntoViewIfNeeded();
    const firstRow = page.locator('.workspace-file-table tbody tr').first();
    const nameBox = await firstRow.locator('td').first().boundingBox();
    const actionsBox = await firstRow.locator('.workspace-file-actions').boundingBox();
    expect(Math.abs(nameBox.y - actionsBox.y)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `output/playwright/files-list-${language === 'Русский' ? 'ru' : 'en'}-320.png` });
    await page.locator('.workspace-file-table tbody tr').filter({ hasText: 'e2e-keyboard-upload.txt' }).locator('[data-a="ctxBtn"]').click();
    await page.locator('[data-a="renameFile"]').click();
    await expect(page.locator('#mt-prompt')).toHaveText(language === 'Русский' ? 'Переименовать файл' : 'Rename file');
    await page.locator('.modal-f [data-a="closeModal"]').click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator(`[data-a="previewFile"][data-id="${file.id}"]`).first().click();
    const image = page.locator('.modal .file-preview-image');
    await expect(image).toBeVisible({ timeout: 30000 });
    await expect(image).toHaveJSProperty('naturalWidth', 480);
    await page.locator('.modal [data-a="pdfPreviewPage"][data-page="2"]').click();
    await expect(page.locator('.modal [data-a="pdfPreviewPage"][data-page="3"]')).toBeDisabled({ timeout: 30000 });
    expect(await page.evaluate(() => globalThis.__pdfPreviewExecuted)).toBeUndefined();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(2);
    await page.screenshot({ path: `output/playwright/pdf-preview-${language === 'Русский' ? 'ru' : 'en'}.png` });
    await page.locator('.modal-f [data-a="closeModal"]').click();
    await page.locator('#workspace-file-q').fill('no-file-matches-history-eviction');
    await expect(page.locator('.workspace-file-card,.workspace-file-table tbody tr')).toHaveCount(0);
    await page.evaluate(id => {
      history.pushState({ smena: true }, '', `/e2e-team/file/${encodeURIComponent(id)}`);
      dispatchEvent(new PopStateEvent('popstate'));
    }, file.id);
    await expect(page.locator('.modal .file-preview-image')).toBeVisible({ timeout: 30000 });
    await expect(page).toHaveURL(new RegExp(`/file/${file.id}$`));
    await page.locator('.modal-f [data-a="closeModal"]').click();
    let failedContextCalls = 0;
    await page.route('**/api/files/catalog/query', route => {
      failedContextCalls++;
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'private-provider-token' }) });
    });
    await page.goto('/e2e-team/search');
    await page.locator('#search-page-q').fill('audit-context-failure');
    const notice = page.locator('.catalog-context-status');
    await expect(notice).toContainText(language === 'Русский' ? 'Проверьте подключение' : 'Check connection');
    await expect(notice).not.toContainText('private-provider-token');
    await page.waitForTimeout(400);
    expect(failedContextCalls).toBe(1);
    expect(await notice.locator('button').evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: `output/playwright/audit-context-error-${language === 'Русский' ? 'ru' : 'en'}-320.png` });
    await notice.locator('button').click();
    await expect.poll(() => failedContextCalls).toBe(2);
    await page.unroute('**/api/files/catalog/query');
    await notice.locator('button').click();
    await expect(notice).toHaveCount(0);
  }
});
