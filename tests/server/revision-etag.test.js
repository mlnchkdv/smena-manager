import assert from 'node:assert/strict';
import test from 'node:test';
import { workspaceRevisionEtag } from '../../src/shared/revision-etag.js';

test('workspace revision etags are stable for the same revision and timestamp', () => {
  assert.equal(workspaceRevisionEtag(4, '2026-10-19T04:00:00.000Z'), workspaceRevisionEtag(4, '2026-10-19T04:00:00.000Z'));
  assert.notEqual(workspaceRevisionEtag(4, '2026-10-19T04:00:00.000Z'), workspaceRevisionEtag(5, '2026-10-19T04:00:00.000Z'));
});
