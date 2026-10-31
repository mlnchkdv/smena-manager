import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesLocalizedName } from '../../src/shared/localized-search.js';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ru = name => ({ Frontend: 'Фронтенд', 'Create task': 'Создать задачу' })[name] || name;
test('system search matches visible translations, stable names and optional aliases', () => {
  for (const query of ['ФРОНТЕНД', ' frontend ', '']) assert.ok(matchesLocalizedName('Frontend', query, ru));
  assert.ok(matchesLocalizedName('Create task', 'создать задачу', ru));
  assert.ok(matchesLocalizedName('Create task', 'new task', ru, ['New task']));
  assert.equal(matchesLocalizedName('Frontend', 'бекенд', ru), false);
  assert.equal(
    matchesLocalizedName('Frontend', 'фронтенд', value => value),
    false,
  );
});

test('label popover searches translated names without translating authored lists', () => {
  const S = { ui: { pop: { q: 'Фронтенд' } } };
  const source = readFileSync(new URL('../../src/overlays/popover-content.js', import.meta.url), 'utf8');
  const context = {
    S,
    matchesLocalizedName,
    esc: value => value,
    ic: () => '',
    tr: name => ({ 'Filter labels…': 'Поиск меток…', 'No matches': 'Совпадений нет' })[name] || ru(name),
  };
  vm.runInNewContext(source.slice(source.indexOf('export function popList'), source.indexOf('export function miniCal')).replace('export ', ''), context);
  const items = [{ id: 'frontend', name: 'Frontend', on: true }];
  assert.match(context.popList(items, { search: 'Filter labels…', localized: true }), /data-v="frontend".*aria-checked="true"/);
  assert.match(context.popList(items, { search: 'Filter labels…', localized: true }), /aria-label="Поиск меток…"/);
  assert.match(context.popList(items), /Совпадений нет/);
  S.ui.pop.q = 'Frontend';
  assert.match(context.popList(items), />Frontend</);
});
