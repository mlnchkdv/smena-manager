import test from 'node:test';
import assert from 'node:assert/strict';

test('connection loading is localized before the lazy file/graph modules load', async () => {
  const document = globalThis.document;
  globalThis.document ||= { querySelectorAll: () => [] };
  const { S } = await import('../../src/core/store.js');
  const { t } = await import('../../src/core/i18n.js');
  const previous = S.prefs.lang;
  try {
    for (const lang of ['Русский', 'English (US)', 'English (UK)']) {
      S.prefs.lang = lang;
      assert.equal(t('Loading file connections…'), lang === 'Русский' ? 'Загрузка файлов и связей…' : 'Loading file connections…');
    }
  } finally {
    S.prefs.lang = previous;
    if (document === undefined) delete globalThis.document;
    else globalThis.document = document;
  }
});
