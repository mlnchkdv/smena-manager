import { expect, test } from '@playwright/test';
test.setTimeout(240000);
const waitSaved = async page => {
  await page.waitForTimeout(500);
  await expect(page.locator('#sync-indicator')).toHaveAttribute('data-state', 'saved', { timeout: 15000 });
};
const expectFolderTileBounds = async page => {
  const overflow = await page.locator('.knowledge-folder-tile').evaluateAll(tiles =>
    tiles.map(tile => {
      const action = tile.querySelector('.knowledge-folder-receive');
      return Math.max(tile.scrollHeight - tile.clientHeight, action ? action.getBoundingClientRect().bottom - tile.getBoundingClientRect().bottom : 0);
    }),
  );
  expect(
    overflow.every(value => value <= 2),
    `Folder content exceeds its tile: ${overflow}`,
  ).toBeTruthy();
};
test('knowledge reading editing history search and mobile folders work in Russian and English', async ({ page }) => {
  await page.goto('/');
  await page.locator('#l-access').fill('e2e-access-id-2026-secure');
  await page.locator('#login-btn').click();
  await page.locator('#o-ws:visible,.shell:visible').first().waitFor();
  if (await page.locator('#o-ws').isVisible()) {
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
  await waitSaved(page);
  const snapshot = await (await page.request.get('/api/workspace-documents/knowledge')).json();
  const data = {
    knowledgeFolders: [
      { id: 'kb-parent', name: 'Documentation' },
      { id: 'kb-child', name: 'Guides', parentId: 'kb-parent' },
      { id: 'kb-long', name: 'Архив регламентов / Team reference folder with a long title' },
    ],
    knowledgeNotes: [
      {
        id: 'kb-a',
        title: 'Knowledge Alpha',
        category: 'Imported',
        summary: 'Original import summary',
        formatted_markdown:
          '---\ntitle: Knowledge Alpha\nsummary: Original import summary\ninternal_key: metadata-only-marker\n---\n# Guide\n\nOriginal knowledge content\n\n[[Knowledge Beta]]\n\n| Раздел / Area | Details |\n| --- | --- |\n| Команда | Team reference |',
        tags: ['team'],
        folderId: 'kb-child',
        updatedAt: new Date().toISOString(),
        updatedBy: 'e2e-admin',
      },
      { id: 'kb-b', title: 'Knowledge Beta', formatted_markdown: 'Second reference', tags: ['team'], folderId: null, updatedAt: new Date().toISOString() },
    ],
  };
  expect((await page.request.put('/api/workspace-documents/knowledge', { data: { revision: snapshot.data.revision, data } })).ok()).toBeTruthy();
  await page.goto('/e2e-team/knowledge');
  await page.locator('[data-in="knowledgeQuery"]').fill('"original knowledge"');
  await expect(page.locator('.knowledge-preview-open')).toHaveCount(1);
  await expect(page.locator('.knowledge-preview-excerpt mark')).toHaveText('Original knowledge');
  await page.locator('[data-a="saveKnowledgeView"]').click();
  await page.locator('#prompt-in').fill('Pinned review');
  await page.locator('[data-a="promptSubmit"]').click();
  await page.reload();
  await expect(page.locator('[data-a="applyKnowledgeView"]')).toHaveText('Pinned review');
  await page.locator('[data-a="applyKnowledgeView"]').click();
  await expect(page.locator('.knowledge-preview-open')).toHaveCount(1);
  await page.locator('.knowledge-preview-open').click();
  await expect(page.locator('.knowledge-drawer')).toContainText('Knowledge Beta');
  await expect(page.locator('.shell')).toHaveAttribute('inert', '');
  await expect(page.locator('.knowledge-quick-content').first()).not.toContainText('metadata-only-marker');
  await expect(page.locator('.knowledge-frontmatter')).not.toHaveAttribute('open');
  await page.locator('.knowledge-frontmatter>summary').click();
  await expect(page.locator('.knowledge-frontmatter pre')).toContainText('metadata-only-marker');
  await page.locator('.knowledge-frontmatter>summary').click();
  await page.locator('[data-a="editKnowledgeNote"]').click();
  await expect(page.locator('#knowledge-body')).toHaveValue(/internal_key: metadata-only-marker/);
  await page.locator('[data-a="toggleKnowledgeEditorPreview"]').click();
  const originalSource = await page.locator('#knowledge-body').inputValue();
  await page.locator('#knowledge-body').fill(originalSource + '\nPreview typing check');
  await expect(page.locator('.knowledge-live-preview .knowledge-quick-content')).toContainText('Preview typing check');
  await expect(page.locator('.knowledge-live-preview .knowledge-quick-content')).not.toContainText('metadata-only-marker');
  await expect(page.locator('.knowledge-live-preview .knowledge-frontmatter>summary')).toHaveText('Метаданные исходника');
  await expect(page.locator('.knowledge-live-preview .knowledge-quick-content')).toHaveAttribute('translate', 'no');
  await page.locator('#knowledge-body').fill(originalSource);
  await page.locator('[data-a="toggleKnowledgeEditorPreview"]').click();
  await page.locator('.knowledge-properties>summary').click();
  await page.locator('#knowledge-title').fill('Renamed legacy Alpha');
  await page.locator('#knowledge-summary').fill('Edited legacy summary');
  await page.locator('#knowledge-summary').press('Tab');
  await waitSaved(page);
  const renamedDocument = await (await page.request.get('/api/workspace-documents/knowledge')).json();
  expect(renamedDocument.data.knowledgeNotes.find(note => note.id === 'kb-a').sourceFormat).toBe('markdown');
  await page.reload();
  await page.locator('.knowledge-preview-open').filter({ hasText: 'Renamed legacy Alpha' }).click();
  await expect(page.locator('.knowledge-quick-content').first()).not.toContainText('metadata-only-marker');
  await expect(page.locator('.knowledge-frontmatter').first()).not.toHaveAttribute('open');
  await page.locator('[data-a="editKnowledgeNote"]').click();
  await page.locator('.knowledge-history>summary').click();
  await page.locator('[data-a="restoreKnowledgeVersion"]').first().click();
  await page.locator('[data-a="confirmOk"]').click();
  await waitSaved(page);
  await expect(page.locator('#knowledge-title')).toHaveValue('Knowledge Alpha');
  await page.locator('.knowledge-history-row details>summary').first().click();
  await expect(page.locator('.knowledge-history-row .knowledge-quick-content').first()).not.toContainText('metadata-only-marker');
  await expect(page.locator('.knowledge-history-row .knowledge-frontmatter pre').first()).toContainText('metadata-only-marker');
  await page.locator('#knowledge-body').fill('Updated knowledge body');
  await waitSaved(page);
  await expect(page.locator('[data-knowledge-save-status]')).toHaveText('Сохранено');
  await page.reload();
  await expect(page.locator('.knowledge-preview-open')).toHaveCount(2);
  await page.locator('.knowledge-preview-open').filter({ hasText: 'Knowledge Alpha' }).click();
  await expect(page.locator('.knowledge-quick-content').first()).toContainText('Updated knowledge body');
  await page.locator('[data-a="editKnowledgeNote"]').click();
  await page.locator('.knowledge-history>summary').click();
  await page.locator('.knowledge-history-row details>summary').first().click();
  await expect(page.locator('.knowledge-history-row .knowledge-quick-content').first()).not.toContainText('metadata-only-marker');
  await expect(page.locator('.knowledge-history-row .knowledge-frontmatter pre').first()).toContainText('metadata-only-marker');
  await expect(page.locator('[data-a="restoreKnowledgeVersion"]').first()).toBeVisible();
  // The rename/restore check adds a newer renamed snapshot; restore the
  // original import explicitly rather than assuming the newest is original.
  await page.locator('[data-a="restoreKnowledgeVersion"]').last().click();
  await page.locator('[data-a="confirmOk"]').click();
  await waitSaved(page);
  await page.reload();
  await page.locator('.knowledge-preview-open').filter({ hasText: 'Knowledge Alpha' }).click();
  await expect(page.locator('.knowledge-quick-content').first()).toContainText('Original knowledge content');
  await page.locator('button[data-a="closeKnowledgeDrawer"]').click();
  expect(await page.locator('.knowledge-content-actions').evaluate(el => parseFloat(getComputedStyle(el).columnGap))).toBeGreaterThanOrEqual(8);
  await page.locator('[data-in="knowledgeFolderLayout"]').selectOption('inline');
  await page.reload();
  await expect(page.locator('[data-in="knowledgeFolderLayout"]')).toHaveValue('inline');
  await expect(page.locator('.knowledge-mixed-grid .knowledge-folder-tile')).toHaveCount(2);
  await expect(page.locator('.knowledge-mixed-grid .knowledge-preview-card')).toHaveCount(2);
  await expect(page.locator('.knowledge-content > .knowledge-folder-browser')).toHaveCount(0);
  const folderIconTops = await page
    .locator('.knowledge-mixed-grid .knowledge-folder-card > svg')
    .evaluateAll(icons => icons.map(icon => icon.getBoundingClientRect().top));
  expect(Math.abs(folderIconTops[0] - folderIconTops[1])).toBeLessThanOrEqual(1);
  await page.screenshot({ path: 'output/playwright/knowledge-mixed-local-desktop-20261022.png' });
  await page.locator('[data-a="toggleKnowledgeFolderCards"]').click();
  await expect(page.locator('[data-in="knowledgeFolderLayout"]')).toHaveCount(0);
  await page.locator('[data-a="toggleKnowledgeFolderCards"]').click();
  await expect(page.locator('[data-in="knowledgeFolderLayout"]')).toHaveValue('inline');
  for (const [language, folderLabel, editLabel] of [
    ['Русский', 'Папки', 'Редактировать заметку'],
    ['English (US)', 'Folders', 'Edit note'],
  ]) {
    await page.goto('/e2e-team/settings/language');
    await page.locator('select[data-k="lang"]').selectOption(language);
    await waitSaved(page);
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto('/e2e-team/knowledge');
    await expect(page.locator('[data-in="knowledgeFolderLayout"]')).toHaveAttribute(
      'aria-label',
      language === 'Русский' ? 'Отображение папок' : 'Folder display',
    );
    await page.locator('[data-in="knowledgeFolderLayout"]').selectOption('block');
    await expect(page.locator('.knowledge-content > .knowledge-folder-browser')).toBeVisible();
    await page.locator('[data-a="focusKnowledgeNotes"]').press('Enter');
    await expect(page.locator('.knowledge-preview-open').first()).toBeFocused();
    await expect(page.locator('.knowledge-drawer')).toHaveCount(0);
    await page.locator('[data-in="knowledgeFolderLayout"]').selectOption('inline');
    await expect(page.locator('.knowledge-mixed-grid .knowledge-folder-card').first()).toBeVisible();
    const folderBoxes = await page.locator('.knowledge-mixed-grid .knowledge-folder-tile').evaluateAll(tiles =>
      tiles.map(el => {
        const box = el.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width };
      }),
    );
    expect(Math.abs(folderBoxes[0].y - folderBoxes[1].y)).toBeLessThan(2);
    expect(folderBoxes[1].x).toBeGreaterThan(folderBoxes[0].x + folderBoxes[0].width);
    expect((await page.locator('.knowledge-preview-card').first().boundingBox()).width).toBeGreaterThan(280);
    expect(await page.locator('html').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(2);
    await page.screenshot({ path: `output/playwright/knowledge-mixed-local-mobile-${language === 'Русский' ? 'ru' : 'en'}-20261022.png` });
    await expect(page.locator('[data-a="focusKnowledgeNotes"]')).toHaveAttribute('aria-label', language === 'Русский' ? 'К заметкам' : 'Jump to notes');
    await page.locator('[data-a="focusKnowledgeNotes"]').press('Enter');
    await expect(page.locator('.knowledge-preview-open').first()).toBeFocused();
    const intakeGap = await page.locator('.knowledge-content-actions').evaluate(el => {
      const a = el.querySelector('[data-a="chooseKnowledgeFiles"]').getBoundingClientRect();
      const b = el.querySelector('[data-a="newKnowledgeNote"]').getBoundingClientRect();
      return Math.abs(a.top - b.top) < 2 ? b.left - a.right : b.top - a.bottom;
    });
    expect(intakeGap).toBeGreaterThanOrEqual(7.5);
    await page.locator('#knowledge-import-files').setInputFiles(
      Array.from({ length: 4 }, (_, i) => ({
        name: `Mobile import ${i}.${i % 2 ? 'txt' : 'md'}`,
        mimeType: 'text/plain',
        buffer: Buffer.from(`# Mobile import ${i}\n\nТекст / Team content ${i}`),
      })),
    );
    await expect(page.locator('.knowledge-import-review li')).toHaveCount(4);
    await expect(page.locator('.knowledge-import-dialog')).toContainText(language === 'Русский' ? 'Готово к импорту' : 'Ready to import');
    for (const button of await page.locator('.knowledge-import-dialog .modal-f button').all())
      expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44);
    expect((await page.locator('.knowledge-import-counts').boundingBox()).height).toBeLessThan(80);
    expect(await page.locator('.knowledge-import-dialog').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(2);
    await page.locator('.knowledge-import-dialog .modal-f [data-a="closeModal"]').click();
    await page.locator('.knowledge-folder-card-options summary').first().click();
    await page.locator('[data-in="knowledgeSelect"]').last().focus();
    const scrollBeforeSelection = await page.locator('.knowledge-main').evaluate(el => el.scrollTop);
    const cardBeforeSelection = (await page.locator('.knowledge-preview-card').last().boundingBox()).y;
    expect(scrollBeforeSelection).toBeGreaterThan(0);
    await page.locator('[data-in="knowledgeSelect"]').last().press('Space');
    expect(await page.locator('.knowledge-main').evaluate(el => el.scrollTop)).toBeGreaterThanOrEqual(scrollBeforeSelection - 2);
    expect(Math.abs((await page.locator('.knowledge-preview-card').last().boundingBox()).y - cardBeforeSelection)).toBeLessThanOrEqual(2);
    await expect(page.locator('.knowledge-folder-card-options').first()).toHaveAttribute('open', '');
    await expectFolderTileBounds(page);
    await page.locator('.knowledge-folder-card-options summary').first().click();
    await expectFolderTileBounds(page);
    await page.locator('[data-a="clearKnowledgeSelection"]').click();
    await page.locator('.knowledge-content .knowledge-mobile-folder-button').click();
    await expect(page.locator('.knowledge-sidebar[role="dialog"]')).toBeVisible();
    await expect(page.locator('[data-in="knowledgeFolderQuery"]')).not.toBeFocused();
    await expect(page.locator('.knowledge-sidebar')).toHaveAttribute('aria-label', folderLabel);
    await page.locator('[data-in="knowledgeFolderQuery"]').fill('Guides');
    await page.locator('.knowledge-sidebar [data-a="setKnowledgeFolder"][data-folder="kb-child"]').click();
    await expect(page.locator('#knowledge-view-title')).toBeFocused();
    await expect(page.locator('#knowledge-view-title')).toHaveText('Guides');
    await expect(page.locator('.knowledge-sidebar[role="dialog"]')).toHaveCount(0);
    await expect(page.locator('.knowledge-preview-open')).toHaveCount(1);
    expect(await page.locator('.knowledge-main').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(2);
    await expect(page.locator('.knowledge-content .knowledge-mobile-folder-button')).toContainText(folderLabel);
    await page.locator('.knowledge-preview-open').click();
    await expect(page.locator('[data-a="editKnowledgeNote"]')).toHaveText(editLabel);
    await expect(page.locator('.knowledge-frontmatter>summary')).toHaveText(language === 'Русский' ? 'Метаданные исходника' : 'Source metadata');
    await expect(page.locator('.knowledge-quick-content').first()).not.toContainText('metadata-only-marker');
    await page.locator('.knowledge-frontmatter>summary').click();
    await expect(page.locator('.knowledge-frontmatter pre')).toBeVisible();
    expect((await page.locator('.knowledge-frontmatter>summary').boundingBox()).height).toBeGreaterThanOrEqual(44);
    await page.locator('.knowledge-frontmatter>summary').click();
    await expect(page.locator('.knowledge-quick-content').first().getByRole('table')).toBeVisible();
    await expect(page.locator('.knowledge-quick-content').first().getByRole('columnheader').first()).toHaveText('Раздел / Area');
    await expect.poll(async () => Math.abs((await page.locator('.knowledge-drawer').boundingBox()).x)).toBeLessThanOrEqual(1);
    const box = await page.locator('.knowledge-drawer').boundingBox();
    expect(box.x + box.width).toBeLessThanOrEqual(321);
    expect(await page.locator('.knowledge-drawer').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(2);
    await page.screenshot({ path: `output/playwright/knowledge-preview-${language === 'Русский' ? 'ru' : 'en'}-320.png` });
    await page.locator('button[data-a="closeKnowledgeDrawer"]').click();
    await page.locator('.knowledge-preview-move').click();
    await expect(page.locator('#knowledge-move-search')).not.toBeFocused();
    await expect(page.locator('#mt-knowledgeMove')).toBeFocused();
    await expect(page.locator('[data-a="confirmKnowledgeMove"]')).toBeDisabled();
    await expect(page.locator('.knowledge-move-dialog')).toContainText(language === 'Русский' ? 'Перемещение заметок' : 'Move notes');
    await page.locator('[data-a="browseKnowledgeMove"][data-folder=""]').click();
    await expect(page.locator('[data-a="confirmKnowledgeMove"]')).toBeEnabled();
    expect((await page.locator('[data-a="confirmKnowledgeMove"]').boundingBox()).height).toBeGreaterThanOrEqual(44);
    const moveBox = await page.locator('.knowledge-move-dialog').boundingBox();
    expect(moveBox.x).toBeGreaterThanOrEqual(-1);
    expect(moveBox.x + moveBox.width).toBeLessThanOrEqual(321);
    expect(await page.locator('.knowledge-move-dialog').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(2);
    await page.locator('.knowledge-move-dialog [data-a="closeModal"]').first().click();
  }
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/e2e-team/knowledge');
  await page.locator('[data-in="knowledgeSelect"][data-id="kb-a"]').check();
  await page.locator('.knowledge-bulk [data-a="moveKnowledgeNote"]').click();
  await expect(page.locator('[data-a="confirmKnowledgeMove"]')).toBeDisabled();
  await page.locator('[data-a="browseKnowledgeMove"][data-folder=""]').click();
  await page.locator('[data-a="confirmKnowledgeMove"]').click();
  await waitSaved(page);
  await page.reload();
  const updated = await (await page.request.get('/api/workspace-documents/knowledge')).json();
  expect(updated.data.knowledgeNotes.find(note => note.id === 'kb-a').folderId).toBeNull();
  await page.locator('[data-in="knowledgeSelect"][data-id="kb-a"]').check();
  await page.locator('[data-in="knowledgeSelect"][data-id="kb-b"]').check();
  await expect(page.locator('[data-a="selectKnowledgePage"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.knowledge-preview-card[data-id="kb-a"]').dragTo(page.locator('.knowledge-folder-card[data-folder="kb-parent"]'));
  await waitSaved(page);
  await page.reload();
  const dragged = await (await page.request.get('/api/workspace-documents/knowledge')).json();
  expect(dragged.data.knowledgeNotes.every(note => note.folderId === 'kb-parent')).toBeTruthy();
  const indexed = await page.request.get('/api/knowledge/search?q=original%20knowledge&folder=all&offset=0');
  expect(indexed.ok()).toBeTruthy();
  expect((await indexed.json()).ids).toEqual(['kb-a']);

  // Exercise bounded rendering, cross-page selection and path search at scale.
  const scaleSnapshot = await (await page.request.get('/api/workspace-documents/knowledge')).json();
  const scaleFolders = Array.from({ length: 550 }, (_, i) => ({
    id: `scale-folder-${i}`,
    name: i < 50 ? `Раздел ${String(i).padStart(3, '0')} / Section ${String(i).padStart(3, '0')}` : `Подпапка ${i} / Subfolder ${i}`,
    parentId: i < 50 ? null : `scale-folder-${(i - 50) % 50}`,
  }));
  const scaleNotes = Array.from({ length: 3000 }, (_, i) => ({
    id: `scale-note-${i}`,
    title: `Материал ${i} / Team note — подробный регламент команды с длинным названием / detailed team reference with a long title`,
    formatted_markdown: `Large batch marker. Материал команды. unique-${i}`,
    folderId: `scale-folder-${i % 550}`,
    updatedAt: '2026-10-20T00:00:00.000Z',
  }));
  expect(
    (
      await page.request.put('/api/workspace-documents/knowledge', {
        data: { revision: scaleSnapshot.data.revision, data: { knowledgeFolders: scaleFolders, knowledgeNotes: scaleNotes } },
      })
    ).ok(),
  ).toBeTruthy();
  for (const [language, target, parent] of [
    ['Русский', 549, '049'],
    ['English (US)', 548, '048'],
  ]) {
    await page.goto('/e2e-team/settings/language');
    await page.locator('select[data-k="lang"]').selectOption(language);
    await waitSaved(page);
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto('/e2e-team/knowledge');
    await page.locator('[data-in="knowledgeFolderLayout"]').selectOption(language === 'Русский' ? 'block' : 'inline');
    // Paging must remain usable when the activated navigation button becomes disabled.
    await expect(page.locator('.knowledge-folder-card')).toHaveCount(4);
    await page.locator('[data-a="knowledgeFolderCardPage"][data-key="next"]').press('Enter');
    await expect(page.locator('.knowledge-folder-card').first()).toBeFocused();
    await expect(page.locator('.knowledge-folder-card').first()).toHaveAttribute('data-folder', 'scale-folder-4');
    await page.locator('#knowledge-subfolder-search').fill('"Section 04"');
    await expect(page.locator('.knowledge-folder-card')).toHaveCount(4);
    await page.locator('[data-a="knowledgeFolderCardPage"][data-key="next"]').press('Enter');
    await page.locator('[data-a="knowledgeFolderCardPage"][data-key="next"]').press('Enter');
    await expect(page.locator('.knowledge-folder-card')).toHaveCount(2);
    await expect(page.locator('[data-a="knowledgeFolderCardPage"][data-key="next"]')).toBeDisabled();
    await expect(page.locator('.knowledge-folder-card').first()).toBeFocused();
    const pagedFolder = await page.locator('.knowledge-folder-card').first().boundingBox();
    expect(pagedFolder.y).toBeGreaterThanOrEqual(0);
    expect(pagedFolder.y + pagedFolder.height).toBeLessThanOrEqual(740);
    await page.locator('[data-a="knowledgeFolderCardPage"][data-key="previous"]').press('Enter');
    await expect(page.locator('.knowledge-folder-card').first()).toBeFocused();
    await page.locator('[data-a="clearKnowledgeFolderCardQuery"]').click();
    await expect(page.locator('#knowledge-subfolder-search')).toBeFocused();
    await expect(page.locator('.knowledge-folder-card').first()).toHaveAttribute('data-folder', 'scale-folder-0');
    await page.locator('[data-in="knowledgeQuery"]').fill('"Large batch marker"');
    await expect(page.locator('.knowledge-preview-card')).toHaveCount(60);
    const title = page.locator('.knowledge-preview-head strong').first();
    await expect(title).toHaveAttribute('title', scaleNotes[0].title);
    // Indexed search can replace the local result while offscreen cards are skipped.
    await expect(async () => {
      await page.locator('[data-a="focusKnowledgeNotes"]').click();
      const titleBox = await title.boundingBox();
      const timeBox = await page.locator('.knowledge-note-time').first().boundingBox();
      expect(titleBox?.width).toBeGreaterThan(150);
      expect(titleBox.height).toBeLessThanOrEqual(46);
      expect(timeBox.y).toBeGreaterThanOrEqual(titleBox.y + titleBox.height - 1);
      expect(
        await page
          .locator('.knowledge-preview-card')
          .first()
          .evaluate(el => el.scrollWidth - el.clientWidth),
      ).toBeLessThanOrEqual(2);
    }).toPass({ timeout: 10000 });
    await page.locator('[data-a="selectKnowledgePage"]').click();
    await page.locator('.knowledge-pagination [data-offset="60"]').click();
    await page.locator('[data-a="selectKnowledgePage"]').click();
    await expect(page.locator('.knowledge-selection-count b')).toHaveText('120');
    await page.locator('[data-a="clearKnowledgeQuery"]').click();
    await expect(page.locator('.knowledge-pagination .num')).toContainText('1–60');
    await expect(page.locator('.knowledge-selection-count b')).toHaveText('120');
    await page.locator('.knowledge-bulk [data-a="moveKnowledgeNote"]').click();
    await page.locator('#knowledge-move-search').fill(`${parent} "Subfolder ${target}"`);
    await expect(page.locator('.knowledge-move-row')).toHaveCount(1);
    await page.locator(`.knowledge-move-row[data-folder="scale-folder-${target}"]`).click();
    await page.locator('[data-a="confirmKnowledgeMove"]').click();
    await waitSaved(page);
    await page.reload();
    const movedScale = await (await page.request.get('/api/workspace-documents/knowledge')).json();
    expect(movedScale.data.knowledgeNotes).toHaveLength(3000);
    expect(movedScale.data.knowledgeNotes.filter(note => note.folderId === `scale-folder-${target}`)).toHaveLength(125);
    expect(
      movedScale.data.knowledgeNotes.filter(note => Number(note.id.replace('scale-note-', '')) < 120).every(note => note.folderId === `scale-folder-${target}`),
    ).toBeTruthy();
    await page.locator('.knowledge-content .knowledge-mobile-folder-button').click();
    await page.locator('[data-in="knowledgeFolderQuery"]').fill(`${parent} "Subfolder ${target}"`);
    await page.locator(`.knowledge-sidebar [data-a="setKnowledgeFolder"][data-folder="scale-folder-${target}"]`).click();
    await expect(page.locator('#knowledge-view-title')).toBeFocused();
    await expect(page.locator('.knowledge-preview-card')).toHaveCount(60);
    await expect(page.locator('.knowledge-folder-browser')).toHaveClass(/knowledge-folder-browser-compact/);
    const compactFolders = language === 'Русский' ? page.locator('.knowledge-folder-browser') : page.locator('.knowledge-folder-browser-head');
    expect((await compactFolders.boundingBox()).height).toBeLessThanOrEqual(64);
    await expect(page.locator('.knowledge-notes-section-head>span')).toHaveCount(0);
    expect(await page.locator('.knowledge-main').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(2);
    await page.screenshot({ path: `output/playwright/knowledge-scale-move-${language === 'Русский' ? 'ru' : 'en'}-320.png` });
    await page.locator('.knowledge-breadcrumbs [data-a="setKnowledgeFolder"]').first().click();
    await page.locator('[data-in="knowledgeQuery"]').fill('"unique-2999"');
    await expect(page.locator('.knowledge-preview-card')).toHaveCount(1);
    await expect(page.locator('.knowledge-preview-card')).toHaveAttribute('data-id', 'scale-note-2999');
  }
});
