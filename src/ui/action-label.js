import { esc } from '../core/utils.js';
import { t } from '../core/i18n.js';

// Only the action is localized. Authored names and paths retain their spelling.
export const actionLabel = (action, name, context = '') => esc(`${t(action)}: ${name}${context ? ` · ${context}` : ''}`);
