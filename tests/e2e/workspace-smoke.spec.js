import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { unzipSync, strFromU8 } from 'fflate';

test('standalone whiteboards create save archive retain legacy access and fit both languages at every size', async ({ page, browser }) => {
  test.setTimeout(300000);
  await signIn(page);
  await page.goto('/e2e-team/whiteboards');
  await page.locator('[data-a="newWhiteboard"]').click();
  await page.locator('[data-in="whiteboardDocumentField"][data-field="name"]').fill('Workspace plan / План');
  await page.locator('[data-in="whiteboardDocumentField"][data-field="desc"]').fill('Independent canvas');
  await page.locator('[data-a="saveWhiteboardDocument"]').click();
  await expect(page).toHaveURL(/\/whiteboard\//);
  const publicPath = new URL(page.url()).pathname,
    publicId = publicPath.split('/').at(-1);
  await waitForSaved(page);
  await page.locator('.whiteboard-add > summary').click();
  await page.locator('.whiteboard-add [data-a="whiteboardNewText"]').click();
  await page.locator('[data-in="whiteboardField"][data-field="title"]').fill('Independent card');
  await page.locator('[data-in="whiteboardField"][data-field="text"]').fill('Saved outside projects');
  await page.locator('[data-a="whiteboardSave"]').click();
  await waitForSaved(page);
  await page.reload();
  await expect(page.locator('.whiteboard-card-content')).toHaveText('Saved outside projects');
  const publicData = (await (await page.request.get('/api/workspace')).json()).data;
  expect(publicData.whiteboards.find(b => b.id === publicId).project).toBe('');
  expect(publicData.projects.every(p => !p.whiteboard.nodes.some(n => n.title === 'Independent card'))).toBeTruthy();
  const project = publicData.projects[0];
  project.private = true;
  project.members = [publicData.me];
  project.whiteboard = {
    version: 1,
    nodes: [{ id: 'legacy-kept', type: 'text', x: 0, y: 0, width: 220, height: 140, color: 'neutral', title: 'Legacy kept', text: 'Existing protected text' }],
    edges: [],
  };
  expect((await page.request.put('/api/workspace', { data: { revision: publicData.revision, data: publicData } })).ok()).toBeTruthy();
  await page.goto(`/e2e-team/project/${project.id}/whiteboard`);
  await expect(page).toHaveURL(new RegExp('/whiteboard/' + project.id + '$'));
  await expect(page.locator('.whiteboard-card-content')).toHaveText('Existing protected text');
  expect((await page.request.get(`/api/whiteboards/${project.id}/versions`)).ok()).toBeTruthy();
  await page.goto(`/e2e-team/project/${project.id}`);
  await expect(page.locator('.proj-h [data-tab="whiteboard"]')).toHaveCount(0);
  const other = await browser.newContext();
  try {
    const editor = await other.newPage();
    await signIn(editor, 'e2e-editor-access-id-2026-secure');
    const filtered = (await (await editor.request.get('/api/workspace')).json()).data;
    expect(filtered.whiteboards.some(b => b.id === project.id)).toBeFalsy();
    expect(filtered.whiteboards.some(b => b.id === publicId)).toBeTruthy();
    expect((await editor.request.get(`/api/whiteboards/${project.id}/versions`)).status()).toBe(404);
    await editor.goto(`/e2e-team/whiteboard/${project.id}`);
    await expect(editor.locator('.whiteboard-card')).toHaveCount(0);
    await expect(editor.locator('body')).not.toContainText('Existing protected text');
  } finally {
    await other.close();
  }
  await page.goto('/e2e-team/whiteboards');
  for (const language of ['Русский', 'English (US)']) {
    await page.goto('/e2e-team/settings/language');
    await page.locator('select[data-k="lang"]').selectOption(language);
    await waitForSaved(page);
    await page.goto('/e2e-team/whiteboards');
    for (const [width, height] of [
      [320, 740],
      [390, 845],
      [768, 1024],
      [844, 390],
      [1366, 768],
    ]) {
      await page.setViewportSize({ width, height });
      for (const view of ['grid', 'list']) {
        if (width <= 640) await page.locator('[data-a="whiteboardCatalogFilters"]').click();
        await page
          .locator((width <= 640 ? '.modal ' : '.whiteboards-desktop-filters ') + '[data-in="whiteboardsFilter"][data-field="view"]')
          .selectOption(view);
        if (width <= 640) await page.locator('.modal [data-a="closeModal"]').last().click();
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
        await expect(page.locator(`.whiteboard-document-card [data-id="${publicId}"].whiteboard-document-open`)).toBeVisible();
      }
    }
    await page.locator('[data-a="newWhiteboard"]').click();
    await page.setViewportSize({ width: 320, height: 740 });
    expect(await page.locator('.modal').evaluate(e => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(1);
    await page.locator('.modal [data-a="closeModal"]').first().click();
  }
  await page.goto('/e2e-team/search');
  await page.locator('#search-page-q').fill('Saved outside projects');
  await page.locator(`[data-a="openRelatedEntity"][data-key="whiteboard:${publicId}"]`).click();
  await expect(page).toHaveURL(new RegExp('/whiteboard/' + publicId + '$'));
  await page.goto('/e2e-team/graph');
  await expect(page.locator(`#graph-locate option[value="whiteboard:${publicId}"]`)).toHaveCount(1);
  await page.locator('#graph-locate').selectOption('whiteboard:' + publicId);
  await page.locator('.graph-detail [data-a="openRelatedEntity"]').click();
  await expect(page).toHaveURL(new RegExp('/whiteboard/' + publicId + '$'));
  await page.goto(publicPath);
  await page.locator('.whiteboard-document-menu > summary').click();
  await page.locator('[data-a="editWhiteboardDocument"]').click();
  await page.locator('[data-in="whiteboardDocumentField"][data-field="name"]').fill('Renamed workspace plan');
  await page.locator('[data-a="saveWhiteboardDocument"]').click();
  await waitForSaved(page);
  await page.reload();
  await expect(page.locator('.whiteboard-document-heading h1')).toHaveText('Renamed workspace plan');
  await page.locator('.whiteboard-document-menu > summary').click();
  await page.locator('[data-a="toggleWhiteboardArchive"]').click();
  await page.locator('[data-a="confirmOk"]').click();
  await waitForSaved(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.locator('[data-field="archive"][data-in="whiteboardsFilter"]').selectOption('archived');
  await page.locator(`.whiteboard-document-card [data-a="openWhiteboardDocument"][data-id="${publicId}"]`).click();
  await expect(page.locator('.whiteboard-add')).toHaveCount(0);
  await expect(page.locator('.whiteboard-card-content')).toHaveText('Saved outside projects');
  await page.locator('.whiteboard-document-menu > summary').click();
  await page.locator('[data-a="toggleWhiteboardArchive"]').click();
  await page.locator('[data-a="confirmOk"]').click();
  await waitForSaved(page);
  await page.reload();
  await expect(page.locator('.whiteboard-add')).toBeVisible();
});

test('whiteboard native and Canvas interchange previews limitations checks access and preserves replacements', async ({ page }) => {
  test.setTimeout(240000);
  await signIn(page);
  const snapshot = (await (await page.request.get('/api/workspace')).json()).data,
    project = snapshot.projects[0];
  project.whiteboard = { version: 1, nodes: [], edges: [] };
  expect((await page.request.put('/api/workspace', { data: { revision: snapshot.revision, data: snapshot } })).ok()).toBeTruthy();
  const native = {
    format: 'smena-project-whiteboard',
    version: 1,
    board: {
      version: 1,
      nodes: [
        { id: 'io-text', type: 'text', x: 0, y: 0, width: 240, height: 160, color: 'blue', title: 'Import card', text: 'Imported body' },
        { id: 'io-material', type: 'material', x: 320, y: 0, width: 240, height: 160, color: 'neutral', target: 'note:not-readable' },
      ],
      edges: [{ id: 'io-edge', from: 'io-text', to: 'io-material', arrow: true, color: 'neutral', label: 'Related' }],
    },
  };
  const path = await projectBoardPath(page, project.id, true);
  await page.goto(path);
  const upload = async (value, name = 'board.json') => {
    const menu = page.locator('.whiteboard-io');
    if (!(await menu.evaluate(e => e.open))) await menu.locator('summary').click();
    const chooser = page.waitForEvent('filechooser');
    await page.locator('[data-a="whiteboardImport"]').click();
    await (await chooser).setFiles({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
    await expect(page.locator('[data-a="applyWhiteboardImport"]')).toBeVisible();
  };
  await upload(native);
  await expect(page.locator('.modal-b')).toContainText(/Недоступные материалы|Unavailable material references/);
  await page.locator('[data-a="applyWhiteboardImport"]').click();
  await waitForSaved(page);
  await page.reload();
  await expect(page.locator('.whiteboard-card')).toHaveCount(2);
  await expect(page.locator('.whiteboard-card-content').first()).toHaveText('Imported body');
  await page.locator('.whiteboard-io > summary').click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('[data-a="whiteboardExportCanvas"]').click();
  const download = await downloadPromise;
  const canvas = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(canvas.nodes).toHaveLength(2);
  expect(canvas.edges).toHaveLength(1);
  const external = { nodes: [{ id: 'external', type: 'file', file: 'images/screenshot.png', x: 0, y: 0, width: 240, height: 160 }], edges: [] };
  for (const language of ['Русский', 'English (US)']) {
    await page.goto('/e2e-team/settings/language');
    await page.locator('select[data-k="lang"]').selectOption(language);
    await waitForSaved(page);
    await page.goto(path);
    await upload(external, 'board.canvas');
    await expect(page.locator('.modal-b')).toContainText(language === 'Русский' ? 'Вложения не загружаются' : 'Attachments are not uploaded');
    for (const [width, height] of [
      [320, 740],
      [390, 845],
      [768, 1024],
      [844, 390],
      [1366, 768],
    ]) {
      await page.setViewportSize({ width, height });
      expect(await page.locator('.modal').evaluate(e => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    }
    await page.locator('.modal [data-a="closeModal"]').first().click();
  }
  await upload(external, 'board.canvas');
  await page.locator('[data-in="whiteboardImportMode"]').selectOption('replace');
  await page.locator('[data-a="applyWhiteboardImport"]').click();
  await page.locator('[data-a="confirmOk"]').click();
  await waitForSaved(page);
  await page.reload();
  await expect(page.locator('.whiteboard-card')).toHaveCount(1);
  await expect(page.locator('.whiteboard-card-content')).toHaveText('images/screenshot.png');
  const history = await (await page.request.get(`/api/projects/${project.id}/whiteboard-versions`)).json();
  expect(history.versions[0].board.nodes).toHaveLength(2);
  const latest = (await (await page.request.get('/api/workspace')).json()).data;
  const p = latest.projects.find(p => p.id === project.id);
  p.whiteboard = {
    version: 1,
    nodes: [{ id: 'stale-import', type: 'text', x: 0, y: 0, width: 200, height: 120, color: 'neutral', title: 'Stale import', text: 'Rejected' }],
    edges: [],
  };
  p.whiteboardReplaceBaseHash = 'a'.repeat(64);
  const stale = await page.request.put('/api/workspace', { data: { revision: latest.revision, data: latest } });
  expect(stale.status()).toBe(409);
  expect((await stale.json()).code).toBe('WHITEBOARD_REPLACE_STALE');
});

test('personal graph and board layouts retain camera pins filters and account isolation', async ({ page, browser }) => {
  test.setTimeout(240000);
  await signIn(page);
  expect(
    (
      await page.request.put('/api/preferences', { data: { preferences: { diagramViews: JSON.stringify({ version: 1, items: [], active: [], pins: [] }) } } })
    ).ok(),
  ).toBeTruthy();
  const snapshot = (await (await page.request.get('/api/workspace-documents/knowledge')).json()).data;
  snapshot.knowledgeNotes = snapshot.knowledgeNotes.filter(n => !n.id.startsWith('layout-note-'));
  snapshot.knowledgeNotes.push(
    ...Array.from({ length: 40 }, (_, i) => ({
      id: `layout-note-${i}`,
      title: `Layout ${i}`,
      formatted_markdown: i ? `[[note:layout-note-${i - 1}|Previous]]` : 'Start',
      tags: [],
    })),
  );
  expect((await page.request.put('/api/workspace-documents/knowledge', { data: { revision: snapshot.revision, data: snapshot } })).ok()).toBeTruthy();
  const data = (await (await page.request.get('/api/workspace')).json()).data,
    project = data.projects.find(p => !p.private && p.access !== 'private') || data.projects[0];
  const boardPath = await projectBoardPath(page, project.id);
  const saveLayout = async name => {
    await page.locator('.diagram-view-menu:not(.whiteboard-io) > summary').click();
    await page.locator('[data-a="saveDiagramView"]').click();
    await page.locator('[data-in="diagramViewName"]').fill(name);
    await page.locator('[data-a="commitDiagramView"]').click();
    await waitForSaved(page);
  };
  await page.goto('/e2e-team/graph');
  await expect(page.locator('#knowledge-graph-canvas canvas').first()).toBeVisible();
  await page.locator('#graph-locate').selectOption('note:layout-note-0');
  await page.locator('[data-a="toggleGraphPin"]').click();
  await expect(page.locator('[data-a="toggleGraphPin"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-a="clearGraphSelection"]').click();
  await page.locator('[data-command="in"]').click();
  await saveLayout('Graph plan');
  await page.reload();
  await expect(page.locator('#knowledge-graph-canvas canvas').first()).toBeVisible();
  await page.locator('#graph-locate').selectOption('note:layout-note-0');
  await expect(page.locator('[data-a="toggleGraphPin"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-a="clearGraphSelection"]').click();
  await page.goto(boardPath);
  await page.locator('[data-a="whiteboardZoomIn"]').click();
  const scale = await page.locator('.whiteboard-scale').textContent();
  await saveLayout('Board plan');
  await page.reload();
  await expect(page.locator('.whiteboard-scale')).toHaveText(scale);
  for (const language of ['Русский', 'English (US)']) {
    await page.goto('/e2e-team/settings/language');
    await page.locator('select[data-k="lang"]').selectOption(language);
    await waitForSaved(page);
    for (const route of ['/e2e-team/graph', boardPath]) {
      await page.goto(route);
      for (const [width, height] of [
        [320, 740],
        [390, 845],
        [768, 1024],
        [844, 390],
        [1366, 768],
      ]) {
        await page.setViewportSize({ width, height });
        await page.locator('.diagram-view-menu:not(.whiteboard-io) > summary').click();
        await expect(page.locator('[data-a="loadDiagramView"]')).toHaveCount(1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
        await page.keyboard.press('Escape');
      }
    }
  }
  const context = await browser.newContext();
  try {
    const editor = await context.newPage();
    await signIn(editor, 'e2e-editor-access-id-2026-secure');
    await editor.goto(boardPath);
    await editor.locator('.diagram-view-menu:not(.whiteboard-io) > summary').click();
    await expect(editor.locator('[data-a="loadDiagramView"]')).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('whiteboard durable history restores safely rejects stale restore and follows project access', async ({ page, browser }) => {
  test.setTimeout(240000);
  await signIn(page);
  let snapshot = (await (await page.request.get('/api/workspace')).json()).data;
  const project = snapshot.projects[0];
  project.private = true;
  project.members = [snapshot.me];
  project.whiteboard = {
    version: 1,
    nodes: [{ id: 'history-a', type: 'text', x: 0, y: 0, width: 240, height: 180, color: 'neutral', title: 'History card', text: 'Original' }],
    edges: [],
  };
  expect((await page.request.put('/api/workspace', { data: { revision: snapshot.revision, data: snapshot } })).ok()).toBeTruthy();
  const path = await projectBoardPath(page, project.id);
  await page.goto(path);
  await page.locator('.whiteboard-card [data-a="whiteboardEdit"]').click();
  await page.locator('[data-field="text"][data-in="whiteboardField"]').fill('Changed');
  await page.locator('[data-a="whiteboardSave"]').click();
  await waitForSaved(page);
  const history = await (await page.request.get(`/api/projects/${project.id}/whiteboard-versions`)).json(),
    version = history.versions.find(v => v.board.nodes[0]?.text === 'Original');
  expect(version).toBeTruthy();
  await page.locator('[data-a="whiteboardHistory"]').click();
  await page.locator(`[data-a="chooseWhiteboardVersion"][data-id="${version.id}"]`).click();
  await page.locator('[data-a="restoreWhiteboardVersion"]').click();
  await page.locator('[data-a="confirmOk"]').click();
  await waitForSaved(page);
  await page.reload();
  await expect(page.locator('.whiteboard-card-content')).toHaveText('Original');
  const restored = await (await page.request.get(`/api/projects/${project.id}/whiteboard-versions`)).json();
  expect(restored.versions[0].board.nodes[0].text).toBe('Changed');
  snapshot = (await (await page.request.get('/api/workspace')).json()).data;
  expect(snapshot._whiteboardHistory).toBeUndefined();
  snapshot.projects.find(p => p.id === project.id).whiteboard.nodes[0].text = 'Concurrent';
  expect((await page.request.put('/api/workspace', { data: { revision: snapshot.revision, data: snapshot } })).ok()).toBeTruthy();
  snapshot = (await (await page.request.get('/api/workspace')).json()).data;
  const stale = snapshot.projects.find(p => p.id === project.id);
  stale.whiteboard = version.board;
  stale.whiteboardRestoreFrom = { id: version.id, baseHash: restored.baseHash };
  const rejected = await page.request.put('/api/workspace', { data: { revision: snapshot.revision, data: snapshot } });
  expect(rejected.status()).toBe(409);
  expect((await rejected.json()).code).toBe('WHITEBOARD_RESTORE_STALE');
  const context = await browser.newContext();
  try {
    const editor = await context.newPage();
    await signIn(editor, 'e2e-editor-access-id-2026-secure');
    expect((await editor.request.get(`/api/projects/${project.id}/whiteboard-versions`)).status()).toBe(404);
  } finally {
    await context.close();
  }
  for (const language of ['Русский', 'English (US)']) {
    await page.goto('/e2e-team/settings/language');
    await page.locator('select[data-k="lang"]').selectOption(language);
    await waitForSaved(page);
    await page.goto(path);
    await page.locator('[data-a="whiteboardHistory"]').click();
    await expect(page.locator('.whiteboard-version-list button').first()).toBeVisible();
    for (const [width, height] of [
      [320, 740],
      [390, 845],
      [768, 1024],
      [844, 390],
      [1366, 768],
    ]) {
      await page.setViewportSize({ width, height });
      const dialog = page.locator('.modal');
      expect(await dialog.evaluate(e => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(1);
    }
    await page.locator('.modal [data-a="closeModal"]').first().click();
  }
});

test('whiteboard multi selection aligns copies and pastes connected cards with undo and persistence', async ({ page }) => {
  test.setTimeout(180000);
  await signIn(page);
  const snapshot = (await (await page.request.get('/api/workspace')).json()).data,
    project = snapshot.projects[0];
  const card = (id, x, y) => ({ id, type: 'text', x, y, width: 220, height: 160, color: 'neutral', title: id, text: 'Text' });
  project.whiteboard = {
    version: 1,
    nodes: [card('selection-a', 0, 0), card('selection-b', 350, 100), card('selection-c', 700, 200)],
    edges: [{ id: 'selection-e', from: 'selection-a', to: 'selection-b', label: 'Plan', arrow: true, color: 'blue' }],
  };
  expect((await page.request.put('/api/workspace', { data: { revision: snapshot.revision, data: snapshot } })).ok()).toBeTruthy();
  await page.goto(`/e2e-team/project/${project.id}/whiteboard`);
  await page.locator('[data-a="whiteboardToggleSelection"]').click();
  for (const id of ['selection-a', 'selection-b', 'selection-c']) await page.locator(`[data-in="whiteboardSelection"][data-id="${id}"]`).check();
  await page.locator('.whiteboard-arrange > summary').click();
  await page.locator('[data-mode="top"]').click();
  await waitForSaved(page);
  const read = async () => (await (await page.request.get('/api/workspace')).json()).data.projects.find(p => p.id === project.id).whiteboard;
  expect((await read()).nodes.map(n => n.y)).toEqual([0, 0, 0]);
  await page.locator('[data-a="whiteboardCopy"]').click();
  await page.locator('[data-a="whiteboardPaste"]').click();
  await waitForSaved(page);
  expect((await read()).nodes.length).toBe(6);
  expect((await read()).edges.length).toBe(2);
  await page.locator('[data-a="whiteboardUndo"]').click();
  await waitForSaved(page);
  expect((await read()).nodes.length).toBe(3);
  await page.locator('[data-a="whiteboardRedo"]').click();
  await waitForSaved(page);
  await page.reload();
  await expect(page.locator('.whiteboard-card')).toHaveCount(6);
  for (const language of ['Русский', 'English (US)']) {
    await page.goto('/e2e-team/settings/language');
    await page.locator('select[data-k="lang"]').selectOption(language);
    await waitForSaved(page);
    await page.goto(`/e2e-team/project/${project.id}/whiteboard`);
    await page.locator('[data-a="whiteboardToggleOutline"]').click();
    await page.locator('[data-a="whiteboardToggleSelection"]').click();
    await page.locator('[data-in="whiteboardSelection"]').first().check();
    for (const [width, height] of [
      [320, 740],
      [390, 845],
      [768, 1024],
      [844, 390],
      [1366, 768],
    ]) {
      await page.setViewportSize({ width, height });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    }
    await page.screenshot({ path: `output/playwright/audit11-whiteboard-selection-${language === 'Русский' ? 'ru' : 'en'}.png` });
  }
});

test('large folder navigation preserves pinned destinations and move search context', async ({ page }) => {
  test.setTimeout(180000);
  await signIn(page);
  const snapshot = (await (await page.request.get('/api/workspace-documents/knowledge')).json()).data;
  snapshot.knowledgeFolders.push(
    ...Array.from({ length: 500 }, (_, i) => ({ id: `large-${i}`, name: `Folder ${i}` })),
    ...Array.from({ length: 10 }, (_, i) => ({ id: `deep-${i}`, name: `Deep ${i}`, parentId: i ? `deep-${i - 1}` : null })),
  );
  snapshot.knowledgeNotes.push({ id: 'quick-folder-note', title: 'Quick folder note', folderId: 'deep-9', formatted_markdown: 'Test', tags: [] });
  expect((await page.request.put('/api/workspace-documents/knowledge', { data: { revision: snapshot.revision, data: snapshot } })).ok()).toBeTruthy();
  for (const language of ['Русский', 'English (US)']) {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/e2e-team/settings/language');
    await page.locator('select[data-k="lang"]').selectOption(language);
    await waitForSaved(page);
    await page.goto('/e2e-team/knowledge');
    await page.setViewportSize({ width: 390, height: 845 });
    await page.locator('.knowledge-folder-title-button').click();
    await page.locator('[data-in="knowledgeFolderQuery"]').fill('Deep 9');
    await page.locator('.knowledge-folders [data-a="setKnowledgeFolder"][data-folder="deep-9"]').click();
    await page.locator('.knowledge-folder-title-button').click();
    const pin = page.locator('[data-a="pinKnowledgeFolder"]');
    if ((await pin.getAttribute('aria-pressed')) !== 'true') await pin.click();
    await waitForSaved(page);
    for (const [width, height] of [
      [320, 740],
      [390, 845],
      [768, 1024],
      [844, 390],
      [1366, 768],
    ]) {
      await page.setViewportSize({ width, height });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    }
    await page.setViewportSize({ width: 390, height: 845 });
    if (await page.locator('.knowledge-sidebar button.knowledge-mobile-folder-button').isVisible())
      await page.locator('.knowledge-sidebar button.knowledge-mobile-folder-button').click();
    await page.locator('.knowledge-preview-card[data-id="quick-folder-note"] .knowledge-preview-move').click();
    const dialog = page.locator('.knowledge-move-dialog');
    await dialog.locator('[data-in="knowledgeMoveQuery"]').fill('Folder 480');
    await dialog.locator('.knowledge-move-row[data-folder="large-480"]').click();
    await expect(dialog.locator('[data-a="browseKnowledgeMove"][aria-label]')).toHaveAccessibleName(
      language === 'Русский' ? 'Родительская папка' : 'Parent folder',
    );
    await dialog.locator('[data-a="browseKnowledgeMove"][aria-label]').click();
    await dialog.locator('.knowledge-move-quick > summary').click();
    await dialog.locator('.knowledge-move-quick [data-folder="deep-9"]').click();
    await expect(dialog.locator('[data-in="knowledgeMoveQuery"]')).toHaveValue('Folder 480');
    await dialog.locator('[data-a="closeModal"]').last().click();
    await page.reload();
    await page.locator('.knowledge-folder-title-button').click();
    await expect(page.locator('.knowledge-folder-quick-link[data-folder="deep-9"]')).toBeVisible();
    await page.screenshot({ path: `output/playwright/audit11-folders-${language === 'Русский' ? 'ru' : 'en'}-390.png` });
    if (await page.locator('.knowledge-sidebar button.knowledge-mobile-folder-button').isVisible())
      await page.locator('.knowledge-sidebar button.knowledge-mobile-folder-button').click();
  }
});

test('project view chooser exposes every view and retains selection across responsive transitions', async ({ page }) => {
  await signIn(page);
  const data = (await (await page.request.get('/api/workspace')).json()).data,
    project = data.projects[0];
  for (const language of ['Русский', 'English (US)']) {
    await page.goto('/e2e-team/settings/language');
    await page.locator('select[data-k="lang"]').selectOption(language);
    await waitForSaved(page);
    await page.goto(`/e2e-team/project/${project.id}/activity`);
    for (const [width, height] of [
      [320, 740],
      [390, 845],
      [768, 1024],
      [844, 390],
      [1366, 768],
    ]) {
      await page.setViewportSize({ width, height });
      const picker = page.locator('.project-view-picker');
      if (width <= 900) {
        await expect(picker).toBeVisible();
        await expect(picker.locator('select')).toHaveValue('activity');
        await expect(picker.locator('option')).toHaveCount(8);
      } else {
        await expect(picker).toBeHidden();
        await expect(page.locator('.proj-h .tab.on')).toHaveText(language === 'Русский' ? 'Активность' : 'Activity');
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    }
    await page.setViewportSize({ width: 390, height: 845 });
    for (const tab of ['overview', 'board', 'list', 'table', 'calendar', 'timeline', 'files', 'activity']) {
      await page.locator('#project-view-select').selectOption(tab);
      await expect(page.locator('#project-view-select')).toHaveValue(tab);
      await expect(page.locator('.pbody')).toBeVisible();
    }
    await page.reload();
    await expect(page.locator('#project-view-select')).toHaveValue('activity');
    await page.screenshot({ path: `output/playwright/audit11-project-view-${language === 'Русский' ? 'ru' : 'en'}-390.png` });
  }
});

test.setTimeout(180_000);
// This file includes the 140-route responsive audit. Record failure screenshots
// on every failure; collect full video/DOM traces on retries to avoid exhausting
// small desktop hosts. --trace retain-on-failure enables a diagnostic first run.
test.use({ trace: process.env.E2E_TRACE === 'true' ? 'retain-on-failure' : 'on-first-retry', video: 'on-first-retry', actionTimeout: 15000 });

async function openFileFolderTools(page) {
  if (await page.locator('.files-filter-options.is-mobile[open]').count()) await page.keyboard.press('Escape');
  const menu = page.locator('.files-folder-tools');
  if ((await menu.getAttribute('open')) === null) await menu.locator(':scope > summary').click();
}
async function openFileFilters(page) {
  const filters = page.locator('.files-filter-options');
  if ((await filters.getAttribute('open')) === null) await filters.locator(':scope > summary').click();
}

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

async function expectSingleRowMobileHeader(page) {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 845 });
    await expect.poll(() => page.locator('.topbar').evaluate(element => element.getBoundingClientRect().height)).toBeLessThan(60);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

async function confirmDialog(page) {
  await expect(page.locator('[data-a="confirmOk"]:visible').last()).toBeVisible();
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

test.describe('Russian workspace responsive sweep', () => {
  for (const viewport of [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'tablet-wide', width: 1024, height: 900 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'mobile', width: 390, height: 844 },
    { name: 'mobile-narrow', width: 320, height: 844 },
  ]) {
    test(`Russian workspace remains usable and responsive across breakpoints: ${viewport.name}`, async ({ page, browserName }) => {
      // Each viewport gets an independent context and failure artifact. The same
      // 140 route/viewport checks no longer share a single six-minute deadline.
      test.setTimeout(360_000);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await signIn(page);
      await page.goto('/e2e-team/settings/language');
      await page.locator('select[data-k="lang"]').selectOption('Русский');
      await waitForSaved(page);
      await page.goto('/e2e-team');
      await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
      const untranslatedByRoute = [];

      await page.locator('button[data-a="newTask"]:visible').first().click();
      const taskTitle = `Сквозная проверка сохранения ${viewport.width}`;
      await page.locator('#f-title').fill(taskTitle);
      const savedTask = page.waitForResponse(response => {
        if (!response.url().endsWith('/api/workspace') || response.request().method() !== 'PUT') return false;
        return response
          .request()
          .postDataJSON()
          ?.data?.tasks?.some(task => task.title === taskTitle);
      });
      await page.locator('#f-submit').click();
      await expect(page.getByText(taskTitle, { exact: true }).first()).toBeVisible();
      expect((await savedTask).ok(), 'The task must be acknowledged by the server before reloading').toBe(true);
      await waitForSaved(page);

      await page.reload();
      await expect(page.locator('.shell')).toBeVisible();
      await expect(page.getByText(taskTitle, { exact: true }).first()).toBeVisible();
      await page.getByText(taskTitle, { exact: true }).first().click();
      const taskKey = (await page.locator('.drawer .mono').first().textContent()).trim();
      await page.goto(`/e2e-team/task/${encodeURIComponent(taskKey)}`);
      await expect(page.locator('.drawer')).toContainText(taskTitle);

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
      for (const [route, heading] of routes) {
        await page.goto(`/e2e-team${route ? `/${route}` : ''}`);
        await expect(page.locator('#main-content')).toBeVisible();
        await expect(page.locator('.crumbs .cur')).toHaveText(heading);
        await expect(page.locator('#main-content [aria-busy="true"]')).toHaveCount(0);
        // Collect DOM-only audits in one round trip. Repeated full-body locator
        // snapshots are particularly costly in WebKit's Windows tracing backend.
        const audit = await page.evaluate(() => {
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
          const setting = document.querySelector('.set-nav .sitem.on');
          const nav = setting?.closest('.set-nav');
          const navBox = nav?.getBoundingClientRect();
          const settingBox = setting?.getBoundingClientRect();
          return {
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            applicationError: document.body.textContent.includes('Something went wrong'),
            accessibilityIssues: [...new Set([...duplicates.map(id => `duplicate-id:${id}`), ...unnamed.map(value => `unnamed:${value}`)])],
            activeSettingVisible: !nav || nav.scrollWidth <= nav.clientWidth || (settingBox.left >= navBox.left - 2 && settingBox.right <= navBox.right + 2),
          };
        });
        expect(audit.overflow, `${viewport.name}/${route || 'home'} has horizontal page overflow`).toBeLessThanOrEqual(2);
        expect(audit.applicationError, `${viewport.name}/${route || 'home'} has an application error`).toBe(false);
        expect(audit.accessibilityIssues, `${viewport.name}/${route || 'home'} has basic accessibility issues`).toEqual([]);
        expect(audit.activeSettingVisible, `${viewport.name}/${route || 'home'} hides the selected settings tab`).toBe(true);
        if (route.startsWith('settings') && viewport.width <= 1100) {
          await expect(page.locator('#settings-section')).toBeVisible();
          await expect(page.locator('#settings-section')).toHaveValue(route.split('/')[1] || 'appearance');
        }
        if (viewport.name === 'desktop') {
          const untranslated = await visibleUntranslatedUi(page);
          if (untranslated.length) untranslatedByRoute.push({ route: route || 'home', untranslated });
        }
      }
      expect(untranslatedByRoute, 'visible Russian routes contain untranslated English UI text').toEqual([]);
      // Content-first collection layouts need more than an overflow-only check.
      for (const language of ['English (US)', 'Русский']) {
        await page.goto('/e2e-team/settings/language');
        await page.locator('select[data-k="lang"]').selectOption(language);
        await waitForSaved(page);
        for (const theme of ['light', 'dark']) {
          await page.goto('/e2e-team/settings/appearance');
          await page.locator(`[data-a="setTheme"][data-v="${theme}"]`).click();
          await waitForSaved(page);
          for (const route of ['files', 'knowledge', 'bookmarks', 'search', 'settings/appearance']) {
            await page.goto(`/e2e-team/${route}`);
            await expect(page.locator('#main-content')).toBeVisible();
            await expect(page.locator('#main-content [aria-busy="true"]')).toHaveCount(0);
            await expect(page.locator('.topsearch')).toHaveAccessibleName(language === 'Русский' ? /Найти или перейти…/ : /Search or jump to…/);
            expect(
              await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
              `${language}/${theme}/${viewport.name}/${route}`,
            ).toBeLessThanOrEqual(2);
            if (route === 'knowledge') {
              const title = await page.locator('#knowledge-view-title').boundingBox();
              expect(title.width, 'knowledge heading must not collapse to one letter per line').toBeGreaterThanOrEqual(80);
              expect(title.height).toBeLessThanOrEqual(84);
            }
            if (route === 'knowledge' || route === 'files') {
              const query = page.locator(route === 'files' ? '#workspace-file-q' : '#knowledge-search');
              await query.fill('no-result-keyboard-check');
              await query.press('Escape');
              await expect(query).toHaveValue('');
              await expect(query).toBeFocused();
            }
            await page.screenshot({
              path: `output/playwright/ux18-${browserName}-${viewport.name}-${language === 'Русский' ? 'ru' : 'en'}-${theme}-${route.replace('/', '-')}.png`,
            });
          }
        }
      }
    });
  }
});

test('shared content, files, settings, and backups persist through core workflows', async ({ page, browserName }) => {
  const variant = { chromium: 1, firefox: 2, webkit: 3 }[browserName];
  await signIn(page);
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto('/e2e-team/teams');
  await page.locator('[data-a="newTeam"]:visible').first().click();
  const teamName = `Команда регрессии ${variant} <strong>Review</strong>`;
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

  const noteTitle = `Регламент сквозной проверки ${variant}`;
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
  await page.locator('.knowledge-preview-edit').click();
  await expect(page.locator('#knowledge-title')).toHaveValue(noteTitle);
  await page.locator('.knowledge-note-actions > summary').click();
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

  const bookmarkTitle = `Справочник для команды ${variant}`;
  await page.goto('/e2e-team/bookmarks');
  await page.locator('[data-a="newBookmark"]').first().click();
  await page.locator('#bookmark-url').fill(`https://example.com/team-guide-${browserName}`);
  await page.locator('#bookmark-title').fill(bookmarkTitle);
  await page.locator('#bookmark-description').fill('Проверка общей коллекции ссылок');
  await expectRussianUi(page, 'bookmark editor');
  await page.locator('[data-a="saveBookmark"]').click();
  await waitForSaved(page);
  await page.reload();
  const bookmarkCard = page.locator('.bookmark-card', { hasText: bookmarkTitle });
  await expect(bookmarkCard).toBeVisible();
  await bookmarkCard.locator('.bookmark-action-menu summary').click();
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

  const fileName = `e2e-team-${browserName}-note.txt`;
  await page.goto('/e2e-team/projects');
  await page.locator('.project-card-link[aria-label="Проверка интерфейса"]').click();
  await page.locator('.proj-h [data-a="go"][data-r="project"][data-tab="files"]').click();
  const projectFilePicker = page.waitForEvent('filechooser');
  await page.locator('[data-a="chooseStoredFiles"]').click();
  await (
    await projectFilePicker
  ).setFiles({
    name: fileName,
    mimeType: 'text/plain',
    buffer: Buffer.from('Файл для сквозной проверки общего хранилища.', 'utf8'),
  });
  await expect(page.getByText(fileName, { exact: true })).toBeVisible({ timeout: 15_000 });
  await waitForSaved(page);
  await page.reload();
  await page.goto('/e2e-team/files');
  await expect(page.getByRole('heading', { name: 'Файлы', exact: true })).toBeVisible();
  await page.locator('#workspace-file-q').fill(fileName);
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
  await expect(page.locator('#ws-save')).toBeDisabled();
  await page.locator('#ws-name').fill('E2E Команда — сохранено');
  await expect(page.locator('#workspace-settings-status')).toHaveText('Есть несохранённые изменения');
  await page.locator('#ws-save').click();
  await waitForSaved(page);
  await expect(page.locator('#workspace-settings-status')).toHaveText('Настройки синхронизированы');
  await expectSingleRowMobileHeader(page);
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
  await expect(page.locator('.auth-session-row[data-current="true"]')).toContainText(browserName === 'webkit' ? 'macOS' : 'Windows');
  await expectRussianUi(page, 'account security settings');

  await page.goto('/e2e-team/settings/language');
  await page.locator('select[data-k="lang"]').selectOption('English (US)', { force: true });
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await waitForSaved(page);
  await expectSingleRowMobileHeader(page);
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
  await page.route('**/app-version.json', route => route.fulfill({ json: { version: 'e2e-next-deployment' } }));
  await page.goto('/e2e-team/files');
  await page.locator('#workspace-file-q').fill(fileName);
  await expect(page.locator('.workspace-file-card', { hasText: fileName })).toBeVisible();
  const update = page.locator('.deployment-update').getByRole('button', { name: 'Обновить приложение', exact: true });
  await expect(update).toBeEnabled();
  await Promise.all([page.waitForEvent('domcontentloaded'), update.click()]);
  await expect(page.locator('#workspace-file-q')).toHaveValue(fileName);
  await expect(page.locator('.workspace-file-card', { hasText: fileName })).toBeVisible();
  await page.unroute('**/app-version.json');
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

test('file folders preserve uploads and moves through reload and archive on mobile in both languages', async ({ page, browserName }) => {
  const folderA = `E2E Files A ${browserName}`;
  const folderB = `E2E Files B ${browserName}`;
  const fileName = `e2e-folder-${browserName}.txt`;
  await signIn(page);
  await page.goto('/e2e-team/settings/language');
  await page.locator('select[data-k="lang"]').selectOption('Русский');
  await waitForSaved(page);
  await page.goto('/e2e-team/files');
  const createFolder = async name => {
    await openFileFolderTools(page);
    await page.locator('[data-a="newFileFolder"]').click();
    await page.locator('#file-folder-name').fill(name);
    await page.locator('[data-a="saveFileFolder"]').click();
    await waitForSaved(page);
  };
  await createFolder(folderA);
  await expect(page.getByRole('heading', { name: 'В этой папке пока нет файлов', exact: true })).toBeVisible();
  const pickerEvent = page.waitForEvent('filechooser');
  await page.locator('[data-a="chooseStoredFiles"]').click();
  await (await pickerEvent).setFiles({ name: fileName, mimeType: 'text/plain', buffer: Buffer.from('Folder upload / Загрузка в папку') });
  await expect(page.locator('.workspace-file-card', { hasText: fileName })).toBeVisible();
  await waitForSaved(page);
  await page.reload();
  await expect(page.locator('.workspace-file-card', { hasText: fileName })).toContainText(folderA, { timeout: 15_000 });
  // Reload restores the saved view, not a transient folder filter. Verify the
  // persisted folder membership by entering it before returning via breadcrumbs.
  await page.locator('.files-folder-tile', { hasText: folderA }).locator('.files-folder-open').click();
  await expect(page.locator('.workspace-file-card', { hasText: fileName })).toBeVisible();
  await page.locator('.files-folder-crumbs [data-project="all"]').click();
  await expect(page.locator('#workspace-file-project')).toHaveValue('all');
  await createFolder(folderB);
  await page.locator('.files-folder-crumbs [data-project="all"]').click();
  await page.locator('.workspace-file-card', { hasText: fileName }).locator('[data-a="ctxBtn"]').click();
  await page.locator('[data-a="moveFileToFolder"]').click();
  await page.locator('.file-move-row', { hasText: folderB }).click();
  await page.locator('[data-a="confirmFileMove"]').click();
  await waitForSaved(page);
  await page.reload();
  await expect(page.locator('.workspace-file-card', { hasText: fileName })).toContainText(folderB, { timeout: 15_000 });
  for (const language of ['English (US)', 'Русский']) {
    await page.goto('/e2e-team/settings/language');
    await page.locator('select[data-k="lang"]').selectOption(language);
    await waitForSaved(page);
    await page.goto('/e2e-team/files');
    await page.setViewportSize({ width: 320, height: 844 });
    await expect(page.locator('.topsearch')).toHaveAccessibleName(language === 'Русский' ? /Найти или перейти…/ : /Search or jump to…/);
    await openFileFolderTools(page);
    await expect(page.locator('[data-a="newFileFolder"]')).toHaveAccessibleName(language === 'Русский' ? 'Новая папка' : 'New folder');
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-a="chooseStoredFiles"]')).toHaveAccessibleName(language === 'Русский' ? 'Загрузить файлы' : 'Upload files');
    await expect(page.locator('.side')).toHaveAttribute('inert', '');
    await page.locator('#mnav-btn').click();
    await expect(page.locator('.side')).toHaveAttribute('role', 'dialog');
    await expect(page.locator('.main')).toHaveAttribute('inert', '');
    await page.keyboard.press('Escape');
    await expect(page.locator('#mnav-btn')).toBeFocused();
    await expect(page.locator('.side')).toHaveAttribute('inert', '');
    const folder = page.locator('.files-folder-tile', { hasText: folderA });
    await folder.locator('summary').click();
    // A click outside dismisses actions; a reopened menu survives background reads.
    await page.locator('#workspace-file-q').click();
    await page.locator('#workspace-file-q').fill(fileName);
    await expect(page.locator('.workspace-file-card', { hasText: fileName })).toBeVisible();
    await expect(folder.locator('details')).not.toHaveAttribute('open', '');
    await folder.locator('summary').click();
    await expect(folder.locator('details')).toHaveAttribute('open', '');
    const menuBox = await folder.locator('details > div').boundingBox();
    expect(menuBox.x).toBeGreaterThanOrEqual(7);
    expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(313);
    expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(769);
    await folder.locator('[data-a="archiveFileFolder"]').click();
    await waitForSaved(page);
    await openFileFolderTools(page);
    await page.locator('[data-a="toggleFileFolderArchive"]').click();
    await expect(page.locator('.files-folder-tile', { hasText: folderA })).toBeVisible();
    await page.locator('.files-folder-tile', { hasText: folderA }).locator('[data-a="restoreFileFolder"]').click();
    await waitForSaved(page);
    await page.locator('.files-folder-crumbs [data-project="all"]').click();
    await page.locator('#workspace-file-q').fill('');
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
    if (!(await page.locator('.files-details').getAttribute('open'))) await page.locator('.files-details > summary').click();
    if (!(await page.locator('.files-exports').getAttribute('open'))) await page.locator('.files-exports > summary').click();
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
    await openFileFolderTools(page);
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
      await openFileFilters(page);
      await page.locator('#workspace-file-project').selectOption('scale-files');
      await page.keyboard.press('Escape');
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
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/e2e-team/files');
    await openFileFilters(page);
    await page.locator('#files-page-size').selectOption('100');
    await page.locator('#workspace-file-sort').selectOption('date');
    await page.locator('.files-view-switch [data-v="grid"]').click();
    if (await page.locator('.files-folder-grid.compact').count()) {
      await openFileFolderTools(page);
      await page.locator('[data-a="toggleFileFolderLayout"]').click();
    }
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
      await page.locator('.files-details > summary').click();
      await page.locator('[data-a="toggleFileRecursive"]').click();
      await expect(page.locator('.workspace-file-card')).toHaveCount(2);
      await page.locator('[data-a="saveFileFilter"]').click();
      await page.locator('#prompt-in').fill('E2E saved tree');
      await page.locator('[data-a="promptSubmit"]').click();
      await page.reload();
      await page.locator('.files-details > summary').click();
      await page.locator('[data-in="fileFilterPreset"]').selectOption({ label: 'E2E saved tree' });
      await expect(page.locator('.workspace-file-card')).toHaveCount(2);
      await page.locator('.files-selection-tools > summary').click();
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

test('PDF previews render pages locally without document scripts in Russian and English on mobile', async ({ page, browserName }) => {
  await signIn(page);
  const current = (await (await page.request.get('/api/workspace')).json()).data;
  const expectedFileCount = current.files.length + 3;
  const keyboardName = `e2e-${browserName}-keyboard-upload.txt`;
  const previousImages = current.files.filter(file => file.type === 'img').map(file => file.id);
  const previousPdfs = current.files.filter(file => file.type === 'pdf').map(file => file.id);
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
  await page.locator('.files-view-switch [data-v="grid"]').click();
  await expect(page.locator('.workspace-file-card')).toHaveCount(expectedFileCount - 1);
  const originalPickerInput = await page.locator('#workspace-files-upload').elementHandle();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('[data-a="chooseStoredFiles"]').press('Enter');
  const picker = await chooser;
  expect(picker.isMultiple()).toBeTruthy();
  // Resizing causes the same render as an arriving catalog response while the
  // OS picker is open. Its original input must still deliver exactly one upload.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => originalPickerInput.evaluate(el => el.isConnected)).toBe(false);
  await picker.setFiles({ name: keyboardName, mimeType: 'text/plain', buffer: Buffer.from('Keyboard upload / Загрузка с клавиатуры') });
  await originalPickerInput.dispose();
  await expect(page.locator('.workspace-file-card', { hasText: keyboardName })).toBeVisible();
  await waitForSaved(page);
  await page.reload();
  await expect(page.locator('.workspace-file-card', { hasText: keyboardName })).toBeVisible();
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
    await expect(page.locator('.workspace-file-card')).toHaveCount(previousImages.length + 1);
    expect(await page.locator('.workspace-file-card').evaluateAll(cards => cards.map(card => card.dataset.id).sort())).toEqual(
      [...previousImages, thumbnail.id].sort(),
    );
    await expect(page.locator('.files-filter-summary b')).toHaveText(String(previousImages.length + 1));
    await page.locator('[data-a="clearFileQuery"]').click();
    await expect(page.locator('#workspace-file-q')).toBeFocused();
    await expect(page.locator('.workspace-file-card')).toHaveCount(expectedFileCount);
    await page.locator('#workspace-file-type').selectOption('pdf');
    await expect(page.locator('.workspace-file-card')).toHaveCount(previousPdfs.length + 1);
    expect(await page.locator('.workspace-file-card').evaluateAll(cards => cards.map(card => card.dataset.id).sort())).toEqual(
      [...previousPdfs, file.id].sort(),
    );
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
    await page.locator('.workspace-file-table tbody tr').filter({ hasText: keyboardName }).locator('[data-a="ctxBtn"]').click();
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
    await page.setViewportSize({ width: 320, height: 844 });
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

test('personal sidebar settings persist independently and help is available in settings', async ({ page, browser }) => {
  test.setTimeout(300000);
  await signIn(page);
  const open = async target => {
    await target.goto('/e2e-team/settings/appearance');
    await target.locator('#main-content [data-a="customizeSidebar"]').click();
    await expect(target.locator('.sidebar-customize-dialog')).toBeVisible();
  };
  for (const language of ['Русский', 'English (US)']) {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/e2e-team/settings/language');
    await page.locator('select[data-k="lang"]').selectOption(language);
    await waitForSaved(page);
    await open(page);
    await page.locator('[data-a="resetSidebarDraft"]').click();
    await page.locator('[data-in="sidebarVisibility"][data-id="graph"]').uncheck();
    await page.locator('[data-in="sidebarOption"][data-field="counts"]').uncheck();
    await page.locator('[data-in="sidebarOption"][data-field="projects"]').uncheck();
    await page.locator('[data-a="sidebarMove"][data-id="knowledge"][data-step="-1"]').click();
    await page.locator('[data-a="applySidebarDraft"]').click();
    await waitForSaved(page);
    await page.reload();
    await expect(page.locator('.shell')).toBeVisible();
    await expect(page.locator('.side .sitem[data-r="graph"]')).toHaveCount(0);
    await expect(page.locator('.side .sproj')).toHaveCount(0);
    await expect(page.locator('.side .sitem[data-r="archive"]')).toHaveCount(1);
    await expect(page.locator('.side-scroll .sitem > .ct')).toHaveCount(0);
    const order = await page.locator('.side-scroll .sitem[data-r]').evaluateAll(els => els.map(el => el.dataset.r));
    expect(order.indexOf('knowledge')).toBeLessThan(order.indexOf('timeline'));
    for (const [width, height] of [
      [320, 740],
      [390, 845],
      [844, 390],
      [1366, 768],
    ]) {
      await page.setViewportSize({ width, height });
      await open(page);
      const box = await page.locator('.sidebar-customize-dialog').boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      if ([390, 1366].includes(width)) await page.screenshot({ path: `output/playwright/sidebar-custom-${language === 'Русский' ? 'ru' : 'en'}-${width}.png` });
      await page.locator('[data-a="resetSidebarDraft"]').click();
      await page.locator('.sidebar-customize-dialog [data-a="closeModal"]').last().click();
      await expect(page.locator('.side .sitem[data-r="graph"]')).toHaveCount(0);
    }
    await page.goto('/e2e-team/settings/help');
    await expect(page.locator('.set-in > h1')).toHaveText(language === 'Русский' ? 'Помощь и ресурсы' : 'Help & resources');
    await expect(page.locator('.side-bot [data-pop="help"]')).toHaveCount(0);
    await expect(page.locator('.side-bot .sitem[data-r="settings"]')).toHaveCount(1);
  }
  const context = await browser.newContext();
  try {
    const editor = await context.newPage();
    await signIn(editor, 'e2e-editor-access-id-2026-secure');
    await expect(editor.locator('.side .sitem[data-r="graph"]')).toHaveCount(1);
    await open(editor);
    await editor.locator('[data-in="sidebarVisibility"][data-id="files"]').uncheck();
    await editor.locator('[data-a="applySidebarDraft"]').click();
    await waitForSaved(editor);
    await editor.reload();
    await expect(editor.locator('.shell')).toBeVisible();
    await expect(editor.locator('.side .sitem[data-r="files"]')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('.shell')).toBeVisible();
    await expect(page.locator('.side .sitem[data-r="files"]')).toHaveCount(1);
    await expect(page.locator('.side .sitem[data-r="graph"]')).toHaveCount(0);
    await editor.goto('/e2e-team/settings/help');
    await expect(editor.locator('.set-in > h1')).toBeVisible();
    await open(editor);
    await editor.locator('[data-a="resetSidebarDraft"]').click();
    await editor.locator('[data-a="applySidebarDraft"]').click();
    await waitForSaved(editor);
  } finally {
    await context.close();
  }
  await open(page);
  await page.locator('[data-a="resetSidebarDraft"]').click();
  await page.locator('[data-a="applySidebarDraft"]').click();
  await waitForSaved(page);
});

test('project whiteboards persist cards connections layout and inherited access in both languages', async ({ page, browser }) => {
  test.setTimeout(360000);
  await signIn(page);
  const workspace = (await (await page.request.get('/api/workspace')).json()).data;
  const project = workspace.projects[0],
    path = await projectBoardPath(page, project.id, true);
  await page.goto(path);
  await expect(page.locator('.project-whiteboard')).toBeVisible();
  const add = async action => {
    const menu = page.locator('.whiteboard-add');
    if ((await menu.getAttribute('open')) === null) await menu.locator(':scope > summary').click();
    await menu.locator(`[data-a="${action}"]`).click();
  };
  const writeCard = async (title, body) => {
    await page.locator('[data-in="whiteboardField"][data-field="title"]').fill(title);
    if (body) await page.locator('[data-in="whiteboardField"][data-field="text"]').fill(body);
    await page.locator('[data-a="whiteboardSave"]').click();
    await waitForSaved(page);
  };
  await page.locator('[data-a="whiteboardNewText"]').filter({ visible: true }).click();
  await writeCard('Research / Исследование', 'A useful idea / Полезная идея');
  await add('whiteboardNewText');
  await writeCard('Release / Выпуск', 'Next step');
  let data = (await (await page.request.get('/api/workspace')).json()).data;
  let board = data.projects.find(p => p.id === project.id).whiteboard;
  expect(board.nodes).toHaveLength(2);
  expect(board.nodes[0].x === board.nodes[1].x && board.nodes[0].y === board.nodes[1].y).toBeFalsy();
  const [first, second] = board.nodes;
  await add('whiteboardNewEdge');
  await page.locator('[data-field="from"]').selectOption(first.id);
  await page.locator('[data-field="to"]').selectOption(second.id);
  await page.locator('[data-field="label"]').fill('Plan / План');
  await page.locator('[data-a="whiteboardSave"]').click();
  await waitForSaved(page);
  await page.locator('[data-a="whiteboardFit"]').click();
  const handle = page.locator(`[data-board-drag="${first.id}"]`),
    box = await handle.boundingBox();
  const edgeBefore = await page.locator('.whiteboard-edges g path').getAttribute('d');
  await page.mouse.move(box.x + 20, box.y + 16);
  await page.mouse.down();
  await page.mouse.move(box.x + 70, box.y + 46, { steps: 5 });
  await expect(page.locator('.whiteboard-edges g path')).not.toHaveAttribute('d', edgeBefore);
  await page.mouse.up();
  await waitForSaved(page);
  data = (await (await page.request.get('/api/workspace')).json()).data;
  expect(data.projects.find(p => p.id === project.id).whiteboard.nodes[0].x).not.toBe(first.x);
  const upload = await page.request.post('/api/files/upload', {
    multipart: {
      file: { name: 'whiteboard-attachment.txt', mimeType: 'text/plain', buffer: Buffer.from('Linked board resource') },
      revision: String(data.revision),
      project: project.id,
    },
  });
  expect(upload.status()).toBe(201);
  const uploaded = (await upload.json()).file;
  await page.reload();
  await expect(page.locator('.whiteboard-card')).toHaveCount(2);
  await add('whiteboardAddMaterial');
  await page.locator('[data-in="whiteboardQuery"]').fill('whiteboard-attachment');
  await page.locator(`[data-a="whiteboardChooseMaterial"][data-key="file:${uploaded.id}"]`).click();
  await waitForSaved(page);
  await add('whiteboardNewFrame');
  await writeCard('Scope / Область');
  await page.reload();
  await expect(page.locator('.whiteboard-card')).toHaveCount(4);
  await expect(page.locator('.whiteboard-edges g')).toHaveCount(1);
  await page.locator('[data-a="whiteboardToggleOutline"]').click();
  await page.locator(`[data-board-drag="${second.id}"]`).click();
  await page.locator('[data-a="whiteboardDelete"]').click();
  await expect(page.locator('.whiteboard-card')).toHaveCount(3);
  await expect(page.locator('.whiteboard-edge-row')).toHaveCount(0);
  await page.locator('[data-a="whiteboardUndo"]').click();
  await expect(page.locator('.whiteboard-card')).toHaveCount(4);
  await expect(page.locator('.whiteboard-edge-row')).toHaveCount(1);
  await waitForSaved(page);
  const download = page.waitForEvent('download');
  await page.locator('.whiteboard-io > summary').click();
  await page.locator('[data-a="whiteboardExport"]').click();
  expect(JSON.parse(await readFile(await (await download).path(), 'utf8')).board.nodes).toHaveLength(4);
  data = (await (await page.request.get('/api/workspace')).json()).data;
  data.projects.push({ ...project, id: 'second-whiteboard', key: 'WBT', whiteboard: { version: 1, nodes: [], edges: [] }, milestones: [] });
  data.projOrder.push('second-whiteboard');
  expect((await page.request.put('/api/workspace', { data: { revision: data.revision, data } })).ok()).toBeTruthy();
  await page.goto(await projectBoardPath(page, 'second-whiteboard'));
  await expect(page.locator('.project-whiteboard')).toBeVisible();
  await expect(page.locator('.whiteboard-card')).toHaveCount(0);
  for (const language of ['Русский', 'English (US)']) {
    await page.goto('/e2e-team/settings/language');
    await page.locator('select[data-k="lang"]').selectOption(language);
    await waitForSaved(page);
    await page.goto(path);
    await expect(page.locator('.whiteboard-card')).toHaveCount(4);
    for (const [width, height] of [
      [320, 740],
      [390, 845],
      [768, 1024],
      [844, 390],
      [1366, 768],
    ]) {
      await page.setViewportSize({ width, height });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      await page.locator('[data-a="whiteboardToggleOutline"]').click();
      await expect(page.locator('.whiteboard-outline')).toBeVisible();
      await page.locator(`[data-a="whiteboardEdit"][data-id="${first.id}"]`).click();
      await expect(page.locator('[data-field="text"]')).toHaveValue('A useful idea / Полезная идея');
      const bounds = await page.locator('.whiteboard-tool-dialog').boundingBox();
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
      await page.locator('.whiteboard-tool-dialog [data-a="closeModal"]').last().click();
      if ([390, 1366].includes(width)) await page.screenshot({ path: `output/playwright/whiteboard-${language === 'Русский' ? 'ru' : 'en'}-${width}.png` });
      await page.locator('[data-a="whiteboardToggleOutline"]').click();
    }
  }
  const context = await browser.newContext();
  try {
    const editor = await context.newPage();
    await signIn(editor, 'e2e-editor-access-id-2026-secure');
    data = (await (await page.request.get('/api/workspace')).json()).data;
    const member = data.members.find(m => m.email === 'editor@example.test'),
      original = data.projects.find(p => p.id === project.id);
    original.members = [...new Set([...original.members, member.id])];
    original.perms = { ...original.perms, [member.id]: 'Can view' };
    expect((await page.request.put('/api/workspace', { data: { revision: data.revision, data } })).ok()).toBeTruthy();
    await editor.goto(path);
    await expect(editor.locator('.project-whiteboard')).toBeVisible();
    await expect(editor.locator('.whiteboard-add')).toHaveCount(0);
    const denied = (await (await editor.request.get('/api/workspace')).json()).data;
    denied.projects.find(p => p.id === project.id).whiteboard.nodes[0].text = 'Forbidden';
    expect((await editor.request.put('/api/workspace', { data: { revision: denied.revision, data: denied } })).status()).toBe(403);
  } finally {
    await context.close();
  }
});

test('project cards stay compact and open through background and keyboard without menu collisions', async ({ page }) => {
  await signIn(page);
  const snapshot = await (await page.request.get('/api/workspace')).json();
  const base = snapshot.data.projects[0];
  snapshot.data.projects = [
    ...snapshot.data.projects,
    ...['planning', 'active', 'hold'].map((status, index) => ({
      ...base,
      id: `card-${index}`,
      key: `CARD${index}`,
      name: index === 0 ? 'Проект с очень длинным названием для проверки карточки / Long project title' : `Card project ${index}`,
      status,
      desc: index === 1 ? 'No description yet.' : 'Описание проекта без лишнего пустого пространства.',
      due: '2030-11-28',
      milestones: [],
    })),
  ];
  snapshot.data.projOrder = snapshot.data.projects.map(project => project.id);
  expect((await page.request.put('/api/workspace', { data: { revision: snapshot.data.revision, data: snapshot.data } })).ok()).toBeTruthy();
  await page.reload();
  for (const language of ['Русский', 'English (US)']) {
    await page.goto('/e2e-team/settings/language');
    await page.locator('select[data-k="lang"]').selectOption(language);
    await waitForSaved(page);
    for (const [width, height] of [
      [320, 740],
      [390, 845],
      [768, 1024],
      [844, 390],
      [1024, 768],
      [1366, 768],
      [1920, 1080],
    ]) {
      await page.setViewportSize({ width, height });
      await page.goto('/e2e-team/projects');
      await expect(page.locator('.project-card')).toHaveCount(4);
      await expect(page.locator('.project-card[data-id="card-1"] .desc')).toHaveText(language === 'Русский' ? 'Описания пока нет.' : 'No description yet.');
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      const geometry = await page.locator('.project-card').evaluateAll(cards =>
        cards.map(card => {
          const status = card.querySelector('.pstatus').getBoundingClientRect(),
            menu = card.querySelector('.project-card-menu').getBoundingClientRect(),
            due = card.querySelector('.project-card-due'),
            link = card.querySelector('.project-card-link');
          return {
            overflow: card.scrollWidth - card.clientWidth,
            collision: status.left < menu.right && status.right > menu.left && status.top < menu.bottom && status.bottom > menu.top,
            wrap: due ? getComputedStyle(due).whiteSpace : 'nowrap',
            href: link.getAttribute('href'),
          };
        }),
      );
      expect(geometry.every(card => card.overflow <= 1 && !card.collision && card.wrap === 'nowrap' && card.href?.includes('/project/'))).toBeTruthy();
      const card = page.locator('.project-card[data-id="card-0"]');
      await card.locator('.project-card-menu').click();
      await expect(page.locator('[data-pop-root]')).toBeVisible();
      await expect(page).toHaveURL(/\/projects$/);
      await page.keyboard.press('Escape');
      await card.click({ position: { x: 12, y: (await card.boundingBox()).height - 8 } });
      await expect(page).toHaveURL(/\/project\/card0/);
      await expect(page.locator('h1')).toContainText('Проект с очень длинным');
      await page.goto('/e2e-team/projects');
      await page.locator('.project-card[data-id="card-1"] .project-card-link').press('Enter');
      await expect(page).toHaveURL(/\/project\/card1/);
      if ([390, 1366].includes(width)) {
        await page.goto('/e2e-team/projects');
        await expect(page.locator('.project-card')).toHaveCount(4);
        await page.screenshot({ path: `output/playwright/projects-cards-${language === 'Русский' ? 'ru' : 'en'}-${width}-20261031.png` });
      }
    }
  }
});

async function projectBoardPath(page, projectId, reset = false) {
  let data = (await (await page.request.get('/api/workspace')).json()).data;
  let existing = data.whiteboards?.find(b => b.legacyProject === projectId);
  if (!existing) {
    data.projects.find(p => p.id === projectId).whiteboard = {
      version: 1,
      nodes: [{ id: 'fixture-init', type: 'text', x: 0, y: 0, width: 200, height: 120, color: 'neutral', title: '', text: '' }],
      edges: [],
    };
    expect((await page.request.put('/api/workspace', { data: { revision: data.revision, data } })).ok()).toBeTruthy();
    data = (await (await page.request.get('/api/workspace')).json()).data;
    existing = data.whiteboards.find(b => b.legacyProject === projectId);
    reset = true;
  }
  if (reset) {
    data.projects.find(p => p.id === projectId).whiteboard = { version: 1, nodes: [], edges: [] };
    expect((await page.request.put('/api/workspace', { data: { revision: data.revision, data } })).ok()).toBeTruthy();
  }
  return `/e2e-team/whiteboard/${existing.id}`;
}
