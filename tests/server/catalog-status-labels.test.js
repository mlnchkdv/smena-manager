import test from 'node:test';
import assert from 'node:assert/strict';
import { contentCounts } from '../../src/shared/content-counts.js';

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
      assert.equal(t(contentCounts(1, 1, 'note')), lang === 'Русский' ? '1 заметка · 1 папка' : '1 note · 1 folder');
      assert.equal(t(contentCounts(2, 5, 'bookmark')), lang === 'Русский' ? '2 закладки · 5 папок' : '2 bookmarks · 5 folders');
      assert.equal(t(contentCounts(0, 21, 'note')), lang === 'Русский' ? '0 заметок · 21 папка' : '0 notes · 21 folders');
      assert.equal(t(contentCounts(1, 1, 'bookmark')), lang === 'Русский' ? '1 закладка · 1 папка' : '1 bookmark · 1 folder');
      assert.equal(t('completed subtask on'), lang === 'Русский' ? 'завершил(а) подзадачу в' : 'completed subtask on');
      assert.equal(t('Field'), lang === 'Русский' ? 'Поле' : 'Field');
      assert.equal(t('Operator'), lang === 'Русский' ? 'Условие' : 'Operator');
      assert.equal(t('Select…'), lang === 'Русский' ? 'Выбрать…' : 'Select…');
      assert.equal(t('2 comments'), lang === 'Русский' ? '2 комментария' : '2 comments');
    }
  } finally {
    S.prefs.lang = previous;
    if (document === undefined) delete globalThis.document;
    else globalThis.document = document;
  }
});
