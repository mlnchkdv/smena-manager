import { graphHitCandidates } from '../shared/graph-hit.js';
import { graphRenderKey } from '../shared/graph-render-key.js';
import { retainGraphSurface } from '../shared/graph-surface.js';
import { registerGraphSurfaceRestorer } from '../shell/render.js';
import { chooseGraphHit } from './graph-actions.js';
import { D, S } from '../core/store.js';
import { diagramPreferences } from '../shared/diagram-views.js';
import { activeDiagramView, diagramScope, registerGraphLayoutReader } from '../core/diagram-view-state.js';
import cytoscape from 'cytoscape';
import { ic } from '../core/icons.js';
import { GRAPH_KINDS, graphPositions, graphTopologyKey } from '../shared/graph-layout.js';
import { graphOverviewLabels } from '../shared/graph-labels.js';
import { t } from '../core/i18n.js';
import { graphPhysicsOptions } from '../shared/graph-physics.js';
import { createGraphDragPhysics } from '../shared/graph-drag-physics.js';
import { disposeGraph } from '../shared/graph-disposal.js';

registerGraphSurfaceRestorer(() => {
  const surface = instance?.container()?.parentElement;
  return surface
    ? () => {
        if (!S.ui.auth && S.ui.route === 'graph') retainGraphSurface(surface, document.querySelector('.graph-surface'), diagramScope());
      }
    : null;
});
let instance;
let mountedKey = '',
  rendererSerial = 0;
let context = '',
  personalViewKey = '';
let disconnectObserver;
let savedView;
let manualCamera = false;
let resizeObserver;
let topology = '';
let mountGeneration = 0;
let repackViewport;
let stopDragPhysics = () => {};
let runningLayout,
  physicsTimer,
  physicsEnabled = false;
export function mountGraph(graph, selected, center, onSelect, simple = false, physics = false, reducedMotion = false, scope = '') {
  const generation = ++mountGeneration,
    requestedScope = diagramScope();
  requestAnimationFrame(() => {
    if (generation !== mountGeneration || requestedScope !== diagramScope()) return;
    const container = document.getElementById('knowledge-graph-canvas');
    if (!container) return;
    const scopeKey = JSON.stringify([scope, center]);
    const css = getComputedStyle(container);
    const key = graphRenderKey(graph, [
      requestedScope,
      scopeKey,
      selected,
      simple,
      S.prefs.graphAnchors !== false,
      physics,
      reducedMotion,
      S.prefs.diagramViews,
      S.ui.diagramViewNonce || 0,
      ...['--text', '--surface', '--text-3', '--accent', '--font', ...Object.values(GRAPH_KINDS).map(meta => meta.color)].map(color =>
        css.getPropertyValue(color),
      ),
    ]);
    if (instance && !instance.destroyed() && instance.container() === container && mountedKey === key) {
      const status = document.querySelector('[data-graph-physics-status]');
      if (status) status.textContent = t(container.dataset.physicsState === 'running' ? 'Settling layout…' : 'Layout settled');
      instance.resize();
      return;
    }
    mountedKey = key;
    container.parentElement.dataset.graphScope = requestedScope;
    container.dataset.graphRenderer = String(++rendererSerial);
    let previous =
      instance && context === scopeKey
        ? {
            signature: topology,
            zoom: instance.zoom(),
            pan: instance.pan(),
            width: instance.width(),
            height: instance.height(),
            positions: new Map(instance.nodes().map(node => [node.id(), { ...node.position() }])),
            selected: instance.nodes(':selected').first().id(),
            physics: physicsEnabled,
            running: !!runningLayout,
            manual: manualCamera,
          }
        : savedView?.scope === scopeKey
          ? savedView
          : null;
    clearTimeout(physicsTimer);
    stopDragPhysics();
    const retired = instance;
    instance = null;
    disposeGraph(retired, runningLayout);
    runningLayout = null;
    disconnectObserver?.disconnect();
    resizeObserver?.disconnect();
    context = scopeKey;
    container.dataset.physics = physics ? 'on' : 'off';
    physicsEnabled = physics;
    container.dataset.physicsState = physics ? 'settled' : 'off';
    const signature = graphTopologyKey(graph);
    topology = signature;
    const positions = graphPositions(graph, center, { width: container.clientWidth, height: container.clientHeight });
    const cfg = diagramPreferences(S.prefs.diagramViews),
      saved = activeDiagramView('graph'),
      active = saved?.context.center === center ? saved : null;
    const personalKey = JSON.stringify([S.ui.currentUser?.id, D().ws.id || D().ws.url, active?.id || '', S.ui.diagramViewNonce || 0]);
    if (active && (!previous || personalViewKey !== personalKey)) {
      const l = active.layout;
      previous = {
        signature,
        positions: new Map(l.positions.map(p => [p.id, p])),
        zoom: l.zoom,
        pan: l.pan,
        width: l.width,
        height: l.height,
        physics,
        running: false,
        selected: '',
        manual: true,
      };
    } else if (personalViewKey && personalViewKey !== personalKey && !active) previous = null;
    personalViewKey = personalKey;
    const pins = new Map(cfg.pins.map(p => [p.id, p]));
    for (const [id, p] of pins) if (positions.has(id)) positions.set(id, p);

    const glyphs = Object.fromEntries(
      Object.entries(GRAPH_KINDS).map(([kind, meta]) => {
        const color = css.getPropertyValue(meta.color).trim() || '#6366f1';
        return [
          kind,
          {
            color,
            icon: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(ic(meta.icon, 18).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ').replace('currentColor', color))}`,
            shape: meta.shape,
          },
        ];
      }),
    );
    const neighbors = new Set(graph.edges.filter(edge => edge.from === selected || edge.to === selected).flatMap(edge => [edge.from, edge.to]));
    if (selected) neighbors.add(selected);
    repackViewport = () => {
      if (!instance || instance.container() !== container) return;
      runningLayout?.stop();
      stopDragPhysics();
      clearTimeout(physicsTimer);
      const packed = graphPositions(graph, center, { width: container.clientWidth, height: container.clientHeight });
      instance.nodes().positions(node => (node.locked() ? node.position() : packed.get(node.id())));
      instance.fit(undefined, 35);
      manualCamera = true;
    };
    const denseGraph = graph.nodes.length > 80 || graph.edges.length > 160;
    const elements = [
      ...graph.nodes.map(node => ({
        data: { id: node.key, label: node.title.length > 46 ? node.title.slice(0, 45) + '…' : node.title, ...glyphs[node.kind] },
        position: positions.get(node.key),
        classes: [selected && !neighbors.has(node.key) ? 'muted' : '', denseGraph ? 'dense' : '', simple ? 'simple' : ''].filter(Boolean).join(' '),
        selected: node.key === selected,
        locked: pins.has(node.key),
      })),
      ...graph.edges.map((edge, index) => ({
        data: { id: `e${index}`, source: edge.from, target: edge.to, automatic: edge.origin === 'automatic' ? 1 : 0 },
        classes: [selected && (edge.from === selected || edge.to === selected) ? 'highlight' : '', denseGraph ? 'dense' : '', simple ? 'simple' : '']
          .filter(Boolean)
          .join(' '),
      })),
    ];
    instance = cytoscape({
      container,
      elements,
      minZoom: 0.08,
      maxZoom: 3,
      layout: {
        name: 'preset',
        animate: false,
        padding: 35,
      },
      style: [
        {
          selector: 'node',
          style: {
            'background-color': 'data(color)',
            'background-opacity': 0.12,
            'background-image': 'data(icon)',
            'background-width': 18,
            'background-height': 18,
            shape: 'data(shape)',
            label: 'data(label)',
            color: css.getPropertyValue('--text').trim(),
            'font-size': 14,
            'font-family':
              css
                .getPropertyValue('--font')
                .split(',')[0]
                .trim()
                .replace(/^['"]|['"]$/gu, '') || 'sans-serif',
            'min-zoomed-font-size': 9,
            'text-valign': 'bottom',
            'text-margin-y': 10,
            'text-wrap': 'wrap',
            'text-max-width': 125,
            width: 38,
            height: 38,
            'border-width': 1.5,
            'border-color': 'data(color)',
          },
        },
        {
          selector: 'node:selected',
          style: {
            'background-opacity': 0.22,
            'border-width': 3,
            'font-weight': 600,
            'font-size': 16,
            'min-zoomed-font-size': 0,
            'text-background-color': css.getPropertyValue('--surface').trim(),
            'text-background-opacity': 0.95,
            'text-background-padding': 4,
            'overlay-color': 'data(color)',
            'overlay-opacity': 0.08,
            'overlay-padding': 7,
          },
        },
        { selector: 'node.muted', style: { opacity: 0.55 } },
        { selector: 'node.dense-hidden', style: { 'text-opacity': 0 } },
        { selector: 'node.dense-hidden:selected', style: { 'text-opacity': 1 } },
        { selector: 'node.overview-hidden', style: { 'text-opacity': 0 } },
        {
          selector: 'node.orientation-label',
          style: {
            'min-zoomed-font-size': 0,
            'text-opacity': 1,
            'text-background-color': css.getPropertyValue('--surface').trim(),
            'text-background-opacity': 0.95,
            'text-background-padding': 3,
          },
        },
        {
          selector: 'edge',
          style: {
            width: 1.4,
            'line-color': css.getPropertyValue('--text-3').trim(),
            'target-arrow-color': css.getPropertyValue('--text-3').trim(),
            'target-arrow-shape': 'triangle',
            'arrow-scale': 0.7,
            'curve-style': 'bezier',
            opacity: 0.65,
          },
        },
        { selector: 'edge[automatic = 1]', style: { 'line-style': 'dashed', opacity: 0.6 } },
        { selector: 'edge.dense', style: { opacity: 0.3, width: 1 } },
        {
          selector: 'edge.highlight',
          style: {
            'line-color': css.getPropertyValue('--accent').trim(),
            'target-arrow-color': css.getPropertyValue('--accent').trim(),
            opacity: 0.9,
            width: 2,
          },
        },
        {
          selector: 'node.simple',
          style: {
            shape: 'ellipse',
            width: 11,
            height: 11,
            'background-image': 'none',
            'background-opacity': 1,
            'border-width': 1,
            'text-opacity': 0,
            'text-margin-y': 8,
          },
        },
        {
          selector: 'node.simple:selected, node.simple.simple-hover, node.simple.simple-neighbor, node.simple.simple-anchor',
          style: {
            width: 16,
            height: 16,
            'text-opacity': 1,
            'font-size': 14,
            'min-zoomed-font-size': 0,
            'text-background-color': css.getPropertyValue('--surface').trim(),
            'text-background-opacity': 0.95,
            'text-background-padding': 4,
            'overlay-opacity': 0,
          },
        },
        { selector: 'edge.simple', style: { 'target-arrow-shape': 'none', 'line-style': 'solid', width: 1, opacity: 0.3 } },
        { selector: 'edge.simple.highlight', style: { width: 1.7, opacity: 0.85 } },
      ],
    });
    const cy = instance;
    const current = () => instance === cy && !cy.destroyed() && container.isConnected;
    const updateDensity = () => {
      if (!current() || !cy.renderer()) return;
      const zoom = instance.zoom();
      cy.batch(() =>
        cy.edges().forEach(edge => {
          const highlighted = edge.hasClass('highlight');
          edge.style({
            width: (highlighted ? 1.8 : denseGraph ? 0.8 : 1) / Math.max(zoom, 0.01),
            opacity: highlighted ? 0.95 : denseGraph ? 0.5 : !simple && edge.data('automatic') ? 0.7 : 0.78,
          });
        }),
      );
      if (simple) {
        const labels = graphOverviewLabels(graph, new Map(cy.nodes().map(node => [node.id(), node.renderedPosition()])), {
          width: cy.width(),
          height: cy.height(),
          selected,
          anchorsOnly: !selected,
          ...(!selected ? { limit: Math.max(2, Math.min(5, Math.floor(cy.width() / 160))) } : {}),
        });
        container.dataset.graphAnchorLabels = String(!selected && S.prefs.graphAnchors !== false ? labels.size : 0);
        cy.batch(() =>
          cy.nodes().forEach(node => {
            const active = node.id() === selected;
            node.style({
              width: Math.max(active ? 18 : 12, (active ? 14 : 9) / zoom),
              height: Math.max(active ? 18 : 12, (active ? 14 : 9) / zoom),
              'font-size': 12 / zoom,
              'text-max-width': 130 / zoom,
              'text-margin-y': 8 / zoom,
            });
            node.toggleClass('simple-anchor', !selected && S.prefs.graphAnchors !== false && labels.has(node.id()));
            node.toggleClass('simple-neighbor', !!selected && neighbors.has(node.id()) && labels.has(node.id()));
          }),
        );
        return;
      }
      if (denseGraph) instance.nodes().toggleClass('dense-hidden', zoom < 0.75);
      {
        const overview = zoom < 0.85;
        const labels = overview
          ? graphOverviewLabels(graph, new Map(instance.nodes().map(node => [node.id(), node.renderedPosition()])), {
              width: instance.width(),
              height: instance.height(),
              selected,
            })
          : new Set();
        instance.batch(() => {
          instance.nodes().forEach(node => {
            const labeled = overview && labels.has(node.id());
            node.toggleClass('overview-hidden', overview && !labeled);
            node.toggleClass('orientation-label', labeled);
            if (labeled) node.style({ 'font-size': 12 / zoom, 'text-max-width': 110 / zoom, 'text-margin-y': 8 / zoom, width: 30 / zoom, height: 30 / zoom });
            else node.removeStyle('font-size text-max-width text-margin-y width height');
            if (container.clientWidth <= 640) {
              if (!labeled) node.style({ width: Math.max(38, 18 / zoom), height: Math.max(38, 18 / zoom) });
              node.style({ 'background-width': Math.max(18, 10 / zoom), 'background-height': Math.max(18, 10 / zoom) });
            } else node.removeStyle('background-width background-height');
          });
        });
      }
    };
    registerGraphLayoutReader(() =>
      current()
        ? {
            positions: instance.nodes().map(n => ({ id: n.id(), x: n.position('x'), y: n.position('y'), locked: n.locked() })),
            zoom: instance.zoom(),
            pan: { ...instance.pan() },
            width: instance.width(),
            height: instance.height(),
          }
        : null,
    );
    instance.on('zoom pan dragfree lock unlock', () => window.dispatchEvent(new Event('smena:diagram-layout-changed')));
    instance.on('zoom', updateDensity);
    instance.on('pan', updateDensity);
    manualCamera = !!previous?.manual;
    if (previous?.signature === signature) {
      instance.nodes().positions(node => pins.get(node.id()) || previous.positions.get(node.id()) || positions.get(node.id()));
      if (manualCamera || (previous.width === container.clientWidth && previous.height === container.clientHeight)) {
        instance.zoom(previous.zoom);
        instance.pan({ x: previous.pan.x + (container.clientWidth - previous.width) / 2, y: previous.pan.y + (container.clientHeight - previous.height) / 2 });
      } else {
        instance.fit(undefined, 35);
        if (instance.zoom() > 1.2) {
          instance.zoom(1.2);
          instance.center();
        }
      }
    } else if (instance.zoom() > 1.2) {
      instance.zoom(1.2);
      instance.center();
    }
    if (selected && previous?.selected !== selected && container.clientWidth <= 640) {
      const focus = instance.nodes(':selected').closedNeighborhood();
      instance.fit(focus, 55);
      instance.zoom(Math.max(0.65, Math.min(1.2, instance.zoom())));
      instance.center(instance.nodes(':selected'));
    }
    updateDensity();
    const simulate = fit => {
      if (!current()) return;
      clearTimeout(physicsTimer);
      runningLayout?.stop();
      const layout = cy.layout(graphPhysicsOptions(reducedMotion));
      runningLayout = layout;
      container.dataset.physicsState = 'running';
      const status = document.querySelector('[data-graph-physics-status]');
      if (status) status.textContent = t('Settling layout…');
      layout.one('layoutstop', () => {
        if (!current() || runningLayout !== layout) return;
        clearTimeout(physicsTimer);
        runningLayout = null;
        container.dataset.physicsState = 'settled';
        const liveStatus = document.querySelector('[data-graph-physics-status]');
        if (liveStatus) liveStatus.textContent = t('Layout settled');
        if (fit) {
          cy.fit(undefined, 45);
          if (cy.zoom() > 1.2) {
            cy.zoom(1.2);
            cy.center();
          }
        }
        updateDensity();
      });
      layout.run();
      if (runningLayout === layout)
        physicsTimer = setTimeout(() => {
          if (current() && runningLayout === layout) layout.stop();
        }, 2500);
    };
    if (physics && (!previous || !previous.physics || previous.running || previous.signature !== signature)) simulate(true);
    let drag,
      dragFrame = 0;
    const dragStatus = state => {
      if (!current()) return;
      container.dataset.physicsState = state;
      const status = document.querySelector('[data-graph-physics-status]');
      if (status)
        status.textContent =
          state === 'running' && drag?.moved
            ? `${t('Moving connected nodes')}: ${drag.motion.size}`
            : t(state === 'running' ? 'Settling layout…' : 'Layout settled');
    };
    stopDragPhysics = () => {
      cancelAnimationFrame(dragFrame);
      dragFrame = 0;
      drag = null;
      if (physics) dragStatus(runningLayout ? 'running' : 'settled');
    };
    const followDrag = () => {
      dragFrame = 0;
      if (!current() || !drag) return;
      const frame = drag.motion.step(drag.node.position());
      cy.batch(() =>
        frame.positions.forEach((position, id) => {
          const node = cy.getElementById(id);
          if (id !== drag.node.id() && !node.locked()) node.position(position);
        }),
      );
      if (!frame.settled && (!drag.released || performance.now() < drag.deadline)) dragFrame = requestAnimationFrame(followDrag);
      else if (drag.released) {
        stopDragPhysics();
        window.dispatchEvent(new Event('smena:diagram-layout-changed'));
      }
    };
    instance.on('grab', 'node', event => {
      stopDragPhysics();
      clearTimeout(physicsTimer);
      runningLayout?.stop();
      if (!physics) return;
      const motion = createGraphDragPhysics(
        cy.nodes().map(n => ({ id: n.id(), ...n.position(), locked: n.locked() })),
        graph.edges,
        event.target.id(),
        { reducedMotion },
      );
      if (motion) drag = { node: event.target, motion, moved: false, released: false };
    });
    instance.on('drag', 'node', () => {
      if (!drag) return;
      drag.moved = true;
      container.dataset.graphDragCluster = String(drag.motion.size);
      dragStatus('running');
      if (!dragFrame) dragFrame = requestAnimationFrame(followDrag);
    });
    instance.on('free', 'node', () => {
      if (!drag?.moved) return stopDragPhysics();
      drag.released = true;
      drag.deadline = performance.now() + 1500;
      if (!dragFrame) dragFrame = requestAnimationFrame(followDrag);
    });
    instance.on('mousedown touchstart scrollzoom', () => {
      manualCamera = true;
    });
    instance.on('tap', event => {
      const touch = event.originalEvent?.pointerType === 'touch' || event.originalEvent?.type?.startsWith('touch') || matchMedia('(pointer: coarse)').matches;
      if (!touch && !simple) {
        if (event.target !== cy && event.target.isNode?.()) onSelect(event.target.id());
        return;
      }
      if (!event.renderedPosition) return;
      const ids = graphHitCandidates(
        cy.nodes().map(node => ({ id: node.id(), ...node.renderedPosition() })),
        event.renderedPosition,
        touch ? 22 : 12,
      );
      if (ids.length === 1) onSelect(ids[0]);
      else if (ids.length > 1) chooseGraphHit(ids.map(id => graph.nodes.find(node => node.key === id)).filter(Boolean), onSelect);
    });
    instance.on('mouseover', 'node', event => {
      container.style.cursor = 'pointer';
      if (simple) event.target.addClass('simple-hover');
    });
    instance.on('mouseout', 'node', event => {
      container.style.cursor = '';
      if (simple) event.target.removeClass('simple-hover');
    });
    let width = container.clientWidth,
      height = container.clientHeight;
    const ownedResizeObserver = new ResizeObserver(() => {
      if (!current() || (width === container.clientWidth && height === container.clientHeight)) return;
      const delta = { x: (container.clientWidth - width) / 2, y: (container.clientHeight - height) / 2 };
      width = container.clientWidth;
      height = container.clientHeight;
      instance.resize();
      if (manualCamera) instance.panBy(delta);
      else instance.fit(undefined, 35);
      if (!manualCamera && instance.zoom() > 1.2) {
        instance.zoom(1.2);
        instance.center();
      }
    });
    resizeObserver = ownedResizeObserver;
    ownedResizeObserver.observe(container);
    const ownedDisconnectObserver = new MutationObserver(() => {
      if (!container.isConnected) {
        ownedDisconnectObserver.disconnect();
        ownedResizeObserver.disconnect();
        if (instance !== cy || cy.destroyed()) return;
        if (instance)
          savedView = {
            center,
            scope: scopeKey,
            physics,
            running: !!runningLayout,
            manual: manualCamera,
            signature,
            width,
            height,
            zoom: instance.zoom(),
            pan: instance.pan(),
            positions: new Map(instance.nodes().map(node => [node.id(), { ...node.position() }])),
            selected: instance.nodes(':selected').first().id(),
          };
        clearTimeout(physicsTimer);
        stopDragPhysics();
        const retiredLayout = runningLayout;
        runningLayout = null;
        instance = null;
        disposeGraph(cy, retiredLayout);
      }
    });
    disconnectObserver = ownedDisconnectObserver;
    ownedDisconnectObserver.observe(document.getElementById('app'), { childList: true, subtree: true });
  });
}
let scrollFrame;
document.addEventListener(
  'scroll',
  () => {
    if (scrollFrame || !instance) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = null;
      if (instance && !instance.destroyed() && instance.container().isConnected) instance.resize();
    });
  },
  true,
);
window.addEventListener('smena:graph-control', event => {
  if (!instance) return;
  if (event.detail === 'repack') return repackViewport?.();
  manualCamera = event.detail !== 'fit';
  if (event.detail === 'fit') instance.fit(undefined, 35);
  else if (event.detail === 'selection') {
    const selected = instance.nodes(':selected');
    if (!selected.length) return;
    instance.fit(selected.closedNeighborhood(), 45);
    if (instance.zoom() > 1.5) {
      instance.zoom(1.5);
      instance.center(selected.closedNeighborhood());
    }
  } else
    instance.zoom({
      level: Math.max(0.08, Math.min(3, instance.zoom() * (event.detail === 'in' ? 1.3 : 1 / 1.3))),
      renderedPosition: { x: instance.width() / 2, y: instance.height() / 2 },
    });
});
