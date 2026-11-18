export function activityPresetFilters(filters, { today, projectIds, memberIds }) {
  const result = Object.fromEntries(
    ['actFilter', 'actWho', 'actFrom', 'actTo', 'actQuery', 'actProject', 'actPeriod'].map(key => [key, String(filters[key] || '').slice(0, 500)]),
  );
  if (!['all', 'status', 'comments', 'projects'].includes(result.actFilter)) result.actFilter = 'all';
  if (!projectIds.includes(result.actProject)) result.actProject = 'all';
  if (!memberIds.includes(result.actWho)) result.actWho = 'all';
  if (['1', '7'].includes(result.actPeriod)) {
    const start = new Date(today + 'T00:00:00Z');
    start.setUTCDate(start.getUTCDate() - Number(result.actPeriod) + 1);
    result.actFrom = start.toISOString().slice(0, 10);
    result.actTo = today;
  }
  return result;
}
