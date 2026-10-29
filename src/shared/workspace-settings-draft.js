export function mergeWorkspaceSettings(base, draft, current) {
  const value = { ...current };
  const conflicts = [];
  for (const key of ['name', 'description', 'url', 'c']) {
    const before = base?.[key] || '';
    const proposed = draft?.[key] || '';
    const remote = current?.[key] || '';
    if (proposed === before) continue;
    if (remote !== before && remote !== proposed) conflicts.push(key);
    else value[key] = proposed;
  }
  return { value, conflicts };
}
