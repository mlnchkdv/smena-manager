import { graphNeighborhood } from './relations.js';
import { textMatcher } from './search-query.js';

export function graphView(graph, { center = '', depth = 1, query = '', kind = '', project = '', connectedOnly = false, limit = 250 } = {}) {
  const local = graphNeighborhood(graph, center, depth);
  const connected = new Set(local.edges.flatMap(edge => [edge.from, edge.to]));
  const matches = textMatcher(query);
  const matching = local.nodes.filter(
    node =>
      (!kind || node.kind === kind) &&
      (!project || node.project === project) &&
      (!connectedOnly || connected.has(node.key)) &&
      matches([node.title, ...(node.tags || []), node.item?.url].join(' ')),
  );
  // Keep project anchors in a bounded global window. Otherwise a large file
  // collection fills the window before its project node and hides every edge.
  matching.sort((a, b) => Number(b.key === center) - Number(a.key === center) || Number(b.kind === 'project') - Number(a.kind === 'project'));
  const nodes = matching.slice(0, Number.isFinite(limit) ? Math.min(500, Math.max(1, limit)) : matching.length);
  const keys = new Set(nodes.map(node => node.key));
  const edges = local.edges.filter(edge => keys.has(edge.from) && keys.has(edge.to));
  return {
    nodes,
    edges,
    unresolved: local.unresolved.filter(ref => keys.has(ref.from)),
    total: matching.length,
    visibleTotal: nodes.length,
    visibleEdgeTotal: edges.length,
    truncated: nodes.length < matching.length,
    limit: Number.isFinite(limit) ? Math.min(500, Math.max(1, limit)) : matching.length,
  };
}
