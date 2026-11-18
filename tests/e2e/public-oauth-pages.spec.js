import { expect, test } from './fixtures.js';

test('public Google OAuth disclosure pages are accessible and responsive without signing in', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('/');
  await expect(page.locator('.auth-foot a[href="/product.html"]')).toHaveText('Возможности smena.team');
  await expect(page.locator('.auth-foot a[href="/privacy.html"]')).toHaveText('Конфиденциальность');

  for (const [path, heading] of [
    ['/privacy.html', 'Политика конфиденциальности'],
    ['/terms.html', 'Условия использования'],
  ]) {
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
      { width: 320, height: 568 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(path);
      await expect(page.locator('h1')).toHaveText(heading);
      await expect(page.locator('details[lang="en"] summary')).toHaveText('English version');
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      await page.locator('details[lang="en"] summary').click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      const boxes = await page.locator('.top nav a:visible, .foot a').evaluateAll(links =>
        links.map(link => {
          const { x, width } = link.getBoundingClientRect();
          return { x, width };
        }),
      );
      for (const box of boxes) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      }
    }
  }

  await page.goto('/about.html');
  await expect(page).toHaveURL(/\/product\.html$/);
  await page.goto('/about.html#english');
  await expect(page).toHaveURL(/\/product-en\.html$/);

  await page.goto('/privacy.html');
  await expect(page.locator('main')).toContainText('gmail.send');
  await expect(page.locator('main')).toContainText('Limited Use');
  await expect(page.locator('a[href="https://developers.google.com/terms/api-services-user-data-policy"]').first()).toBeVisible();
});

test('deployment acceptance: public capabilities demos work in both languages on desktop and mobile', async ({ page }) => {
  test.setTimeout(90000);
  for (const ru of [true, false])
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(ru ? '/product.html' : '/product-en.html');
      const text = (en, russian) => (ru ? russian : en);
      await expect(page.locator('footer a[href="https://smena.agency"] .agency-wordmark')).toBeVisible();
      await expect(page.locator('a[href^="/about.html"]')).toHaveCount(0);
      const project = page.getByRole('tabpanel').filter({ visible: true });
      await project.locator('[data-demo-action="task"]').first().click();
      const dialog = page.locator('dialog[open]');
      await dialog.getByRole('combobox').selectOption('1');
      await dialog.getByRole('button', { name: text('Apply in demo', 'Применить в демо'), exact: true }).click();
      await expect(project.locator('.bcol').nth(1).locator('.kcard')).toHaveCount(2);
      await page.getByRole('tab', { name: text('Bookmarks', 'Закладки'), exact: true }).click();
      const bookmarks = page.getByRole('tabpanel').filter({ visible: true });
      await bookmarks.locator('[data-demo-action="archive"]').first().click();
      await expect(dialog.frameLocator('iframe').locator('h1')).toHaveText(text('Work with context.', 'Работайте с контекстом.'));
      await dialog.getByRole('combobox').selectOption('previous');
      await expect(dialog.frameLocator('iframe').locator('h1')).toHaveText(text('A shared team memory', 'Общая память команды'));
      await dialog.getByRole('button', { name: text('Text', 'Текст'), exact: true }).click();
      await expect(dialog.locator('.example-archive-text')).toBeVisible();
      await page.keyboard.press('Escape');
      await page.getByRole('tab', { name: text('Files', 'Файлы'), exact: true }).click();
      await page.getByRole('tabpanel').filter({ visible: true }).locator('[data-kind="MP4"]').click();
      await expect(dialog.locator('video')).toHaveAttribute('src', '/product-demo.mp4');
      await page.keyboard.press('Escape');
      await page.getByRole('tab', { name: text('Graph', 'Граф'), exact: true }).click();
      const graph = page.getByRole('tabpanel').filter({ visible: true });
      await graph.locator('[data-demo-physics]').click();
      await expect(graph.locator('[data-demo-physics]')).toHaveAttribute('aria-pressed', 'true');
      const node = graph.locator('[data-demo-graph-node]').first();
      const before = Number(await node.locator('circle').getAttribute('cx'));
      await node.press('ArrowRight');
      expect(Number(await node.locator('circle').getAttribute('cx'))).toBeGreaterThan(before);
      await page.getByRole('tab', { name: text('Research', 'Исследования'), exact: true }).click();
      const demo = page.getByRole('tabpanel').filter({ visible: true });
      await demo.locator('[data-stage="runs"]').click();
      await expect(demo.locator('[data-demo-research-view="runs"]')).toContainText('A · 100% → B · 75%');
      await demo.locator('[data-stage="article"]').click();
      await expect(demo.locator('[data-demo-research-view="article"]')).toBeVisible();
      await expect(demo.locator('[data-demo-research-view="runs"]')).toBeHidden();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    }
});
