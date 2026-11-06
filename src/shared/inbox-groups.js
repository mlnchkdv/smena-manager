export function inboxEventGroups(notifications) {
  const groups = [],
    system = new Map();
  for (const notification of notifications) {
    // Unread events remain first-class rows, even when their diagnostic repeats.
    const key =
      notification.read === true && !notification.by
        ? notification.type === 'security'
          ? JSON.stringify(['security', notification.workspaceId || notification.workspace || ''])
          : notification.type === 'system'
            ? JSON.stringify([
                'system',
                notification.workspaceId || notification.workspace || '',
                notification.incident?.id || '',
                notification.incident?.state || '',
                notification.text,
                notification.snippet,
              ])
            : null
        : null;
    if (key && system.has(key)) system.get(key).earlier.push(notification);
    else {
      const group = { notification, earlier: [], securityHistory: notification.type === 'security' && notification.read === true && !notification.by };
      groups.push(group);
      if (key) system.set(key, group);
    }
  }
  return groups;
}
