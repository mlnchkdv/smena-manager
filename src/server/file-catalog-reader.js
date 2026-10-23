import { memberForProfile } from '../shared/member-identity.js';
import { canReadProject } from '../shared/project-access.js';
import { fileCatalogPage } from '../shared/file-catalog.js';
import { fileCatalogVersion } from './file-catalog-version.js';

// Cache references only inside one immutable server snapshot. Return page clones,
// never mutable database objects or a shared user-independent visibility cache.
export function createCatalogReader(database) {
  const cache = new Map();
  return (user, options) => {
    const member = memberForProfile(database, user)?.id || user.id,
      key = JSON.stringify([member, user.role]);
    let entry = cache.get(key);
    if (!entry) {
      const readable = new Set(database.projects.filter(project => canReadProject(project, member, user.role)).map(project => project.id));
      const tasks = new Map(database.tasks.map(task => [task.id, task.project]));
      const files = database.files.filter(file => readable.has(file.project || tasks.get(file.task)));
      const projects = new Map();
      for (const file of files) {
        const id = file.project || tasks.get(file.task);
        if (!projects.has(id)) projects.set(id, []);
        projects.get(id).push(file);
      }
      entry = { files, projects, token: fileCatalogVersion(files) };
      cache.set(key, entry);
      if (cache.size > 64) cache.delete(cache.keys().next().value);
    }
    let files = !options.project || options.project === 'all' ? entry.files : entry.projects.get(options.project) || [];
    if (options.ids) {
      if (!Array.isArray(options.ids) || options.ids.length > 100 || options.ids.some(id => typeof id !== 'string'))
        throw new TypeError('Invalid file identities.');
      const ids = new Set(options.ids);
      files = files.filter(file => ids.has(file.id));
    }
    return structuredClone(fileCatalogPage({ revision: database.revision, files }, { ...options, project: 'all', expectedToken: entry.token }));
  };
}
