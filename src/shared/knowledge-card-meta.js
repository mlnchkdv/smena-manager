export const defaultCardMeta = () => ({ version: 1, showType: true, fields: {} });
export function validCardMeta(value) {
  const key = value => /^[a-zA-Z0-9_-]{1,100}$/.test(value) && !['__proto__', 'constructor', 'prototype'].includes(value);
  return !!(
    value &&
    value.version === 1 &&
    typeof value.showType === 'boolean' &&
    Object.keys(value).every(k => ['version', 'showType', 'fields'].includes(k)) &&
    value.fields &&
    typeof value.fields === 'object' &&
    !Array.isArray(value.fields) &&
    Object.keys(value.fields).length <= 45 &&
    Object.entries(value.fields).every(
      ([type, fields]) =>
        key(type) &&
        Array.isArray(fields) &&
        fields.length <= 3 &&
        new Set(fields).size === fields.length &&
        fields.every(id => typeof id === 'string' && key(id)),
    )
  );
}
export function cardMetaPreferences(raw) {
  try {
    const value = JSON.parse(raw);
    return validCardMeta(value) ? value : defaultCardMeta();
  } catch {
    return defaultCardMeta();
  }
}
