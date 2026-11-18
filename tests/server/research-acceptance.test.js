import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { researchFixture } from '../fixtures/research.js';

test('research acceptance rejects secret configuration, validates profile readiness, preserves timestamps and recovers archives', async () => {
  const f = researchFixture();
  await f.enable();
  await assert.rejects(f.create('protocol', { config: { api_key: 'synthetic-secret' } }), { code: 'RESEARCH_SECRET_BLOCKED' });
  await assert.rejects(f.create('source', { sourceUrl: 'javascript:alert(1)' }), { code: 'RESEARCH_SOURCE_INVALID' });
  await assert.rejects(f.create('review', { periodFrom: '2026-11-18', periodTo: '2026-11-17', timeZone: 'UTC' }), { code: 'RESEARCH_PERIOD_INVALID' });
  const experiment = (await f.create('experiment', { hypothesis: 'Synthetic', baseline: 'A', criterion: 'No claims' })).record,
    dataset = (await f.create('dataset')).record,
    protocol = (await f.create('protocol')).record;
  let run = (
    await f.create('run', {
      profile: 'scene_optimization',
      experimentId: experiment.id,
      datasetId: dataset.id,
      protocolId: protocol.id,
      codeRevision: 'synthetic',
      hardware: 'synthetic',
      config: {},
      state: 'planned',
      startedAt: '1900-01-01',
    })
  ).record;
  assert.equal(run.data.startedAt, undefined);
  await assert.rejects(f.update(run, { state: 'running' }), { code: 'RESEARCH_SEED_REQUIRED' });
  run = (await f.update(run, { state: 'running', seed: 0 })).record;
  const started = run.data.startedAt;
  run = (await f.update(run, { startedAt: '1900-01-01' })).record;
  assert.equal(run.data.startedAt, started);
  const archive = await f.command({ action: 'archive', id: run.id, expectedRevision: run.revision });
  assert.equal((await f.store.read('3dgs', f.editor, [], { kind: 'run' })).total, 0);
  assert.equal((await f.store.read('3dgs', f.editor, [], { kind: 'run', archived: true })).total, 1);
  await f.command({ action: 'restore', id: run.id, expectedRevision: archive.revision });
  assert.equal((await f.store.read('3dgs', f.editor, [], { kind: 'run' })).total, 1);
  assert.equal((await f.store.operation('3dgs', randomUUID(), f.editor)).state, 'not_found');
  const operation = await f.create('observation', {}, 'Retry');
  assert.equal((await f.store.operation('3dgs', operation.operationId, f.editor)).record.title, 'Retry');
  const parent = randomUUID(),
    commands = [
      { operationId: randomUUID(), action: 'create', id: randomUUID(), record: { kind: 'observation', title: 'Import A', body: 'Synthetic', data: {} } },
      { operationId: randomUUID(), action: 'create', id: randomUUID(), record: { kind: 'observation', title: '', body: 'Synthetic', data: {} } },
    ];
  const batch = await f.store.importBatch('3dgs', parent, commands, f.editor);
  assert.equal(batch.completed.length, 1);
  assert.equal(batch.failed.index, 1);
  const partial = await f.store.operation('3dgs', parent, f.editor);
  assert.equal(partial.state, 'partial');
  assert.deepEqual(partial.pending, [commands[1].operationId]);
  const retry = await f.store.importBatch('3dgs', parent, commands, f.editor);
  assert.equal(retry.completed[0].replayed, true);
});
