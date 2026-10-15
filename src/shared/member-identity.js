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
  if (!member) {
    const seedMember = members.find(item => item.id === data.me) || members[0];
    member = seedMember && !seedMember.authProfileId ? seedMember : null;
  }
  if (!member) {
    member = { id: profile.id, name: profile.name, email: profile.email, role: 'Owner', c: '#5A67D8', status: 'active' };
    data.members = [...members, member];
  }
  member.authProfileId = profile.id;
  if (profile.name) member.name = profile.name;
  if (profile.email) member.email = profile.email;
  data.me = member.id;
  return data;
}
