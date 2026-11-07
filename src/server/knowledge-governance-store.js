import { getWorkspaceDatabase, mutateWorkspaceMetadata } from './workspace-store.js';
import { getStorageProvider } from './storage/index.js';
import { knowledgeActor } from './knowledge-access.js';
import { loadKnowledgeBody } from './knowledge-body-store.js';
import { knowledgeSnapshotHash } from './knowledge-versions.js';
import { applyKnowledgeReview, knowledgeReviewHash } from './knowledge-governance-policy.js';
import { validKnowledgeGovernance, knowledgeGovernanceStatus, KNOWLEDGE_REVIEW_EVENT_LIMIT } from '../shared/knowledge-governance.js';
import { workspaceMemberRole } from '../shared/workspace-access.js';
import { isActiveMember } from '../shared/workspace-membership.js';
import { calendarDate } from '../shared/calendar-time.js';

const missing = () => Object.assign(new Error('Note not found.'), { code: 'KNOWLEDGE_NOT_FOUND', statusCode: 404 });
async function reviewModel(data, note, actor, knownHashes) {
  if (!validKnowledgeGovernance(note.governance))
    throw Object.assign(new Error('The review journal failed validation.'), { code: 'KNOWLEDGE_REVIEW_INTEGRITY', statusCode: 503 });
  const loaded = knownHashes ? null : await loadKnowledgeBody(getStorageProvider(), note);
  const { noteHash, reviewHash } = knownHashes || { noteHash: knowledgeSnapshotHash(loaded), reviewHash: knowledgeReviewHash(loaded) };
  const creator = data.members.find(member => member.id === note.createdBy && isActiveMember(member) && workspaceMemberRole(member) !== 'viewer');
  const defaultOwner = creator?.id || actor.id;
  return {
    noteId: note.id,
    noteHash,
    reviewHash,
    governance: note.governance || null,
    status: knowledgeGovernanceStatus(note.governance, reviewHash, calendarDate(new Date(), actor.timeZone)),
    actor: actor.id,
    canWrite: workspaceMemberRole(actor) !== 'viewer',
    defaultOwner,
    canConfigure:
      workspaceMemberRole(actor) === 'admin' || (workspaceMemberRole(actor) === 'editor' && (note.governance?.ownerId || defaultOwner) === actor.id),
    revision: Number(data._documentRevisions?.knowledge?.revision || 0),
    eventLimit: KNOWLEDGE_REVIEW_EVENT_LIMIT,
    members: (data.members || []).map(member => ({
      id: member.id,
      name: String(member.name || member.email || '').slice(0, 200),
      role: workspaceMemberRole(member),
      active: isActiveMember(member),
    })),
  };
}
export async function readKnowledgeGovernance(id, profile, profiles = []) {
  const data = await getWorkspaceDatabase({
    fields: ['members', 'knowledgeNotes', '_documentRevisions'],
    knowledgeIds: [id],
    knowledgeAuthorize: root => knowledgeActor(root, profile, profiles),
  });
  const actor = knowledgeActor(data, profile, profiles),
    note = data.knowledgeNotes?.find(n => n.id === id);
  if (!note) throw missing();
  return reviewModel(data, note, actor);
}
export async function writeKnowledgeGovernance(id, input, profile, profiles = []) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const baseline = await getWorkspaceDatabase({ fields: ['revision'] });
    let selected;
    try {
      const saved = await mutateWorkspaceMetadata(
        async data => {
          const actor = knowledgeActor(data, profile, profiles, { write: true }),
            note = data.knowledgeNotes?.find(n => n.id === id);
          if (!note) throw missing();
          const loaded = await loadKnowledgeBody(getStorageProvider(), note),
            hashes = { noteHash: knowledgeSnapshotHash(loaded), reviewHash: knowledgeReviewHash(loaded) };
          const result = applyKnowledgeReview(note, hashes.reviewHash, actor, data.members, input);
          if (result.replay)
            throw Object.assign(new Error('Review already recorded.'), {
              code: 'KNOWLEDGE_REVIEW_REPLAY_OK',
              result: await reviewModel(data, note, actor, hashes),
            });
          note.governance = result.governance;
          selected = { id: note.id, actor, hashes };
          const meta = data._documentRevisions?.knowledge || {};
          data._documentRevisions = {
            ...data._documentRevisions,
            knowledge: { revision: Number(meta.revision || 0) + 1, createdAt: meta.createdAt || data.createdAt, updatedAt: new Date().toISOString() },
          };
          return data;
        },
        baseline.revision,
        { role: 'admin', scope: 'knowledge' },
      );
      return reviewModel(
        saved,
        saved.knowledgeNotes.find(n => n.id === selected.id),
        selected.actor,
        selected.hashes,
      );
    } catch (error) {
      if (error.code === 'KNOWLEDGE_REVIEW_REPLAY_OK') return error.result;
      if (error.code !== 'REVISION_CONFLICT' || attempt === 2) throw error;
    }
  }
}
