import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../../packages/smena-mcp/src/server.js';
import { SmenaApiClient } from '../../packages/smena-mcp/src/client.js';
import { OperationJournal } from '../../packages/smena-mcp/src/operations.js';
import { app } from '../../src/server/app.js';
import { memberSharingFixture } from '../fixtures/member-sharing.js';
import { getWorkspaceDatabase } from '../../src/server/workspace-store.js';
import { integrationRegistry } from '../../src/server/integration-registry.js';
import { researchStore } from '../../src/server/research-store.js';

test('research API and independent MCP client enforce opt-in grants, stable imports and readback', async () => {
  const f = await memberSharingFixture(),
    server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port,
    database = await getWorkspaceDatabase({ fields: ['members'] });
  let client, mcp;
  try {
    await researchStore.command('shared', { operationId: randomUUID(), action: 'enable', enabled: true }, f.profiles[0], f.profiles);
    await integrationRegistry.policy('default', { enabled: true, writeEnabled: true, uploadsEnabled: true });
    const old = await integrationRegistry.create(f.profiles[1], 'default', { name: 'Legacy', scopes: ['knowledge:read'] }, database.members[1]);
    const denied = await fetch(origin + '/api/v1/workspaces/default/research/projects', { headers: { Authorization: 'Bearer ' + old.token } });
    assert.equal(denied.status, 403);
    await assert.rejects(integrationRegistry.create(f.profiles[1], 'default', { name: 'Research', scopes: ['research:read'] }, database.members[1]), {
      code: 'INTEGRATION_SCOPE_FORBIDDEN',
    });
    await integrationRegistry.setMemberAccess(f.profiles[0], 'default', database.members[1], {
      enabled: true,
      scopes: ['knowledge:read', 'research:read', 'research:write', 'files:read'],
    });
    const issued = await integrationRegistry.create(
      f.profiles[1],
      'default',
      { name: 'Research', scopes: ['research:read', 'research:write', 'files:read'] },
      database.members[1],
    );
    const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
    mcp = createMcpServer(new SmenaApiClient({ origin, token: issued.token }), new OperationJournal({ directory: f.directory, profile: 'research-test' }));
    client = new Client({ name: 'codex-compatible-research', version: '1' });
    await mcp.connect(serverSide);
    await client.connect(clientSide);
    const tools = await client.listTools();
    assert.ok(tools.tools.some(row => row.name === 'write_research_record'));
    const args = {
      workspace_id: 'default',
      project_id: 'shared',
      operation_id: randomUUID(),
      action: 'create',
      id: randomUUID(),
      record: {
        kind: 'observation',
        title: 'Research RU EN',
        body: 'Synthetic / Служебная запись',
        data: { artifacts: [{ fileId: 'file', role: 'observation' }] },
      },
    };
    const saved = await client.callTool({ name: 'write_research_record', arguments: args });
    assert.equal(saved.isError, undefined, JSON.stringify(saved));
    assert.equal((await client.callTool({ name: 'write_research_record', arguments: args })).structuredContent.result.replayed, true);
    const result = await client.callTool({ name: 'search_research', arguments: { workspace_id: 'default', project_id: 'shared', q: 'RU' } });
    assert.equal(result.structuredContent.result.total, 1);
    const read = await client.callTool({ name: 'read_research_record', arguments: { workspace_id: 'default', project_id: 'shared', record_id: args.id } });
    assert.equal(read.structuredContent.result.record.body, args.record.body);
    assert.equal(read.structuredContent.result.record.data.artifacts[0].name, 'member.txt');
    const status = await client.callTool({
      name: 'get_research_operation',
      arguments: { workspace_id: 'default', project_id: 'shared', operation_id: args.operation_id },
    });
    assert.equal(status.structuredContent.result.state, 'completed');
    const bad = await client.callTool({ name: 'search_research', arguments: { workspace_id: 'default', project_id: 'private' } });
    assert.equal(bad.isError, true);
    const command = { operationId: randomUUID(), action: 'create', id: randomUUID(), record: args.record };
    const imported = await client.callTool({
      name: 'import_research_records',
      arguments: { workspace_id: 'default', project_id: 'shared', operation_id: randomUUID(), commands: [command] },
    });
    assert.equal(imported.structuredContent.result.completed.length, 1);
    await integrationRegistry.setMemberAccess(f.profiles[0], 'default', database.members[1], { enabled: true, scopes: ['research:read'] });
    const researchOnly = await client.callTool({
      name: 'read_research_record',
      arguments: { workspace_id: 'default', project_id: 'shared', record_id: args.id },
    });
    assert.equal(researchOnly.structuredContent.result.record.body, args.record.body);
    assert.deepEqual(researchOnly.structuredContent.result.record.data.artifacts, []);
    const receipt = await client.callTool({
      name: 'get_research_operation',
      arguments: { workspace_id: 'default', project_id: 'shared', operation_id: args.operation_id },
    });
    assert.deepEqual(receipt.structuredContent.result.record.data.artifacts, []);
    const blocked = await client.callTool({ name: 'write_research_record', arguments: { ...args, operation_id: randomUUID(), id: randomUUID() } });
    assert.equal(blocked.isError, true);
  } finally {
    await client?.close();
    await mcp?.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await f.cleanup();
  }
});
