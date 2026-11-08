export const KNOWLEDGE_INTAKE_EVENT_LIMIT = 50;
export const INTAKE_OUTCOMES = ['knowledge', 'project', 'duplicate', 'dismissed'];
const identity = value => typeof value === 'string' && /^[\p{L}\p{N}_.:@+-]{1,180}$/u.test(value);
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
export function validKnowledgeIntake(value) {
  if (value == null) return true;
  if (
    value.version !== 1 ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 1 ||
    value.revision > 1000000 ||
    !identity(value.ownerId) ||
    !['open', 'closed'].includes(value.state) ||
    !timestamp(value.at) ||
    !Number.isSafeInteger(value.omitted) ||
    value.omitted < 0 ||
    !Array.isArray(value.events) ||
    value.events.length > KNOWLEDGE_INTAKE_EVENT_LIMIT ||
    value.events.length + value.omitted !== value.revision
  )
    return false;
  const result = value.result;
  if (value.state === 'open' ? result !== null : !result || !INTAKE_OUTCOMES.includes(result.outcome)) return false;
  if (
    result &&
    (typeof result.reason !== 'string' ||
      result.reason.length > 1000 ||
      (result.outcome === 'project' && !identity(result.projectId)) ||
      (result.outcome === 'duplicate' && !identity(result.duplicateId)))
  )
    return false;
  return (
    new Set(value.events.map(event => event?.id)).size === value.events.length &&
    value.events.every(
      event =>
        event &&
        typeof event.id === 'string' &&
        /^[\w-]{8,100}$/.test(event.id) &&
        identity(event.by) &&
        timestamp(event.at) &&
        ['enroll', 'assign', 'resolve', 'reopen'].includes(event.action) &&
        /^[a-f0-9]{64}$/.test(event.fingerprint) &&
        typeof event.reason === 'string' &&
        event.reason.length <= 1000 &&
        identity(event.ownerId) &&
        (event.action !== 'resolve' || INTAKE_OUTCOMES.includes(event.outcome)) &&
        (!event.projectId || identity(event.projectId)) &&
        (!event.duplicateId || identity(event.duplicateId)),
    )
  );
}
export function knowledgeIntakeSummary(note) {
  const value = note.intake;
  if (value) return validKnowledgeIntake(value) ? { state: value.state, ownerId: value.ownerId, at: value.at } : { state: 'unavailable' };
  return note.captureStatus === 'unprocessed' ? { state: 'open', ownerId: '', at: note.updatedAt || note.createdAt || '' } : null;
}
// Client document/trash round trips may never forge another person's triage.
export function preserveKnowledgeIntake(current, incoming) {
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return incoming;
  const records = new Map([
    ...(current.trash || []).filter(item => item.kind === 'note' && item.data?.note).map(item => [item.data.note.id, item.data.note]),
    ...(current.knowledgeNotes || []).map(note => [note.id, note]),
  ]);
  const preserve = note => {
    const next = { ...note },
      canonical = records.get(note.id);
    delete next.intakeSummary;
    if (canonical?.intake) next.intake = structuredClone(canonical.intake);
    else delete next.intake;
    return next;
  };
  return {
    ...incoming,
    ...(Array.isArray(incoming.knowledgeNotes) ? { knowledgeNotes: incoming.knowledgeNotes.map(preserve) } : {}),
    ...(Array.isArray(incoming.trash)
      ? {
          trash: incoming.trash.map(item =>
            item.kind === 'note' && item.data?.note ? { ...item, data: { ...item.data, note: preserve(item.data.note) } } : item,
          ),
        }
      : {}),
  };
}
