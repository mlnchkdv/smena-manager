import { mergeWorkspaceData } from './workspace-merge.js';

const pending = new Set();

export function captureUndo(data) {
  const command = { before: structuredClone(data), after: null };
  pending.add(command);
  return command;
}

export function completeUndo(data) {
  for (const command of pending) command.after = structuredClone(data);
  pending.clear();
}

export function undoCommand(command, current) {
  if (!command?.after) return { data: current, conflicts: ['undo'] };
  return mergeWorkspaceData(command.after, command.before, current);
}
