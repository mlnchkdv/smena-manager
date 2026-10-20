import { expect, test } from '@playwright/test';
test.setTimeout(180000);
const waitSaved = async page => {
  await page.waitForTimeout(500);
  await expect(page.locator('#sync-indicator')).toHaveAttribute('data-state', 'saved', { timeout: 15000 });
};
test('knowledge reading editing history search and mobile folders work in Russian and English', async ({ page }) => {
  await page.goto('/');
  await page.locator('#l-access').fill('e2e-access-id-2026-secure');
  await page.locator('#login-btn').click();
  await page.locator('#o-ws:visible,.shell:visible').first().waitFor();
  if (await page.locator('#o-ws').isVisible()) {
    await page.locator('#o-ws').fill('Knowledge review');
    await page.locator('#o-url').fill('e2e-team');
    await page.locator('#onb-next').click();
    await page.locator('#onb-next').click();
    await page.locator('#o-proj').fill('Knowledge');
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
    ],
    knowledgeNotes: [
      {
        id: 'kb-a',
        title: 'Knowledge Alpha',
        formatted_markdown: '# Guide\n\nOriginal knowledge content\n\n[[Knowledge Beta]]',
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
  await page.locator('[data-a="editKnowledgeNote"]').click();
  await page.locator('#knowledge-body').fill('Updated knowledge body');
  await waitSaved(page);
  await expect(page.locator('[data-knowledge-save-status]')).toHaveText('Сохранено');
  await page.reload();
  await expect(page.locator('.knowledge-preview-open')).toHaveCount(2);
  await page.locator('.knowledge-preview-open').filter({ hasText: 'Knowledge Alpha' }).click();
  await expect(page.locator('.knowledge-quick-content').first()).toContainText('Updated knowledge body');
  await page.locator('[data-a="editKnowledgeNote"]').click();
  await page.locator('.knowledge-history>summary').click();
  await expect(page.locator('[data-a="restoreKnowledgeVersion"]').first()).toBeVisible();
  await page.locator('[data-a="restoreKnowledgeVersion"]').first().click();
  await page.locator('[data-a="confirmOk"]').click();
  await waitSaved(page);
  await page.reload();
  await page.locator('.knowledge-preview-open').filter({ hasText: 'Knowledge Alpha' }).click();
  await expect(page.locator('.knowledge-quick-content').first()).toContainText('Original knowledge content');
  await page.locator('button[data-a="closeKnowledgeDrawer"]').click();
  for (const [language, folderLabel, editLabel] of [
    ['Русский', 'Папки', 'Редактировать заметку'],
    ['English (US)', 'Folders', 'Edit note'],
  ]) {
    await page.goto('/e2e-team/settings/language');
    await page.locator('select[data-k="lang"]').selectOption(language);
    await waitSaved(page);
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto('/e2e-team/knowledge');
    await page.locator('.knowledge-folder-card-options summary').first().click();
    await page.locator('[data-in="knowledgeSelect"]').last().focus();
    const scrollBeforeSelection = await page.locator('.knowledge-main').evaluate(el => el.scrollTop);
    expect(scrollBeforeSelection).toBeGreaterThan(0);
    await page.locator('[data-in="knowledgeSelect"]').last().press('Space');
    expect(await page.locator('.knowledge-main').evaluate(el => el.scrollTop)).toBeGreaterThanOrEqual(scrollBeforeSelection - 2);
    await expect(page.locator('.knowledge-folder-card-options').first()).toHaveAttribute('open', '');
    await page.locator('.knowledge-folder-card-options summary').first().click();
    await page.locator('[data-a="clearKnowledgeSelection"]').click();
    await page.locator('.knowledge-content .knowledge-mobile-folder-button').click();
    await expect(page.locator('.knowledge-sidebar[role="dialog"]')).toBeVisible();
    await expect(page.locator('[data-in="knowledgeFolderQuery"]')).not.toBeFocused();
    await expect(page.locator('.knowledge-sidebar')).toHaveAttribute('aria-label', folderLabel);
    await page.locator('[data-in="knowledgeFolderQuery"]').fill('Guides');
    await page.locator('.knowledge-sidebar [data-a="setKnowledgeFolder"][data-folder="kb-child"]').click();
    await expect(page.locator('.knowledge-preview-open')).toHaveCount(1);
    expect(await page.locator('.knowledge-main').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(2);
    await expect(page.locator('.knowledge-content .knowledge-mobile-folder-button')).toContainText(folderLabel);
    await page.locator('.knowledge-preview-open').click();
    await expect(page.locator('[data-a="editKnowledgeNote"]')).toHaveText(editLabel);
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
  await page.locator('.knowledge-preview-card[data-id="kb-a"]').dragTo(page.locator('.knowledge-folder-card[data-folder="kb-parent"]'));
  await waitSaved(page);
  await page.reload();
  const dragged = await (await page.request.get('/api/workspace-documents/knowledge')).json();
  expect(dragged.data.knowledgeNotes.every(note => note.folderId === 'kb-parent')).toBeTruthy();
  const indexed = await page.request.get('/api/knowledge/search?q=original%20knowledge&folder=all&offset=0');
  expect(indexed.ok()).toBeTruthy();
  expect((await indexed.json()).ids).toEqual(['kb-a']);
});
