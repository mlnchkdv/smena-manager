export function inboxEventGroups(notifications) {
  const groups = [],
    system = new Map();
  for (const notification of notifications) {
    const signIn = !notification.by && notification.type === 'security' && notification.text === 'New sign-in detected' && notification.snippet?.trim();
    const key = signIn
      ? JSON.stringify(['sign-in', notification.workspaceId || notification.workspace, notification.recipient, signIn])
      : notification.read === true && !notification.by
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
      const group = {
        notification,
        earlier: [],
        signIn: !!signIn,
        securityHistory: !signIn && notification.type === 'security' && notification.read === true && !notification.by,
      };
      groups.push(group);
      if (key) system.set(key, group);
    }
  }
  return groups;
}
