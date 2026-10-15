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
  let member = memberForProfile(data, profile) || data.members?.find(item => item.id === data.me) || data.members?.[0];
  if (!member) {
    member = { id: profile.id, name: profile.name, email: profile.email, role: 'Owner', c: '#5A67D8', status: 'active' };
    data.members = [member];
  }
  member.authProfileId = profile.id;
  if (profile.name) member.name = profile.name;
  if (profile.email) member.email = profile.email;
  data.me = member.id;
  return data;
}
