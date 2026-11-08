import { createHash } from 'node:crypto';
import { INTAKE_OUTCOMES, KNOWLEDGE_INTAKE_EVENT_LIMIT, validKnowledgeIntake } from '../shared/knowledge-intake.js';
import { workspaceMemberRole } from '../shared/workspace-access.js';
import { isActiveMember } from '../shared/workspace-membership.js';
import { canEditProject } from '../shared/project-access.js';

const fail = (code, statusCode = 400) => Object.assign(new Error('The intake operation could not be applied.'), { code, statusCode });
const allowed = new Set(['action', 'operationId', 'intakeRevision', 'ownerId', 'outcome', 'projectId', 'duplicateId', 'reason']);
export function applyKnowledgeIntake(note, actor, data, input, now = new Date().toISOString()) {
  if (!isActiveMember(actor) || workspaceMemberRole(actor) === 'viewer') throw fail('INTAKE_FORBIDDEN', 403);
  if (!validKnowledgeIntake(note.intake)) throw fail('INTAKE_INTEGRITY', 503);
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some(key => !allowed.has(key)) ||
    !['enroll', 'assign', 'resolve', 'reopen'].includes(input.action) ||
    typeof input.operationId !== 'string' ||
    !/^[\w-]{8,100}$/.test(input.operationId) ||
    !Number.isSafeInteger(input.intakeRevision) ||
    input.intakeRevision < 0
  )
    throw fail('INTAKE_INVALID');
  for (const field of ['ownerId', 'outcome', 'projectId', 'duplicateId', 'reason'])
    if (Object.hasOwn(input, field) && typeof input[field] !== 'string') throw fail('INTAKE_INVALID');
  if ((input.reason || '').length > 1000) throw fail('INTAKE_INVALID');
  const fingerprint = createHash('sha256')
    .update(JSON.stringify([actor.id, Object.fromEntries(Object.entries(input).sort(([a], [b]) => a.localeCompare(b)))]))
    .digest('hex');
  const prior = note.intake,
    replay = prior?.events.find(event => event.id === input.operationId);
  if (replay) {
    if (replay.fingerprint !== fingerprint) throw fail('INTAKE_STALE', 409);
    return { intake: prior, replay: true };
  }
  if ((prior?.revision || 0) !== input.intakeRevision) throw fail('INTAKE_STALE', 409);
  if ((prior?.revision || 0) >= 1000000) throw fail('INTAKE_LIMIT', 409);
  const admin = workspaceMemberRole(actor) === 'admin',
    owner = prior?.ownerId || actor.id;
  if (owner !== actor.id && !admin) throw fail('INTAKE_FORBIDDEN', 403);
  if (input.action === 'enroll' && (prior || note.captureStatus === 'unprocessed')) throw fail('INTAKE_STALE', 409);
  if (input.action !== 'enroll' && !prior && note.captureStatus !== 'unprocessed') throw fail('INTAKE_STALE', 409);
  const ownerId = input.action === 'assign' ? input.ownerId : owner;
  if (!data.members.some(member => member.id === ownerId && isActiveMember(member) && workspaceMemberRole(member) !== 'viewer')) throw fail('INTAKE_INVALID');
  if (input.action === 'reopen' ? prior?.state !== 'closed' : input.action !== 'assign' && prior?.state === 'closed') throw fail('INTAKE_STALE', 409);
  let result = input.action === 'assign' ? prior?.result || null : null;
  if (input.action === 'resolve') {
    if (!INTAKE_OUTCOMES.includes(input.outcome) || (['duplicate', 'dismissed'].includes(input.outcome) && !input.reason?.trim())) throw fail('INTAKE_INVALID');
    result = { outcome: input.outcome, reason: (input.reason || '').trim() };
    if (input.outcome === 'project') {
      const project = data.projects.find(project => project.id === input.projectId && !project.archived);
      if (!canEditProject(project, actor.id, workspaceMemberRole(actor))) throw fail('INTAKE_FORBIDDEN', 403);
      result.projectId = project.id;
    }
    if (input.outcome === 'duplicate') {
      if (input.duplicateId === note.id || !data.knowledgeNotes.some(target => target.id === input.duplicateId)) throw fail('INTAKE_INVALID');
      result.duplicateId = input.duplicateId;
    }
  }
  const event = { id: input.operationId, fingerprint, action: input.action, by: actor.id, at: now, ownerId, reason: result?.reason || '', ...(result || {}) };
  const events = [...(prior?.events || []), event];
  return {
    intake: {
      version: 1,
      revision: (prior?.revision || 0) + 1,
      state: input.action === 'resolve' ? 'closed' : input.action === 'assign' ? prior?.state || 'open' : 'open',
      ownerId,
      result,
      at: now,
      events: events.slice(-KNOWLEDGE_INTAKE_EVENT_LIMIT),
      omitted: (prior?.omitted || 0) + Math.max(0, events.length - KNOWLEDGE_INTAKE_EVENT_LIMIT),
    },
    replay: false,
  };
}
