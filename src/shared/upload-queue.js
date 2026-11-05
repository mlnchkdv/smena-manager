export const unfinishedUpload = item => !['done', 'cancelled'].includes(item.phase);

// File handles stay in memory. Scheduling, cancellation and retry are independent
// of the current route, and at most two byte transfers run at once.
export function createUploadQueue({ run, changed = () => {}, concurrency = 2, limit = 500 }) {
  const jobs = [];
  let active = 0,
    scheduled = false,
    batching = false,
    dirty = false;
  const notify = () => {
    if (batching) dirty = true;
    else changed(jobs);
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      pump();
    });
  };
  const settle = (job, result) => {
    job.resolve?.(result);
    job.resolve = null;
  };
  async function start(job) {
    active++;
    job.running = true;
    job.phase = 'uploading';
    const controller = (job.controller = new AbortController());
    notify();
    try {
      const result = await run(job, controller.signal);
      if (!controller.signal.aborted) {
        job.phase = 'done';
        job.pct = 100;
        job.accepted = job.bytes;
        job.file = null;
        job.session = null;
        settle(job, result);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        job.phase = 'failed';
        job.error = error.message;
        job.code = error.code;
        settle(job, null);
      }
    } finally {
      job.running = false;
      job.controller = null;
      active--;
      notify();
      schedule();
    }
  }
  function pump() {
    for (const job of jobs) {
      if (active >= concurrency) break;
      if (job.phase === 'queued' && !job.running) void start(job);
    }
  }
  return {
    jobs,
    batch(action) {
      batching = true;
      try {
        action();
      } finally {
        batching = false;
        if (dirty) {
          dirty = false;
          notify();
        }
      }
    },
    add(entries, { restored = false } = {}) {
      if (entries.length + jobs.filter(unfinishedUpload).length > limit) throw new RangeError('Upload queue is full.');
      const promises = entries.map(entry => {
        const job = { pct: 0, accepted: 0, ...entry, phase: restored ? 'needs-file' : 'queued' };
        const promise = new Promise(resolve => {
          job.resolve = resolve;
        });
        jobs.push(job);
        return promise;
      });
      notify();
      schedule();
      return Promise.all(promises);
    },
    pause(job) {
      if (!['queued', 'uploading', 'verifying'].includes(job.phase)) return;
      job.phase = 'paused';
      job.controller?.abort();
      notify();
    },
    resume(job) {
      if (!['paused', 'failed', 'needs-file'].includes(job.phase) || !job.file) return;
      job.error = '';
      job.phase = 'queued';
      notify();
      schedule();
    },
    cancel(job) {
      job.phase = 'cancelled';
      job.controller?.abort();
      job.file = null;
      job.session = null;
      settle(job, null);
      notify();
    },
    clear() {
      for (let i = jobs.length - 1; i >= 0; i--) if (!unfinishedUpload(jobs[i]) && !jobs[i].running) jobs.splice(i, 1);
      notify();
    },
  };
}

export function uploadFileKey(file) {
  return JSON.stringify([file.name, file.size, file.lastModified || 0]);
}

export async function uploadFingerprint(file) {
  const sampleSize = 64 * 1024;
  const start = new Uint8Array(await file.slice(0, sampleSize).arrayBuffer());
  const end = file.size > sampleSize ? new Uint8Array(await file.slice(Math.max(sampleSize, file.size - sampleSize)).arrayBuffer()) : new Uint8Array();
  const bytes = new Uint8Array(start.length + end.length);
  bytes.set(start);
  bytes.set(end, start.length);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
