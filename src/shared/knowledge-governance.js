import { knowledgeSnapshot } from './knowledge-history.js';

export const knowledgeReviewSnapshot = note => ({
  ...knowledgeSnapshot(note),
  sourceFormat: note.sourceFormat || 'markdown',
  sourceName: note.sourceName || '',
});

const identity = value => typeof value === 'string' && /^[\p{L}\p{N}_.:@+-]{1,180}$/u.test(value);
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
export const KNOWLEDGE_REVIEW_EVENT_LIMIT = 100;
export function validReviewDate(value) {
  if (value === '') return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1970-01-01') return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
const decision = item =>
  item &&
  identity(item.by) &&
  timestamp(item.at) &&
  ['approved', 'changes'].includes(item.outcome) &&
  typeof item.comment === 'string' &&
  item.comment.length <= 1000;
export function validKnowledgeGovernance(value) {
  if (value == null) return true;
  const current = value.current;
  return !!(
    value.version === 1 &&
    Number.isSafeInteger(value.revision) &&
    value.revision >= 0 &&
    value.revision <= 1000000 &&
    identity(value.ownerId) &&
    validReviewDate(value.reviewDue) &&
    Number.isSafeInteger(value.omitted) &&
    value.omitted >= 0 &&
    Array.isArray(value.events) &&
    value.events.length <= KNOWLEDGE_REVIEW_EVENT_LIMIT &&
    value.events.length + value.omitted === value.revision &&
    new Set(value.events.map(e => e?.id)).size === value.events.length &&
    value.events.every(
      e =>
        e &&
        identity(e.id) &&
        ['configure', 'request', 'decide'].includes(e.action) &&
        identity(e.by) &&
        timestamp(e.at) &&
        hash(e.hash) &&
        hash(e.fingerprint) &&
        (e.action === 'configure'
          ? identity(e.ownerId) && validReviewDate(e.reviewDue)
          : e.action === 'request'
            ? Array.isArray(e.reviewers) &&
              e.reviewers.length >= 1 &&
              e.reviewers.length <= 5 &&
              e.reviewers.every(identity) &&
              new Set(e.reviewers).size === e.reviewers.length
            : identity(e.requestId) && decision(e)),
    ) &&
    (current === null ||
      (current &&
        identity(current.id) &&
        hash(current.hash) &&
        identity(current.by) &&
        timestamp(current.at) &&
        Array.isArray(current.reviewers) &&
        current.reviewers.length >= 1 &&
        current.reviewers.length <= 5 &&
        current.reviewers.every(identity) &&
        new Set(current.reviewers).size === current.reviewers.length &&
        Array.isArray(current.decisions) &&
        current.decisions.length <= 5 &&
        current.decisions.every(item => decision(item) && current.reviewers.includes(item.by)) &&
        new Set(current.decisions.map(item => item.by)).size === current.decisions.length))
  );
}

// Approval follows an exact content/metadata snapshot hash. Editing a note
// never erases the earlier decision; restoring exactly that snapshot can make
// its existing approval current again. Due dates are an independent reminder.
export function knowledgeGovernanceStatus(value, noteHash, today = new Date().toISOString().slice(0, 10)) {
  if (!validKnowledgeGovernance(value)) return { status: 'unavailable', overdue: false };
  const current = value?.current;
  const status = !current
    ? 'unreviewed'
    : current.hash !== noteHash
      ? 'stale'
      : current.decisions.some(item => item.outcome === 'changes')
        ? 'changes'
        : current.reviewers.every(id => current.decisions.some(item => item.by === id && item.outcome === 'approved'))
          ? 'approved'
          : 'pending';
  return { status, overdue: !!value?.reviewDue && value.reviewDue <= today };
}

// Only the review endpoint writes this metadata. Core/legacy document payloads
// cannot forge approvals, including via a new trash entry or a restored ID.
export function preserveKnowledgeGovernance(current, incoming) {
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return incoming;
  const stored = new Map([
    ...(current.trash || []).filter(item => item.kind === 'note' && item.data?.note).map(item => [item.data.note.id, item.data.note]),
    ...(current.knowledgeNotes || []).map(note => [note.id, note]),
  ]);
  const preserve = note => {
    const value = { ...note },
      canonical = stored.get(note.id)?.governance;
    if (canonical) value.governance = structuredClone(canonical);
    else delete value.governance;
    return value;
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
