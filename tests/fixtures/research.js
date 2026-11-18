import { createResearchStore } from '../../src/server/research-store.js';
import { createHash, randomUUID } from 'node:crypto';

export function researchFixture() {
  const owner = { id: 'owner', role: 'admin', email: 'owner@example.test' };
  const editor = { id: 'editor', role: 'editor', email: 'editor@example.test' };
  let database = {
    revision: 1,
    members: [
      { ...owner, role: 'Owner', status: 'active' },
      { ...editor, role: 'Member', status: 'active' },
    ],
    projects: [{ id: '3dgs', name: '3DGS', lead: 'owner', members: ['owner', 'editor'], access: 'private' }],
  };
  const blobs = new Map();
  const store = createResearchStore({
    scope: () => 'test',
    load: async () => structuredClone(database),
    mutate: async (fn, revision) => {
      if (revision !== database.revision) throw Object.assign(new Error('stale'), { code: 'REVISION_CONFLICT' });
      const next = await fn(structuredClone(database));
      next.revision++;
      database = next;
    },
    storage: () => ({
      writeResearchObject: async (text, sha) => {
        if (createHash('sha256').update(text).digest('hex') !== sha) throw new Error('hash');
        blobs.set(sha, text);
      },
      readResearchObject: async sha => blobs.get(sha),
    }),
  });
  const command = (input, actor = editor) => store.command('3dgs', { operationId: randomUUID(), ...input }, actor);
  const create = (kind, data = {}, title = kind) => command({ action: 'create', id: randomUUID(), record: { kind, title, body: '', data } });
  const update = (record, patch) =>
    command({
      action: 'update',
      id: record.id,
      expectedRevision: record.revision,
      record: { kind: record.kind, title: record.title, body: record.body, tags: record.tags, data: { ...record.data, ...patch } },
    });
  return { owner, editor, store, blobs, create, update, command, enable: () => command({ action: 'enable', enabled: true }, owner) };
}
