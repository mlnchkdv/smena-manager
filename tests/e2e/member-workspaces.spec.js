import { expect, test } from '@playwright/test';

test.setTimeout(240000);
test.use({ actionTimeout: 15000 });

const saved = async page => {
  await page.waitForTimeout(700);
  await expect(page.locator('#sync-indicator')).toHaveAttribute('data-state', 'saved');
};

test('an ordinary member creates and configures owned workspaces without gaining source administration', async ({ page, browser }) => {
  await page.goto('/');
  await page.locator('#l-access').fill('e2e-access-id-2026-secure');
  await page.locator('#login-btn').click();
  await page.locator('#o-ws:visible,.shell:visible').first().waitFor();
  if (await page.locator('#o-ws').isVisible()) {
    await page.locator('#o-ws').fill('E2E Команда');
    await page.locator('#o-url').fill('e2e-team');
    await page.locator('#onb-next').click();
    await page.locator('#onb-next').click();
    await page.locator('#o-proj').fill('Source project');
    await page.locator('#onb-next').click();
    await page.locator('[data-a="onbNext"][data-skip="1"]').click();
    await page.locator('[data-a="onbFinish"]').click();
  }
  await saved(page);
  const source = (await (await page.request.get('/api/workspace')).json()).data;
  const sourceKnowledge = (await (await page.request.get('/api/workspace-documents/knowledge')).json()).data;
  const memberContext = await browser.newContext();
  const member = await memberContext.newPage();
  try {
    await member.goto('/e2e-team');
    await member.locator('#l-access').fill('e2e-editor-access-id-2026-secure');
    await member.locator('#login-btn').click();
    await expect(member.locator('.shell')).toBeVisible();
    for (const language of ['Русский', 'English (US)']) {
      console.log(`Member-owned workspace: ${language}`);
      const ru = language === 'Русский';
      await member.setViewportSize({ width: 1366, height: 767 });
      await member.goto('/e2e-team/settings/language');
      await member.locator('select[data-k="lang"]').selectOption(language);
      await saved(member);
      await expect(member.locator('.set-nav [data-sec="workspace"]')).toHaveCount(0);
      await member.locator('.side [data-pop="ws"]').click();
      await expect(member.locator('.pop [data-a="newWorkspace"]')).toBeVisible();
      await expect(member.locator('.pop [data-sec="workspace"]')).toHaveCount(0);
      await member.locator('.pop [data-a="newWorkspace"]').click();
      for (const [width, height] of [
        [320, 676],
        [390, 845],
        [767, 1024],
        [1366, 767],
      ]) {
        await member.setViewportSize({ width, height });
        await expect(member.locator('.workspace-create-dialog')).toBeVisible();
        expect(await member.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      }
      // Submit and save on a genuinely narrow layout, not only inspect its form.
      await member.setViewportSize({ width: ru ? 320 : 390, height: 845 });
      const name = ru ? 'Личное пространство участника' : 'Member workspace';
      await member.locator('#new-ws-name').fill('   ');
      await member.locator('.workspace-create-dialog button[type="submit"]').click();
      await expect(member.locator('#new-ws-name')).toBeFocused();
      await expect(member.locator('#new-ws-name')).toHaveAttribute('aria-invalid', 'true');
      await expect(member.locator('#new-ws-name-error')).toBeVisible();
      await member.locator('#new-ws-name').fill(name);
      await expect(member.locator('#new-ws-name-error')).toHaveCount(0);
      await member.locator('#new-ws-description').fill('Owner-only settings test');
      await expect(member.locator('.workspace-create-dialog')).toContainText(ru ? 'Вы станете владельцем.' : 'You become the owner.');
      await member.locator('.workspace-create-dialog button[type="submit"]').click();
      await expect(member).toHaveURL(/\/settings\/workspace$/);
      await expect(member.locator('#ws-name')).toHaveValue(name);
      await expect(member.locator('html')).toHaveAttribute('lang', ru ? 'ru' : 'en');
      const ownedPath = new URL(member.url()).pathname;
      await member.locator('#ws-name').fill(name + ' updated');
      await expect(member.locator('#sync-indicator .sync-label')).toContainText(ru ? 'несохранённые' : 'Unsaved');
      const actions = await member.locator('.workspace-settings-actions').boundingBox();
      const bottomNav = await member.locator('.bottomnav').boundingBox();
      expect(actions.y).toBeGreaterThan(50);
      expect(actions.y + actions.height).toBeLessThanOrEqual(bottomNav.y);
      await member.locator('#ws-description').fill('Persisted owner changes');
      await member.locator('#ws-save').click();
      await saved(member);
      await member.reload();
      await expect(member.locator('#ws-name')).toHaveValue(name + ' updated');
      await expect(member.locator('#ws-description')).toHaveValue('Persisted owner changes');
      await expect(member.locator('html')).toHaveAttribute('lang', ru ? 'ru' : 'en');
      const directory = (await (await member.request.get('/api/workspaces')).json()).workspaces;
      await member.screenshot({ path: `output/playwright/member-owned-workspaces-2026-10-31/${ru ? 'ru' : 'en'}-settings-mobile.png` });
      expect(directory.find(item => item.url === ownedPath.split('/')[1]).role).toBe('admin');
      expect(directory.find(item => item.id === 'default').role).toBe('editor');
      const ownEntry = directory.find(item => item.url === ownedPath.split('/')[1]);
      for (const [width, height] of [
        [320, 676],
        [390, 845],
        [767, 1024],
        [1366, 767],
      ]) {
        await member.setViewportSize({ width, height });
        await expect(member.locator('#ws-name')).toBeEditable();
        await expect(member.locator('#ws-url')).toHaveAttribute('readonly', '');
        expect((await member.locator('#ws-url').boundingBox()).width).toBeGreaterThan(240);
        await expect(member.locator('.workspace-copy-link')).toHaveAttribute('data-text', new URL(`/${ownEntry.url}`, member.url()).href);
        expect(await member.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      }
      await member.setViewportSize({ width: ru ? 320 : 390, height: 845 });
      await member.goto(`/${ownEntry.url}/projects`);
      await member.locator('#main-content [data-a="newProject"]').first().click();
      const projectName = ru ? 'Проект в личном пространстве' : 'Personal workspace project';
      await member.locator('#p-name').fill(projectName);
      await member.locator('[data-a="pformSet"][data-v="blank"]').click();
      await member.locator('.modal-f [data-a="submitProject"]').click();
      await saved(member);
      const headers = { 'X-Smena-Workspace': ownEntry.id };
      const ownCore = (await (await member.request.get('/api/workspace', { headers })).json()).data;
      const project = ownCore.projects.find(item => item.name === projectName);
      expect(project).toBeTruthy();
      await member.goto(`/${ownEntry.url}/project/${project.id}`);
      await member.locator('#main-content [data-a="newTask"]').first().click();
      const taskName = ru ? 'Личная задача — проверка изоляции' : 'Personal task — isolation check';
      await member.locator('#f-title').fill(taskName);
      await member.locator('#f-submit').click();
      await saved(member);
      await member.reload();
      await expect(member.locator('#main-content')).toContainText(taskName);
      const document = (await (await member.request.get('/api/workspace-documents/knowledge', { headers })).json()).data;
      const noteTitle = ru ? 'Личная заметка — проверка изоляции' : 'Personal note — isolation check';
      expect(
        (
          await member.request.put('/api/workspace-documents/knowledge', {
            headers,
            data: {
              revision: document.revision,
              data: {
                knowledgeFolders: [],
                knowledgeNotes: [{ id: 'owned-note', title: noteTitle, formatted_markdown: '# Independent workspace content', tags: [], category: 'General' }],
              },
            },
          })
        ).ok(),
      ).toBeTruthy();
      await member.goto(`/${ownEntry.url}/knowledge`);
      await expect(member.getByText(noteTitle, { exact: true }).first()).toBeVisible();
      await member.reload();
      await expect(member.getByText(noteTitle, { exact: true }).first()).toBeVisible();
      await expect(member.locator('html')).toHaveAttribute('lang', ru ? 'ru' : 'en');
      await member.screenshot({ path: `output/playwright/member-owned-workspaces-2026-10-31/${ru ? 'ru' : 'en'}-knowledge-mobile.png` });
      expect((await page.request.get('/api/workspace', { headers })).status()).toBe(403);
      expect((await page.request.get('/api/workspace-documents/knowledge', { headers })).status()).toBe(403);
      expect((await (await page.request.get('/api/workspaces')).json()).workspaces.some(item => item.id === ownEntry.id)).toBe(false);
      await saved(member);
      await member.locator('.workspace-context[data-pop="ws"]').click();
      await member.locator('.pop [data-a="switchWs"][data-v="default"]').click();
      await expect(member).toHaveURL(/\/e2e-team\/home$/);
      await expect(member.locator('html')).toHaveAttribute('lang', ru ? 'ru' : 'en');
      await member.goto('/e2e-team/knowledge');
      await expect(member.locator('.knowledge-shell')).toBeVisible();
      await expect(member.getByText(noteTitle, { exact: true })).toHaveCount(0);
      await member.locator('.workspace-context[data-pop="ws"]').click();
      await member.locator(`.pop [data-a="switchWs"][data-v="${ownEntry.id}"]`).click();
      await expect(member).toHaveURL(new RegExp(`/${ownEntry.url}/home$`));
      await member.goto(`/${ownEntry.url}/knowledge`);
      await expect(member.getByText(noteTitle, { exact: true }).first()).toBeVisible();
      await member.goto('/e2e-team/settings/workspace');
      console.log(`Member-owned isolation and mobile switcher verified: ${language}`);
      await expect(member.locator('.shell')).toBeVisible();
      await expect(member.locator('#ws-name')).toHaveCount(0);
      await expect(member.locator('.settings-access')).toContainText(ru ? 'Требуется доступ администратора' : 'Administrator access required');
      await expect(member.locator('.settings-access [data-a="newWorkspace"]')).toBeVisible();
      await expect(member.locator('.settings-access [data-pop="ws"]')).toBeVisible();
      const unchanged = (await (await page.request.get('/api/workspace')).json()).data;
      expect(unchanged.ws).toEqual(source.ws);
      expect(unchanged.projects).toEqual(source.projects);
      expect(unchanged.tasks).toEqual(source.tasks);
      expect((await (await page.request.get('/api/workspace-documents/knowledge')).json()).data.knowledgeNotes).toEqual(sourceKnowledge.knowledgeNotes);
      expect(unchanged.members.find(item => item.email === 'editor@example.test').role).toBe('Member');
    }
  } finally {
    await memberContext.close();
  }
});
