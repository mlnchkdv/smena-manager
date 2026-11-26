import test from 'node:test';
import assert from 'node:assert/strict';
import { fileCatalogPage, fileCatalogChanges, applyFileCatalogChanges } from '../../src/shared/file-catalog.js';
import { projectWorkspace, mergeClientWorkspace } from '../../src/server/workspace-policy.js';
import {
  takeFilePageRecords,
  advancePreferenceCatalog,
  fileCatalogInfo,
  hydrateFileCatalog,
  catalogWrite,
  requestFileIdentities,
} from '../../src/core/file-catalog-transport.js';

test('catalog pages are bounded, scoped by project and pinned to one revision', () => {
  const data = { revision: 8, files: Array.from({ length: 321 }, (_, i) => ({ id: `f${i}`, project: i < 220 ? 'a' : 'b' })) };
  const page = fileCatalogPage(data, { revision: 8, project: 'a', offset: 100 });
  assert.equal(page.files.length, 100);
  assert.equal(page.total, 220);
  assert.equal(page.nextOffset, 200);
  assert.equal(fileCatalogPage(data, { revision: 8, project: 'b', offset: 100 }).nextOffset, null);
  assert.throws(() => fileCatalogPage(data, { revision: 7 }), { code: 'REVISION_CONFLICT' });
  for (const offset of [-1, 0.5, NaN]) assert.throws(() => fileCatalogPage(data, { revision: 8, offset }));
  assert.equal(fileCatalogPage(data, { revision: 7, token: 'same', expectedToken: 'same' }).files.length, 100);
  assert.throws(() => fileCatalogPage(data, { revision: 8, token: 'old', expectedToken: 'new' }), { code: 'REVISION_CONFLICT' });
});

test('catalog delta reconstructs complete data before ACL validation; hidden files survive', () => {
  const current = {
    revision: 1,
    members: [],
    projects: [
      { id: 'a', members: ['m'] },
      { id: 'b', private: true, members: ['other'] },
    ],
    files: [
      { id: 'a', project: 'a', name: 'before' },
      { id: 'b', project: 'b', name: 'private' },
    ],
    tasks: [],
    trash: [],
  };
  const visible = projectWorkspace(current, { id: 'm', role: 'editor' });
  assert.equal(fileCatalogPage(visible, { revision: 1 }).total, 1);
  const after = [{ ...visible.files[0], name: 'after' }];
  const incoming = { ...visible, files: applyFileCatalogChanges(visible.files, fileCatalogChanges(visible.files, after)) };
  const merged = mergeClientWorkspace(current, incoming, 'editor', 'm');
  assert.equal(merged.files.find(file => file.id === 'b').name, 'private');
  current.projects[0].perms = { m: 'Can view' };
  assert.throws(() => mergeClientWorkspace(current, incoming, 'editor', 'm'), { code: 'ENTITY_FORBIDDEN' });
  assert.throws(() => applyFileCatalogChanges([], { remove: ['a'], upsert: [{ id: 'a' }] }));
});

test('transport never publishes an incomplete catalog or reuses another session baseline', async () => {
  const data = { revision: 3, projects: [], tasks: [] };
  const files = [
    { id: 'a', name: 'one' },
    { id: 'b', name: 'two' },
  ];
  const hydrated = await hydrateFileCatalog(
    { data, fileCatalog: { total: 2 } },
    async path =>
      path.includes('offset=0') ? { revision: 3, total: 2, files: [files[0]], nextOffset: 1 } : { revision: 3, total: 2, files: [files[1]], nextOffset: null },
    1,
  );
  assert.deepEqual(hydrated.files, files);
  assert.deepEqual(catalogWrite({ ...data, files: [files[1]] }, 3, 1).fileChanges, { upsert: [], remove: ['a'] });
  assert.equal(catalogWrite({ ...data, files }, 3, 2).fileChanges, undefined);
  await assert.rejects(
    hydrateFileCatalog({ data, fileCatalog: { total: 2 } }, async () => ({ revision: 3, total: 2, files: [files[0]], nextOffset: null }), 3),
  );
  assert.equal(catalogWrite({ ...data, files }, 3, 3).fileChanges, undefined);
});

test('unchanged metadata can be reused across core revisions without sharing a mutable baseline', async () => {
  const result = { data: { revision: 1 }, fileCatalog: { total: 1, token: 'stable' } };
  const first = await hydrateFileCatalog(result, async () => ({ revision: 1, total: 1, files: [{ id: 'a', name: 'Original' }], nextOffset: null }), 44);
  first.files[0].name = 'Local';
  const reused = await hydrateFileCatalog(
    { ...result, data: { revision: 2 } },
    () => {
      throw Error('Must reuse');
    },
    44,
  );
  assert.equal(reused.files[0].name, 'Original');
  assert.deepEqual(catalogWrite(reused, 2, 44).fileChanges, { upsert: [], remove: [] });
});

test('a project-level operation can remove a large catalog without the UI selection cap truncating it', () => {
  const files = Array.from({ length: 1200 }, (_, i) => ({ id: `f${i}`, project: 'p' }));
  assert.deepEqual(applyFileCatalogChanges(files, fileCatalogChanges(files, [])), []);
});

test('on-demand bootstrap reads no catalog and deltas never remove unloaded rows', async () => {
  const snapshot = { data: { revision: 20 }, fileCatalog: { mode: 'demand', total: 10000, token: 'a' } };
  const initial = await hydrateFileCatalog(snapshot, () => assert.fail('Bootstrap must not read any catalog page'), 150);
  assert.deepEqual(initial.files, []);
  requestFileIdentities(['one'], 150, true);
  const loaded = await hydrateFileCatalog(
    snapshot,
    async (path, options) => {
      assert.equal(path, '/api/files/catalog/resolve');
      assert.deepEqual(JSON.parse(options.body).ids, ['one']);
      return { revision: 20, files: [{ id: 'one', project: 'p', name: 'One' }] };
    },
    150,
  );
  assert.deepEqual(catalogWrite({ ...loaded, files: [] }, 20, 150).fileChanges.remove, [], 'Evicting a loaded page is not deletion');
  const payload = catalogWrite({ ...loaded, files: [], trash: [{ id: 'trash-one', kind: 'file', data: { file: loaded.files[0] } }] }, 20, 150);
  assert.deepEqual(payload.fileChanges, { upsert: [], remove: ['one'] });
  assert.equal(payload.data.files, undefined);
  const full = [{ id: 'unloaded', project: 'q' }, ...loaded.files];
  assert.deepEqual(applyFileCatalogChanges(full, payload.fileChanges), [full[0]]);
  const next = await hydrateFileCatalog({ ...snapshot, data: { revision: 21 } }, () => assert.fail('Removed identities are not refetched'), 150);
  assert.deepEqual(next.files, []);
  const fresh = await hydrateFileCatalog(snapshot, () => assert.fail('Another account must not reuse identities'), 151);
  assert.deepEqual(fresh.files, []);
});

test('direct file bootstrap reuses only the requested row from the same revision', async () => {
  const file = { id: 'opened', project: 'p' };
  const result = { data: { revision: 4 }, fileCatalog: { mode: 'demand', total: 3 }, resolved: { revision: 4, id: file.id, file } };
  requestFileIdentities([file.id], 152, true);
  const noRequest = () => assert.fail('The direct file is already resolved');
  assert.deepEqual((await hydrateFileCatalog(result, noRequest, 152)).files, [file]);
  assert.deepEqual((await hydrateFileCatalog({ ...result, resolved: { ...result.resolved, file: null } }, noRequest, 152)).files, []);
  assert.deepEqual((await hydrateFileCatalog(result, noRequest, 153)).files, []);
  requestFileIdentities([file.id], 153);
  const latest = { ...file, folderId: 'other' };
  const refreshed = await hydrateFileCatalog({ ...result, data: { revision: 5 } }, async () => ({ revision: 5, files: [latest] }), 153);
  assert.deepEqual(refreshed.files, [latest]);
});

test('on-demand metadata follows byte-budget continuations and stale page baselines cannot delete new scopes', async () => {
  const snapshot = { data: { revision: 30, trash: [] }, fileCatalog: { mode: 'demand', total: 9000 } };
  requestFileIdentities(['one', 'two'], 160, true);
  let calls = 0;
  const first = await hydrateFileCatalog(
    snapshot,
    async (_path, options) => {
      const { offset } = JSON.parse(options.body);
      calls += 1;
      return { revision: 30, total: 2, files: [{ id: offset ? 'two' : 'one' }], nextOffset: offset ? null : 1 };
    },
    160,
  );
  assert.equal(calls, 2);
  requestFileIdentities(['three'], 160, true);
  await hydrateFileCatalog(snapshot, async () => ({ revision: 30, total: 1, files: [{ id: 'three' }], nextOffset: null }), 160);
  assert.deepEqual(catalogWrite(first, 30, 160).fileChanges.remove, [], 'A late snapshot from the previous scope cannot delete the current scope');
});

test('only consecutive preference saves carry the loaded file baseline within its session', async () => {
  const files = [{ id: 'a', name: 'Report' }];
  requestFileIdentities(['a'], 77);
  await hydrateFileCatalog({ data: { revision: 11 }, fileCatalog: { mode: 'demand', total: 2 } }, async () => ({ revision: 11, files, nextOffset: null }), 77);
  assert.equal(advancePreferenceCatalog(11, 13, files, 77), false);
  assert.equal(advancePreferenceCatalog(11, 12, files, 78), false);
  assert.equal(advancePreferenceCatalog(11, 12, [{ id: 'other' }], 77), false);
  assert.equal(advancePreferenceCatalog(11, 12, files, 77), true);
  assert.equal(advancePreferenceCatalog(12, 13, files, 77), true);
  assert.equal(fileCatalogInfo().contentRevision, 11);
  assert.deepEqual(catalogWrite({ files }, 13, 77).fileChanges, { upsert: [], remove: [] });
});

test('turning pages binds complete records to the right session and revision before editing', async () => {
  const session = 987;
  const snapshot = { data: { revision: 21 }, fileCatalog: { mode: 'demand', total: 53 } };
  await hydrateFileCatalog(snapshot, () => assert.fail(), session);
  const record = { id: 'new', name: 'report', storageName: 'blob', versions: [{ id: 'v1' }] };
  const page = { records: [record], revision: 21 };
  assert.equal(takeFilePageRecords(page, ['new'], session + 1), null);
  assert.equal(takeFilePageRecords({ ...page, revision: 22 }, ['new'], session), null);
  assert.equal(takeFilePageRecords(page, ['missing'], session), null);
  const files = takeFilePageRecords(page, ['new'], session);
  assert.deepEqual(files, [record]);
  const another = { id: 'next', storageName: 'another' };
  assert.deepEqual(takeFilePageRecords({ ...page, records: [another] }, ['next', 'new'], session), [another, record]);
  assert.deepEqual(catalogWrite({ files: [another] }, 21, session).fileChanges, { upsert: [], remove: [] });
  files[0].name = 'edited';
  assert.deepEqual(catalogWrite({ files }, 21, session).fileChanges, { upsert: files, remove: [] });
});
