import { getWorkspaceFilesSnapshot, getWorkspaceFileCatalogPage, getWorkspaceDatabase, queryWorkspaceFileCatalog } from './workspace-store.js';
import { researchError, researchId } from '../shared/research.js';

export async function researchFiles(projectId, profile, query = '') {
  const { revision } = await getWorkspaceDatabase({ fields: ['revision'] });
  const matches = await queryWorkspaceFileCatalog(profile, { revision, project: projectId, context: projectId, query, limit: 30 });
  const page = await getWorkspaceFileCatalogPage(profile, { project: projectId, ids: matches.files.map(file => file.id), limit: 50 });
  return (page.files || [])
    .filter(file => file.project === projectId && (!query || file.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())))
    .slice(0, 30)
    .map(file => ({ id: file.id, name: file.name, bytes: Number(file.bytes || 0), sha256: file.sha256 || null }));
}
export async function resolveResearchFiles(profile, ids) {
  return (await getWorkspaceFilesSnapshot(profile, ids)).files;
}
export async function validateResearchEvidence(record, profile, resolveFiles) {
  const artifacts = record.data.artifacts || [];
  if (artifacts.some(item => !item || !researchId(item.fileId) || typeof item.role !== 'string' || item.role.length > 100))
    throw researchError('RESEARCH_EVIDENCE_INVALID');
  const ids = [...new Set(artifacts.map(item => item.fileId))];
  const files = ids.length ? await resolveFiles(profile, ids) : [];
  record.data.artifacts = artifacts.map(item => {
    const file = files.find(file => file.id === item.fileId && file.project === record.projectId);
    if (!file) throw researchError('RESEARCH_EVIDENCE_UNAVAILABLE', 409);
    if (item.sha256 && file.sha256 && item.sha256 !== file.sha256) throw researchError('RESEARCH_EVIDENCE_CHANGED', 409);
    return {
      fileId: file.id,
      role: item.role,
      name: file.name,
      bytes: Number(file.bytes || 0),
      sha256: file.sha256 || null,
      checksumStatus: file.sha256 ? 'recorded' : 'unavailable',
    };
  });
  for (const metric of record.data.metrics || []) {
    if (metric.status !== 'measured') continue;
    if (!metric.scope || !metric.aggregation || !metric.n || !metric.protocolId || !metric.evidenceId) throw researchError('RESEARCH_METRIC_EVIDENCE_REQUIRED');
    if (metric.origin !== 'author' && metric.protocolId !== record.data.protocolId) throw researchError('RESEARCH_METRIC_PROTOCOL_MISMATCH');
    if (!ids.includes(metric.evidenceId)) throw researchError('RESEARCH_METRIC_EVIDENCE_REQUIRED');
  }
}
