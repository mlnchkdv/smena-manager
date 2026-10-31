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
  const memberContext = await browser.newContext();
  const member = await memberContext.newPage();
  try {
    await member.goto('/e2e-team');
    await member.locator('#l-access').fill('e2e-editor-access-id-2026-secure');
    await member.locator('#login-btn').click();
    await expect(member.locator('.shell')).toBeVisible();
    for (const language of ['Русский', 'English (US)']) {
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
      const name = ru ? 'Личное пространство участника' : 'Member workspace';
      await member.locator('#new-ws-name').fill(name);
      await member.locator('#new-ws-description').fill('Owner-only settings test');
      await expect(member.locator('.workspace-create-dialog')).toContainText(ru ? 'Вы станете владельцем.' : 'You become the owner.');
      await member.locator('.workspace-create-dialog button[type="submit"]').click();
      await expect(member).toHaveURL(/\/settings\/workspace$/);
      await expect(member.locator('#ws-name')).toHaveValue(name);
      const ownedPath = new URL(member.url()).pathname;
      await member.locator('#ws-name').fill(name + ' updated');
      await member.locator('#ws-description').fill('Persisted owner changes');
      await member.locator('#ws-save').click();
      await saved(member);
      await member.reload();
      await expect(member.locator('#ws-name')).toHaveValue(name + ' updated');
      await expect(member.locator('#ws-description')).toHaveValue('Persisted owner changes');
      const directory = (await (await member.request.get('/api/workspaces')).json()).workspaces;
      expect(directory.find(item => item.url === ownedPath.split('/')[1]).role).toBe('admin');
      expect(directory.find(item => item.id === 'default').role).toBe('editor');
      for (const [width, height] of [
        [320, 676],
        [390, 845],
        [767, 1024],
        [1366, 767],
      ]) {
        await member.setViewportSize({ width, height });
        await expect(member.locator('#ws-name')).toBeEditable();
        expect(await member.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      }
      await member.goto('/e2e-team/settings/workspace');
      await expect(member.locator('.shell')).toBeVisible();
      await expect(member.locator('#ws-name')).toHaveCount(0);
      const unchanged = (await (await page.request.get('/api/workspace')).json()).data;
      expect(unchanged.ws).toEqual(source.ws);
      expect(unchanged.members.find(item => item.email === 'editor@example.test').role).toBe('Member');
    }
  } finally {
    await memberContext.close();
  }
});
