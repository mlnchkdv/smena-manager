// Both the calendar cells and their overflow list must use the same scoped inputs.
export function calendarDayItems(tasks, events, date, projectId = '') {
  const inDay = item => !projectId || item.project === projectId;
  return [
    ...events.filter(event => event.date === date && inDay(event)).map(ev => ({ ev })),
    ...tasks.filter(task => task.due === date && inDay(task)).map(t => ({ t })),
  ];
}
