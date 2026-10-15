import { PRODUCT_NAME } from './product.js';

const LEGACY_NAME = 'Gr8r Studio';
const LEGACY_SLUG = 'gr8rstudio';

export function migrateLegacyWorkspaceBrand(value) {
  if (!value || typeof value !== 'object') return value;
  const data = structuredClone(value);

  if (data.workspace?.name === LEGACY_NAME) data.workspace.name = PRODUCT_NAME;
  if (data.ws?.name === LEGACY_NAME) data.ws.name = PRODUCT_NAME;
  if (data.ws?.url === LEGACY_SLUG) data.ws.url = 'smena-manager';

  for (const workspace of data.workspaces || []) {
    if (workspace.name === LEGACY_NAME) workspace.name = PRODUCT_NAME;
  }
  for (const member of data.members || []) {
    if (typeof member.email === 'string' && member.email.endsWith('@gr8rstudio.com')) {
      member.email = member.email.replace('@gr8rstudio.com', '@example.com');
    }
  }
  for (const project of data.projects || []) {
    if (typeof project.desc === 'string') project.desc = project.desc.replaceAll('gr8rstudio.com', 'smena-manager.app');
  }
  for (const session of data.sessions || []) {
    if (typeof session.dev === 'string') session.dev = session.dev.replaceAll('Gr8r app', 'Smena Manager');
  }

  return data;
}
