import test from 'node:test';
import assert from 'node:assert/strict';
import { readFilePresets, writeFilePresets, normalizeFilePresets } from '../../src/shared/file-presets.js';
import { fileViewKey } from '../../src/shared/file-view.js';
test('file filter presets are bounded, normalized and isolated by device account/workspace', () => {
  const memory = new Map(),
    storage = { getItem: key => memory.get(key), setItem: (key, value) => memory.set(key, value) };
  const key = fileViewKey('u', 'w');
  const preset = { id: 'p', name: '  Тексты  ', project: 'project', folder: 'folder', type: 'doc', query: 'инструкция', sort: 'name', recursive: true };
  assert.ok(writeFilePresets(storage, key, [preset, preset, null]));
  assert.deepEqual(readFilePresets(storage, key), [{ ...preset, name: 'Тексты' }]);
  assert.deepEqual(readFilePresets(storage, fileViewKey('other', 'w')), []);
  assert.deepEqual(readFilePresets(storage, fileViewKey('u', 'other')), []);
  assert.deepEqual(
    readFilePresets(
      {
        getItem() {
          throw Error('blocked');
        },
      },
      key,
    ),
    [],
  );
  assert.equal(
    writeFilePresets(
      {
        setItem() {
          throw Error('full');
        },
      },
      key,
      [],
    ),
    false,
  );
  assert.equal(normalizeFilePresets(Array.from({ length: 40 }, (_, i) => ({ ...preset, id: `${i}` }))).length, 12);
});
