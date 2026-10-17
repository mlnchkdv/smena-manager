export function migrateMilestoneIds(data) {
  for (const project of data.projects || []) {
    if (!Array.isArray(project.milestones)) continue;
    const used = new Set(project.milestones.map(item => item?.id).filter(Boolean));
    project.milestones.forEach((milestone, index) => {
      if (!milestone || typeof milestone !== 'object' || milestone.id) return;
      let id = `ms-legacy-${project.id}-${index}`;
      while (used.has(id)) id += '-m';
      milestone.id = id;
      used.add(id);
    });
  }
  return data;
}
