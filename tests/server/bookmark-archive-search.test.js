import test from 'node:test';
import assert from 'node:assert/strict';
import { createBookmarkArchiveSearch } from '../../src/server/bookmark-archive-search.js';
import { bookmarkView } from '../../src/shared/bookmark-view.js';

test('archive search scans bounded batches, returns exact versions and scopes its text cache', async () => {
  let reads = 0;
  const search = createBookmarkArchiveSearch(async (_bookmark, id) => {
    reads++;
    if (id === 'bad') throw new Error('Corrupt archive');
    return { html: '<p>Experiment &amp; dynamic results ' + id + '</p>' };
  });
  const links = [
    {
      id: 'bookmark',
      title: 'Original title',
      pageSnapshots: Array.from({ length: 23 }, (_, i) => ({
        id: i === 22 ? 'bad' : String(i),
        sha256: String(i),
        capturedAt: new Date(2026, 0, i + 1).toISOString(),
      })),
    },
  ];
  const first = await search(links, { query: 'dynamic results' }, 'workspace-one');
  assert.equal(first.scanned, 20);
  assert.equal(first.total, 23);
  assert.equal(first.cursor, 20);
  assert.equal(first.unavailable, 1);
  assert.equal(first.matches[0].snapshotId, '21');
  const last = await search(links, { query: 'Experiment &', cursor: first.cursor }, 'workspace-one');
  assert.equal(last.matches.length, 3);
  assert.equal(last.cursor, null);
  const before = reads;
  await search(links, { query: 'results', cursor: 20 }, 'workspace-two');
  assert.equal(reads, before + 3, 'another workspace cannot reuse text cached under the same IDs');
  await assert.rejects(search(links, { query: 'x' }, 'workspace-one'), { code: 'PAGE_INVALID_SEARCH' });
});
test('archive filters compose and sort by capture date', () => {
  const links = [
    { id: 'none' },
    { id: 'text', pageSnapshots: [{ capturedAt: '2026-11-01' }] },
    { id: 'html', pageSnapshots: [{ format: 'html', capturedAt: '2026-11-18', capture: { missing: 2 } }] },
  ];
  assert.deepEqual(
    bookmarkView(links, { archive: 'none' }).items.map(row => row.id),
    ['none'],
  );
  assert.deepEqual(
    bookmarkView(links, { archive: 'incomplete', capturedAfter: '2026-11-10' }).items.map(row => row.id),
    ['html'],
  );
  assert.equal(bookmarkView(links, { sort: 'captured' }).items[0].id, 'html');
});
