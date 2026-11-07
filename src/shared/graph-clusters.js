export function clusterGraph(graph, { expanded = [], selected = '', reveal = false, dense = false, label = group => group } = {}) {
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
  // Sparse folders otherwise leave hundreds of single nodes in a dense view.
  // An expanded group and the current selection always retain their identity.
  if (dense)
    for (const [group, members] of [...groups]) {
      if (!/^(note|bookmark)-folder:/.test(group) || members.length >= 3 || open.has(group) || members.some(node => node.key === selected)) continue;
      const fallback = 'kind:' + members[0].kind;
      if (open.has(fallback)) continue;
      groups.delete(group);
      groups.set(fallback, [...(groups.get(fallback) || []), ...members]);
    }
  const nodes = [],
    clusters = [];
  for (const [group, members] of groups) {
    if (members.length < 3 || open.has(group) || members.some(node => node.key === selected)) {
      nodes.push(...members);
      continue;
    }
    const kindCounts = Object.fromEntries(
      [...new Set(members.map(node => node.kind))].sort().map(kind => [kind, members.filter(node => node.kind === kind).length]),
    );
    const dominantKind = Object.keys(kindCounts).sort((a, b) => kindCounts[b] - kindCounts[a] || a.localeCompare(b))[0];
    const cluster = {
      key: `cluster:${group}`,
      kind: 'group',
      groupType: group.slice(0, group.indexOf(':')),
      dominantKind,
      kindCounts,
      memberCount: members.length,
      title: `${label(group, members)} · ${members.length}`,
      project: members[0].project,
      cluster: true,
      clusterId: group,
      members: members.map(node => node.key),
      internalEdges: 0,
      externalEdges: 0,
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
    if (clusterByKey.has(from)) clusterByKey.get(from).externalEdges++;
    if (clusterByKey.has(to)) clusterByKey.get(to).externalEdges++;
    const key = JSON.stringify([from, to, edge.type, edge.origin]);
    if (edges.has(key)) edges.get(key).count++;
    else edges.set(key, { ...edge, from, to, count: 1 });
  }
  return { ...graph, nodes, edges: [...edges.values()], clusters };
}
