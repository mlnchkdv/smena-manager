// Run with playwright-cli run-code --filename against an isolated production preview.
// prettier-ignore
async page => {
  if (!page.url().startsWith('http://127.0.0.1:5195')) throw new Error('Local production preview only');
  await page.context().clearCookies();
  const session = await page.context().newCDPSession(page);
  await session.send('Network.enable');
  await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await session.send('Network.emulateNetworkConditions', { offline: false, latency: 100, downloadThroughput: 200 * 1024, uploadThroughput: 100 * 1024 });
  await session.send('Network.clearBrowserCache');
  await session.send('Network.setCacheDisabled', { cacheDisabled: true });
  const started = Date.now();
  await page.goto('http://127.0.0.1:5195');
  await page.getByRole('textbox', { name: 'Идентификатор доступа', exact: true }).waitFor();
  const coldLoginMs = Date.now() - started;
  await page.getByRole('textbox', { name: 'Идентификатор доступа', exact: true }).fill('density-layout-test-id-2026');
  const authStarted = Date.now();
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await page.locator('.home-page h1').waitFor();
  const authenticatedHomeMs = Date.now() - authStarted;
  const resources = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .filter(r => r.name.includes('/assets/'))
      .map(r => ({ name: r.name.split('/').pop(), bytes: r.transferSize, duration: Math.round(r.duration) })),
  );
  await session.send('Network.setCacheDisabled', { cacheDisabled: false });
  await page.reload();
  await page.locator('.home-page h1').waitFor();
  const warmStarted = Date.now();
  await page.reload();
  await page.locator('.home-page h1').waitFor();
  const warmHomeMs = Date.now() - warmStarted;
  const readerStarted = Date.now();
  await page.goto('http://127.0.0.1:5195/layout-qa/knowledge');
  await page.locator('.knowledge-preview-open').first().waitFor();
  await page.locator('.knowledge-preview-open').first().click();
  await page.locator('.knowledge-drawer h1').waitFor();
  return {
    environment: 'localhost; Chromium; CPU 4x; 100ms latency; 200KiB/s down; single sample, not production SLA',
    coldLoginMs,
    authenticatedHomeMs,
    warmHomeMs,
    firstReaderMs: Date.now() - readerStarted,
    resources,
  };
}
