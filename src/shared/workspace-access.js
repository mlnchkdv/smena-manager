const ROLE_MAP = new Map([
  ['owner', 'admin'],
  ['admin', 'admin'],
  ['member', 'editor'],
  ['editor', 'editor'],
  ['guest', 'viewer'],
  ['viewer', 'viewer'],
]);

export function workspaceMemberProfile(member) {
  const email = String(member?.email || '')
    .trim()
    .toLowerCase();
  const role = ROLE_MAP.get(String(member?.role || 'member').trim().toLowerCase()) || 'viewer';
  if (!member?.id || !email || member.status === 'deactivated' || member.status === 'removed') return null;
  return {
    id: `workspace:${member.id}`,
    name: String(member.name || email).trim(),
    email,
    title: String(member.title || '').trim(),
    team: String(member.team || '').trim(),
    role,
    active: true,
    source: 'workspace',
  };
}

export function workspaceAccessProfiles(database) {
  return (database?.members || []).map(workspaceMemberProfile).filter(Boolean);
}

export function mergeAccessProfiles(configuredProfiles, database) {
  const profiles = [...(configuredProfiles || [])];
  const configuredEmails = new Set(profiles.map(profile => String(profile.email || '').toLowerCase()).filter(Boolean));
  for (const profile of workspaceAccessProfiles(database)) {
    if (!configuredEmails.has(profile.email)) profiles.push(profile);
  }
  return profiles;
}
