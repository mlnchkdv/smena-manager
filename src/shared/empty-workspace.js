const EMPTY_COLLECTIONS = [
  'workspaces',
  'projects',
  'tasks',
  'comments',
  'knowledgeNotes',
  'knowledgeFolders',
  'links',
  'linkFolders',
  'files',
  'activity',
  'notifs',
  'events',
  'projOrder',
  'savedViews',
  'recentSearches',
  'sessions',
  'invoices',
  'teams',
];

export function emptyWorkspace(database) {
  const source = structuredClone(database || {});
  const members = (source.members || []).filter(member => member.authProfileId);
  const currentMember = members.find(member => member.id === source.me) || members[0] || null;
  const empty = {
    ws: { name: '', url: '', c: source.ws?.c || '#1D1C1A' },
    me: currentMember?.id || null,
    members,
    tfa: false,
    notifPrefs: {},
  };
  for (const field of EMPTY_COLLECTIONS) empty[field] = [];
  return empty;
}
