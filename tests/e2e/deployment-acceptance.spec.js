import { test, expect } from './fixtures.js';

test('deployment acceptance persists sessions and materials in RU/EN at desktop and mobile sizes', async ({ page }) => {
  test.setTimeout(180000);
  await page.goto('/');
  await page.locator('#l-access').fill('e2e-access-id-2026-secure');
  await page.locator('#login-btn').click();
  await page.locator('#o-ws').fill('E2E Команда');
  await page.locator('#o-url').fill('e2e-team');
  await page.locator('#onb-next').click();
  await page.locator('#onb-next').click();
  await page.locator('#o-proj').fill('Проверка интерфейса');
  await page.locator('#onb-next').click();
  await page.locator('[data-a="onbNext"][data-skip="1"]').click();
  await page.locator('[data-a="onbFinish"]').click();
  await expect(page.locator('.shell')).toBeVisible();
  await expect(page.locator('#sync-indicator')).toHaveAttribute('data-state', 'saved');

  const initial = (await (await page.request.get('/api/workspace')).json()).data;
  const upload = await page.request.post('/api/files/upload', {
    multipart: {
      file: { name: 'CI deployment.txt', mimeType: 'text/plain', buffer: Buffer.from('CI deployment / Проверка публикации') },
      revision: String(initial.revision),
      project: initial.projects[0].id,
    },
  });
  expect(upload.status()).toBe(201);
  const file = (await upload.json()).file;
  const downloaded = await page.request.get(`/api/files/${file.id}/content?download=1`);
  expect(downloaded.ok()).toBeTruthy();
  expect(await downloaded.text()).toBe('CI deployment / Проверка публикации');

  const knowledge = (await (await page.request.get('/api/workspace-documents/knowledge')).json()).data;
  knowledge.knowledgeNotes.push({
    id: 'ci-deployment-note',
    title: 'CI deployment note',
    formatted_markdown: '# CI deployment\n\nПроверка сохранения / Persistence check',
    tags: [],
  });
  expect((await page.request.put('/api/workspace-documents/knowledge', { data: { revision: knowledge.revision, data: knowledge } })).ok()).toBeTruthy();
  const data = (await (await page.request.get('/api/workspace')).json()).data;
  data.whiteboards.push({
    id: 'ci-deployment-board',
    name: 'CI deployment board',
    desc: '',
    project: data.projects[0].id,
    by: data.me,
    at: new Date().toISOString(),
    archived: false,
    whiteboard: {
      version: 1,
      nodes: [{ id: 'ci-card', type: 'text', x: 0, y: 0, width: 240, height: 160, color: 'neutral', title: 'CI card', text: 'Saved canvas' }],
      edges: [],
    },
  });
  expect((await page.request.put('/api/workspace', { data: { revision: data.revision, data } })).ok()).toBeTruthy();

  const researchProject = data.projects[0].id;
  const researchRoot = `/api/research/projects/${encodeURIComponent(researchProject)}`;
  expect(
    (await page.request.post(researchRoot + '/commands', { data: { operationId: crypto.randomUUID(), action: 'enable', enabled: true } })).ok(),
  ).toBeTruthy();
  await page.goto(`/e2e-team/project/${researchProject}/research`);
  await page.locator('[data-a="researchNew"][data-kind="observation"]').click();
  await page.locator('[data-in="researchField"][data-field="title"]').fill('CI research uncertain recovery');
  await page.locator('[data-in="researchField"][data-field="body"]').fill('Synthetic research journal / Служебный журнал. No scientific result.');
  let interrupted = false;
  await page.route('**' + researchRoot + '/commands', async route => {
    if (!interrupted) {
      interrupted = true;
      await route.fetch();
      await route.abort('failed');
    } else await route.continue();
  });
  await page.locator('[data-a="researchSave"]').click();
  await expect(page.locator('.research-error')).toBeVisible();
  await page.reload();
  await page.locator('[data-a="researchRecover"]').click();
  await expect(page.locator('.research-record-head')).toContainText('CI research uncertain recovery');
  const research = await (await page.request.get(researchRoot + '?q=CI%20research%20uncertain')).json();
  expect(research.total).toBe(1);
  const researchId = research.items[0].id;
  await page.unroute('**' + researchRoot + '/commands');

  for (const language of ['Русский', 'English (US)']) {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/e2e-team/settings/language');
    await page.locator('select[data-k="lang"]').selectOption(language);
    await expect(page.locator('html')).toHaveAttribute('lang', language === 'Русский' ? 'ru' : 'en');
    await page.waitForTimeout(650);
    await expect(page.locator('#sync-indicator')).toHaveAttribute('data-state', 'saved');
    for (const width of [1366, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/e2e-team/files');
      await expect(page.locator('.workspace-file-card', { hasText: 'CI deployment.txt' })).toBeVisible({ timeout: 15000 });
      await page.goto('/e2e-team/knowledge');
      await page.locator('.knowledge-preview-open', { hasText: 'CI deployment note' }).click();
      await expect(page.locator('.knowledge-quick-content')).toContainText('Проверка сохранения / Persistence check');
      await page.locator('.knowledge-reader-close').click();
      await page.goto('/e2e-team/whiteboard/ci-deployment-board');
      await expect(page.locator('.whiteboard-card-content')).toHaveText('Saved canvas');
      await page.goto('/e2e-team/graph');
      await expect(page.locator('#knowledge-graph-canvas canvas').first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(2);
      await page.reload();
      await expect(page.locator('.shell')).toBeVisible();
      await page.goto(`/e2e-team/project/${researchProject}/research/${researchId}`);
      await expect(page.locator('.research-body')).toContainText('Synthetic research journal');
      await page.locator('[data-a="researchEdit"]').click();
      await expect(page.locator('[data-in="researchField"][data-field="body"]')).toHaveValue(
        'Synthetic research journal / Служебный журнал. No scientific result.',
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(2);
      await page.locator('.modal [data-a="closeModal"]').first().click();
      await expect(page.locator('html')).toHaveAttribute('lang', language === 'Русский' ? 'ru' : 'en');
      expect((await page.request.get('/api/auth/me')).ok()).toBeTruthy();
    }
  }
});
