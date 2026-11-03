export function graphRenderKey(graph, context) {
  const nodes = graph.nodes.map(n => [n.key, n.kind, n.title]).sort((a, b) => a[0].localeCompare(b[0]));
  const edges = graph.edges.map(e => [e.from, e.to, e.origin]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return JSON.stringify([context, nodes, edges]);
}
