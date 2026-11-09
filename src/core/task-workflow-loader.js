let module, loading, failed;
export const needsTaskWorkflowCommands = data =>
  data?.projects?.some(project => project.workflow != null) || data?.trash?.some(item => item.kind === 'project' && item.data?.project?.workflow != null);
export const taskWorkflowCommands = () => module;
export function prepareTaskWorkflowCommands(onReady, retry = false) {
  if (module || loading || (failed && !retry)) return;
  failed = false;
  loading = import('../features/task-workflow-command.js')
    .then(value => {
      module = value;
      loading = null;
      onReady?.();
    })
    .catch(() => {
      loading = null;
      failed = true;
    });
}
