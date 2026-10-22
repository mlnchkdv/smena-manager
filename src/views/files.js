// One renderer and one action model for workspace and project files.
import { pageFiles } from '../pages/files.js';
export const filesHtml = projectId => pageFiles(projectId);
