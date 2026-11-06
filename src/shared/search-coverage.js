const SOURCES = ['tasks', 'projects', 'people', 'files', 'comments', 'knowledge', 'bookmarks', 'whiteboards'];

// Counts describe one scope: all matching loaded records, not just the current
// page. Pending/error remote sources never turn that count into a final answer.
export function searchCoverage({ category = 'all', totals = {}, demandFiles = false, whiteboardStatus = '', locale = 'en' } = {}) {
  const ru = locale === 'ru';
  const counts = Object.fromEntries(SOURCES.map(key => [key, Math.max(0, Number(totals[key]) || 0)]));
  const count = category === 'all' ? Object.values(counts).reduce((a, b) => a + b, 0) : counts[category] || 0;
  const filesIncomplete = demandFiles && ['all', 'files'].includes(category);
  const boardsIncomplete = !!whiteboardStatus && ['all', 'whiteboards'].includes(category);
  const partial = filesIncomplete || boardsIncomplete;
  return {
    count,
    partial,
    filesIncomplete,
    boardsIncomplete,
    countLabel: partial ? (ru ? `Совпадения в загруженных материалах: ${count}` : `Matches in loaded materials: ${count}`) : '',
    categoryLabel(key) {
      const value = key === 'all' ? Object.values(counts).reduce((a, b) => a + b, 0) : counts[key] || 0;
      return (key === 'files' && demandFiles) || (key === 'whiteboards' && whiteboardStatus) || (key === 'all' && (demandFiles || whiteboardStatus))
        ? ru
          ? `Загружено: ${value}`
          : `Loaded: ${value}`
        : String(value);
    },
  };
}
