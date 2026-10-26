import { t } from '../core/i18n.js';

export const KNOWLEDGE_CATEGORIES = ['General', 'Processes', 'Regulations', 'Projects', 'Research'];
export const knowledgeCategoryLabel = value => (KNOWLEDGE_CATEGORIES.includes(value) ? t(value) : value || '');
