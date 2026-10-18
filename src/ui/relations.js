import { D, S } from '../core/store.js';
import { esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { entityAllowed, RELATION_TYPES, workspaceGraph } from '../shared/relations.js';

export const ENTITY_LABELS = { note: 'Note', bookmark: 'Bookmark', file: 'File', project: 'Project', task: 'Task' };
export const ENTITY_ICONS = { note: 'file-text', bookmark: 'bookmark', file: 'paperclip', project: 'folder', task: 'circle-check' };
export const graphOptions = () => ({ role: S.ui.currentUser?.role || 'viewer', memberId: D().me });
let cachedGraph;
export function relationGraph() {
  if (!cachedGraph || cachedGraph.data !== D() || cachedGraph.revision !== S.ui.renderRevision)
    cachedGraph = { data: D(), revision: S.ui.renderRevision, graph: workspaceGraph(D(), { ...graphOptions(), includeArchived: true }) };
  return cachedGraph.graph;
}

export function relationsPanel(key, compact = false) {
  const graph = relationGraph();
  const nodes = new Map(graph.nodes.map(node => [node.key, node]));
  const edges = graph.edges.filter(edge => edge.from === key || edge.to === key);
  const writable = entityAllowed(D(), key, graphOptions(), true);
  const rows = incoming =>
    edges
      .filter(edge => (incoming ? edge.to === key : edge.from === key))
      .map(edge => {
        const node = nodes.get(incoming ? edge.from : edge.to);
        return `<div class="relation-row"><button class="relation-open" data-a="openRelatedEntity" data-key="${esc(node.key)}">${ic(ENTITY_ICONS[node.kind], 14)}<span class="trunc" translate="no">${esc(node.title)}</span></button><span class="relation-type">${RELATION_TYPES[edge.type] || 'Related to'}</span>${edge.origin === 'manual' && writable && entityAllowed(D(), node.key, graphOptions(), true) ? `<button class="ibtn ibtn-xs" data-a="removeRelation" data-id="${esc(edge.id)}" aria-label="Remove connection">${ic('x', 13)}</button>` : `<span class="relation-origin">${edge.origin === 'wiki' ? 'Wiki link' : 'Automatic'}</span>`}</div>`;
      })
      .join('');
  const unresolved = graph.unresolved.filter(ref => ref.from === key);
  const unresolvedHtml = unresolved.length
    ? `<div class="relation-unresolved"><span>Unresolved wiki links</span>: ${unresolved.map(ref => (writable ? `<button class="link" data-a="resolveWikiReference" data-key="${esc(key)}" data-label="${esc(ref.label)}" translate="no">${esc(ref.label)}</button>` : `<span translate="no">${esc(ref.label)}</span>`)).join(', ')}<p class="hint">Select a wiki link to choose its target, or create the missing note.</p></div>`
    : '';
  const content = `<section class="relations-panel" aria-label="Material connections"><div class="relations-head"><h3>Connections</h3><span class="sp"></span><button class="btn btn-ghost btn-sm" data-a="showGraph" data-key="${esc(key)}">${ic('network', 14)}Show in graph</button>${writable ? `<button class="ibtn ibtn-sm" data-a="addRelationPicker" data-key="${esc(key)}" aria-label="Add connection">${ic('plus', 14)}</button>` : ''}</div>${edges.length ? `<h4>Related materials</h4>${rows(false)}<h4>Where used</h4>${rows(true)}` : '<p class="hint">No connections yet. Link this material to give it context.</p>'}${unresolvedHtml}</section>`;
  return compact ? `<details class="relations-compact"><summary><span>Connections</span> · ${edges.length}</summary>${content}</details>` : content;
}

export function relationPicker(m) {
  const query = String(m.query || '')
    .trim()
    .toLocaleLowerCase();
  const graph = relationGraph();
  const candidates = graph.nodes.filter(
    node =>
      node.key !== m.source &&
      (!m.wikiLabel || node.kind === 'note') &&
      entityAllowed(D(), node.key, graphOptions(), true) &&
      (!m.kind || node.kind === m.kind) &&
      [node.title, node.item.url, ...(node.tags || [])].join(' ').toLocaleLowerCase().includes(query),
  );
  return `<div class="modal-h"><h2>Add connection</h2><button class="ibtn" data-a="closeModal" aria-label="Close">${ic('x', 16)}</button></div><div class="modal-b relation-picker"><label class="label" for="relation-search">Find material</label><input id="relation-search" class="input" data-in="relationQuery" value="${esc(m.query || '')}" placeholder="Search notes, bookmarks, files, projects and tasks" autofocus><div class="relation-picker-filters"><label class="field"><span class="label">Material type</span><select class="select" data-in="relationKind" aria-label="Material type" ${m.wikiLabel ? 'disabled' : ''}><option value="">All types</option>${Object.entries(
    ENTITY_LABELS,
  )
    .map(([kind, label]) => `<option value="${kind}" ${m.kind === kind ? 'selected' : ''}>${label}</option>`)
    .join('')}</select></label><label class="field"><span class="label">Connection type</span><select class="select" data-in="relationType" aria-label="Connection type" ${m.wikiLabel ? 'disabled' : ''}>${Object.entries(
    RELATION_TYPES,
  )
    .map(([type, label]) => `<option value="${type}" ${(m.relationType || 'related') === type ? 'selected' : ''}>${label}</option>`)
    .join('')}</select></label></div><div class="relation-candidates">${
    candidates
      .slice(0, 50)
      .map(
        node =>
          `<button class="relation-candidate" data-a="createRelation" data-key="${esc(node.key)}">${ic(ENTITY_ICONS[node.kind], 16)}<span class="trunc" translate="no">${esc(node.title)}</span><span class="badge">${ENTITY_LABELS[node.kind]}</span></button>`,
      )
      .join('') || '<p class="hint">No matching materials.</p>'
  }</div>${candidates.length > 50 ? '<p class="hint">Showing 50 materials. Refine your search.</p>' : ''}</div><div class="modal-f"><button class="btn btn-secondary" data-a="closeModal">Cancel</button></div>`;
}
