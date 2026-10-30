import { expect, test } from '@playwright/test';

test.setTimeout(360000);
test.use({ video: 'on-first-retry', trace: 'retain-on-failure', actionTimeout: 15000 });

const saved = async page => {
  await page.waitForTimeout(650);
  await expect(page.locator('#sync-indicator')).toHaveAttribute('data-state', 'saved');
};
const noOverflow = async page => expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);

test('audit six: calendar clearance, anchored menus, mobile folders and catalog states in both languages', async ({ page }) => {
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
  await saved(page);
  const knowledge = (await (await page.request.get('/api/workspace-documents/knowledge')).json()).data;
  expect(
    (
      await page.request.put('/api/workspace-documents/knowledge', {
        data: {
          revision: knowledge.revision,
          data: { knowledgeNotes: [], knowledgeFolders: Array.from({ length: 25 }, (_, i) => ({ id: `audit6-folder-${i}`, name: `Folder ${i}` })) },
        },
      })
    ).ok(),
  ).toBeTruthy();
  const core = (await (await page.request.get('/api/workspace')).json()).data;
  const project = core.projects[0];
  core.files.push({ id: 'audit6-file', name: 'audit6.txt', type: 'doc', project: project.id, bytes: 10, by: core.me, at: Date.now() });
  expect((await page.request.put('/api/workspace', { data: { revision: core.revision, data: core } })).ok()).toBeTruthy();
  const bookmarks = (await (await page.request.get('/api/workspace-documents/bookmarks')).json()).data;
  const links = ['low', 'medium', 'high', 'critical'].map(importance => ({
    id: `audit6-${importance}`,
    title: importance,
    url: `https://example.test/${importance}`,
    importance,
    created_at: new Date().toISOString(),
  }));
  expect(
    (await page.request.put('/api/workspace-documents/bookmarks', { data: { revision: bookmarks.revision, data: { links, linkFolders: [] } } })).ok(),
  ).toBeTruthy();

  for (const language of ['Русский', 'English (US)']) {
    const ru = language === 'Русский';
    await page.goto('/e2e-team/settings/language');
    await page.locator('select[data-k="lang"]').selectOption(language);
    await saved(page);
    await page.goto('/e2e-team/calendar');
    for (const [width, height] of [
      [320, 676],
      [390, 845],
      [767, 1024],
      [1024, 767],
      [1366, 767],
      [1920, 1080],
    ]) {
      await page.setViewportSize({ width, height });
      await page.locator('.cal-views [data-v="month"]').click();
      await page.locator('.cal-g > .cday').last().scrollIntoViewIfNeeded();
      await page.locator('#main-content').press('Control+End');
      await expect
        .poll(() =>
          page.evaluate(() => {
            const last = document.querySelector('.cal-g').lastElementChild.getBoundingClientRect();
            const nav = document.querySelector('.bottomnav').getBoundingClientRect();
            return last.bottom - (nav.height ? nav.top : innerHeight);
          }),
        )
        .toBeLessThanOrEqual(1);
      await noOverflow(page);
    }
    await page.setViewportSize({ width: 320, height: 676 });
    const seen = new Set();
    for (let i = 0; i < 14 && seen.size < 3; i++) {
      seen.add(await page.locator('.cal-g').evaluate(e => Number(e.style.getPropertyValue('--cal-weeks'))));
      await page.locator('.cal-g > .cday').last().scrollIntoViewIfNeeded();
      await page.locator('#main-content').press('Control+End');
      await expect
        .poll(() => page.locator('.cal-g').evaluate(e => e.getBoundingClientRect().bottom - document.querySelector('.bottomnav').getBoundingClientRect().top))
        .toBeLessThanOrEqual(1);
      await page.locator('[data-a="calNav"][data-d="1"]').click();
    }
    expect([...seen].sort()).toEqual([4, 5, 6]);
    await page.locator('[data-a="calNav"][data-d="0"]').click();

    await page.setViewportSize({ width: 1366, height: 500 });
    await page.goto('/e2e-team/knowledge');
    const menu = page.locator('.knowledge-folder-menu').first();
    await menu.locator('summary').click();
    await expect(menu).toHaveAttribute('open');
    await page.locator('.knowledge-folders').evaluate(e => e.scrollBy(0, 160));
    await expect(menu).not.toHaveAttribute('open');
    for (const [width, height] of [
      [320, 676],
      [390, 845],
      [844, 390],
    ]) {
      await page.setViewportSize({ width, height });
      await page.locator('.knowledge-folder-title-button').click();
      await expect(page.locator('.knowledge-shell')).toHaveClass(/folders-open/);
      if (height > 480)
        expect(
          await page
            .locator('.knowledge-sidebar')
            .evaluate(e => e.querySelector('.knowledge-folders').getBoundingClientRect().height / e.getBoundingClientRect().height),
        ).toBeGreaterThan(0.6);
      expect(
        await page
          .locator('.knowledge-folders [data-a="setKnowledgeFolder"]')
          .first()
          .evaluate(e => e.getBoundingClientRect().height),
      ).toBeGreaterThanOrEqual(43);
      await noOverflow(page);
      await page.locator('.knowledge-sidebar [data-a="toggleKnowledgeMobileFolders"]').click();
    }

    await page.setViewportSize({ width: 320, height: 676 });
    await page.goto('/e2e-team/bookmarks');
    await expect(page.locator('.bookmark-importance')).toHaveCount(4);
    for (const label of await page.locator('.bookmark-importance span').all()) await expect(label).toBeVisible();
    await expect(page.locator('.bookmark-importance').first()).toHaveAttribute('aria-label', new RegExp(ru ? 'Важность' : 'Importance'));
    await noOverflow(page);

    let release;
    let intercepted = false;
    const gate = new Promise(resolve => {
      release = resolve;
    });
    await page.route('**/api/files/catalog/query', async route => {
      intercepted = true;
      await gate;
      await route.continue();
    });
    try {
      await page.goto('/e2e-team/files');
      await expect(page.locator('.file-page-loading')).toBeVisible();
      await expect.poll(() => intercepted).toBeTruthy();
      await expect(page.locator('.file-skeleton-card')).toHaveCount(3);
      await expect(page.locator('.files-upload-target')).toContainText(ru ? 'Загрузить в:' : 'Upload to:');
      await expect(page.locator('.files-upload-target > span')).toBeVisible();
      await noOverflow(page);
      await page.locator('.files-filter-options > summary').click();
      await page.locator('.files-view-switch [data-v="list"]').click();
      await expect(page.locator('.file-skeleton-row')).toHaveCount(5);
      if ((await page.locator('.files-filter-options').getAttribute('open')) === null) await page.locator('.files-filter-options > summary').click();
      await page.locator('.files-view-switch [data-v="grid"]').click();
      await page.keyboard.press('Escape');
    } finally {
      release();
    }
    await expect(page.locator('.file-page-loading')).toHaveCount(0);
    await expect(page.locator('.workspace-file-card')).toHaveCount(1);
    await page.unroute('**/api/files/catalog/query');

    await page.route('**/api/files/catalog/query', route => route.fulfill({ status: 503, json: { error: 'private-provider-message' } }));
    await page.locator('#workspace-file-q').fill('audit6-failed-query');
    await expect(page.locator('.file-page-pending[role="alert"]')).toBeVisible();
    await expect(page.locator('.file-page-pending')).not.toContainText('private-provider-message');
    await expect(page.locator('.workspace-file-card')).toHaveCount(0);
    await page.unroute('**/api/files/catalog/query');
    await page.locator('[data-a="retryFileCatalog"]').click();
    await expect(page.locator('.file-page-pending')).toHaveCount(0);
    await expect(page.locator('.file-page-loading')).toHaveCount(0);
    await expect(page.locator('.empty-state')).toBeVisible();
    await page.reload();
    await expect(page.locator('.shell')).toBeVisible();
  }
});
