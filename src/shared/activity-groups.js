// Presentation only: preserve source order, object identity, and every event.
export function activityGroups(events, { enabled = false, day = event => new Date(event.at).toISOString().slice(0, 10), windowMs = 5 * 60 * 1000 } = {}) {
  const groups = [];
  const key = event =>
    event.task &&
    event.by &&
    Number.isFinite(new Date(event.at).getTime()) &&
    !/comment|security|sign|login|access|member|invite/i.test(event.verb || '') &&
    !['security', 'system'].includes(event.type) &&
    event.read !== false
      ? JSON.stringify([event.workspace || event.workspaceId || '', event.project || '', event.task, event.by, day(event)])
      : null;
  for (const event of events) {
    const last = groups.at(-1),
      candidate = enabled ? key(event) : null;
    const delta = last ? Math.abs(new Date(last.events[0].at).getTime() - new Date(event.at).getTime()) : Infinity;
    if (candidate && last?.key === candidate && delta <= windowMs) last.events.push(event);
    else groups.push({ key: candidate, events: [event] });
  }
  return groups;
}
