const media = {
  mp4: ['video/mp4', 'video'],
  m4v: ['video/mp4', 'video'],
  webm: ['video/webm', 'video'],
  mp3: ['audio/mpeg', 'audio'],
  m4a: ['audio/mp4', 'audio'],
  wav: ['audio/wav', 'audio'],
  ogg: ['audio/ogg', 'audio'],
  flac: ['audio/flac', 'audio'],
  aac: ['audio/aac', 'audio'],
};
export function safeMedia(file) {
  const entry =
    media[
      String(file?.name || '')
        .split('.')
        .pop()
        .toLowerCase()
    ];
  return entry &&
    String(file?.mimeType || '')
      .toLowerCase()
      .split(';')[0] === entry[0]
    ? { mime: entry[0], kind: entry[1] }
    : null;
}
