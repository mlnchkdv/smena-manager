import test from 'node:test';
import assert from 'node:assert/strict';
import { S } from '../../src/core/store.js';
import { t } from '../../src/core/i18n.js';

test('connection loading is localized before the lazy file/graph modules load', () => {
  const previous = S.prefs.lang;
  try {
    for (const lang of ['Русский', 'English (US)', 'English (UK)']) {
      S.prefs.lang = lang;
      assert.equal(t('Loading file connections…'), lang === 'Русский' ? 'Загрузка файлов и связей…' : 'Loading file connections…');
    }
  } finally {
    S.prefs.lang = previous;
  }
});
