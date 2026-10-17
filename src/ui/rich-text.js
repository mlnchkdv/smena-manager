import DOMPurify from 'dompurify';

export function safeRichText(value) {
  return DOMPurify.sanitize(String(value || ''), {
    ALLOWED_TAGS: ['p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'h2', 'h3', 'h4', 'a'],
    ALLOWED_ATTR: ['href', 'title', 'rel', 'target'],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
  });
}
