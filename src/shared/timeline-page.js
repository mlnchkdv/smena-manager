export function timelineAnchorPage(items, date, size = 60) {
  const found = items.findIndex(item => item.date >= date);
  const index = found < 0 ? Math.max(0, items.length - 1) : found;
  return { page: Math.floor(index / size), afterLast: items.length > 0 && found < 0 };
}

export const timelineContextKey = (key, date, items) => JSON.stringify([key, date, items.map(item => [item.task?.id || item.milestone?.id, item.date])]);
