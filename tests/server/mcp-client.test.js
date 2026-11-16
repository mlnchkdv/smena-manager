import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SmenaApiClient } from '../../packages/smena-mcp/src/client.js';

test('MCP stdio interoperates with independent clients and returns bounded structured tool data', async () => {
  const token = 'smena_int_00000000-0000-4000-8000-000000000001.' + 'a'.repeat(43);
  const seen = [];
  const api = http.createServer((req, res) => {
    seen.push(req.url);
    assert.equal(req.headers.authorization, 'Bearer ' + token);
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify(
        req.url === '/api/v1/me'
          ? { workspace: { id: 'test' }, scopes: ['knowledge:read'] }
          : { id: 'note-a', content_markdown: 'Привет / Hello', etag: '"v1"', next_cursor: null },
      ),
    );
  });
  api.listen(0, '127.0.0.1');
  await once(api, 'listening');
  try {
    for (const name of ['codex-compatible', 'generic-client']) {
      const client = new Client({ name, version: '1.0.0' });
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [fileURLToPath(new URL('../../packages/smena-mcp/src/cli.js', import.meta.url)), 'serve', '--origin', 'http://127.0.0.1:' + api.address().port],
        env: { ...process.env, SMENA_INTEGRATION_TOKEN: token },
        stderr: 'pipe',
      });
      let diagnostics = '';
      transport.stderr.on('data', chunk => {
        diagnostics += chunk;
      });
      try {
        await client.connect(transport);
        const tools = await client.listTools();
        assert.ok(tools.tools.some(tool => tool.name === 'search_notes' && tool.annotations.readOnlyHint));
        const context = await client.callTool({ name: 'get_context', arguments: {} });
        assert.equal(context.structuredContent.result.workspace.id, 'test');
        const note = await client.callTool({ name: 'read_note', arguments: { workspace_id: 'test', note_id: 'note-a' } });
        assert.equal(note.structuredContent.result.content_markdown, 'Привет / Hello');
        assert.ok(!JSON.stringify(note).includes(token));
        assert.ok(!diagnostics.includes(token));
      } finally {
        await client.close();
      }
    }
    assert.equal(seen.filter(url => url === '/api/v1/me').length, 2);
  } finally {
    api.closeAllConnections();
    await new Promise(resolve => api.close(resolve));
  }
});

test('MCP client prevents cross-origin redirects and refuses large responses and unsafe origins', async () => {
  assert.throws(() => new SmenaApiClient({ origin: 'http://remote.example' }));
  assert.throws(() => new SmenaApiClient({ origin: 'https://smena.team/path' }));
  let options;
  const client = new SmenaApiClient({
    token: 'not-printed',
    fetch: async (_url, value) => {
      options = value;
      return new Response('x'.repeat(512 * 1024 + 1));
    },
  });
  await assert.rejects(client.call('GET', '/me'), { code: 'RESPONSE_TOO_LARGE' });
  assert.equal(options.redirect, 'error');
});
