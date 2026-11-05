export function inboxCategoryMatches(notification, category) {
  return (
    category === 'all' || (category === 'actionable' ? ['mention', 'assign', 'comment', 'due'].includes(notification.type) : notification.type === category)
  );
}
