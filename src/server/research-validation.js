import { researchError, researchRef } from '../shared/research.js';
import { isActiveMember } from '../shared/workspace-membership.js';
import { workspaceMemberRole } from '../shared/workspace-access.js';
import { canReadProject } from '../shared/project-access.js';

export async function validateResearchRecord({ record, before, book, database, context, readObject }) {
  const data = record.data;
  for (const key of ['ownerId', 'reviewerId']) {
    if (!data[key]) continue;
    const member = database.members.find(member => member.id === data[key]);
    if (!isActiveMember(member) || !canReadProject(context.project, member.id, workspaceMemberRole(member))) throw researchError('RESEARCH_MEMBER_UNAVAILABLE');
  }
  async function reference(id, kind, frozen) {
    const row = book.records.find(row => row.id === id && row.kind === kind && !row.archived);
    if (!row) throw researchError('RESEARCH_REFERENCE_UNAVAILABLE');
    const ref = frozen?.ref || row.ref;
    if (!researchRef(ref)) throw researchError('RESEARCH_REFERENCE_UNAVAILABLE');
    const linked = await readObject(ref, record.projectId);
    if (linked.id !== id || linked.kind !== kind || (frozen && linked.revision !== frozen.revision)) throw researchError('RESEARCH_REFERENCE_UNAVAILABLE');
    return { record: linked, version: { id, revision: linked.revision, ref } };
  }
  if (data.experimentId) await reference(data.experimentId, 'experiment');
  if (data.datasetId) await reference(data.datasetId, 'dataset', data.datasetVersion);
  if (data.protocolId) await reference(data.protocolId, 'protocol', data.protocolVersion);
  if (record.kind !== 'run') return;
  data.state ||= 'planned';
  if (!before && data.state !== 'planned') throw researchError('RESEARCH_STATE_TRANSITION', 409);
  if (data.state === 'running' && before?.data.state !== 'running') {
    if (
      !data.profile ||
      !data.experimentId ||
      !data.datasetId ||
      !data.protocolId ||
      !data.codeRevision?.trim() ||
      !data.hardware ||
      !data.config ||
      Array.isArray(data.config) ||
      typeof data.config !== 'object'
    )
      throw researchError('RESEARCH_PLAN_INCOMPLETE');
    const experiment = await reference(data.experimentId, 'experiment');
    if (!experiment.record.data.hypothesis?.trim() || !experiment.record.data.baseline?.trim() || !experiment.record.data.criterion?.trim())
      throw researchError('RESEARCH_CRITERION_REQUIRED');
    const dataset = await reference(data.datasetId, 'dataset', data.datasetVersion),
      protocol = await reference(data.protocolId, 'protocol', data.protocolVersion);
    data.datasetVersion = dataset.version;
    data.protocolVersion = protocol.version;
    data.startedAt = new Date().toISOString();
    record.plan = {
      experiment: experiment.version,
      dataset: dataset.version,
      protocol: protocol.version,
      config: structuredClone(data.config),
      codeRevision: data.codeRevision,
      profile: data.profile,
      fixedAt: data.startedAt,
    };
  }
  if (data.state === 'completed' && (!Array.isArray(data.metrics) || !data.metrics.length)) throw researchError('RESEARCH_METRICS_REQUIRED');
  if (['completed', 'failed', 'cancelled'].includes(data.state) && before?.data.state !== data.state) data.finishedAt = new Date().toISOString();
}
