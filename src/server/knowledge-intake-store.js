import { getWorkspaceDatabase, mutateWorkspaceMetadata } from './workspace-store.js';
import { knowledgeActor } from './knowledge-access.js';
import { applyKnowledgeIntake } from './knowledge-intake-policy.js';
import { validKnowledgeIntake, knowledgeIntakeSummary } from '../shared/knowledge-intake.js';
import { workspaceMemberRole } from '../shared/workspace-access.js';
import { isActiveMember } from '../shared/workspace-membership.js';
import { canReadProject, canEditProject } from '../shared/project-access.js';

const missing = () => Object.assign(new Error('Material not found.'), { code: 'KNOWLEDGE_NOT_FOUND', statusCode: 404 });
function model(data, note, actor) {
  if (!validKnowledgeIntake(note.intake))
    throw Object.assign(new Error('The intake journal failed validation.'), { code: 'INTAKE_INTEGRITY', statusCode: 503 });
  const role = workspaceMemberRole(actor),
    admin = role === 'admin';
  const readable = new Set(data.projects.filter(project => canReadProject(project, actor.id, role)).map(project => project.id));
  const redact = record => {
    if (!record) return record;
    const value = { ...record };
    delete value.fingerprint;
    if (value.projectId && !readable.has(value.projectId)) {
      delete value.projectId;
      value.targetUnavailable = true;
    }
    if (value.duplicateId && !data.knowledgeNotes.some(note => note.id === value.duplicateId)) {
      delete value.duplicateId;
      value.targetUnavailable = true;
    }
    return value;
  };
  const intake = note.intake && { ...note.intake, result: redact(note.intake.result), events: note.intake.events.map(redact) };
  return {
    noteId: note.id,
    title: note.title || '',
    intake: intake || null,
    summary: knowledgeIntakeSummary(note),
    actor: actor.id,
    canManage: role !== 'viewer' && (admin || !intake || intake.ownerId === actor.id),
    canWrite: role !== 'viewer',
    members: data.members.map(member => ({
      id: member.id,
      name: member.name || member.email || '',
      active: isActiveMember(member),
      role: workspaceMemberRole(member),
    })),
    projects: data.projects
      .filter(project => !project.archived && canEditProject(project, actor.id, role))
      .map(project => ({ id: project.id, name: project.name })),
  };
}
export async function readKnowledgeIntake(id, profile, profiles = []) {
  // Metadata only: no source body or other catalog is needed for triage.
  const data = await getWorkspaceDatabase({
    fields: ['members', 'projects', 'knowledgeNotes'],
    knowledgeAuthorize: root => knowledgeActor(root, profile, profiles),
  });
  const actor = knowledgeActor(data, profile, profiles),
    note = data.knowledgeNotes.find(note => note.id === id);
  if (!note) throw missing();
  return model(data, note, actor);
}
export async function readKnowledgeIntakeQueue(options, profile, profiles = []) {
  const state = options.state || 'open',
    owner = options.owner || '',
    query = options.query || '',
    offset = Number(options.offset || 0);
  if (
    !['open', 'closed', 'all'].includes(state) ||
    typeof owner !== 'string' ||
    owner.length > 180 ||
    typeof query !== 'string' ||
    query.length > 200 ||
    !Number.isSafeInteger(offset) ||
    offset < 0
  )
    throw Object.assign(new Error('Invalid intake query.'), { code: 'INTAKE_INVALID', statusCode: 400 });
  const data = await getWorkspaceDatabase({ fields: ['members', 'knowledgeNotes'], knowledgeAuthorize: root => knowledgeActor(root, profile, profiles) });
  const actor = knowledgeActor(data, profile, profiles),
    term = query.trim().toLocaleLowerCase();
  const rows = data.knowledgeNotes
    .map(note => ({ note, summary: knowledgeIntakeSummary(note) }))
    .filter(
      ({ note, summary }) =>
        summary &&
        (state === 'all' || summary.state === state) &&
        (!owner || summary.ownerId === (owner === 'me' ? actor.id : owner)) &&
        (!term || `${note.title || ''} ${note.summary || ''} ${(note.tags || []).join(' ')}`.toLocaleLowerCase().includes(term)),
    )
    .sort((a, b) => String(b.summary.at).localeCompare(String(a.summary.at)) || a.note.id.localeCompare(b.note.id));
  return {
    total: rows.length,
    offset,
    limit: 25,
    rows: rows.slice(offset, offset + 25).map(({ note, summary }) => ({ id: note.id, title: note.title || '', ...summary })),
  };
}
export async function writeKnowledgeIntake(id, input, profile, profiles = []) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const baseline = await getWorkspaceDatabase({ fields: ['revision'] });
    let actorId;
    try {
      const saved = await mutateWorkspaceMetadata(
        data => {
          const actor = knowledgeActor(data, profile, profiles, { write: true }),
            note = data.knowledgeNotes.find(note => note.id === id);
          if (!note) throw missing();
          const result = applyKnowledgeIntake(note, actor, data, input);
          if (result.replay)
            throw Object.assign(new Error('Intake operation already recorded.'), { code: 'INTAKE_REPLAY_OK', result: model(data, note, actor) });
          note.intake = result.intake;
          actorId = actor.id;
          const meta = data._documentRevisions?.knowledge || {};
          data._documentRevisions = {
            ...data._documentRevisions,
            knowledge: {
              revision: Number(meta.revision || 0) + 1,
              createdAt: meta.createdAt || data.createdAt,
              updatedAt: new Date().toISOString(),
            },
          };
          return data;
        },
        baseline.revision,
        { role: 'admin', scope: 'knowledge' },
      );
      return model(
        saved,
        saved.knowledgeNotes.find(note => note.id === id),
        saved.members.find(member => member.id === actorId),
      );
    } catch (error) {
      if (error.code === 'INTAKE_REPLAY_OK') return error.result;
      if (error.code !== 'REVISION_CONFLICT' || attempt === 2) throw error;
    }
  }
}
