import cytoscape from 'cytoscape';

let instance;
let context = '';
let disconnectObserver;
let savedView;
export function mountGraph(graph, selected, center, onSelect) {
  requestAnimationFrame(() => {
    const container = document.getElementById('knowledge-graph-canvas');
    if (!container) return;
    const previous =
      instance && context === center
        ? { zoom: instance.zoom(), pan: instance.pan(), positions: new Map(instance.nodes().map(node => [node.id(), { ...node.position() }])) }
        : savedView?.center === center
          ? savedView
          : null;
    instance?.destroy();
    disconnectObserver?.disconnect();
    context = center;
    const css = getComputedStyle(container);
    const colors = { note: '--accent', bookmark: '--amber', file: '--teal', project: '--blue', task: '--text-3' };
    const elements = [
      ...graph.nodes.map(node => ({
        data: { id: node.key, label: node.title, color: css.getPropertyValue(colors[node.kind]).trim() || '#6366f1', center: node.key === center ? 1 : 0 },
        selected: node.key === selected,
      })),
      ...graph.edges.map((edge, index) => ({ data: { id: `e${index}`, source: edge.from, target: edge.to, automatic: edge.origin === 'automatic' ? 1 : 0 } })),
    ];
    instance = cytoscape({
      container,
      elements,
      minZoom: 0.25,
      maxZoom: 3,
      wheelSensitivity: 0.2,
      layout: {
        name: 'concentric',
        animate: false,
        padding: 35,
        minNodeSpacing: 35,
        concentric: node => (node.data('center') ? 100 : node.degree()),
        levelWidth: () => 2,
      },
      style: [
        {
          selector: 'node',
          style: {
            'background-color': 'data(color)',
            label: 'data(label)',
            color: css.getPropertyValue('--text').trim(),
            'font-size': 11,
            'text-valign': 'bottom',
            'text-margin-y': 8,
            'text-wrap': 'ellipsis',
            'text-max-width': 110,
            width: 18,
            height: 18,
            'border-width': 2,
            'border-color': css.getPropertyValue('--surface').trim(),
          },
        },
        { selector: 'node:selected', style: { width: 26, height: 26, 'border-width': 4, 'border-color': css.getPropertyValue('--accent').trim() } },
        {
          selector: 'edge',
          style: {
            width: 1,
            'line-color': css.getPropertyValue('--border-strong').trim(),
            'target-arrow-color': css.getPropertyValue('--text-3').trim(),
            'target-arrow-shape': 'triangle',
            'arrow-scale': 0.7,
            'curve-style': 'bezier',
            opacity: 0.65,
          },
        },
        { selector: 'edge[automatic = 1]', style: { 'line-style': 'dashed', opacity: 0.35 } },
      ],
    });
    if (previous && graph.nodes.every(node => previous.positions.has(node.key))) {
      instance.nodes().positions(node => previous.positions.get(node.id()));
      instance.zoom(previous.zoom);
      instance.pan(previous.pan);
    }
    instance.on('tap', 'node', event => onSelect(event.target.id()));
    instance.on('mouseover', 'node', () => {
      container.style.cursor = 'pointer';
    });
    instance.on('mouseout', 'node', () => {
      container.style.cursor = '';
    });
    disconnectObserver = new MutationObserver(() => {
      if (!container.isConnected) {
        if (instance)
          savedView = {
            center,
            zoom: instance.zoom(),
            pan: instance.pan(),
            positions: new Map(instance.nodes().map(node => [node.id(), { ...node.position() }])),
          };
        instance?.destroy();
        instance = null;
        disconnectObserver.disconnect();
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
      level: Math.max(0.25, Math.min(3, instance.zoom() * (event.detail === 'in' ? 1.3 : 1 / 1.3))),
      renderedPosition: { x: instance.width() / 2, y: instance.height() / 2 },
    });
});
