// Only exact server identifiers identify a message; legacy snippets are never guessed.
export function inboxConversation(comments, notification, window) {
  let id = notification.comment;
  if (!id && ['mention', 'comment'].includes(notification.type) && notification.recipient) {
    const prefix = /^n-\d+-(?:mention|comment)-/.exec(notification.id || '')?.[0];
    const suffix = '-' + notification.recipient;
    if (prefix && notification.id.endsWith(suffix)) id = notification.id.slice(prefix.length, -suffix.length);
  }
  const index = id ? comments.findIndex(c => c.id === id) : -1;
  const start =
    window?.id === notification.id
      ? Math.max(0, Math.min(comments.length, window.start))
      : index >= 0
        ? Math.max(0, index - 2)
        : Math.max(0, comments.length - 4);
  const end =
    window?.id === notification.id
      ? Math.min(comments.length, Math.max(start, window.end))
      : Math.min(comments.length, index >= 0 ? index + 3 : comments.length);
  return { items: comments.slice(start, end), target: index >= 0 ? id : null, start, end, total: comments.length, missing: !!id && index < 0 };
}
