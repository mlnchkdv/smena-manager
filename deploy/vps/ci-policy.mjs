export const CI_REPOSITORY = 'https://github.com/mlnchkdv/smena-manager.git';
export const CI_DIRECTORY = '/usr/local/lib/smena-manager-ci';
export const CI_USER = 'smena-deploy';

export function parseCiCommand(command) {
  if (command === 'status') return { action: 'status' };
  const match = typeof command === 'string' && /^deploy ([a-f0-9]{40})$/.exec(command);
  if (!match || match[0] !== command) throw new Error('Only status or deploy followed by one full lowercase commit SHA is allowed.');
  return { action: 'deploy', sha: match[1] };
}

export async function checkedCiDeployment(sha, ops) {
  parseCiCommand(`deploy ${sha}`);
  if (!(await ops.clean())) throw new Error('The server checkout has local changes; refusing to overwrite them.');
  await ops.fetchMain();
  const main = await ops.mainCommit();
  if (sha !== main) return { status: 'superseded', requested: sha, main };
  if (!(await ops.fastForwardAllowed(sha))) throw new Error('The requested main history is not a fast-forward; manual review is required.');
  await ops.fastForward(sha);
  await ops.deploy(sha);
  await ops.verify(sha);
  return { status: 'deployed', commit: sha };
}
