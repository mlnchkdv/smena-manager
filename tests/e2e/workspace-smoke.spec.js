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
  await page.locator('#tm-name').fill(teamName);
  await page.locator('[data-a="submitTeam"]').click();
  await expect(page.locator('#tm-name-err')).toHaveText(`Команда с названием «${teamName}» уже существует.`);
  await expect(page.locator('#tm-name-err strong')).toHaveCount(0);
  await page.getByRole('dialog').getByRole('button', { name: 'Отмена', exact: true }).click();

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
    await page.locator('[data-a="setViewMode"][data-v="table"]').click();
    expect(await page.locator('table tr [data-a="openTask"]').count()).toBeLessThanOrEqual(100);
    await expect(page.locator('[data-a="listPage"][data-page="1"]').first()).toBeVisible();
  } finally {
    const latest = (await (await page.request.get('/api/workspace')).json()).data;
    latest.tasks = latest.tasks.filter(task => !task.id.startsWith(prefix));
    expect((await page.request.put('/api/workspace', { data: { revision: latest.revision, data: latest } })).status()).toBe(200);
  }
});

test('PDF previews render pages locally without document scripts in Russian and English on mobile', async ({ page }) => {
  await signIn(page);
  const current = (await (await page.request.get('/api/workspace')).json()).data;
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
  for (const language of ['Русский', 'English (US)']) {
    await page.goto('/e2e-team/settings/language');
    await page.locator('select[data-k="lang"]').selectOption(language);
    await waitForSaved(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/e2e-team/files');
    await expect(page.locator(`[data-file-thumb="${thumbnail.id}"] .file-thumbnail`)).toHaveJSProperty('naturalWidth', 1);
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
  }
});
