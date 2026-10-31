import { expect, test } from '@playwright/test';

test.setTimeout(360000);
test.use({ actionTimeout: 15000 });
const saved = async page => {
  await page.waitForTimeout(700);
  await expect(page.locator('#sync-indicator')).toHaveAttribute('data-state', 'saved');
};
const overflow = async page => expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);

test('audit eight: authored palette text, select and folder focus, graph context and mobile controls', async ({ page }) => {
  await page.goto('/');
  await page.locator('#l-access').fill('e2e-access-id-2026-secure');
  await page.locator('#login-btn').click();
  await page.locator('#o-ws:visible,.shell:visible').first().waitFor();
  if (await page.locator('#o-ws').isVisible()) {
    await page.locator('#o-ws').fill('E2E Команда');
    await page.locator('#o-url').fill('e2e-team');
    await page.locator('#onb-next').click();
    await page.locator('#onb-next').click();
    await page.locator('#o-proj').fill('Design');
    await page.locator('#onb-next').click();
    await page.locator('[data-a="onbNext"][data-skip="1"]').click();
    await page.locator('[data-a="onbFinish"]').click();
  }
  await expect(page.locator('.shell')).toBeVisible();
  await page.locator('#main-content [data-a="newTask"]').first().click();
  await page.locator('#f-title').fill('Frontend сайта');
  await page.locator('#f-submit').click();
  await saved(page);
  const core = (await (await page.request.get('/api/workspace')).json()).data;
  const authoredTask = core.tasks.find(task => task.title === 'Frontend сайта');
  authoredTask.assignee = core.me;
  core.projects.find(project => project.id === authoredTask.project).name = 'Design';
  expect((await page.request.put('/api/workspace', { data: { revision: core.revision, data: core } })).ok()).toBeTruthy();
  const knowledge = (await (await page.request.get('/api/workspace-documents/knowledge')).json()).data;
  const folders = Array.from({ length: 30 }, (_, i) => ({ id: `audit8-folder-${i}`, name: `Folder ${i}` }));
  folders[1].name = 'Beta directory';
  const notes = Array.from({ length: 24 }, (_, i) => ({
    id: `audit8-note-${i}`,
    title: i < 3 ? 'Home' : `Note ${i}`,
    folderId: folders[i === 2 ? 0 : i].id,
    formatted_markdown: '# Test',
    category: 'General',
    summary: i === 0 ? '' : `Summary ${i}`,
    tags: [],
  }));
  expect(
    (
      await page.request.put('/api/workspace-documents/knowledge', {
        data: { revision: knowledge.revision, data: { knowledgeNotes: notes, knowledgeFolders: folders } },
      })
    ).ok(),
  ).toBeTruthy();

  for (const language of ['Русский', 'English (US)']) {
    console.log(`Audit8 locale: ${language}`);
    const ru = language === 'Русский';
    await page.setViewportSize({ width: 1366, height: 767 });
    await page.goto('/e2e-team/settings/language');
    // Real keyboard selection, including a different option and full render.
    await page.locator('select[data-k="lang"] + button').click();
    await page.locator('.select-menu [role="option"]').filter({ hasText: language }).press('Enter');
    await expect(page.locator('html')).toHaveAttribute('lang', ru ? 'ru' : 'en');
    await expect(page.locator('select[data-k="lang"] + button')).toBeFocused();
    await saved(page);

    let releaseConnections;
    const connectionsGate = new Promise(resolve => {
      releaseConnections = resolve;
    });
    let heldConnections = false;
    await page.route('**/api/graph/query', async route => {
      if (!heldConnections && route.request().postDataJSON()?.includeArchived === true) {
        heldConnections = true;
        const response = await route.fetch();
        await connectionsGate;
        await route.fulfill({ response });
      } else await route.continue();
    });
    await page.goto('/e2e-team/graph');
    await page.locator('#graph-locate + button').click();
    await expect(page.locator('.select-menu input')).toBeFocused();
    const home = page.locator('.select-menu [role="option"]').filter({ hasText: 'Home' });
    await expect(home).toHaveCount(3);
    expect(new Set(await home.allTextContents()).size).toBe(3);
    await page.locator('.select-menu input').fill('Home Beta');
    await expect(page.locator('.select-menu [role="option"]')).toHaveCount(1);
    await page.locator('.select-menu [role="option"]').press('Enter');
    await expect(page.locator('#graph-locate + button')).toBeFocused();
    await expect(page.locator('#graph-locate')).toHaveValue('note:audit8-note-1');
    await page.locator('#graph-locate + button').press('Space');
    await page.locator('.select-menu input').fill('Frontend');
    await page.locator('.select-menu input').press('ArrowDown');
    await expect.poll(() => heldConnections).toBe(true);
    const connectionsDone = page.waitForResponse(
      response => response.url().endsWith('/api/graph/query') && response.request().postDataJSON()?.includeArchived === true,
    );
    releaseConnections();
    await connectionsDone;
    await expect(page.locator('.relations-panel [role="status"]')).toHaveCount(0);
    await expect(page.locator('.select-menu input')).toHaveValue('Frontend');
    await expect(page.locator('.select-menu [role="option"]')).toBeFocused();
    await page.unroute('**/api/graph/query');
    await page.locator('.select-menu input').press('Escape');
    await expect(page.locator('#graph-locate + button')).toBeFocused();

    for (const [width, height] of [
      [320, 676],
      [390, 845],
      [767, 1024],
      [844, 390],
      [1024, 767],
      [1366, 767],
      [1920, 1080],
    ]) {
      console.log(`Audit8 viewport: ${width}x${height}`);
      await page.setViewportSize({ width, height });
      await page.goto('/e2e-team/knowledge');
      if (await page.locator('.knowledge-folder-title-button').isVisible()) {
        await page.locator('.knowledge-folder-title-button').click();
        await page.locator('.knowledge-sidebar [data-a="setKnowledgeFolder"][data-folder="all"]').click();
        await expect(page.locator('#knowledge-view-title')).toBeFocused();
        await page.locator('.knowledge-folder-title-button').click();
        await page.keyboard.press('Escape');
        await expect(page.locator('.knowledge-folder-title-button')).toBeFocused();
        if (width === 320) {
          const folders = page.locator('.knowledge-folder-disclosure');
          if ((await folders.count()) && (await folders.getAttribute('open')) === null) await folders.locator(':scope > summary').click();
          await page.locator('.knowledge-folder-card').first().click();
          await expect(page.locator('#knowledge-view-title')).toBeFocused();
          await page.locator('.knowledge-folder-title-button').click();
          await page.locator('.knowledge-sidebar [data-a="setKnowledgeFolder"][data-folder="all"]').click();
        }
      }
      await overflow(page);
      await page.locator('.topbar [data-a="openPalette"]').click();
      await page.locator('#pal-in').fill('Frontend');
      await expect(page.locator('.pi > .trunc').filter({ hasText: 'Frontend сайта' })).toHaveCount(1);
      await expect(page.locator('.pi .sub').filter({ hasText: 'Design' })).toHaveCount(1);
      await expect(
        page.locator('.pi > .trunc').filter({ hasText: ru ? 'Все результаты по запросу «Frontend»' : 'View all results for “Frontend”' }),
      ).toHaveCount(1);
      await expect(page.locator('.pi mark').first()).toHaveText('Frontend');
      for (const search of [false, true]) {
        if (search) await page.locator('#pal-in').press('Tab');
        expect(await page.locator('.pal-f').evaluate(e => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(1);
      }
      if (width === 320) {
        await page.locator('#pal-in').fill('Home');
        await expect(page.locator('.pi > .trunc').filter({ hasText: /^Home$/ })).toHaveCount(3);
        await expect(page.locator('.pi .sub').filter({ hasText: ru ? /^Общие$/ : /^General$/ })).toHaveCount(1);
      }
      await page.locator('#pal-in').press('Escape');
      await page.locator('.topbar [data-a="openPalette"]').click();
      await page.locator('#pal-in').fill(ru ? 'создать задачу' : 'create task');
      await expect(
        page
          .locator('.pi')
          .filter({ hasText: ru ? 'Создать задачу' : 'Create task' })
          .first(),
      ).toBeVisible();
      await page.locator('#pal-in').press('Enter');
      await expect(page.locator('#f-title')).toBeVisible();
      await page.locator('.task-form-footer [data-a="closeModal"]').click();

      await page.goto('/e2e-team/tasks');
      await page.locator('#main-content [data-a="newTask"]').first().click();
      await expect(page.locator('.modal [data-pop="labels"]')).toHaveAccessibleName(ru ? 'Метки: Не выбраны' : 'Labels: No labels selected');
      await expect(page.locator('.modal [data-pop="recur"]')).toHaveAccessibleName(ru ? 'Повтор: Не повторяется' : 'Repeat: Does not repeat');
      await page.locator('.modal [data-pop="labels"]').click();
      await expect(page.locator('#pop-q')).toHaveAccessibleName(ru ? 'Поиск меток…' : 'Filter labels…');
      for (const query of [ru ? 'Фронтенд' : 'Frontend', 'Frontend']) {
        await page.locator('#pop-q').fill(query);
        await expect(page.locator('.pop [data-v="frontend"]')).toBeVisible();
      }
      await page.locator('#pop-q').fill('no-such-label');
      await expect(page.locator('.pop')).toContainText(ru ? 'Совпадений нет' : 'No matches');
      await page.locator('#pop-q').press('Escape');
      await page.locator('#f-sub').fill('Typed subtask');
      await expect(page.locator('#f-sub')).toHaveAccessibleName(ru ? 'Добавить подзадачу' : 'Add subtask');
      if (width <= 390) {
        const cancel = await page.locator('.task-form-footer [data-a="closeModal"]').boundingBox();
        const submit = await page.locator('#f-submit').boundingBox();
        expect(Math.abs(cancel.y - submit.y)).toBeLessThanOrEqual(1);
        expect(submit.x).toBeGreaterThan(cancel.x);
        expect(await page.locator('.task-form-footer').evaluate(e => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(1);
        expect((await page.locator('.task-form-footer').boundingBox()).height).toBeLessThan(90);
      }
      await page.locator('.task-form-footer [data-a="closeModal"]').click();
      await overflow(page);
      await page.goto(`/e2e-team/member/${core.me}`);
      await expect(page.locator('.member-profile-actions')).toBeVisible();
      for (const box of await page.locator('.member-profile-actions > *').evaluateAll(elements =>
        elements.map(element => {
          const r = element.getBoundingClientRect();
          return { left: r.left, right: r.right };
        }),
      )) {
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(width + 1);
      }
      await page.locator('[data-k="memTab"][data-v="assigned"]').press('End');
      await expect(page.locator('[data-k="memTab"][data-v="completed"]')).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.locator('#member-tasks-panel')).toHaveAttribute('aria-labelledby', 'member-tasks-tab-completed');
      await expect(page.locator('[data-k="memTab"][data-v="completed"]')).toHaveAttribute('aria-selected', 'true');
      await page.locator('[data-k="memTab"][data-v="assigned"]').click();
      if (width <= 767) {
        const target = await page.locator('.mini-complete-target').first().boundingBox();
        expect(target.width).toBeGreaterThanOrEqual(44);
        expect(target.height).toBeGreaterThanOrEqual(44);
        const more = await page.locator('.member-profile-actions > .ibtn').boundingBox();
        expect(more.width).toBeGreaterThanOrEqual(44);
        expect(more.height).toBeGreaterThanOrEqual(44);
      }
      if (width === 320) {
        await page.locator(`.mini[data-id="${authoredTask.id}"] .mini-complete-target`).click({ position: { x: 2, y: 2 } });
        await expect(page.locator('.drawer')).toHaveCount(0);
        await expect(page.locator(`.mini[data-id="${authoredTask.id}"]`)).toHaveCount(0);
        await saved(page);
        expect((await (await page.request.get('/api/workspace')).json()).data.tasks.find(task => task.id === authoredTask.id).status).toBe('done');
        await page.locator('[data-k="memTab"][data-v="completed"]').click();
        await page.locator(`.mini[data-id="${authoredTask.id}"] .mini-complete-target`).click({ position: { x: 2, y: 2 } });
        await page.locator('[data-k="memTab"][data-v="assigned"]').click();
        await saved(page);
      }
      await overflow(page);
      await page.goto('/e2e-team/tasks');
    }

    await page.locator('#main-content [data-a="newTask"]').first().click();
    await page.locator('.modal [data-pop="labels"]').click();
    await page.locator('.pop [data-a="popToggleLabel"][data-v="frontend"]').click();
    await page.locator('.pop [data-a="popToggleLabel"][data-v="frontend"]').press('Escape');
    await expect(page.locator('.modal [data-pop="labels"]')).toHaveAccessibleName(ru ? 'Метки: Frontend' : 'Labels: Frontend');
    await page.locator('.modal [data-pop="recur"]').click();
    await page.locator('.pop [data-v="Weekly"]').click();
    await expect(page.locator('.modal [data-pop="recur"]')).toHaveAccessibleName(ru ? 'Повтор: Еженедельно' : 'Repeat: Weekly');
    await page.locator('.task-form-footer [data-a="closeModal"]').click();

    await page.setViewportSize({ width: 390, height: 845 });
    for (const [route, selector] of [
      ['graph', '.graph-legend-disclosure > summary'],
      ['files', '.files-details > summary'],
      ['mytasks', '.tlist button.addrow'],
      ['activity', '.fitem .obj'],
    ]) {
      await page.goto(`/e2e-team/${route}`);
      await page.locator(selector).first().waitFor();
      await expect.poll(async () => (await page.locator(selector).first().boundingBox())?.height || 0, { message: selector }).toBeGreaterThanOrEqual(44);
      await overflow(page);
    }
    await page.goto('/e2e-team/files');
    await page.locator('.files-filter-options > summary').click();
    await page.locator('#workspace-file-sort + button').click();
    await page.getByRole('option', { name: ru ? 'Название' : 'Name', exact: true }).press('Enter');
    await expect(page.locator('.file-page-loading')).toHaveCount(0);
    await expect(page.locator('.files-filter-options > summary')).toBeFocused();
    await page.locator('.files-filter-options > summary').click();
    await page.locator('#workspace-file-sort + button').click();
    await page.getByRole('option', { name: ru ? 'Сначала новые' : 'Newest', exact: true }).click();
    await expect(page.locator('.file-page-loading')).toHaveCount(0);
    await expect(page.locator('.files-filter-options > summary')).toBeFocused();
    // Select triggers in a newly opened project modal also keep keyboard focus.
    await page.goto('/e2e-team/projects');
    await page.locator('#main-content [data-a="newProject"]').first().click();
    await page.locator('#p-lead + button').click();
    await page.locator('.select-menu [role="option"]').first().press('Escape');
    await expect(page.locator('#p-lead + button')).toBeFocused();
    await page.locator('.modal-f [data-a="closeModal"]').click();
  }
});
