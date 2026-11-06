import test from 'node:test';
import assert from 'node:assert/strict';
import { File } from 'node:buffer';
import { prepareKnowledgeImportManifest, readImportSource } from '../../src/shared/knowledge-import-manifest.js';
test('review accepts more than 4 MiB across files and retains only metadata/handles, with mixed invalid-file feedback', async () => {
  const files = Array.from({ length: 6 }, (_, i) => new File(['text '.repeat(200000)], 'Заметка ' + i + (i % 2 ? '.md' : '.txt')));
  const result = await prepareKnowledgeImportManifest([...files, new File(['binary\0text'], 'bad.txt'), new File([], 'empty.md'), files[0]]);
  assert.equal(result.entries.length, 6);
  assert.equal(result.errors.length, 3);
  assert.equal(result.errors.at(-1).error, 'Duplicate selected file.');
  assert.equal(result.handles.size, 6);
  assert.ok(result.entries.reduce((sum, e) => sum + e.size, 0) > 4 * 1024 * 1024);
  assert.ok(JSON.stringify(result.entries).length < 5000);
  assert.ok(result.entries.every(e => /^[a-f0-9]{64}$/.test(e.key) && !Object.hasOwn(e, 'source')));
  const again = await prepareKnowledgeImportManifest([new File([await files[0].arrayBuffer()], files[0].name, { lastModified: 1 })]);
  assert.equal(result.entries[0].key, again.entries[0].key);
});
test('review bounds each source, encoded JSON, total selection and cancellation without retaining payloads', async () => {
  await assert.rejects(readImportSource(new File(['x'.repeat(2 * 1024 * 1024 + 1)], 'too.txt')), /2 MiB/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(prepareKnowledgeImportManifest([new File(['x'], 'x.md')], { signal: controller.signal }), { name: 'AbortError' });
  await assert.rejects(prepareKnowledgeImportManifest(Array.from({ length: 1001 }, () => new File(['x'], 'x.txt'))), /1,000/);
  assert.equal(await readImportSource(new File(['---\nname: literal\n---\ntext'], 'x.txt')), '---\nname: literal\n---\ntext');
});
