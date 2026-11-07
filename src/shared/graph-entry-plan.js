export function graphEntryPlan(graph, { preference, savedView = false, center = '', query = '' } = {}) {
  const dense = (graph.total || graph.nodes.length) >= 120 && !center && !query.trim();
  const automatic = preference === undefined && !savedView && dense;
  const nodes = new Map(graph.nodes.map(node => [node.key, node])),
    parent = new Map([...nodes.keys()].map(key => [key, key])),
    degree = new Map();
  const find = key => {
    let root = key;
    while (parent.get(root) !== root) root = parent.get(root);
    while (key !== root) {
      const next = parent.get(key);
      parent.set(key, root);
      key = next;
    }
    return root;
  };
  for (const edge of graph.edges) {
    if (!nodes.has(edge.from) || !nodes.has(edge.to)) continue;
    const a = find(edge.from),
      b = find(edge.to);
    if (a !== b) parent.set(b, a);
    degree.set(edge.from, (degree.get(edge.from) || 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) || 0) + 1);
  }
  const groups = new Map();
  for (const node of nodes.values()) {
    const key = find(node.key);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(node);
  }
  const entries = [...groups.values()]
    .filter(items => items.length >= 3)
    .map(items => {
      const ranked = items
        .slice()
        .sort(
          (a, b) =>
            Number(b.kind === 'project') - Number(a.kind === 'project') || (degree.get(b.key) || 0) - (degree.get(a.key) || 0) || a.key.localeCompare(b.key),
        );
      return { key: ranked[0].key, title: ranked[0].title, count: items.length };
    })
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, 4);
  return { dense, automatic, grouped: preference ?? automatic, entries };
}
