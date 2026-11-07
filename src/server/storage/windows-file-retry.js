import fs from 'node:fs/promises';

// Windows readers/antivirus can briefly deny atomic replacement of a JSON
// root. Keep the old root intact and retry the same rename; never unlink it.
export async function renameWithRetry(
  source,
  destination,
  { rename = fs.rename, platform = process.platform, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {},
) {
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(source, destination);
      return;
    } catch (error) {
      if (platform !== 'win32' || !['EACCES', 'EBUSY', 'EPERM'].includes(error.code) || attempt >= 7) throw error;
      await wait(25 * 2 ** attempt);
    }
  }
}
