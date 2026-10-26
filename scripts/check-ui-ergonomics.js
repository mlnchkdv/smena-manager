import { spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { openSync, closeSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

// CLI-based visual acceptance against the isolated Layout QA fixture only.
// Start the fixture with Google/Gmail/Redis credentials blank, never production.
const origin = new URL(process.env.UI_AUDIT_BASE_URL || 'http://127.0.0.1:5194');
if (
  !['127.0.0.1', 'localhost'].includes(origin.hostname) ||
  origin.protocol !== 'http:' ||
  origin.pathname !== '/' ||
  origin.username ||
  origin.password ||
  origin.search ||
  origin.hash
)
  throw new Error('A credential-free local fixture origin is required.');
const session = process.env.UI_AUDIT_SESSION || 'ergonomics26';
if (!/^[a-z0-9-]+$/.test(session)) throw new Error('Invalid CLI session name.');
await mkdir('output/playwright/ergonomics26', { recursive: true });

function cli(args) {
  const executable = process.platform === 'win32' ? 'powershell.exe' : 'npx';
  const common = ['--offline', '--package', '@playwright/cli', 'playwright-cli', '--session', session];
  const command =
    process.platform === 'win32'
      ? ['-NoProfile', '-Command', '& npx ' + [...common, ...args].map(value => "'" + value.replaceAll("'", "''") + "'").join(' ')]
      : [...common, ...args];
  // A CLI browser daemon inherits stdout. A real log file prevents that open
  // handle from holding spawnSync's output pipe alive after the command exits.
  const log = `output/playwright/ergonomics26/cli-${randomUUID()}.log`;
  const fd = openSync(log, 'w');
  let result;
  try {
    result = spawnSync(executable, command, { encoding: 'utf8', timeout: 600000, stdio: ['ignore', fd, fd] });
  } finally {
    closeSync(fd);
  }
  const output = readFileSync(log, 'utf8');
  if (result.error || result.status !== 0 || output.includes('### Error')) throw new Error(result.error?.message || output);
  console.log(output.split('### Ran Playwright code')[0].trim());
}

async function acceptance(page, base) {
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  await page.goto(base);
  const login = page.getByRole('textbox', { name: 'Идентификатор доступа', exact: true });
  await page.waitForFunction(() => document.querySelector('#l-access') || document.querySelector('.shell'));
  if (await login.isVisible()) {
    await login.waitFor();
    await login.fill('density-layout-test-id-2026');
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
  }
  await page.waitForURL('**/layout-qa**');
  check(new URL(page.url()).pathname.startsWith('/layout-qa'), 'Only the Layout QA fixture is allowed.');
  const open = async (route, title) => {
    await page.goto(base + '/layout-qa/' + route);
    if (route === '') await page.locator('.home-page h1').waitFor();
    else if (title) await page.getByRole('heading', { name: title, level: 1, exact: true }).waitFor();
    else await page.locator('#search-page-q').waitFor();
  };
  const rows = [];
  for (const lang of ['ru', 'en']) {
    await page.goto(base + '/layout-qa/settings/language');
    // Wait for real settings content, not the session-restoration heading.
    await page.locator('.set-in h1').waitFor();
    const current = await page.locator('html').getAttribute('lang');
    if (current !== lang) {
      const trigger = page.getByRole('button', { name: current === 'ru' ? /^Язык:/ : /^Language:/ });
      await trigger.click();
      const saved = page.waitForResponse(response => response.url().endsWith('/api/preferences') && response.request().method() === 'PUT' && response.ok());
      await page.getByRole('option', { name: lang === 'ru' ? 'Русский' : 'English (US)', exact: true }).click();
      await saved;
    }
    for (const theme of ['light', 'dark']) {
      await open('settings/appearance', lang === 'ru' ? 'Оформление' : 'Appearance');
      const radio = page.getByRole('radio', {
        name: lang === 'ru' ? (theme === 'light' ? 'Светлая' : 'Тёмная') : theme === 'light' ? 'Light' : 'Dark',
        exact: true,
      });
      if ((await radio.getAttribute('aria-checked')) !== 'true') {
        const saved = page.waitForResponse(response => response.url().endsWith('/api/preferences') && response.request().method() === 'PUT' && response.ok());
        await radio.click();
        await saved;
      }
      for (const density of ['comfortable', 'compact']) {
        await open('settings/appearance', lang === 'ru' ? 'Оформление' : 'Appearance');
        const control = page.locator(`[data-a="setPref"][data-k="density"][data-v="${density}"]`);
        if ((await control.getAttribute('aria-pressed')) !== 'true') {
          const saved = page.waitForResponse(response => response.url().endsWith('/api/preferences') && response.request().method() === 'PUT' && response.ok());
          await control.click();
          await saved;
        }
        for (const width of [320, 390, 768, 1024, 1440]) {
          await page.setViewportSize({ width, height: width < 500 ? 845 : 900 });
          for (const [route, title] of [
            ['files', lang === 'ru' ? 'Файлы' : 'Files'],
            ['knowledge', lang === 'ru' ? 'Все заметки' : 'All notes'],
            ['calendar', lang === 'ru' ? 'Календарь' : 'Calendar'],
            ['bookmarks', lang === 'ru' ? 'Закладки' : 'Bookmarks'],
            ['search', null],
            ['', null],
            ['timeline', lang === 'ru' ? 'Хронология' : 'Timeline'],
            ['graph', lang === 'ru' ? 'Граф' : 'Graph'],
            ['inbox', lang === 'ru' ? 'Входящие' : 'Inbox'],
          ]) {
            await open(route, title);
            const geometry = await page.evaluate(() => ({
              overflow: document.documentElement.scrollWidth - innerWidth,
              firstNote: document.querySelector('.knowledge-preview-card')?.getBoundingClientRect().top,
              toolbarEscape: [...document.querySelectorAll('.toolbar,.cal-h')].some(element => {
                const r = element.getBoundingClientRect();
                return [...element.children].some(child => {
                  const c = child.getBoundingClientRect();
                  return c.width > 0 && getComputedStyle(child).display !== 'none' && c.bottom > r.bottom + 1;
                });
              }),
            }));
            check(geometry.overflow <= 1, JSON.stringify({ route, lang, theme, width, geometry }));
            check(!geometry.toolbarEscape, 'Calendar controls escape their row: ' + JSON.stringify({ lang, theme, width }));
            if (route === 'knowledge' && (width === 390 || width === 1440))
              check(geometry.firstNote < (width === 390 ? 480 : 360), 'Notes are pushed below primary controls.');
            await page.screenshot({ path: `output/playwright/ergonomics26/${route || 'home'}-${lang}-${theme}-${density}-${width}.png` });
            rows.push({ route, lang, theme, density, width });
          }
        }
      }
    }
    await page.setViewportSize({ width: 390, height: 845 });
    await open('calendar', lang === 'ru' ? 'Календарь' : 'Calendar');
    const day = page.locator('.cal-day-open').first();
    const date = await day.getAttribute('data-date');
    await day.click();
    await page.getByRole('button', { name: lang === 'ru' ? 'Добавить задачу' : 'Add task', exact: true }).waitFor();
    await page.keyboard.press('Escape');
    check((await page.evaluate(() => document.activeElement?.dataset.date)) === date, 'Day list returned focus to another date.');
    await page.getByRole('button', { name: lang === 'ru' ? 'Повестка' : 'Agenda', exact: true }).click();
    await page.locator('.cal-agenda').waitFor();
    check(
      (await page
        .locator('.cal-agenda .cev')
        .first()
        .evaluate(element => element.getBoundingClientRect().height)) >= 44,
      'Agenda item is too small.',
    );
    await open('knowledge', lang === 'ru' ? 'Все заметки' : 'All notes');
    const query = await page.locator('.knowledge-preview-card .knowledge-preview-head strong').first().innerText();
    check(Boolean(query.trim()), 'The isolated fixture needs a named note for the reader scenario.');
    await open('search', null);
    await page.locator('#search-page-q').fill(query);
    // A result now has its own path disclosure. Open its title, not the
    // geometric row centre, which can legitimately expand that disclosure.
    await page.locator('[data-a=goKnowledgeNote] .tt').first().click();
    await page.locator('.knowledge-quick-preview').waitFor();
    check(page.url().endsWith('/search'), 'Opening a reader lost the search route.');
    await page.locator('.knowledge-drawer [data-a=closeKnowledgeDrawer]').click();
    check((await page.locator('#search-page-q').inputValue()) === query, 'Reader lost the query.');
    check((await page.evaluate(() => document.activeElement?.dataset.a)) === 'goKnowledgeNote', 'Reader lost result focus.');
    await page.locator('#search-page-q').press('Escape');
    check((await page.locator('#search-page-q').inputValue()) === '', 'Escape did not clear the query.');
    await open('graph', lang === 'ru' ? 'Граф' : 'Graph');
    await page.getByRole('button', { name: lang === 'ru' ? 'Режим фокуса' : 'Focus mode', exact: true }).click();
    await page.locator('.graph-page.is-focused').waitFor();
    await page.keyboard.press('Escape');
    check((await page.locator('.graph-page.is-focused').count()) === 0, 'No escape from graph focus.');
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const [route, title] of [
      ['knowledge', lang === 'ru' ? 'Все заметки' : 'All notes'],
      ['settings/appearance', lang === 'ru' ? 'Оформление' : 'Appearance'],
    ]) {
      await open(route, title);
      await page.evaluate(() => {
        document.documentElement.style.zoom = '2';
      });
      if (route === 'knowledge') await page.locator('.knowledge-shell[data-folder-overlay=true]').waitFor();
      check((await page.locator(route === 'knowledge' ? '.knowledge-sidebar' : '.set-nav').isVisible()) === false, 'Side columns did not reflow.');
      check(
        (await page.getByRole('heading', { name: title, level: 1, exact: true }).evaluate(element => element.getBoundingClientRect().width)) >= 150,
        'Main heading is squeezed.',
      );
      await page.screenshot({ path: `output/playwright/ergonomics26/zoom-${route.replaceAll('/', '-')}-${lang}.png` });
      await page.evaluate(() => {
        document.documentElement.style.zoom = '';
      });
    }
  }
  return {
    passed: rows.length,
    languages: ['ru', 'en'],
    themes: ['light', 'dark'],
    densities: ['comfortable', 'compact'],
    screenshots: 'output/playwright/ergonomics26',
    scope: 'isolated local fixture; no physical-device claims',
  };
}

try {
  cli(['open', origin.origin]);
  const source = 'output/playwright/ergonomics26/acceptance.js';
  writeFileSync(source, `async page => (${acceptance.toString()})(page, ${JSON.stringify(origin.origin)})`);
  cli(['run-code', '--filename', source]);
} finally {
  cli(['close']);
}
