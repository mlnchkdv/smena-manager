export const unfinishedUpload = item => !['done', 'cancelled'].includes(item.phase);
export const retryableUploadError = error =>
  ['NETWORK_ERROR', 'DIRECT_UPLOAD_NETWORK_ERROR', 'UPLOAD_TIMEOUT'].includes(error?.code) ||
  [408, 429].includes(error?.status) ||
  (error?.status >= 500 && error.status <= 599);

// File handles stay in memory. Scheduling, cancellation and retry are independent
// of the current route, and at most two byte transfers run at once.
export function createUploadQueue({
  run,
  changed = () => {},
  concurrency = 2,
  limit = 500,
  recoverNetwork = false,
  online = true,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
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
  const clearRetry = job => {
    if (job.retryTimer !== undefined) clearTimer(job.retryTimer);
    delete job.retryTimer;
    delete job.retryAt;
  };
  const connectionWait = job => {
    clearRetry(job);
    job.phase = 'waiting-network';
    job.pct = job.bytes ? Math.min(99, Math.floor(((job.accepted || 0) / job.bytes) * 100)) : 0;
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
        job.sourceHandle = null;
        job.session = null;
        settle(job, result);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        job.error = error.message;
        job.code = error.code;
        if (recoverNetwork && retryableUploadError(error) && !online) connectionWait(job);
        else if (recoverNetwork && retryableUploadError(error) && (job.retryCount || 0) < 8) {
          job.retryCount = (job.retryCount || 0) + 1;
          const delay = Math.min(30000, 1000 * 2 ** (job.retryCount - 1));
          job.phase = 'retrying';
          job.retryAt = Date.now() + delay;
          job.retryTimer = setTimer(() => {
            clearRetry(job);
            if (job.phase !== 'retrying') return;
            job.phase = online ? 'queued' : 'waiting-network';
            notify();
            schedule();
          }, delay);
        } else {
          job.phase = 'failed';
          settle(job, null);
        }
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
      if (job.phase === 'queued' && !job.running) {
        if (recoverNetwork && !online) {
          connectionWait(job);
          notify();
        } else void start(job);
      }
    }
  }
  return {
    jobs,
    setOnline(value) {
      online = Boolean(value);
      if (!recoverNetwork) return;
      this.batch(() =>
        jobs.forEach(job => {
          if (!online && ['queued', 'uploading', 'verifying', 'retrying'].includes(job.phase)) {
            connectionWait(job);
            job.controller?.abort();
            notify();
          } else if (online && job.phase === 'waiting-network') {
            job.retryCount = 0;
            job.phase = 'queued';
            notify();
          }
        }),
      );
      schedule();
    },
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
      if (!['queued', 'uploading', 'verifying', 'waiting-network', 'retrying'].includes(job.phase)) return;
      clearRetry(job);
      job.phase = 'paused';
      job.controller?.abort();
      notify();
    },
    resume(job) {
      if (!['paused', 'failed', 'needs-file'].includes(job.phase) || (!job.file && !job.session?.uploaded?.id)) return;
      clearRetry(job);
      job.retryCount = 0;
      job.error = '';
      job.phase = 'queued';
      notify();
      schedule();
    },
    cancel(job) {
      clearRetry(job);
      job.phase = 'cancelled';
      job.controller?.abort();
      job.sourceController?.abort();
      job.file = null;
      job.sourceHandle = null;
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
