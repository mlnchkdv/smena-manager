import test from 'node:test';
import assert from 'node:assert/strict';
import { createBookmarkArchiveSearch } from '../../src/server/bookmark-archive-search.js';
import { bookmarkView } from '../../src/shared/bookmark-view.js';
import { restoreBookmarkTrash } from '../../src/shared/trash-recovery.js';

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
  const next = await search(links, { query: 'dynamic results', cursor: first.cursor, collectionVersion: first.collectionVersion }, 'workspace-one');
  assert.equal(next.matches.length, 3);
  const changed = [{ ...links[0], pageSnapshots: links[0].pageSnapshots.slice(1) }];
  await assert.rejects(search(changed, { query: 'dynamic results', cursor: first.cursor, collectionVersion: first.collectionVersion }, 'workspace-one'), {
    code: 'PAGE_SEARCH_CHANGED',
  });
  const last = await search(links, { query: 'Experiment &', cursor: first.cursor }, 'workspace-one');
  assert.equal(last.matches.length, 3);
  assert.equal(last.cursor, null);
  const before = reads;
  await search(links, { query: 'results', cursor: 20 }, 'workspace-two');
  assert.equal(reads, before + 3, 'another workspace cannot reuse text cached under the same IDs');
  await assert.rejects(search(links, { query: 'x' }, 'workspace-one'), { code: 'PAGE_INVALID_SEARCH' });
});

test('trash and restore invalidate the cursor after the second page and preserve exact versions on restart', async () => {
  const search = createBookmarkArchiveSearch(async () => ({ html: '<p>archive text</p>' }));
  const links = Array.from({ length: 49 }, (_, i) => ({
    id: `bookmark-${i}`,
    pageSnapshots: [{ id: `copy-${i}`, sha256: String(i), capturedAt: new Date(Date.UTC(2026, 0, i + 1)).toISOString() }],
  }));
  const data = { links, trash: [] };
  const query = 'archive text';
  const page = cursor => search(data.links, { query, cursor: cursor?.cursor, collectionVersion: cursor?.collectionVersion }, 'workspace');
  const initialPage2 = await page(await page());
  assert.equal(initialPage2.scanned, 40);

  const trashIds = [2, 15, 20, 30, 38, 48].map(i => `bookmark-${i}`);
  data.links = links.filter(bookmark => !trashIds.includes(bookmark.id));
  data.trash = links.filter(bookmark => trashIds.includes(bookmark.id)).map(link => ({ id: `trash-${link.id}`, kind: 'bookmark', data: { link } }));
  await assert.rejects(page(initialPage2), { code: 'PAGE_SEARCH_CHANGED' });
  const trashPage1 = await page();
  const trashPage2 = await page(trashPage1);
  const trashPage3 = await page(trashPage2);
  const remaining = [trashPage1, trashPage2, trashPage3].flatMap(result => result.matches.map(match => match.bookmarkId));
  assert.equal(trashPage3.scanned, 43);
  assert.equal(new Set(remaining).size, 43);
  assert.ok(trashIds.every(id => !remaining.includes(id)));

  assert.equal(
    restoreBookmarkTrash(
      data,
      data.trash.map(entry => entry.id),
      'member',
      'editor',
    ),
    trashIds.length,
  );
  await assert.rejects(page(trashPage2), { code: 'PAGE_SEARCH_CHANGED' });
  const restoredPage1 = await page();
  const restoredPage2 = await page(restoredPage1);
  const restoredPage3 = await page(restoredPage2);
  assert.equal(restoredPage3.scanned, 49);
  assert.deepEqual(
    [restoredPage1, restoredPage2, restoredPage3].flatMap(result => result.matches.map(row => [row.bookmarkId, row.snapshotId])),
    [...links].reverse().map(link => [link.id, link.pageSnapshots[0].id]),
  );
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
  const beforeMidnightUtc = [{ id: 'local-today', pageSnapshots: [{ capturedAt: '2026-11-17T21:30:00Z' }] }];
  assert.equal(bookmarkView(beforeMidnightUtc, { capturedAfter: '2026-11-18', timeZone: 'UTC' }).total, 0);
  assert.equal(bookmarkView(beforeMidnightUtc, { capturedAfter: '2026-11-18', timeZone: 'Europe/Saratov' }).total, 1);
});
