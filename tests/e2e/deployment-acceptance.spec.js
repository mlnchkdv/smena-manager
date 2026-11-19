import { test, expect } from './fixtures.js';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { strFromU8, unzipSync } from 'fflate';

async function createAcceptanceWorkspace(page, projectName) {
  await page.goto('/');
  await page.locator('#l-access').fill('e2e-access-id-2026-secure');
  await page.locator('#login-btn').click();
  await page.locator('#o-ws').fill('E2E Команда');
  await page.locator('#o-url').fill('e2e-team');
  await page.locator('#onb-next').click();
  await page.locator('#onb-next').click();
  await page.locator('#o-proj').fill(projectName);
  await page.locator('#onb-next').click();
  await page.locator('[data-a="onbNext"][data-skip="1"]').click();
  await page.locator('[data-a="onbFinish"]').click();
  await expect(page.locator('.shell')).toBeVisible();
  await expect(page.locator('#sync-indicator')).toHaveAttribute('data-state', 'saved');
}

test('deployment acceptance opens a saved research ZIP and bookmark archive on desktop and mobile', async ({ page }, testInfo) => {
  test.setTimeout(150000);
  await page.addInitScript(() => {
    window.showSaveFilePicker = undefined;
  });
  await createAcceptanceWorkspace(page, '3DGS');
  const data = (await (await page.request.get('/api/workspace')).json()).data;
  const project = data.projects[0].id;
  const commands = `/api/research/projects/${project}/commands`;
  const record = crypto.randomUUID();
  expect((await page.request.post(commands, { data: { operationId: crypto.randomUUID(), action: 'enable', enabled: true } })).ok()).toBeTruthy();
  expect(
    (
      await page.request.post(commands, {
        data: {
          operationId: crypto.randomUUID(),
          action: 'create',
          id: record,
          record: {
            kind: 'experiment',
            title: '3DGS · Export check',
            body: 'A synthetic archive / Служебный архив.',
            data: { hypothesis: 'Test render scale' },
          },
        },
      })
    ).ok(),
  ).toBeTruthy();

  const saved = { id: crypto.randomUUID(), title: 'Capture check', format: 'html', capturedAt: '2026-11-18T12:00:00Z' };
  const linkId = 'acceptance-bookmark';
  const url = 'https://example.com/archive-check';
  const bookmarkDocument = (await (await page.request.get('/api/workspace-documents/bookmarks')).json()).data;
  bookmarkDocument.links.push({ id: linkId, title: saved.title, url, tags: [], pageSnapshots: [saved] });
  expect(
    (await page.request.put('/api/workspace-documents/bookmarks', { data: { revision: bookmarkDocument.revision, data: bookmarkDocument } })).ok(),
  ).toBeTruthy();
  const snapshotUrl = `**/api/bookmark-pages/${linkId}/snapshots/${saved.id}`;
  await page.route(snapshotUrl, route =>
    route.fulfill({ json: { ...saved, url, html: '<p>Saved page text</p>', capture: { assets: 1, scriptsDisabled: true } } }),
  );
  await page.route(snapshotUrl + '/document*', route =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><meta http-equiv="Content-Security-Policy" content="default-src 'none'"><h1>Saved page</h1></html>`,
    }),
  );

  for (const [language, lang] of [
    ['Русский', 'ru'],
    ['English (US)', 'en'],
  ]) {
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto('/e2e-team/settings/language');
    await page.locator('select[data-k="lang"]').selectOption(language, { timeout: 20000 });
    await expect(page.locator('html')).toHaveAttribute('lang', lang);
    await expect(page.locator('#sync-indicator')).toHaveAttribute('data-state', 'saved');

    for (const [width, height] of [
      [1366, 900],
      [390, 844],
      [320, 700],
    ]) {
      await page.setViewportSize({ width, height });
      await page.goto(`/e2e-team/project/${project}/research/${record}`);
      const summary = page.getByText(lang === 'ru' ? 'История, проверка и экспорт' : 'History, review and export', { exact: true });
      await summary.waitFor({ state: 'visible', timeout: 20000 });
      await summary.click();
      await page.getByRole('button', { name: lang === 'ru' ? 'Подготовить ZIP исследования' : 'Prepare research ZIP' }).click();
      const save = page.getByRole('link', { name: lang === 'ru' ? 'Сохранить ZIP' : 'Save ZIP' });
      const [download] = await Promise.all([page.waitForEvent('download'), save.click()]);
      const zipPath = testInfo.outputPath(`3dgs-${lang}-${width}.zip`);
      await download.saveAs(zipPath);
      const entries = unzipSync(await readFile(zipPath));
      const manifest = JSON.parse(strFromU8(entries['manifest.json']));
      expect(manifest.recordId).toBe(record);
      expect(strFromU8(entries['article.html'])).toContain(`<html lang="${lang}">`);
      expect(manifest.files).toHaveLength(Object.keys(entries).length - 1);
      for (const file of manifest.files) expect(createHash('sha256').update(entries[file.name]).digest('hex')).toBe(file.sha256);

      await page.goto('/e2e-team/bookmarks');
      const documentResponse = page.waitForResponse(
        response => response.ok() && response.url().includes(`/snapshots/${saved.id}/document`) && response.request().isNavigationRequest(),
      );
      await page.getByRole('button', { name: saved.title, exact: true }).click({ timeout: 20000 });
      const viewer = page.getByRole('dialog');
      await expect(viewer.locator('iframe.bookmark-archive-frame')).toBeVisible({ timeout: 15000 });
      expect(await (await documentResponse).text()).toContain('<h1>Saved page</h1>');
      await expect(viewer.locator('[data-in="bookmarkCaptureMode"]')).toBeHidden();
      const frame = await viewer.locator('.bookmark-archive-frame').boundingBox();
      expect(frame.y).toBeLessThan(height - 100);
      if (width === 1366) {
        const archiveFrame = viewer.locator('.bookmark-archive-frame');
        const originalFrame = await archiveFrame.elementHandle();
        await viewer.getByRole('button', { name: lang === 'ru' ? 'Расширить просмотр' : 'Expand viewer' }).click();
        expect(await archiveFrame.evaluate((node, original) => node === original, originalFrame)).toBe(true);
      }
      await viewer.getByRole('button', { name: lang === 'ru' ? 'Текст' : 'Text', exact: true }).click();
      await expect(viewer.locator('.bookmark-page-reader')).toContainText('Saved page text');
    }
  }
});

test('deployment acceptance persists sessions and materials in RU/EN at desktop and mobile sizes', async ({ page }) => {
  test.setTimeout(180000);
  await page.addInitScript(() => {
    window.showSaveFilePicker = undefined;
  });
  await createAcceptanceWorkspace(page, 'Проверка интерфейса');

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
  await expect(page).toHaveURL(new RegExp(`/research/${researchId}$`));
  await page.goBack();
  await expect(page.locator('.research-record-head')).toHaveCount(0);
  await page.goForward();
  await expect(page.locator('.research-record-head')).toContainText('CI research uncertain recovery');
  await page.unroute('**' + researchRoot + '/commands');

  // A successful write must remain recoverable if reading the result fails.
  await page.locator('[data-a="researchEdit"]').click();
  await page.route('**' + researchRoot + '/records/' + researchId, route => route.fulfill({ status: 403, json: { code: 'RESEARCH_FORBIDDEN' } }), { times: 1 });
  await page.locator('[data-a="researchSave"]').click();
  await expect(page.locator('.research-form [role="alert"]')).toBeVisible();
  await page.reload();
  await page.locator('[data-a="researchRecover"]').click();
  await expect(page.locator('.research-record-head')).toContainText('Редакция 2');
  await expect(page.locator('[data-a="researchRecover"]')).toHaveCount(0);

  // A user may close a saving form and continue working. A late response must
  // stay with its original project instead of reopening a reader on another page.
  await page.locator('[data-a="researchBack"]').click();
  await page.locator('[data-a="researchNew"][data-kind="observation"]').click();
  await page.locator('[data-in="researchField"][data-field="title"]').fill('CI research late response');
  await page.locator('[data-in="researchField"][data-field="body"]').fill('Synthetic late-response acceptance.');
  let releaseSave, notifyCommitted;
  const gate = new Promise(resolve => {
    releaseSave = resolve;
  });
  const committed = new Promise(resolve => {
    notifyCommitted = resolve;
  });
  await page.route('**' + researchRoot + '/commands', async route => {
    const response = await route.fetch();
    notifyCommitted();
    await gate;
    await route.fulfill({ response });
  });
  await page.locator('[data-a="researchSave"]').click();
  await committed;
  await page.locator('.modal [data-a="closeModal"]').first().click();
  await page.getByRole('button', { name: 'Файлы', exact: true }).click();
  releaseSave();
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveURL(/\/project\/[^/]+\/files$/u);
  expect((await (await page.request.get(researchRoot + '?q=CI%20research%20late')).json()).total).toBe(1);
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
      if (width === 320) {
        await page
          .locator('.research-form summary')
          .filter({ hasText: /Files and evidence|Файлы и доказательства/u })
          .click();
        await page.locator('[data-a="researchFindFiles"]').click();
        const evidence = page.locator('.research-form [data-a="researchAttachFile"]').filter({ hasText: 'CI deployment.txt' });
        await expect(evidence).toBeVisible();
        await evidence.click();
        await expect(page.locator('.research-form details[data-ui-disclosure$=":evidence"]')).toHaveAttribute('open', '');
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(2);
      await page.locator('.modal [data-a="closeModal"]').first().click();
      if (width === 320 || width === 1366) {
        await page.goto('/e2e-team/files');
        await page.locator('.topsearch').click();
        await page.locator('#pal-in').fill('CI research uncertain recovery');
        await page
          .locator('.pi')
          .filter({ has: page.locator('.pi-name', { hasText: /^CI research uncertain recovery$/u }) })
          .click();
        await expect(page.locator('.research-record-head')).toContainText('CI research uncertain recovery');
        await page.locator('[data-a="returnToMaterialSource"]').click();
        await expect(page.locator('#search-page-q')).toHaveValue('CI research uncertain recovery');
        await page.locator('[data-a="openResearchSearchResult"]').click();
        await page
          .locator('.research-technical summary')
          .filter({ hasText: /History, review and export|История, проверка и экспорт/u })
          .click();
        const filename = `research-${researchId}.zip`;
        await page.locator('[data-a="researchExport"]').click();
        const [download] = await Promise.all([page.waitForEvent('download'), page.locator('.research-page a[download]').click()]);
        expect(download.suggestedFilename()).toBe(filename);
        expect(await download.failure()).toBeNull();
        const files = unzipSync(await readFile(await download.path()));
        expect(JSON.parse(strFromU8(files['manifest.json'])).recordId).toBe(researchId);
        expect(strFromU8(files['article.md'])).toContain('Synthetic research journal');
        if (width === 1366 && language === 'Русский' && test.info().project.name === 'chromium') {
          await page.evaluate(() => {
            window.showSaveFilePicker = async ({ suggestedName }) => {
              if (!navigator.userActivation.isActive) throw new Error('Picker must open during the click');
              const bytes = [];
              return {
                name: suggestedName,
                createWritable: async () =>
                  new WritableStream({
                    write(chunk) {
                      for (const byte of chunk) bytes.push(byte);
                    },
                    close() {
                      window.savedResearchZip = bytes;
                    },
                  }),
              };
            };
          });
          await page.locator('[data-a="researchExport"]').click();
          await page.getByRole('button', { name: 'Сохранить ZIP', exact: true }).click();
          await expect(page.getByText(`Сохранён на диск · ${filename}`, { exact: true })).toBeVisible();
          const bytes = new Uint8Array(await page.evaluate(() => window.savedResearchZip));
          expect(JSON.parse(strFromU8(unzipSync(bytes)['manifest.json'])).recordId).toBe(researchId);
        }
      }
      await expect(page.locator('html')).toHaveAttribute('lang', language === 'Русский' ? 'ru' : 'en');
      expect((await page.request.get('/api/auth/me')).ok()).toBeTruthy();
    }
  }
});
