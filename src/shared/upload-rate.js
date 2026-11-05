export function sampleUploadRate(previous, bytes, now) {
  if (!previous || bytes < previous.bytes || now - previous.at > 15000) return { bytes, at: now, rate: 0, samples: 0 };
  const elapsed = now - previous.at;
  if (elapsed < 200) return previous;
  const current = Math.max(0, bytes - previous.bytes) / (elapsed / 1000);
  return { bytes, at: now, rate: previous.rate ? previous.rate * 0.6 + current * 0.4 : current, samples: previous.samples + 1 };
}
export function uploadEstimate(jobs) {
  const pending = jobs.filter(job => !['done', 'cancelled'].includes(job.phase));
  const running = pending.filter(job => job.phase === 'uploading');
  const rate = running.reduce((sum, job) => sum + (job.rateSample?.samples >= 2 ? job.rateSample.rate : 0), 0);
  const remaining = pending.reduce((sum, job) => sum + Math.max(0, job.bytes - (job.accepted || 0)), 0);
  const seconds = rate > 0 && !pending.some(job => ['paused', 'failed', 'needs-file'].includes(job.phase)) ? Math.ceil(remaining / rate) : null;
  return { rate, seconds };
}
