import { randomUUID } from 'node:crypto';
import { pageError } from './web-page-fetch.js';
import { knowledgeActor } from './knowledge-access.js';
import { SNAPSHOT_LIMIT } from './bookmark-snapshots.js';

const busy = job => ['queued', 'fetching', 'resources', 'verifying'].includes(job.phase);
const summary = ({ id, bookmarkId, phase, createdAt, updatedAt, snapshot, code, mode }) => ({
  id,
  bookmarkId,
  phase,
  createdAt,
  updatedAt,
  snapshot,
  code,
  mode,
});

// The ledger and the new storage reference commit in the same canonical write.
// A lost HTTP response therefore cannot turn a retry into a second snapshot.
export function createBookmarkArchiveJobs({ load, mutate, capture, save, now = Date.now }) {
  const running = new Map();
  async function write(change) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const current = await load();
      let result;
      try {
        await mutate(
          data => {
            result = change(data);
            return data;
          },
          current.revision,
          { role: 'admin', scope: 'bookmarks', outboxWorker: true },
        );
        return structuredClone(result);
      } catch (error) {
        if (error.code !== 'REVISION_CONFLICT' || attempt === 3) throw error;
      }
    }
  }
  function actor(data, user, profiles, id, write = false) {
    knowledgeActor(data, user, profiles, { write });
    const bookmark = data.links?.find(row => row.id === id);
    if (!bookmark) throw pageError('PAGE_BOOKMARK_NOT_FOUND', 404);
    return bookmark;
  }
  async function run(id, user, profiles) {
    if (running.has(id)) return running.get(id);
    const work = (async () => {
      const lease = randomUUID();
      try {
        const job = await write(data => {
          const row = data._bookmarkArchiveJobs?.find(item => item.id === id && item.owner === user.id);
          if (!row || !busy(row)) return null;
          if (row.lease?.until > now()) return null;
          const bookmark = actor(data, user, profiles, row.bookmarkId, true);
          if (bookmark.url !== row.url) throw pageError('PAGE_BOOKMARK_CHANGED', 409);
          row.phase = 'fetching';
          row.updatedAt = now();
          row.lease = { id: lease, until: now() + 120000 };
          return row;
        });
        if (!job) return;
        const stage = phase =>
          write(data => {
            const row = data._bookmarkArchiveJobs.find(item => item.id === id);
            if (row.lease?.id !== lease) throw pageError('PAGE_JOB_BUSY', 409);
            actor(data, user, profiles, row.bookmarkId, true);
            row.phase = phase;
            row.updatedAt = now();
            row.lease.until = now() + 120000;
            return row;
          });
        const page = await capture(job.url, stage, job.mode);
        await stage('verifying');
        const ref = await save({ id: job.bookmarkId, url: job.url }, page, id);
        await write(data => {
          const row = data._bookmarkArchiveJobs.find(item => item.id === id);
          if (row.lease?.id !== lease) throw pageError('PAGE_JOB_BUSY', 409);
          const bookmark = actor(data, user, profiles, row.bookmarkId, true);
          if (bookmark.url !== job.url) throw pageError('PAGE_BOOKMARK_CHANGED', 409);
          if ((bookmark.pageSnapshots || []).filter(item => !item.isArchived).length >= SNAPSHOT_LIMIT) throw pageError('PAGE_SNAPSHOT_LIMIT', 409);
          bookmark.pageSnapshots = [ref, ...(bookmark.pageSnapshots || []).filter(item => item.id !== ref.id)];
          row.phase = 'ready';
          row.snapshot = ref;
          row.updatedAt = now();
          const previous = data._documentRevisions?.bookmarks || {};
          data._documentRevisions = {
            ...data._documentRevisions,
            bookmarks: { ...previous, revision: Number(previous.revision || 0) + 1, updatedAt: new Date(now()).toISOString() },
          };
          return row;
        });
      } catch (error) {
        await write(data => {
          const row = data._bookmarkArchiveJobs?.find(item => item.id === id && item.owner === user.id);
          if (row && row.phase !== 'ready' && row.lease?.id === lease) {
            row.phase = 'failed';
            row.code = error.code || 'PAGE_UNAVAILABLE';
            row.updatedAt = now();
          }
          return row;
        }).catch(() => {});
      }
    })().finally(() => running.delete(id));
    running.set(id, work);
    return work;
  }
  return {
    async create(user, profiles, bookmarkId, key = randomUUID(), mode = 'static') {
      if (!/^[a-zA-Z0-9-]{16,80}$/u.test(key) || !['static', 'rendered'].includes(mode)) throw pageError('PAGE_INVALID_STATE', 400);
      const job = await write(data => {
        const bookmark = actor(data, user, profiles, bookmarkId, true);
        const jobs = (data._bookmarkArchiveJobs ||= []);
        const existing = jobs.find(item => item.owner === user.id && item.bookmarkId === bookmarkId && (item.key === key || busy(item)));
        if (existing) return existing;
        if ((bookmark.pageSnapshots || []).filter(item => !item.isArchived).length >= SNAPSHOT_LIMIT) throw pageError('PAGE_SNAPSHOT_LIMIT', 409);
        if (jobs.filter(busy).length >= 4 || jobs.filter(item => item.owner === user.id && busy(item)).length >= 2) throw pageError('PAGE_QUEUE_FULL', 429);
        data._bookmarkArchiveJobs = jobs.filter(item => busy(item) || item.updatedAt > now() - 7 * 86400000).slice(-63);
        const row = { id: randomUUID(), key, owner: user.id, bookmarkId, url: bookmark.url, mode, phase: 'queued', createdAt: now(), updatedAt: now() };
        data._bookmarkArchiveJobs.push(row);
        return row;
      });
      void run(job.id, user, profiles);
      return summary(job);
    },
    async list(user, profiles, bookmarkId) {
      const data = await load();
      actor(data, user, profiles, bookmarkId);
      const jobs = (data._bookmarkArchiveJobs || []).filter(row => row.owner === user.id && row.bookmarkId === bookmarkId);
      for (const job of jobs.filter(busy)) void run(job.id, user, profiles);
      return jobs.map(summary).reverse();
    },
    settle: () => Promise.all([...running.values()]),
  };
}
