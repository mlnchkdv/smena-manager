import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createKnowledgeInspection } from '../../src/server/knowledge-inspection.js';

function fixture() {
  const objects = [],
    calls = [],
    profiles = { owner: { id: 'owner', role: 'editor' }, reader: { id: 'reader', role: 'admin' } };
  const put = (kind, value, area = 'live') => {
    const text = JSON.stringify(value),
      sha256 = createHash('sha256').update(text).digest('hex');
    const object = {
      id: sha256,
      kind,
      scope: area === 'backup' ? 'backup' : kind,
      area,
      sha256,
      bytes: Buffer.byteLength(text),
      text,
      owned: true,
      createdAt: '2000-01-01T00:00:00Z',
    };
    objects.push(object);
    return object;
  };
  const body = id => {
    const object = put('body', { format: 'smena-knowledge-body-v1', noteId: id, formatted_markdown: 'PRIVATE source ' + id });
    return { id, bodyRef: { kind: 'knowledge-body-v1', sha256: object.sha256, bytes: object.bytes } };
  };
  const active = body('active'),
    trashed = body('trashed');
  body('orphan');
  const root = {
    schemaVersion: 3,
    _aggregateVersion: 1,
    ws: { id: 'workspace-a' },
    revision: 1,
    members: [
      { id: 'owner', role: 'Owner' },
      { id: 'reader', role: 'Member' },
    ],
    knowledgeNotes: [active],
    knowledgeFolders: [],
    trash: [{ kind: 'note', data: { note: trashed } }],
  };
  const version = put('version', {
    format: 'smena-knowledge-version-v1',
    noteId: active.id,
    version: { id: 'version', formatted_markdown: 'Prior PRIVATE source' },
  });
  active.history = [{ id: 'version', contentRef: { kind: 'knowledge-version-v1', sha256: version.sha256, bytes: version.bytes } }];
  let payload = null,
    token = 0;
  const journal = {
    read: async () => ({ payload: structuredClone(payload), token }),
    save: async (next, expected) => {
      if (expected !== token) throw Object.assign(Error(), { code: 'INSPECTION_CONFLICT' });
      payload = structuredClone(next);
      token++;
    },
  };
  const storage = {
    name: 'local',
    listKnowledgeObjectInventory: async ({ scope }) => {
      calls.push(scope);
      return {
        items: objects
          .filter(o => o.scope === scope)
          .map(({ text: _text, ...o }) => {
            void _text;
            return o;
          }),
        cursor: null,
      };
    },
    readKnowledgeInventoryObject: async object => {
      calls.push('read:' + object.kind);
      return { text: objects.find(o => o.id === object.id).text, integrityChecked: true };
    },
  };
  const service = () => createKnowledgeInspection({ storage, journal, loadRoot: async () => structuredClone(root) });
  return { root, calls, profiles, service, objects, journal, storage, put };
}
async function finish(service, profile, id) {
  let result = await service.control(profile, id, 'resume');
  for (let i = 0; i < 50 && !['complete', 'failed', 'stale'].includes(result.job.phase); i++) result = await service.step(profile, id);
  return result;
}

test('inspection preserves active, trash and history references; resumes from durable checkpoint with a fresh controller', async () => {
  const f = fixture(),
    owner = f.profiles.owner;
  let service = f.service(),
    result = await service.start(owner),
    id = result.job.id;
  await service.control(owner, id, 'resume');
  await service.step(owner, id);
  await service.control(owner, id, 'pause');
  service = f.service();
  assert.equal((await service.read(owner)).job.paused, true);
  result = await finish(service, owner, id);
  assert.equal(result.job.phase, 'complete');
  assert.equal(result.job.plan.complete, true);
  assert.equal(result.job.plan.counts.reachable, 3);
  assert.equal(result.job.plan.counts.unreferenced, 1);
  assert.equal(result.job.plan.counts.retained, 1);
  assert.equal(result.job.plan.counts.candidates, 0);
  assert.equal(result.deletionEnabled, false);
  assert.equal(f.calls.filter(call => call.startsWith('read:')).length, 1);
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
  assert.equal(JSON.stringify(result).includes(f.objects[0].sha256), false);
});

test('canonical role is checked before inventory or private journal reads, regardless of configured profile role', async () => {
  const f = fixture(),
    service = f.service();
  await assert.rejects(service.start(f.profiles.reader), { statusCode: 403 });
  assert.deepEqual(f.calls, []);
  const { job } = await service.start(f.profiles.owner);
  f.root.members[0].status = 'deactivated';
  await assert.rejects(service.read(f.profiles.owner), { statusCode: 403 });
  await assert.rejects(service.step(f.profiles.owner, job.id), { statusCode: 403 });
  assert.deepEqual(f.calls, []);
});

test('changed roots and unknown inventory never yield an eligible cleanup plan', async () => {
  const f = fixture(),
    service = f.service(),
    owner = f.profiles.owner;
  let result = await service.start(owner);
  f.root.revision++;
  result = await service.control(owner, result.job.id, 'resume');
  assert.equal(result.job.phase, 'stale');
  assert.equal(result.job.plan.complete, false);
  result = await service.start(owner, result.job.id);
  f.objects.push({ id: 'unknown', scope: 'body', owned: false });
  result = await finish(service, owner, result.job.id);
  assert.equal(result.job.phase, 'complete');
  assert.equal(result.job.plan.complete, false);
  assert.equal(result.job.plan.counts.unknown, 1);
  assert.deepEqual(result.job.candidates, []);
  assert.equal(result.deletionEnabled, false);
  f.root.ws.id = 'workspace-b';
  await assert.rejects(service.read(owner), { code: 'INSPECTION_WORKSPACE_UNAVAILABLE' });
});

test('independent backups retain their detached bodies; unsupported large snapshots conservatively block eligibility', async () => {
  const f = fixture(),
    source = f.put('body', { format: 'smena-knowledge-body-v1', noteId: 'independent', formatted_markdown: 'PRIVATE detached backup' }, 'backup');
  const root = f.put(
    'root',
    {
      schemaVersion: 3,
      _aggregateVersion: 1,
      knowledgeNotes: [{ id: 'independent', bodyRef: { kind: 'knowledge-body-v1', sha256: source.sha256, bytes: source.bytes } }],
      knowledgeFolders: [],
    },
    'backup',
  );
  f.put('snapshot', { format: 'smena-prepared-backup-v1', source: { kind: 'root', sha256: root.sha256, bytes: root.bytes } });
  let service = f.service(),
    result = await service.start(f.profiles.owner);
  result = await finish(service, f.profiles.owner, result.job.id);
  assert.equal(result.job.plan.complete, true);
  assert.equal(result.job.plan.counts.reachable, 5);
  assert.equal(result.job.plan.counts.unreferenced, 1);
  f.objects.push({ id: 'expanded-legacy', kind: 'snapshot', scope: 'snapshot', bytes: 9 * 1024 * 1024, owned: true });
  service = f.service();
  result = await service.start(f.profiles.owner, result.job.id);
  result = await finish(service, f.profiles.owner, result.job.id);
  assert.equal(result.job.skippedBackups, 1);
  assert.equal(result.job.plan.rootsComplete, false);
  assert.equal(result.job.plan.complete, false);
  assert.deepEqual(result.job.candidates, []);
});

test('role revocation during an inventory read prevents publication or a new checkpoint', async () => {
  const f = fixture(),
    service = f.service(),
    owner = f.profiles.owner;
  const { job } = await service.start(owner);
  await service.control(owner, job.id, 'resume');
  const original = f.storage.listKnowledgeObjectInventory;
  f.storage.listKnowledgeObjectInventory = async options => {
    const page = await original(options);
    f.root.members[0].role = 'Guest';
    return page;
  };
  await assert.rejects(service.step(owner, job.id), { statusCode: 403 });
  f.root.members[0].role = 'Owner';
  assert.equal((await service.read(owner)).job.backups, 0);
  assert.equal((await service.read(owner)).job.phase, 'backups');
});
