import test from 'node:test';
import assert from 'node:assert/strict';
import { researchFixture } from '../fixtures/research.js';

test('evidence reuses canonical files, rejects inaccessible links and checks measured metric provenance', async () => {
  const f = researchFixture([
    { id: 'metrics-file', project: '3dgs', name: 'metrics.json', bytes: 64, sha256: 'a'.repeat(64) },
    { id: 'private', project: 'other', name: 'private', bytes: 1 },
  ]);
  await f.enable();
  await assert.rejects(f.create('observation', { artifacts: [{ fileId: 'private', role: 'evidence' }] }), { code: 'RESEARCH_EVIDENCE_UNAVAILABLE' });
  const note = (await f.create('observation', { artifacts: [{ fileId: 'metrics-file', role: 'evidence' }] })).record;
  assert.equal(note.data.artifacts[0].sha256, 'a'.repeat(64));
  assert.equal(note.data.artifacts[0].bytes, 64);
  await assert.rejects(f.update(note, { artifacts: [{ fileId: 'metrics-file', role: 'evidence', sha256: 'b'.repeat(64) }] }), {
    code: 'RESEARCH_EVIDENCE_CHANGED',
  });
  const metric = {
    key: 'fps',
    value: 0,
    unit: 'fps',
    status: 'measured',
    scope: 'scene',
    n: 1,
    aggregation: 'mean',
    protocolId: 'protocol',
    evidenceId: 'metrics-file',
    origin: 'team',
  };
  await assert.rejects(f.create('observation', { metrics: [metric] }), { code: 'RESEARCH_METRIC_PROTOCOL_MISMATCH' });
  metric.origin = 'author';
  await assert.rejects(f.create('source', { metrics: [metric] }), { code: 'RESEARCH_METRIC_EVIDENCE_REQUIRED' });
  const source = await f.create('source', { metrics: [metric], artifacts: [{ fileId: 'metrics-file', role: 'author-table' }] });
  assert.equal(source.record.data.metrics[0].value, 0);
});
