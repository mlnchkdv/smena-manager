import { diagramViewsControl } from '../ui/diagram-views.js';
import { preparePersonalGraph } from '../core/diagram-view-state.js';
import { diagramPreferences } from '../shared/diagram-views.js';
import { D, S, visibleProjects } from '../core/store.js';
import { esc } from '../core/utils.js';
import { t as tr } from '../core/i18n.js';
import { ic } from '../core/icons.js';
import { empty } from '../ui/helpers.js';
import { ENTITY_ICONS, ENTITY_LABELS, graphOptions, relationsPanel } from '../ui/relations.js';
import { workspaceGraph } from '../shared/relations.js';
import { graphView } from '../shared/graph-view.js';
import { GRAPH_KINDS } from '../shared/graph-layout.js';
import { mountGraph } from '../features/graph-renderer.js';
import { render } from '../shell/render.js';
import { graphReadModel } from '../core/graph-query-state.js';
import '../features/graph-actions.js';

function graphFilters(ui, center) {
  return `<div class="graph-filter-panel" id="graph-filters" ${ui.graphFiltersOpen ? '' : 'hidden'}>
    <label class="field"><span class="label">Material type</span><select class="select" data-in="graphFilter" data-field="graphKind" aria-label="Material type"><option value="">All types</option>${Object.entries(
      ENTITY_LABELS,
    )
      .map(([kind, label]) => `<option value="${kind}" ${ui.graphKind === kind ? 'selected' : ''}>${label}</option>`)
      .join('')}</select></label>
    <label class="field"><span class="label">Project</span><select class="select" data-in="graphFilter" data-field="graphProject" aria-label="Project"><option value="">All projects</option>${visibleProjects()
      .map(project => `<option value="${esc(project.id)}" ${ui.graphProject === project.id ? 'selected' : ''} translate="no">${esc(project.name)}</option>`)
      .join('')}</select></label>
    <div class="graph-filter-checks"><label class="row"><input type="checkbox" data-in="graphCheck" data-field="graphConnected" ${ui.graphConnected === 'yes' ? 'checked' : ''}>Connected only</label><label class="row"><input type="checkbox" data-in="graphCheck" data-field="graphArchive" ${ui.graphArchive === 'yes' ? 'checked' : ''}>Include archived</label></div>
    ${center ? `<label class="field graph-depth"><span class="label">Depth</span><select class="select" data-in="graphFilter" data-field="graphDepth" aria-label="Depth"><option value="1" ${String(ui.graphDepth || 1) === '1' ? 'selected' : ''}>1</option><option value="2" ${String(ui.graphDepth) === '2' ? 'selected' : ''}>2</option></select></label>` : ''}
    <button class="btn btn-ghost btn-sm" data-a="resetGraphFilters">Clear filters</button>
  </div>`;
}

function graphDetails(node) {
  if (!node) return '';
  const pinned = diagramPreferences(S.prefs.diagramViews).pins.some(p => p.id === node.key);
  const description = node.item.summary || node.item.description || node.item.url;
  return `<aside class="graph-detail ${S.ui.graphInspectorExpanded ? 'is-expanded' : ''}" aria-label="Material details"><div class="graph-detail-primary"><div class="graph-detail-head"><span class="badge">${ic(ENTITY_ICONS[node.kind], 12)}${ENTITY_LABELS[node.kind]}</span><button class="ibtn graph-detail-expand" data-a="toggleGraphInspector" aria-pressed="${!!S.ui.graphInspectorExpanded}" aria-label="Expand or reduce details">${ic(S.ui.graphInspectorExpanded ? 'chevron-down' : 'chevron-up', 15)}</button><button class="ibtn" data-a="clearGraphSelection" aria-label="Close material details">${ic('x', 15)}</button></div>
    <h2 translate="no" title="${esc(node.title)}">${esc(node.title)}</h2>
    <div class="graph-detail-actions"><button class="btn btn-primary btn-sm" data-a="openRelatedEntity" data-key="${esc(node.key)}">Open material</button><button class="ibtn" data-a="toggleGraphPin" data-key="${esc(node.key)}" aria-pressed="${pinned}" aria-label="${tr(pinned ? 'Unpin node' : 'Pin node')}">${ic('pin', 14)}</button><button class="btn btn-secondary btn-sm" data-a="showGraph" data-key="${esc(node.key)}">Local graph</button></div></div>
    ${description ? `<details class="graph-description-disclosure"><summary>Description</summary><p class="graph-description" translate="no">${esc(description)}</p></details>` : ''}
    ${S.ui.graphView === 'list' ? '' : '<button class="btn btn-ghost btn-sm" data-a="graphControl" data-command="selection">Focus connections</button>'}
    ${relationsPanel(node.key)}
  </aside>`;
}

export function pageGraph() {
  const ui = S.ui,
    center = ui.params.center || '';
  preparePersonalGraph(center);
  const remote = graphReadModel('view');
  const pending = !!remote && !remote.view;
  const view = remote
    ? remote.view || { nodes: [], edges: [], total: 0 }
    : graphView(workspaceGraph(D(), { ...graphOptions(), includeArchived: ui.graphArchive === 'yes' }), {
        center,
        depth: ui.graphDepth || 1,
        query: ui.graphQuery,
        kind: ui.graphKind,
        project: ui.graphProject,
        connectedOnly: ui.graphConnected === 'yes',
      });
  const selected = view.nodes.find(node => node.key === ui.graphSelected) || (!ui.graphSelectionClosed && view.nodes.find(node => node.key === center)) || null;
  const list = ui.graphView === 'list';
  const activeFilters = [ui.graphKind, ui.graphProject, ui.graphConnected, ui.graphArchive].filter(Boolean).length;
  if (!list && view.nodes.length)
    mountGraph(
      view,
      selected?.key,
      center,
      key => {
        ui.graphSelected = key;
        ui.graphSelectionClosed = false;
        render();
        if (matchMedia('(max-width: 1100px)').matches)
          requestAnimationFrame(() => document.querySelector('.graph-detail')?.scrollIntoView({ block: 'nearest', behavior: 'auto' }));
      },
      !!S.prefs.graphSimple,
      !!S.prefs.graphPhysics,
      S.prefs.motion === 'reduce' || (S.prefs.motion === 'system' && matchMedia('(prefers-reduced-motion: reduce)').matches),
      `${S.ui.currentUser?.id}:${D().ws.id || D().ws.url}`,
    );
  const controls = `<div class="graph-controls"><button class="ibtn" data-a="graphControl" data-command="in" aria-label="Zoom in">${ic('plus', 15)}</button><button class="ibtn" data-a="graphControl" data-command="out" aria-label="Zoom out">${ic('minus', 15)}</button><button class="ibtn" data-a="graphControl" data-command="fit" aria-label="Fit graph">${ic('maximize', 15)}</button></div>`;
  const contexts = view.nodes.map(node =>
    [tr(ENTITY_LABELS[node.kind]), node.context || (node.kind === 'note' ? tr('No folder') : '')].filter(Boolean).join(' · '),
  );
  const signatures = view.nodes.map((node, index) => `${node.title}\n${contexts[index]}`);
  const navigator = `<div class="graph-locator"><label for="graph-locate">Locate material</label><select class="select" id="graph-locate" data-in="graphLocate" data-searchable data-preserve-search><option value="">Choose material</option>${view.nodes
    .map((node, index) => {
      const duplicate = signatures.filter(signature => signature === signatures[index]).length > 1;
      const context = contexts[index] + (duplicate ? ` · #${signatures.slice(0, index + 1).filter(signature => signature === signatures[index]).length}` : '');
      return `<option value="${esc(node.key)}" data-context="${esc(context)}" ${selected?.key === node.key ? 'selected' : ''} translate="no">${esc(node.title)}</option>`;
    })
    .join('')}</select></div>`;
  const legend = Object.entries(GRAPH_KINDS)
    .filter(([kind]) => view.nodes.some(node => node.kind === kind))
    .map(([kind, meta]) => `<span class="graph-kind" style="--node-color:var(${meta.color})">${ic(meta.icon, 12)}<span>${ENTITY_LABELS[kind]}</span></span>`)
    .join('');
  return `<div class="graph-page${ui.graphFocus ? ' is-focused' : ''}${ui.graphInteract ? ' is-interactive' : ''}">
<header class="graph-head"><div><h1>Graph</h1><p>Explore connections between your team's materials.</p></div><div class="row">${diagramViewsControl('graph')}<button class="btn btn-secondary btn-sm" data-a="toggleGraphFocus" aria-pressed="${!!ui.graphFocus}" aria-label="${ui.graphFocus ? 'Exit focus mode' : 'Focus mode'}">${ic(ui.graphFocus ? 'minimize' : 'maximize', 14)}<span>${ui.graphFocus ? 'Exit focus mode' : 'Focus mode'}</span></button>${center ? `<button class="btn btn-secondary btn-sm" data-a="showGraph">${ic('arrow-left', 14)}All materials</button>` : ''}<button class="btn btn-secondary btn-sm graph-export" data-a="exportGraph" aria-label="Export graph">${ic('download', 14)}<span>Export graph</span></button></div></header>
    <div class="graph-toolbar"><div class="graph-search"><label class="sr" for="graph-search">Search graph</label><input id="graph-search" class="input" data-in="graphQuery" value="${esc(ui.graphQuery || '')}" placeholder="Search materials and tags" aria-label="Search graph">${ui.graphQuery ? `<button class="ibtn graph-search-clear" data-a="clearGraphQuery" aria-label="Clear search">${ic('x', 14)}</button>` : ''}</div><button class="btn btn-secondary btn-sm graph-filter-toggle ${activeFilters ? 'is-active' : ''}" data-a="toggleGraphFilters" aria-label="${esc(tr('Filters'))}${activeFilters ? `: ${activeFilters}` : ''}" title="${esc(tr('Filters'))}" aria-expanded="${!!ui.graphFiltersOpen}" aria-controls="graph-filters">${ic('sliders-horizontal', 14)}<span>Filters</span>${activeFilters ? `<span class="cnt">${activeFilters}</span>` : ''}</button>${!list ? `<button class="btn btn-secondary btn-sm graph-display-trigger" data-a="graphDisplayOptions" aria-label="${esc(tr('Graph appearance'))}">${ic('settings-2', 14)}<span>${tr('Display')}</span>${S.prefs.graphSimple || S.prefs.graphPhysics ? '<span aria-hidden="true"> •</span>' : ''}</button>` : ''}<div class="seg" role="group" aria-label="Graph view"><button data-a="set" data-k="graphView" data-v="graph" class="${!list ? 'on' : ''}" aria-pressed="${!list}" aria-label="Graph">${ic('network', 14)}<span>Graph</span></button><button data-a="set" data-k="graphView" data-v="list" class="${list ? 'on' : ''}" aria-pressed="${list}" aria-label="List">${ic('list', 14)}<span>List</span></button></div></div>
    ${graphFilters(ui, center)}
    ${activeFilters || center ? `<p class="graph-active-context hint" role="status">${center ? tr('Local graph') + ' · ' : ''}${ui.graphKind ? tr(ENTITY_LABELS[ui.graphKind]) + ' · ' : ''}${ui.graphProject ? esc(visibleProjects().find(p => p.id === ui.graphProject)?.name || '') + ' · ' : ''}${ui.graphConnected ? tr('Connected only') + ' · ' : ''}${ui.graphArchive ? tr('Include archived') : ''}</p>` : ''}<div class="graph-meta"><details class="graph-legend-disclosure"><summary>Material types</summary><div class="graph-legend" aria-label="Material types">${legend}</div></details><div class="graph-summary" role="status"><span>Materials</span>: ${pending ? '—' : view.total}<span class="graph-meta-dot">·</span><span>Connections</span>: ${pending ? '—' : view.edges.length}</div></div>
    ${pending ? `<section class="graph-pending" aria-busy="${!remote.error}" aria-label="Graph navigation"><div class="catalog-context-status graph-query-status" role="status"><span>${esc(remote.error || 'Loading graph…')}</span>${remote.error ? '<button class="btn btn-secondary btn-sm" data-a="retryGraphQuery">Try again</button>' : ''}</div></section>` : ''}
    ${view.total > view.nodes.length ? '<p class="hint" role="status">Showing up to 250 materials. Refine the filters or open a local graph.</p>' : ''}
${!view.nodes.length ? (remote && !remote.view ? '' : empty('network', 'No matching materials.', center ? 'The selected material is unavailable or excluded by filters.' : 'Add materials or change the filters to explore connections.')) : `<div class="graph-layout ${selected ? 'has-detail' : ''}"><section class="graph-stage" aria-label="Graph navigation">${list ? `<div class="graph-list">${view.nodes.map(node => `<button class="graph-list-item ${selected?.key === node.key ? 'on' : ''}" data-a="selectGraphNode" data-key="${esc(node.key)}" aria-pressed="${selected?.key === node.key}">${ic(ENTITY_ICONS[node.kind], 16)}<span class="graph-list-copy"><span class="trunc" translate="no">${esc(node.title)}</span><small class="trunc" translate="no">${esc(node.context || (node.kind === 'note' ? tr('No folder') : tr(ENTITY_LABELS[node.kind])))}</small></span><span class="badge">${ENTITY_LABELS[node.kind]}</span></button>`).join('')}</div>` : `${navigator}${controls}<button class="btn btn-secondary graph-touch-control" data-a="toggleGraphInteraction" aria-pressed="${!!ui.graphInteract}">${ui.graphInteract ? 'Scroll page' : 'Interact with graph'}</button><div id="knowledge-graph-canvas" role="img" aria-label="Interactive material graph. Use List view for keyboard navigation."></div><p class="graph-help">${S.prefs.graphPhysics ? '<span class="graph-physics-status" role="status" data-graph-physics-status>Layout settled</span>' : ''}${S.prefs.graphSimple ? '<span>Compact nodes. Labels appear when you select or point at a node.</span> ' : ''}<span class="graph-help-pointer">Select a node to see its connections. Drag to move; pinch or scroll to zoom.</span><span class="graph-help-touch">Enable interaction to move the graph. Switch back to scroll the page.</span></p>`}</section>${graphDetails(selected)}</div>`}
  </div>`;
}
