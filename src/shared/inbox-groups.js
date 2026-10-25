export function inboxEventGroups(notifications) {
  const groups = [],
    system = new Map();
  for (const notification of notifications) {
    const key = notification.type === 'system' && !notification.by ? JSON.stringify([notification.text, notification.snippet]) : null;
    if (key && system.has(key)) system.get(key).earlier.push(notification);
    else {
      const group = { notification, earlier: [] };
      groups.push(group);
      if (key) system.set(key, group);
    }
  }
  return groups;
}
