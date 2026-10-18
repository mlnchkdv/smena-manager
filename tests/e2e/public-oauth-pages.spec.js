import { expect, test } from '@playwright/test';

test('public Google OAuth disclosure pages are accessible and responsive without signing in', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.auth-foot a[href="/about.html"]')).toHaveText('О продукте');
  await expect(page.locator('.auth-foot a[href="/privacy.html"]')).toHaveText('Конфиденциальность');

  for (const [path, heading] of [
    ['/about.html', 'Smena Manager'],
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
    }
  }

  await page.goto('/privacy.html');
  await expect(page.locator('main')).toContainText('gmail.send');
  await expect(page.locator('main')).toContainText('Limited Use');
  await expect(page.locator('a[href="https://developers.google.com/terms/api-services-user-data-policy"]').first()).toBeVisible();
});
