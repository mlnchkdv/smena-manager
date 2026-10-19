import cytoscape from 'cytoscape';
import { ic } from '../core/icons.js';
import { GRAPH_KINDS, graphPositions, graphTopologyKey } from '../shared/graph-layout.js';

let instance;
let context = '';
let disconnectObserver;
let savedView;
let resizeObserver;
let topology = '';
export function mountGraph(graph, selected, center, onSelect) {
  requestAnimationFrame(() => {
    const container = document.getElementById('knowledge-graph-canvas');
    if (!container) return;
    const previous =
      instance && context === center
        ? {
            signature: topology,
            zoom: instance.zoom(),
            pan: instance.pan(),
            width: instance.width(),
            height: instance.height(),
            positions: new Map(instance.nodes().map(node => [node.id(), { ...node.position() }])),
          }
        : savedView?.center === center
          ? savedView
          : null;
    instance?.destroy();
    disconnectObserver?.disconnect();
    resizeObserver?.disconnect();
    context = center;
    const css = getComputedStyle(container);
    const signature = graphTopologyKey(graph);
    topology = signature;
    const positions = graphPositions(graph, center);
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
    const denseGraph = graph.nodes.length > 80 || graph.edges.length > 160;
    const elements = [
      ...graph.nodes.map(node => ({
        data: { id: node.key, label: node.title.length > 46 ? node.title.slice(0, 45) + '…' : node.title, ...glyphs[node.kind] },
        position: positions.get(node.key),
        classes: [selected && !neighbors.has(node.key) ? 'muted' : '', denseGraph ? 'dense' : ''].filter(Boolean).join(' '),
        selected: node.key === selected,
      })),
      ...graph.edges.map((edge, index) => ({
        data: { id: `e${index}`, source: edge.from, target: edge.to, automatic: edge.origin === 'automatic' ? 1 : 0 },
        classes: [selected && (edge.from === selected || edge.to === selected) ? 'highlight' : '', denseGraph ? 'dense' : ''].filter(Boolean).join(' '),
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
            'font-size': 12,
            'font-family': 'Arial',
            'min-zoomed-font-size': 6,
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
            'overlay-color': 'data(color)',
            'overlay-opacity': 0.08,
            'overlay-padding': 7,
          },
        },
        { selector: 'node.muted', style: { opacity: 0.38 } },
        { selector: 'node.dense-hidden', style: { 'text-opacity': 0 } },
        { selector: 'node.dense-hidden:selected', style: { 'text-opacity': 1 } },
        {
          selector: 'edge',
          style: {
            width: 1.4,
            'line-color': css.getPropertyValue('--border-strong').trim(),
            'target-arrow-color': css.getPropertyValue('--text-3').trim(),
            'target-arrow-shape': 'triangle',
            'arrow-scale': 0.7,
            'curve-style': 'bezier',
            opacity: 0.65,
          },
        },
        { selector: 'edge[automatic = 1]', style: { 'line-style': 'dashed', opacity: 0.45 } },
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
      ],
    });
    const updateDensity = () => {
      if (!denseGraph || !instance) return;
      instance.nodes().toggleClass('dense-hidden', instance.zoom() < 0.75);
    };
    instance.on('zoom', updateDensity);
    if (previous?.signature === signature) {
      instance.nodes().positions(node => previous.positions.get(node.id()));
      if (previous.width === container.clientWidth && previous.height === container.clientHeight) {
        instance.zoom(previous.zoom);
        instance.pan(previous.pan);
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
    updateDensity();
    instance.on('tap', 'node', event => onSelect(event.target.id()));
    instance.on('mouseover', 'node', () => {
      container.style.cursor = 'pointer';
    });
    instance.on('mouseout', 'node', () => {
      container.style.cursor = '';
    });
    let width = container.clientWidth,
      height = container.clientHeight;
    resizeObserver = new ResizeObserver(() => {
      if (!instance || !container.isConnected || (width === container.clientWidth && height === container.clientHeight)) return;
      width = container.clientWidth;
      height = container.clientHeight;
      instance.resize();
      instance.fit(undefined, 35);
      if (instance.zoom() > 1.2) {
        instance.zoom(1.2);
        instance.center();
      }
    });
    resizeObserver.observe(container);
    disconnectObserver = new MutationObserver(() => {
      if (!container.isConnected) {
        if (instance)
          savedView = {
            center,
            signature,
            width,
            height,
            zoom: instance.zoom(),
            pan: instance.pan(),
            positions: new Map(instance.nodes().map(node => [node.id(), { ...node.position() }])),
          };
        instance?.destroy();
        instance = null;
        disconnectObserver.disconnect();
        resizeObserver.disconnect();
      }
    });
    disconnectObserver.observe(document.getElementById('app'), { childList: true, subtree: true });
  });
}
window.addEventListener('smena:graph-control', event => {
  if (!instance) return;
  if (event.detail === 'fit') instance.fit(undefined, 35);
  else
    instance.zoom({
      level: Math.max(0.08, Math.min(3, instance.zoom() * (event.detail === 'in' ? 1.3 : 1 / 1.3))),
      renderedPosition: { x: instance.width() / 2, y: instance.height() / 2 },
    });
});
