import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { inspectedKnowledgeKind } from '../../src/server/knowledge-inspection-formats.js';

test('known object formats require their identities and schema; future fields remain unknown', () => {
  const body = { format: 'smena-knowledge-body-v1', noteId: 'note', formatted_markdown: 'Text' };
  assert.equal(inspectedKnowledgeKind(body), 'body');
  assert.equal(inspectedKnowledgeKind({ ...body, futureReference: {} }), null);
  assert.equal(inspectedKnowledgeKind({ ...body, noteId: '' }), null);
  assert.equal(inspectedKnowledgeKind({ format: 'smena-knowledge-version-v1', noteId: 'note', version: { id: 'old', formatted_markdown: '' } }), 'version');
  const prefix = createHash('sha256').update('note').digest('hex').slice(0, 1);
  const metadata = { format: 'smena-knowledge-metadata-v1', field: 'knowledgeNotes', prefix, rows: [['note', { id: 'note' }]] };
  assert.equal(inspectedKnowledgeKind(metadata), 'metadata');
  assert.equal(inspectedKnowledgeKind({ ...metadata, rows: [['note', { id: 'other' }]] }), null);
  assert.equal(inspectedKnowledgeKind({ ...metadata, rows: [...metadata.rows, ...metadata.rows] }), null);
});

test('search inspection validates inflated length, bucket, unique identities and UTF-8', () => {
  const prefix = createHash('sha256').update('note').digest('hex').slice(0, 1);
  const rows = [['note', 'a'.repeat(64), 'search text']];
  const encode = raw => ({ format: 'smena-knowledge-search-v1', prefix, rawBytes: raw.length, data: deflateRawSync(raw).toString('base64') });
  const valid = encode(Buffer.from(JSON.stringify(rows)));
  assert.equal(inspectedKnowledgeKind(valid), 'search');
  assert.equal(inspectedKnowledgeKind({ ...valid, rawBytes: valid.rawBytes + 1 }), null);
  assert.equal(inspectedKnowledgeKind(encode(Buffer.from(JSON.stringify([...rows, ...rows])))), null);
  assert.equal(inspectedKnowledgeKind(encode(Buffer.from([0xff, 0xfe]))), null);
  assert.equal(inspectedKnowledgeKind({ ...valid, rawBytes: 100 * 1024 * 1024 }), null);
});
