export function memberForProfile(database, profile) {
  if (!profile || !Array.isArray(database?.members)) return null;
  const email = String(profile.email || '').toLowerCase();
  return (
    database.members.find(member => member.authProfileId === profile.id) ||
    database.members.find(member => member.id === profile.id) ||
    (email ? database.members.find(member => String(member.email || '').toLowerCase() === email) : null) ||
    null
  );
}

export function bindInitialAdministrator(database, profile) {
  const data = structuredClone(database);
  const members = Array.isArray(data.members) ? data.members : [];
  let member = memberForProfile(data, profile);
  if (!member && profile.role === 'admin') {
    const seedMember = members.find(item => item.id === data.me) || members[0];
    member = seedMember && !seedMember.authProfileId ? seedMember : null;
  }
  if (!member) {
    const workspaceRole = profile.role === 'admin' ? 'Owner' : profile.role === 'editor' ? 'Member' : 'Guest';
    member = {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      title: profile.title || '',
      team: profile.team || 'product',
      role: workspaceRole,
      c: '#5A67D8',
      status: 'active',
    };
    data.members = [...members, member];
  }
  member.authProfileId = profile.id;
  if (profile.name) member.name = profile.name;
  if (profile.email) member.email = profile.email;
  if (profile.title) member.title = profile.title;
  if (profile.team) member.team = profile.team;
  data.me = member.id;
  return data;
}

export function bindAccessProfiles(database, profiles) {
  const originalMemberId = database?.me;
  const data = (profiles || [])
    .filter(profile => profile?.active !== false)
    .reduce((workspace, profile) => bindInitialAdministrator(workspace, profile), database);
  data.me = originalMemberId;
  return data;
}
