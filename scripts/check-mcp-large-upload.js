// Offline transfer acceptance: real local 1/5 GiB files, bounded reads, simulated
// Drive acknowledgements and one lost response. Does not consume Drive quota.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { uploadLocalFile } from '../packages/smena-mcp/src/upload.js';
import { OperationJournal } from '../packages/smena-mcp/src/operations.js';

const root = path.resolve('.data');
await fs.mkdir(root, { recursive: true });
const temporary = await fs.mkdtemp(path.join(root, 'mcp-large-'));
const results = [];
try {
  for (const gib of [1, 5]) {
    const size = gib * 1024 ** 3,
      file = path.join(temporary, `large-${gib}GiB.mp4`),
      handle = await fs.open(file, 'wx');
    try {
      await handle.truncate(size);
    } finally {
      await handle.close();
    }
    const started = Date.now();
    let metadata,
      offset = 128 * 1024 * 1024,
      lost = true,
      maxChunk = 0,
      peakRss = process.memoryUsage().rss,
      requests = 0;
    const client = {
      origin: 'http://127.0.0.1:1',
      call: async (method, url, options = {}) => {
        if (method === 'POST' && url.endsWith('/uploads')) {
          metadata = options.body;
          return { upload_id: 'test-upload' };
        }
        if (url.endsWith('/transport'))
          return { uploadUrl: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=offline-test', size, sha256: metadata.sha256 };
        if (url.endsWith('/complete')) {
          assert.equal(offset, size);
          return { id: `test-${gib}`, size, sha256: metadata.sha256 };
        }
        throw new Error('Unexpected request');
      },
    };
    const result = await uploadLocalFile({
      client,
      journal: new OperationJournal({ profile: 'test-' + gib, directory: temporary }),
      file,
      workspaceId: 'test',
      projectId: 'test',
      operationId: randomUUID(),
      fetch: async (_url, options) => {
        requests++;
        const range = options.headers['Content-Range'];
        assert.equal(options.headers.Authorization, undefined);
        if (range.startsWith('bytes */')) return new Response(null, { status: 308, headers: { Range: `bytes=0-${offset - 1}` } });
        const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(range);
        assert.ok(match);
        assert.equal(Number(match[1]), offset);
        maxChunk = Math.max(maxChunk, options.body.byteLength);
        assert.ok(options.body.byteLength <= 8 * 1024 * 1024);
        offset = Number(match[2]) + 1;
        peakRss = Math.max(peakRss, process.memoryUsage().rss);
        if (lost) {
          lost = false;
          throw new TypeError('Lost response after acknowledged bytes');
        }
        return offset === size
          ? new Response(JSON.stringify({ id: 'offline-object' }), { status: 200 })
          : new Response(null, { status: 308, headers: { Range: `bytes=0-${offset - 1}` } });
      },
    });
    assert.equal(result.size, size);
    assert.equal(maxChunk, 8 * 1024 * 1024);
    const row = {
      gib,
      bytes: size,
      maxChunkBytes: maxChunk,
      peakRssMiB: Math.round(peakRss / 1024 ** 2),
      requests,
      durationMs: Date.now() - started,
      resumedFromBytes: 128 * 1024 * 1024,
      lostResponseRecovered: true,
      provider: 'offline acknowledgement fixture',
    };
    results.push(row);
    console.log(JSON.stringify(row));
    await fs.unlink(file);
  }
  await fs.writeFile(path.join(root, 'mcp-large-upload-results.json'), JSON.stringify({ results }, null, 2) + '\n');
} finally {
  const resolved = path.resolve(temporary);
  if (resolved.startsWith(root + path.sep) && path.basename(resolved).startsWith('mcp-large-')) await fs.rm(resolved, { recursive: true, force: true });
  else {
    console.error('Unexpected cleanup target; no files were removed.');
    process.exitCode = 1;
  }
}
