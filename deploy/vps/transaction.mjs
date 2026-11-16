// Injectable activation sequence: tests exercise failures at each cutover step
// without controlling the host's real services or touching production Drive.
export async function activateRelease(ops) {
  const timerWasActive = await ops.timerActive();
  await ops.stopTimer();
  let switching = false;
  let restarting = false;
  try {
    await ops.assertCronIdle();
    await ops.journal('switching');
    switching = true;
    await ops.installConfig();
    await ops.validateConfig();
    await ops.preflight?.();
    await ops.selectTarget();
    restarting = true;
    if (ops.restartApp) await ops.restartApp();
    else {
      await ops.stopApp();
      await ops.startApp();
    }
    await ops.backendHealthy();
    await ops.reloadNginx();
    await ops.vhostHealthy();
    await ops.commit();
    await ops.journal('ready');
  } catch (error) {
    let recovered = !switching;
    if (switching) {
      try {
        if (restarting) await ops.stopApp();
        await ops.restorePrevious();
        await ops.restoreConfig();
        await ops.validateConfig();
        if (restarting) await ops.recoverApp();
        await ops.reloadNginx();
        await ops.recoveredHealthy();
        recovered = true;
        await ops.journal('rolled-back');
      } catch {
        await ops.journal('recovery-failed');
      }
    }
    if (timerWasActive && recovered) await ops.startTimer();
    throw new Error(
      recovered
        ? 'Activation failed; previous code/configuration restored. No data restore was performed.'
        : 'Activation and recovery failed. Cron remains stopped; inspect deploy-state.json and systemd logs.',
      { cause: error },
    );
  }
  if (timerWasActive) await ops.startTimer();
}
