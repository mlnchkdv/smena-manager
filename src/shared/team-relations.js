export function primaryTeamId(teams, preferredId = '') {
  const available = Array.isArray(teams) ? teams : [];
  return available.some(team => team.id === preferredId) ? preferredId : available[0]?.id || '';
}

export function assignTeamRelations(database, teamId, memberIds = [], projectIds = []) {
  const selectedMembers = new Set(memberIds);
  const selectedProjects = new Set(projectIds);
  for (const member of database.members || []) {
    if (member.team === teamId && !selectedMembers.has(member.id)) member.team = '';
    if (selectedMembers.has(member.id)) member.team = teamId;
  }
  for (const project of database.projects || []) {
    if (project.team === teamId && !selectedProjects.has(project.id)) project.team = '';
    if (selectedProjects.has(project.id)) project.team = teamId;
  }
  return database;
}
