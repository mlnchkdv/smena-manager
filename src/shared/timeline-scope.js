export function timelineMilestones(tasks, projects, selectedProject = null) {
  if (selectedProject) return (selectedProject.milestones || []).map(milestone => ({ ...milestone, p: selectedProject }));
  const scope = new Set((tasks || []).map(task => task.project));
  return (projects || [])
    .filter(project => scope.has(project.id))
    .flatMap(project => (project.milestones || []).map(milestone => ({ ...milestone, p: project })));
}
