import test from 'node:test';
import assert from 'node:assert/strict';
import { compareResearchRuns } from '../../src/shared/research-comparison.js';
test('comparisons keep incompatible conditions, hardware, author claims and missing values separate', () => {
  const base = {
    id: 'a',
    kind: 'run',
    projectId: 'p',
    workspaceId: 'w',
    data: {
      state: 'completed',
      profile: 'rendering',
      experimentId: 'e',
      datasetVersion: { ref: { sha256: 'dataset' } },
      protocolVersion: { ref: { sha256: 'protocol' } },
      hardware: 'cpu-a',
      config: { quality: 1 },
      metrics: [{ key: 'fps', unit: 'fps', scope: 'scene', aggregation: 'mean', n: 10, origin: 'team', value: 0, status: 'measured' }],
    },
  };
  const candidate = structuredClone(base);
  candidate.id = 'b';
  candidate.data.config.quality = 2;
  candidate.data.metrics[0].value = 5;
  let result = compareResearchRuns(base, candidate);
  assert.equal(result.metrics[0].delta, 5);
  assert.deepEqual(result.configDiff, [{ key: 'quality', before: 1, after: 2 }]);
  candidate.data.hardware = 'cpu-b';
  assert.equal(compareResearchRuns(base, candidate).metrics[0].reason, 'hardware');
  candidate.data.datasetVersion.ref.sha256 = 'other';
  assert.equal(compareResearchRuns(base, candidate).compatible, false);
  candidate.data.metrics[0].status = 'missing';
  candidate.data.metrics[0].value = null;
  assert.equal(compareResearchRuns(base, candidate).metrics[0].delta, null);
  candidate.data = structuredClone(base.data);
  candidate.data.metrics[0].n = 1;
  assert.equal(compareResearchRuns(base, candidate).metrics[0].reason, 'sample');
  base.data.metrics[0].origin = 'author';
  candidate.data.metrics[0].origin = 'author';
  candidate.data.metrics[0].n = 10;
  assert.equal(compareResearchRuns(base, candidate).metrics[0].reason, 'author');
});
