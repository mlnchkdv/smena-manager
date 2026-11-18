import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { app } from '../../src/server/app.js';
import { memberSharingFixture } from '../fixtures/member-sharing.js';

test('research HTTP routes preserve ordinary-member project ACL, actor identity, replay, reload and bounded pagination', async () => {
  const fixture = await memberSharingFixture();
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  const call = (actor, path = '', input) =>
    fetch(origin + '/api/research/projects/shared' + path, {
      method: input ? 'POST' : 'GET',
      headers: { Authorization: 'Bearer ' + fixture.sessions[actor], 'X-Smena-Workspace': 'default', 'Content-Type': 'application/json' },
      ...(input ? { body: JSON.stringify(input) } : {}),
    });
  try {
    assert.equal((await call(1)).status, 200);
    assert.equal((await (await call(1)).json()).canConfigure, false);
    const evidence = await call(1, '/files?q=member');
    assert.equal(evidence.status, 200, await evidence.clone().text());
    assert.deepEqual(
      (await evidence.json()).items.map(file => file.id),
      ['file'],
    );
    assert.equal((await call(0, '/commands', { operationId: randomUUID(), action: 'enable', enabled: true })).status, 200);
    const input = {
      operationId: randomUUID(),
      action: 'create',
      id: randomUUID(),
      record: { kind: 'observation', title: 'Один вопрос / One question', body: 'Synthetic observation', data: {} },
    };
    const saved = await call(1, '/commands', input);
    assert.equal(saved.status, 200, await saved.clone().text());
    assert.equal((await saved.json()).record.createdBy, 'member');
    assert.equal((await (await call(1, '/commands', input)).json()).replayed, true);
    assert.equal((await (await call(1, '/records/' + input.id)).json()).record.body, 'Synthetic observation');
    assert.equal((await (await call(1, '?q=One&limit=1')).json()).total, 1);
    assert.equal((await call(1, '?limit=1000')).status, 400);
    const denied = await fetch(origin + '/api/research/projects/private', { headers: { Authorization: 'Bearer ' + fixture.sessions[1] } });
    assert.equal(denied.status, 404);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await fixture.cleanup();
  }
});
