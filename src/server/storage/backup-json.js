// Emit the existing standalone backup envelope without allocating a second
// catalog-sized JSON string. Arrays are serialized one complete record at a
// time; normal JSON semantics (including undefined array slots) are retained.
export function* backupJson(data, createdAt, label) {
  yield `{"createdAt":${JSON.stringify(createdAt)},"label":${JSON.stringify(String(label || ''))},"data":{`;
  let separator = '';
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      yield `${separator}${JSON.stringify(key)}:[`;
      for (let index = 0; index < value.length; index++) yield `${index ? ',' : ''}${JSON.stringify(value[index]) ?? 'null'}`;
      yield ']';
    } else {
      const text = JSON.stringify(value);
      if (text === undefined) continue;
      yield `${separator}${JSON.stringify(key)}:${text}`;
    }
    separator = ',';
  }
  yield '}}';
}
