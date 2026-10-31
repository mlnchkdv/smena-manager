import { memberForProfile } from '../shared/member-identity.js';
import { entityAllowed, workspaceGraph, ENTITY_COLLECTIONS } from '../shared/relations.js';
import { graphView } from '../shared/graph-view.js';
import { currentCatalogUser } from './file-catalog-query.js';
import { canEditProject } from '../shared/project-access.js';

export function validateGraphQuery(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Invalid graph query.');
  const options = { ...input };
  for (const field of ['query', 'kind', 'project', 'center', 'source']) {
    if (options[field] !== undefined && (typeof options[field] !== 'string' || options[field].length > 500)) throw new TypeError('Invalid graph filter.');
  }
  if (options.kind && !Object.hasOwn(ENTITY_COLLECTIONS, options.kind)) throw new TypeError('Invalid graph type.');
  if (options.mode && !['view', 'candidates', 'export'].includes(options.mode)) throw new TypeError('Invalid graph mode.');
  if (options.depth !== undefined && ![1, 2].includes(Number(options.depth))) throw new TypeError('Invalid graph depth.');
  for (const field of ['connectedOnly', 'includeArchived', 'wikiOnly', 'inline'])
    if (options[field] !== undefined && typeof options[field] !== 'boolean') throw new TypeError('Invalid graph flag.');
  if (!Number.isSafeInteger(options.revision) || options.revision < 0) throw new TypeError('Invalid graph revision.');
  if (!options.documents || !['knowledge', 'bookmarks'].every(name => Number.isSafeInteger(options.documents[name]) && options.documents[name] >= 0))
    throw new TypeError('Invalid document revisions.');
  return options;
}

function publicNode(node) {
  const item = Object.fromEntries(
    ['summary', 'description', 'url'].filter(key => typeof node.item[key] === 'string').map(key => [key, node.item[key].slice(0, 1000)]),
  );
  return { key: node.key, kind: node.kind, id: node.id, title: node.title, tags: node.tags, project: node.project, context: node.context, item };
}

export function queryGraph(data, user, input) {
  const options = validateGraphQuery(input);
  user = currentCatalogUser(data, user);
  const documents = Object.fromEntries(['knowledge', 'bookmarks'].map(name => [name, Number(data._documentRevisions?.[name]?.revision || 0)]));
  if (data.revision !== options.revision || Object.keys(documents).some(name => documents[name] !== options.documents[name]))
    throw Object.assign(new Error('The workspace changed. Retry loading files.'), { statusCode: 409, code: 'REVISION_CONFLICT' });
  const access = { role: user.role, memberId: memberForProfile(data, user)?.id || user.id };
  const writable = new Set(data.projects.filter(project => canEditProject(project, access.memberId, access.role)).map(project => project.id));
  const graph = workspaceGraph(data, { ...access, includeArchived: options.mode === 'candidates' || options.includeArchived === true });
  let view;
  if (options.mode === 'candidates') {
    if (!options.source || !entityAllowed(data, options.source, access, true))
      throw Object.assign(new Error('You do not have permission to change this item.'), { statusCode: 403, code: 'ENTITY_FORBIDDEN' });
    const query = (options.query || '').trim().toLocaleLowerCase();
    const nodes = graph.nodes.filter(
      node =>
        node.key !== options.source &&
        (!options.wikiOnly || node.kind === 'note') &&
        (!options.kind || node.kind === options.kind) &&
        (options.inline || !node.project || writable.has(node.project)) &&
        [node.title, node.item.url, ...(node.tags || [])].join(' ').toLocaleLowerCase().includes(query),
    );
    view = { nodes: nodes.slice(0, 50), total: nodes.length, truncated: nodes.length > 50, edges: [], unresolved: [] };
  } else {
    view = graphView(graph, { ...options, limit: options.mode === 'export' ? Infinity : 250 });
  }
  return {
    ...view,
    nodes: view.nodes.map(node => ({
      ...publicNode(node),
      writable: ['admin', 'editor'].includes(access.role) && (!node.project || writable.has(node.project)),
    })),
    revision: data.revision,
    documents,
  };
}
