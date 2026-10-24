export function contentCounts(items, folders, kind) {
  return `${items} ${kind}${items === 1 ? '' : 's'} · ${folders} folder${folders === 1 ? '' : 's'}`;
}
