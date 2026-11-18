import test from 'node:test';
import assert from 'node:assert/strict';
import { researchFixture } from '../fixtures/research.js';
import { researchTemplate, researchMetricDefaults } from '../../src/shared/research-templates.js';
import { RESEARCH_KINDS, RESEARCH_PROFILES } from '../../src/shared/research.js';

test('nine versioned templates cover RU/EN and all profiles leave measurements explicitly missing', () => {
  for (const kind of RESEARCH_KINDS) {
    const ru = researchTemplate(kind, { russian: true }),
      en = researchTemplate(kind, { russian: false });
    assert.ok(ru.body && en.body && ru.body !== en.body);
    assert.equal(ru.data.templateVersion, '1');
  }
  for (const profile of RESEARCH_PROFILES) assert.ok(researchMetricDefaults(profile).every(metric => metric.value === null && metric.status !== 'measured'));
});
test('starting a run validates its plan, freezes input revisions, and terminal corrections require a reason', async () => {
  const f = researchFixture();
  await f.enable();
  const experiment = (await f.create('experiment', { hypothesis: 'Synthetic', baseline: 'Control', criterion: 'Defined before outcome' })).record;
  const dataset = (await f.create('dataset', { sourceVersion: 'v1' })).record;
  const protocol = (await f.create('protocol', { config: { resolution: 'test' } })).record;
  let run = (await f.create('run', { state: 'planned' })).record;
  await assert.rejects(f.update(run, { state: 'running' }), { code: 'RESEARCH_PLAN_INCOMPLETE' });
  run = (
    await f.update(run, {
      state: 'running',
      experimentId: experiment.id,
      datasetId: dataset.id,
      protocolId: protocol.id,
      profile: 'rendering',
      codeRevision: 'test-commit',
      hardware: 'synthetic CPU',
      config: { factor: 1 },
    })
  ).record;
  assert.equal(run.plan.dataset.revision, 1);
  assert.equal(run.data.datasetVersion.revision, 1);
  await f.update(dataset, { sourceVersion: 'v2' });
  await assert.rejects(f.update(run, { config: { factor: 2 } }), { code: 'RESEARCH_PLAN_LOCKED' });
  await assert.rejects(f.update(run, { state: 'completed', metrics: [] }), { code: 'RESEARCH_METRICS_REQUIRED' });
  run = (
    await f.update(run, {
      state: 'completed',
      metrics: [{ key: 'fps', unit: 'fps', value: null, status: 'missing', reason: 'Synthetic acceptance, not measured' }],
    })
  ).record;
  assert.equal(run.plan.dataset.revision, 1);
  await assert.rejects(f.update(run, { conclusion: 'Corrected' }), { code: 'RESEARCH_AMENDMENT_REQUIRED' });
  run = (await f.update(run, { conclusion: 'No scientific result', amendment: 'Fix description' })).record;
  assert.ok(run.data.finishedAt);
  await assert.rejects(f.update(run, { state: 'running' }), { code: 'RESEARCH_STATE_TRANSITION' });
});
