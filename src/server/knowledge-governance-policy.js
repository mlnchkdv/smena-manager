import { createHash } from 'node:crypto';
import { validKnowledgeGovernance, validReviewDate, KNOWLEDGE_REVIEW_EVENT_LIMIT, knowledgeReviewSnapshot } from '../shared/knowledge-governance.js';
import { workspaceMemberRole } from '../shared/workspace-access.js';
import { isActiveMember } from '../shared/workspace-membership.js';

const fail = (code, statusCode = 400) =>
  Object.assign(new Error('The knowledge review could not be saved. Reload and review the current version.'), { code, statusCode });
const activeEditor = member => isActiveMember(member) && ['admin', 'editor'].includes(workspaceMemberRole(member));
export const knowledgeReviewHash = note =>
  createHash('sha256')
    .update(JSON.stringify(knowledgeReviewSnapshot(note)))
    .digest('hex');
const fields = ['action', 'operationId', 'reviewRevision', 'reviewHash', 'ownerId', 'reviewDue', 'reviewers', 'outcome', 'comment'];
export function applyKnowledgeReview(note, reviewHash, actor, members, input, now = new Date().toISOString()) {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some(key => !fields.includes(key)) ||
    !['configure', 'request', 'decide'].includes(input.action) ||
    typeof input.operationId !== 'string' ||
    !/^[\w-]{8,100}$/.test(input.operationId) ||
    typeof input.reviewHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(input.reviewHash) ||
    !Number.isSafeInteger(input.reviewRevision) ||
    input.reviewRevision < 0
  )
    throw fail('KNOWLEDGE_REVIEW_INVALID');
  if (!validKnowledgeGovernance(note.governance)) throw fail('KNOWLEDGE_REVIEW_INTEGRITY', 503);
  if (!activeEditor(actor)) throw fail('KNOWLEDGE_REVIEW_FORBIDDEN', 403);
  const byId = new Map(members.map(member => [member.id, member]));
  const creator = byId.get(note.createdBy);
  const initialOwner = activeEditor(creator) ? creator.id : actor.id;
  const previous = note.governance || { version: 1, revision: 0, ownerId: initialOwner, reviewDue: '', current: null, events: [], omitted: 0 };
  const payload = Object.fromEntries(
    fields
      .filter(field => Object.hasOwn(input, field))
      .sort()
      .map(field => [field, input[field]]),
  );
  const fingerprint = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const replay = previous.events.find(event => event.id === input.operationId);
  if (replay) {
    if (replay.by !== actor.id || replay.fingerprint !== fingerprint) throw fail('KNOWLEDGE_REVIEW_REPLAY', 409);
    return { governance: previous, replay: true };
  }
  if (input.reviewHash !== reviewHash) throw fail('KNOWLEDGE_VERSION_STALE', 409);
  if (input.reviewRevision !== previous.revision || previous.revision >= 1000000) throw fail('KNOWLEDGE_REVIEW_STALE', 409);
  const governance = structuredClone(previous);
  const event = { id: input.operationId, action: input.action, by: actor.id, at: now, hash: reviewHash, fingerprint };
  const owner = previous.ownerId === actor.id || workspaceMemberRole(actor) === 'admin';
  if (input.action === 'configure') {
    if (!owner) throw fail('KNOWLEDGE_REVIEW_FORBIDDEN', 403);
    if (!activeEditor(byId.get(input.ownerId)) || !validReviewDate(input.reviewDue)) throw fail('KNOWLEDGE_REVIEW_INVALID');
    governance.ownerId = input.ownerId;
    governance.reviewDue = input.reviewDue;
    Object.assign(event, { ownerId: input.ownerId, reviewDue: input.reviewDue });
  } else if (input.action === 'request') {
    if (!owner) throw fail('KNOWLEDGE_REVIEW_FORBIDDEN', 403);
    if (
      !Array.isArray(input.reviewers) ||
      input.reviewers.length < 1 ||
      input.reviewers.length > 5 ||
      new Set(input.reviewers).size !== input.reviewers.length ||
      input.reviewers.some(id => !activeEditor(byId.get(id)))
    )
      throw fail('KNOWLEDGE_REVIEW_INVALID');
    governance.current = { id: input.operationId, hash: reviewHash, by: actor.id, at: now, reviewers: [...input.reviewers], decisions: [] };
    event.reviewers = [...input.reviewers];
  } else {
    const current = governance.current;
    if (!current || current.hash !== reviewHash) throw fail('KNOWLEDGE_REVIEW_STALE', 409);
    if (!current.reviewers.includes(actor.id)) throw fail('KNOWLEDGE_REVIEW_FORBIDDEN', 403);
    if (
      !['approved', 'changes'].includes(input.outcome) ||
      typeof input.comment !== 'string' ||
      input.comment.length > 1000 ||
      (input.outcome === 'changes' && !input.comment.trim())
    )
      throw fail('KNOWLEDGE_REVIEW_INVALID');
    const decision = { by: actor.id, at: now, outcome: input.outcome, comment: input.comment.trim() };
    current.decisions = [...current.decisions.filter(item => item.by !== actor.id), decision];
    Object.assign(event, { requestId: current.id, outcome: decision.outcome, comment: decision.comment });
  }
  governance.revision++;
  governance.events.push(event);
  if (governance.events.length > KNOWLEDGE_REVIEW_EVENT_LIMIT) {
    governance.events.shift();
    governance.omitted++;
  }
  if (!validKnowledgeGovernance(governance)) throw fail('KNOWLEDGE_REVIEW_INTEGRITY', 503);
  return { governance, replay: false };
}
