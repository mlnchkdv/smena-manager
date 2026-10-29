import { AsyncLocalStorage } from 'node:async_hooks';

const context = new AsyncLocalStorage();
export const DEFAULT_WORKSPACE = 'default';
export const workspaceScope = () => context.getStore() || DEFAULT_WORKSPACE;
export const validWorkspaceScope = value => value === DEFAULT_WORKSPACE || /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value);
export function inWorkspace(id, operation) {
  if (!validWorkspaceScope(id)) throw Object.assign(new Error('Invalid workspace.'), { statusCode: 400, code: 'WORKSPACE_INVALID' });
  return context.run(id, operation);
}

// AsyncLocalStorage keeps concurrent requests, writes and provider caches isolated.
export function workspaceState(factory) {
  const states = new Map();
  return () => {
    const key = workspaceScope();
    if (!states.has(key)) states.set(key, factory());
    return states.get(key);
  };
}
