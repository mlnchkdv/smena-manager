import { graphNeighborhood } from './relations.js';

export function graphView(graph, { center = '', depth = 1, query = '', kind = '', project = '', connectedOnly = false, limit = 250 } = {}) {
  const local = graphNeighborhood(graph, center, depth);
  const connected = new Set(local.edges.flatMap(edge => [edge.from, edge.to]));
  const q = String(query).trim().toLocaleLowerCase();
  const matching = local.nodes.filter(
    node =>
      (!kind || node.kind === kind) &&
      (!project || node.project === project) &&
      (!connectedOnly || connected.has(node.key)) &&
      [node.title, ...(node.tags || []), node.item?.url].join(' ').toLocaleLowerCase().includes(q),
  );
  matching.sort((a, b) => Number(b.key === center) - Number(a.key === center));
  const nodes = matching.slice(0, Math.min(500, Math.max(1, limit)));
  const keys = new Set(nodes.map(node => node.key));
  return {
    nodes,
    edges: local.edges.filter(edge => keys.has(edge.from) && keys.has(edge.to)),
    unresolved: local.unresolved.filter(ref => keys.has(ref.from)),
    total: matching.length,
  };
}
