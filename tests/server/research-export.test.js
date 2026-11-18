import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { researchFixture } from '../fixtures/research.js';

test('export contains immutable versions, verifiable manifests and scriptless RU/EN reports without publishing media', async () => {
  const f = researchFixture();
  await f.enable();
  const saved = await f.create('experiment', { hypothesis: 'Synthetic', criterion: 'No fake metrics' }, 'Служебный / Synthetic');
  const draft = await f.store.exportRecord('3dgs', saved.id, f.editor, [], true);
  assert.match(draft.files['article.md'], /Гипотеза: Synthetic/);
  assert.match(draft.files['article.md'], /Критерий успеха: No fake metrics/);
  await f.command({
    action: 'update',
    id: saved.id,
    expectedRevision: 1,
    record: { kind: 'experiment', title: '<script>test</script>', body: '## Result\n\n<script>alert(1)</script>', data: { conclusion: 'No result' } },
  });
  const result = await f.store.exportRecord('3dgs', saved.id, f.editor, [], true);
  assert.ok(result.files['article.md'].includes('Черновик'));
  assert.ok(result.files['article.html'].includes('lang="ru"'));
  assert.ok(!result.files['article.html'].includes('<script>'));
  const manifest = JSON.parse(result.files['manifest.json']);
  assert.equal(manifest.assetsIncluded, false);
  for (const file of manifest.files) {
    assert.equal(Buffer.byteLength(result.files[file.name]), file.bytes);
    assert.equal(createHash('sha256').update(result.files[file.name]).digest('hex'), file.sha256);
  }
  assert.equal(Object.keys(result.files).filter(name => name.startsWith('objects/')).length, 2);
  await f.command({ action: 'review', id: saved.id, expectedRevision: 2 }, f.owner);
  assert.equal((await f.store.read('3dgs', f.owner, [], { id: saved.id })).record.review.status, 'reviewed');
  const english = await f.store.exportRecord('3dgs', saved.id, f.editor, [], false);
  assert.ok(english.files['article.md'].includes('Reviewed'));
});
