export const MEDIA_MANIFEST_MAX_BYTES = 2 * 1024 * 1024;
const fail = () => {
  throw Object.assign(new TypeError('Use a valid Smena media manifest.'), { code: 'MEDIA_MANIFEST_INVALID', statusCode: 400 });
};
export function mediaManifestIdentity(value) {
  if (
    !value ||
    value.format !== 'smena-media-v1' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value.id || '') ||
    !value.ready ||
    !Array.isArray(value.entries) ||
    !value.entries.length ||
    value.entries.length > 500
  )
    fail();
  const entries = value.entries.map((entry, index) => {
    const file = entry?.file,
      copy = entry?.copy;
    if (
      typeof file?.id !== 'string' ||
      !file.id ||
      file.id.length > 180 ||
      typeof file.name !== 'string' ||
      !file.name ||
      file.name.length > 255 ||
      (file.mimeType !== undefined && (typeof file.mimeType !== 'string' || file.mimeType.length > 255)) ||
      !Number.isSafeInteger(copy?.bytes) ||
      copy.bytes < 1 ||
      copy.bytes !== file.bytes ||
      copy.storageName !== `media-${value.id}-${index}` ||
      typeof copy.storageFileId !== 'string' ||
      !/^[\w.-]{1,200}$/.test(copy.storageFileId) ||
      !/^[a-f0-9]{32,64}$/i.test(copy.checksum || '')
    )
      fail();
    return [file.id, file.name, file.mimeType || '', copy.storageName, copy.storageFileId, copy.bytes, copy.checksum];
  });
  return { format: value.format, id: value.id, entries };
}
