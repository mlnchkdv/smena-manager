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

test('preparation reports explain the stopped phase without serializing private recovery pointers', () => {
  const job = {
    id: 'job',
    state: 'preparing',
    entries: [{ name: 'a.md' }],
    backupProgress: { copied: 71 },
    backupPreparation: { source: 'PRIVATE_SOURCE', pending: ['PRIVATE_HASH'] },
  };
  const report = knowledgeImportReport(job, null, { phase: 'preparation', code: 'BACKUP_PREPARATION_INTEGRITY', message: 'PRIVATE_MESSAGE' });
  assert.deepEqual(report.preparation, { verifiedObjects: 71, code: 'BACKUP_PREPARATION_INTEGRITY' });
  assert.equal(report.rows[0].status, 'pending');
  assert.equal(JSON.stringify(report).includes('PRIVATE_'), false);
  assert.equal(knowledgeImportReport(job, null, { phase: 'preparation', code: 'PRIVATE_PROVIDER_TOKEN' }).preparation.code, 'REQUEST_FAILED');
});
