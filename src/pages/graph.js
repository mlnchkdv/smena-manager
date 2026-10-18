import { D, S, visibleProjects } from '../core/store.js';
import { esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { empty } from '../ui/helpers.js';
import { ENTITY_ICONS, ENTITY_LABELS, graphOptions, relationsPanel } from '../ui/relations.js';
import { entityAllowed, workspaceGraph } from '../shared/relations.js';
import { graphView } from '../shared/graph-view.js';
import { mountGraph } from '../features/graph-renderer.js';
import { render } from '../shell/render.js';

export function pageGraph() {
  const ui = S.ui;
  const center = ui.params.center || '';
  const graph = workspaceGraph(D(), { ...graphOptions(), includeArchived: ui.graphArchive === 'yes' });
  const view = graphView(graph, {
    center,
    depth: ui.graphDepth || 1,
    query: ui.graphQuery,
    kind: ui.graphKind,
    project: ui.graphProject,
    connectedOnly: ui.graphConnected === 'yes',
  });
  const selected = view.nodes.find(node => node.key === ui.graphSelected) || view.nodes.find(node => node.key === center) || view.nodes[0];
  const list = ui.graphView === 'list';
  if (!list && view.nodes.length)
    mountGraph(view, selected?.key, center, key => {
      ui.graphSelected = key;
      render();
    });
  return `<div class="graph-page"><header class="graph-head"><div><h1>Graph</h1><p>Explore connections between your team's materials.</p></div><div class="row"><button class="btn btn-secondary btn-sm" data-a="exportGraph">${ic('download', 14)}Export graph</button>${center ? `<button class="btn btn-secondary btn-sm" data-a="showGraph">${ic('network', 14)}All materials</button>` : ''}</div></header>
    <div class="graph-toolbar"><label class="graph-search"><span class="sr">Search graph</span><input id="graph-search" class="input" data-in="graphQuery" value="${esc(ui.graphQuery || '')}" placeholder="Search materials and tags" aria-label="Search graph"></label><label><span class="sr">Material type</span><select class="select" data-in="graphFilter" data-field="graphKind" aria-label="Material type"><option value="">All types</option>${Object.entries(
      ENTITY_LABELS,
    )
      .map(([kind, label]) => `<option value="${kind}" ${ui.graphKind === kind ? 'selected' : ''}>${label}</option>`)
      .join(
        '',
      )}</select></label><label><span class="sr">Project</span><select class="select" data-in="graphFilter" data-field="graphProject" aria-label="Project"><option value="">All projects</option>${visibleProjects()
      .map(project => `<option value="${esc(project.id)}" ${ui.graphProject === project.id ? 'selected' : ''} translate="no">${esc(project.name)}</option>`)
      .join(
        '',
      )}</select></label><div class="seg" role="group" aria-label="Graph view"><button data-a="set" data-k="graphView" data-v="graph" class="${!list ? 'on' : ''}" aria-pressed="${!list}">Graph</button><button data-a="set" data-k="graphView" data-v="list" class="${list ? 'on' : ''}" aria-pressed="${list}">List</button></div></div>
    <div class="graph-options"><label class="row"><input type="checkbox" data-in="graphCheck" data-field="graphConnected" ${ui.graphConnected === 'yes' ? 'checked' : ''}>Connected only</label><label class="row"><input type="checkbox" data-in="graphCheck" data-field="graphArchive" ${ui.graphArchive === 'yes' ? 'checked' : ''}>Include archived</label>${center ? `<label class="row"><span>Depth</span><select class="select" data-in="graphFilter" data-field="graphDepth" aria-label="Depth"><option value="1" ${String(ui.graphDepth || 1) === '1' ? 'selected' : ''}>1</option><option value="2" ${String(ui.graphDepth) === '2' ? 'selected' : ''}>2</option></select></label>` : ''}<button class="link" data-a="resetGraphFilters">Clear filters</button><span class="sp"></span><span><span>Materials</span>: ${view.total} · <span>Connections</span>: ${view.edges.length}</span></div>
    ${view.total > view.nodes.length ? '<p class="hint" role="status">Showing up to 250 materials. Refine the filters or open a local graph.</p>' : ''}
    ${!view.nodes.length ? empty('network', 'No matching materials.', center ? 'The selected material is unavailable or excluded by filters.' : 'Add materials or change the filters to explore connections.') : `<div class="graph-layout"><section class="graph-stage" aria-label="Graph navigation">${list ? `<div class="graph-list">${view.nodes.map(node => `<button class="graph-list-item ${selected?.key === node.key ? 'on' : ''}" data-a="selectGraphNode" data-key="${esc(node.key)}" aria-pressed="${selected?.key === node.key}">${ic(ENTITY_ICONS[node.kind], 16)}<span class="trunc" translate="no">${esc(node.title)}</span><span class="badge">${ENTITY_LABELS[node.kind]}</span></button>`).join('')}</div>` : `<div class="graph-controls"><button class="ibtn" data-a="graphControl" data-command="in" aria-label="Zoom in">${ic('plus', 16)}</button><button class="ibtn" data-a="graphControl" data-command="out" aria-label="Zoom out">${ic('minus', 16)}</button><button class="ibtn" data-a="graphControl" data-command="fit" aria-label="Fit graph">${ic('maximize', 16)}</button></div><div id="knowledge-graph-canvas" role="img" aria-label="Interactive material graph. Use List view for keyboard navigation."></div><p class="graph-help">Select a node to see its connections. Drag to move; pinch or scroll to zoom.</p>`}</section><aside class="graph-detail"><span class="badge">${ENTITY_LABELS[selected.kind]}</span><h2 translate="no">${esc(selected.title)}</h2><p class="graph-description" translate="no">${esc(selected.item.summary || selected.item.description || selected.item.url || '')}</p><div class="graph-detail-actions"><button class="btn btn-primary btn-sm" data-a="openRelatedEntity" data-key="${esc(selected.key)}">Open material</button><button class="btn btn-secondary btn-sm" data-a="showGraph" data-key="${esc(selected.key)}">Local graph</button>${entityAllowed(D(), selected.key, graphOptions(), true) ? `<button class="btn btn-secondary btn-sm" data-a="addRelationPicker" data-key="${esc(selected.key)}">${ic('plus', 13)}Add connection</button>` : ''}</div>${relationsPanel(selected.key)}</aside></div>`}
  </div>`;
}
