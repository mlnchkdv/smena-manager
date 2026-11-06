import test from 'node:test';
import assert from 'node:assert/strict';
import { knowledgeImportReport } from '../../src/shared/knowledge-import-report.js';
test('full import reports include every receipt and exclusion without handles, source text, storage paths or account data', () => {
  const entries = Array.from({ length: 1000 }, (_, i) => ({
    key: 'key' + i,
    name: 'Note ' + i + '.md',
    source: 'private text',
    status: i < 998 ? 'imported' : undefined,
    noteId: i < 998 ? 'n' + i : undefined,
  }));
  const report = knowledgeImportReport(
    { id: 'job', by: 'private-account', entries, state: 'paused' },
    { errors: [{ name: 'C:\\private\\bad.txt', error: 'empty' }], handles: new Map() },
    { key: 'key998', code: 'RATE_LIMITED' },
    'now',
  );
  assert.equal(report.rows.length, 1001);
  assert.equal(report.rows[998].status, 'failed');
  assert.equal(report.rows[999].status, 'pending');
  assert.equal(report.rows[1000].name, 'bad.txt');
  for (const secret of ['private text', 'private-account', 'private\\', 'handles']) assert.ok(!JSON.stringify(report).includes(secret));
});
