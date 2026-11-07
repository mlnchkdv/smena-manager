import { validKnowledgeBodyLinks } from './knowledge-body-links.js';

// Input must already be ACL-filtered. Count unique *materials*, not parallel
// edges. A source may appear in several types/origins; those rows are not sums.
export function createRelationRollupReader(graph, members = []) {
  const nodes = new Map(graph.nodes.map(item => [item.key, item]));
  const edges = new Map();
  for (const edge of graph.edges)
    for (const key of new Set([edge.from, edge.to])) {
      if (!edges.has(key)) edges.set(key, []);
      edges.get(key).push(edge);
    }
  const unindexedNotes = graph.nodes.filter(
    item =>
      item.kind === 'note' &&
      typeof item.item.formatted_markdown !== 'string' &&
      (item.item.bodyPending || item.item.bodyRef) &&
      (!validKnowledgeBodyLinks(item.item) || !item.item.bodyLinks.complete),
  ).length;
  return center => {
    const node = nodes.get(center);
    if (!node) return null;
    const targets = new Set(),
      kinds = new Map(),
      types = new Map(),
      origins = new Map();
    const add = (map, type, key) => {
      if (!map.has(type)) map.set(type, new Set());
      map.get(type).add(key);
    };
    for (const edge of edges.get(center) || []) {
      const key = edge.from === center ? edge.to : edge.from;
      const target = nodes.get(key);
      if (!target || key === center) continue;
      targets.add(key);
      add(kinds, target.kind, key);
      add(types, edge.type, key);
      add(origins, edge.origin, key);
    }
    const counts = map => [...map].map(([key, ids]) => ({ key, count: ids.size })).sort((a, b) => a.key.localeCompare(b.key));
    const author = members.find(member => member.id === node.item.createdBy && !['removed', 'deactivated'].includes(member.status));
    return {
      total: targets.size,
      kinds: counts(kinds),
      types: counts(types),
      origins: counts(origins),
      author: author ? { name: String(author.name || '').slice(0, 200) } : null,
      coverage: { complete: unindexedNotes === 0, unindexedNotes },
    };
  };
}

export const relationRollup = (graph, center, members) => createRelationRollupReader(graph, members)(center);
