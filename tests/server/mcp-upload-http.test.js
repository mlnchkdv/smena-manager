import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { uploadLocalFile } from '../../packages/smena-mcp/src/upload.js';

test('real HTTP 308 checkpoints resume, while Location redirects are never followed', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'smena-mcp-http-'));
  const file = path.join(directory, 'fixture.txt'),
    bytes = Buffer.from('Тест / Test\n'.repeat(100));
  await fs.writeFile(file, bytes);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  let redirect = false,
    requests = 0,
    received = Buffer.alloc(0);
  const server = http.createServer(async (req, res) => {
    requests++;
    assert.equal(req.headers.authorization, undefined);
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    if (redirect) {
      res.writeHead(308, { Location: 'https://untrusted.example/' });
      res.end();
      return;
    }
    if (req.headers['content-range'].startsWith('bytes */')) {
      res.writeHead(308);
      res.end();
      return;
    }
    received = body;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ id: 'stored-file' }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  const client = {
    origin,
    call: async (_method, url) =>
      url.endsWith('/transport')
        ? { uploadUrl: origin + '/upload/drive/session', sha256, size: bytes.length }
        : url.endsWith('/complete')
          ? { id: 'stored-file', sha256 }
          : { upload_id: 'upload' },
  };
  const args = {
    client,
    journal: { reserve: async () => {}, mark: async () => {} },
    file,
    workspaceId: 'test',
    projectId: 'project',
    operationId: randomUUID(),
  };
  try {
    assert.equal((await uploadLocalFile(args)).id, 'stored-file');
    assert.deepEqual(received, bytes);
    assert.equal(requests, 2);
    redirect = true;
    await assert.rejects(uploadLocalFile({ ...args, operationId: randomUUID() }), { code: 'UPLOAD_REDIRECT_REFUSED' });
    assert.equal(requests, 3);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(directory).startsWith('smena-mcp-http-'));
    await fs.rm(directory, { recursive: true, force: true });
  }
});
