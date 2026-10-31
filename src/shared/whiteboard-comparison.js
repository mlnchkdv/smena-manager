export function compareWhiteboards(current, previous) {
  const rows = [];
  for (const [field, kind] of [
    ['nodes', 'card'],
    ['edges', 'connection'],
  ]) {
    const a = new Map((current?.[field] || []).map(n => [n.id, n]));
    const b = new Map((previous?.[field] || []).map(n => [n.id, n]));
    for (const id of new Set([...a.keys(), ...b.keys()])) {
      const before = a.get(id),
        after = b.get(id);
      if (JSON.stringify(before) !== JSON.stringify(after)) rows.push({ id, kind, change: !before ? 'added' : !after ? 'removed' : 'changed', before, after });
    }
  }
  return {
    rows,
    added: rows.filter(r => r.change === 'added').length,
    removed: rows.filter(r => r.change === 'removed').length,
    changed: rows.filter(r => r.change === 'changed').length,
  };
}
