import test from 'node:test';
import assert from 'node:assert/strict';
import { knowledgeSelectOptions } from '../../src/shared/knowledge-select-options.js';
import { folderTrail } from '../../src/shared/knowledge-tools.js';
test('large pickers keep original option identities and reach choices beyond the DOM limit', () => {
  const options = Array.from({ length: 1000 }, (_, i) => ({ text: `Team / Папка ${i}`, disabled: i === 0, selected: i === 999 }));
  const first = knowledgeSelectOptions(options);
  assert.equal(first.options.length, 100);
  assert.equal(first.total, 1000);
  assert.equal(first.options[0].disabled, true);
  const result = knowledgeSelectOptions(options, '999 TEAM');
  assert.equal(result.options[0].index, 999);
  assert.equal(result.options[0].selected, true);
  assert.equal(knowledgeSelectOptions(options, 'нет').total, 0);
});
test('folder trails reuse a shared identity map and guard malformed cycles', () => {
  const folders = [
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B', parentId: 'a' },
  ];
  const index = new Map(folders.map(folder => [folder.id, folder]));
  assert.deepEqual(
    folderTrail('b', index).map(folder => folder.id),
    ['a', 'b'],
  );
  folders[0].parentId = 'b';
  assert.equal(folderTrail('b', index).length, 2);
});
