import test from 'node:test';
import assert from 'node:assert/strict';
import { searchCoverage } from '../../src/shared/search-coverage.js';

test('cold and warm file search report loaded matches without claiming a complete catalog', () => {
  const cold = searchCoverage({ demandFiles: true });
  assert.equal(cold.count, 0);
  assert.equal(cold.partial, true);
  assert.equal(cold.categoryLabel('files'), 'Loaded: 0');
  const warm = searchCoverage({ demandFiles: true, totals: { files: 75, knowledge: 2 }, locale: 'ru' });
  assert.equal(warm.count, 77);
  assert.equal(warm.categoryLabel('files'), 'Загружено: 75');
  assert.equal(warm.countLabel, 'Совпадения в загруженных материалах: 77');
  assert.equal(searchCoverage({ demandFiles: true, category: 'knowledge', totals: { files: 75, knowledge: 2 } }).partial, false);
});

test('pending and failed content search remain partial even with zero matches; completed search is final', () => {
  for (const whiteboardStatus of ['loading', 'error']) {
    const result = searchCoverage({ category: 'whiteboards', whiteboardStatus, totals: { files: 3 } });
    assert.equal(result.count, 0);
    assert.equal(result.partial, true);
    assert.equal(result.categoryLabel('all'), 'Loaded: 3');
  }
  const done = searchCoverage({ totals: { whiteboards: 4, files: 3 } });
  assert.equal(done.partial, false);
  assert.equal(done.categoryLabel('all'), '7');
});

test('cold knowledge search never presents pending, failed or offline coverage as final zero in either language', () => {
  for (const locale of ['en', 'ru']) {
    for (const knowledgeStatus of ['loading', 'error', 'local']) {
      const result = searchCoverage({ category: 'knowledge', knowledgeStatus, locale });
      assert.equal(result.partial, true);
      assert.equal(result.knowledgeIncomplete, true);
      assert.equal(result.categoryLabel('knowledge'), locale === 'ru' ? 'Загружено: 0' : 'Loaded: 0');
      assert.equal(searchCoverage({ category: 'tasks', knowledgeStatus }).partial, false);
    }
    const done = searchCoverage({ category: 'knowledge', totals: { knowledge: 75 }, locale });
    assert.equal(done.partial, false);
    assert.equal(done.count, 75);
  }
});
