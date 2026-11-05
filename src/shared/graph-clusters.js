export function clusterGraph(graph, { expanded = [], selected = '', reveal = false, label = group => group } = {}) {
  if (reveal) return { ...graph, clusters: [] };
  const groups = new Map(),
    membership = new Map(),
    open = new Set(expanded);
  for (const node of graph.nodes) {
    const project = node.project || (node.kind === 'project' ? node.item?.id || node.key.slice('project:'.length) : '');
    const folder = node.item?.folderId;
    const group = project ? `project:${project}` : folder && ['note', 'bookmark'].includes(node.kind) ? `${node.kind}-folder:${folder}` : `kind:${node.kind}`;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(node);
  }
  const nodes = [],
    clusters = [];
  for (const [group, members] of groups) {
    if (members.length < 3 || open.has(group) || members.some(node => node.key === selected)) {
      nodes.push(...members);
      continue;
    }
    const cluster = {
      key: `cluster:${group}`,
      kind: 'project',
      title: `${label(group, members)} · ${members.length}`,
      project: members[0].project,
      cluster: true,
      clusterId: group,
      members: members.map(node => node.key),
      internalEdges: 0,
      item: {},
    };
    clusters.push(cluster);
    nodes.push(cluster);
    members.forEach(node => membership.set(node.key, cluster.key));
  }
  const clusterByKey = new Map(clusters.map(cluster => [cluster.key, cluster])),
    edges = new Map();
  for (const edge of graph.edges) {
    const from = membership.get(edge.from) || edge.from,
      to = membership.get(edge.to) || edge.to;
    if (from === to) {
      if (clusterByKey.has(from)) clusterByKey.get(from).internalEdges++;
      continue;
    }
    const key = JSON.stringify([from, to, edge.type, edge.origin]);
    if (edges.has(key)) edges.get(key).count++;
    else edges.set(key, { ...edge, from, to, count: 1 });
  }
  return { ...graph, nodes, edges: [...edges.values()], clusters };
}
