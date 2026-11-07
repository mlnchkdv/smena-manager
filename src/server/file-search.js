import { queryWorkspaceFileCatalog, getWorkspaceFilesSnapshot } from './workspace-store.js';
import { knowledgeActor } from './knowledge-access.js';
import { canReadProject } from '../shared/project-access.js';
import { workspaceMemberRole } from '../shared/workspace-access.js';
const fields = ['id', 'name', 'type', 'size', 'bytes', 'by', 'at', 'project', 'task', 'folder', 'mimeType'];
export async function searchFilePage(options, user, profiles = [], { query = queryWorkspaceFileCatalog, read = getWorkspaceFilesSnapshot } = {}) {
  options?.signal?.throwIfAborted();
  if (
    typeof options?.query !== 'string' ||
    !Number.isSafeInteger(options.revision) ||
    options.revision < 0 ||
    options.query.length > 500 ||
    !Number.isSafeInteger(options.offset || 0) ||
    (options.offset || 0) < 0
  )
    throw Object.assign(Error('Invalid file search.'), { code: 'INVALID_SEARCH', statusCode: 400 });
  const found = await query(
    user,
    {
      query: options.query,
      revision: options.revision,
      offset: options.offset || 0,
      limit: 30,
      context: 'all',
      project: 'all',
      recursive: true,
    },
    { signal: options.signal },
  );
  options.signal?.throwIfAborted();
  const database = await read(
    user,
    found.files.map(file => file.id),
    { signal: options.signal },
  );
  options.signal?.throwIfAborted();
  const actor = knowledgeActor(database, user, profiles);
  if (database.revision !== found.revision)
    throw Object.assign(Error('The file catalog changed. Refresh and retry.'), {
      code: 'REVISION_CONFLICT',
      statusCode: 409,
      currentRevision: database.revision,
    });
  const projects = new Map((database.projects || []).filter(p => !p.archived && canReadProject(p, actor.id, workspaceMemberRole(actor))).map(p => [p.id, p]));
  const records = new Map((database.files || []).filter(f => projects.has(f.project)).map(f => [f.id, f]));
  if (found.files.some(f => !records.has(f.id))) throw Object.assign(Error('File access changed.'), { code: 'FILE_FORBIDDEN', statusCode: 403 });
  return {
    revision: found.revision,
    total: found.total,
    offset: found.page * 30,
    complete: true,
    files: found.files.map(({ id }) => {
      const file = records.get(id);
      return {
        ...Object.fromEntries(fields.filter(key => Object.hasOwn(file, key)).map(key => [key, file[key]])),
        projectName: projects.get(file.project).name,
      };
    }),
  };
}
