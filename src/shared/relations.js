import { canEditProject, canReadProject, entityProjectId } from './project-access.js';
import { bindWikiReferences } from './knowledge-links.js';
import { folderTrail } from './knowledge-tools.js';
export { bindWikiReferences } from './knowledge-links.js';

export const ENTITY_COLLECTIONS = Object.freeze({ note: 'knowledgeNotes', bookmark: 'links', file: 'files', project: 'projects', task: 'tasks' });
export const RELATION_TYPES = Object.freeze({ related: 'Related to', source: 'Source', example: 'Example', used: 'Used in' });
export const entityKey = (kind, id) => `${kind}:${id}`;
export function resolveGraphEntity(data, key) {
  const split = String(key || '').indexOf(':');
  const kind = String(key || '').slice(0, split);
  const id = String(key || '').slice(split + 1);
  const item = (data[ENTITY_COLLECTIONS[kind]] || []).find(entity => entity.id === id);
  return item ? { key, kind, id, item } : null;
}

export function entityAllowed(data, key, { role = 'viewer', memberId = data.me } = {}, write = false) {
  const entity = resolveGraphEntity(data, key);
  if (!entity || (write && !['admin', 'editor'].includes(role))) return false;
  const projectId = entity.kind === 'project' ? entity.id : entityProjectId(entity.item, data);
  if (!projectId) return true;
  const project = (data.projects || []).find(item => item.id === projectId);
  return (write ? canEditProject : canReadProject)(project, memberId, role);
}

export function workspaceGraph(data, options = {}) {
  const nodes = [];
  const visible = new Set();
  const projectMap = new Map((data.projects || []).map(project => [project.id, project]));
  const noteFolders = new Map((data.knowledgeFolders || []).map(folder => [folder.id, folder]));
  const projectIds = new Set((data.projects || []).filter(project => options.includeArchived || !project.archived).map(project => project.id));
  for (const [kind, field] of Object.entries(ENTITY_COLLECTIONS)) {
    for (const item of data[field] || []) {
      const key = entityKey(kind, item.id);
      const project = kind === 'project' ? item.id : entityProjectId(item, data);
      if (!options.includeArchived && (item.archived || item.is_archived || (project && !projectIds.has(project)))) continue;
      if (project && !canReadProject(projectMap.get(project), options.memberId || data.me, options.role || 'viewer')) continue;
      const context = [
        kind === 'note'
          ? folderTrail(item.folderId, noteFolders)
              .map(folder => folder.name)
              .join(' / ')
          : '',
        projectMap.get(project)?.name || '',
      ]
        .filter(Boolean)
        .join(' · ');
      nodes.push({ key, kind, id: item.id, title: item.title || item.name || item.url || item.id, project, context, tags: item.tags || [], item });
      visible.add(key);
    }
  }
  const edges = [];
  const add = edge => {
    if (edge.from !== edge.to && visible.has(edge.from) && visible.has(edge.to)) edges.push(edge);
  };
  for (const relation of data.relations || []) if (!relation.deletedAt) add({ ...relation, origin: 'manual' });
  const notes = bindWikiReferences(structuredClone(data.knowledgeNotes || []));
  const noteIds = new Set(notes.map(note => note.id));
  const unresolved = [];
  for (const note of notes) {
    const from = entityKey('note', note.id);
    if (!visible.has(from)) continue;
    for (const ref of note.wikiRefs || []) {
      if (!ref.target || !noteIds.has(ref.target)) unresolved.push({ from, label: ref.label });
      else add({ id: `wiki:${note.id}:${ref.target}`, from, to: entityKey('note', ref.target), type: 'source', origin: 'wiki' });
    }
  }
  for (const node of nodes) {
    if (node.kind !== 'project' && node.project)
      add({ id: `project:${node.key}`, from: node.key, to: entityKey('project', node.project), type: 'used', origin: 'automatic' });
    if (node.kind === 'file' && node.item.task)
      add({ id: `attachment:${node.id}`, from: node.key, to: entityKey('task', node.item.task), type: 'used', origin: 'automatic' });
  }
  return { nodes, edges, unresolved };
}

export function graphNeighborhood(graph, center, depth = 1) {
  if (!center) return graph;
  const keys = new Set(graph.nodes.some(node => node.key === center) ? [center] : []);
  let frontier = [...keys];
  const neighbors = new Map(graph.nodes.map(node => [node.key, []]));
  for (const edge of graph.edges) {
    neighbors.get(edge.from)?.push(edge.to);
    neighbors.get(edge.to)?.push(edge.from);
  }
  for (let level = 0; level < Math.min(2, Math.max(1, Number(depth) || 1)); level++) {
    const next = [];
    for (const key of frontier)
      for (const neighbor of neighbors.get(key) || [])
        if (!keys.has(neighbor)) {
          keys.add(neighbor);
          next.push(neighbor);
        }
    frontier = next;
  }
  return {
    nodes: graph.nodes.filter(node => keys.has(node.key)),
    edges: graph.edges.filter(edge => keys.has(edge.from) && keys.has(edge.to)),
    unresolved: graph.unresolved.filter(ref => keys.has(ref.from)),
  };
}
