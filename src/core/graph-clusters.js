import { D, S } from './store.js';
import { getSessionGeneration } from './api.js';
import { readLayoutPreferenceEntry, writeLayoutPreference, localViewResetApplies } from './view-layout-preferences.js';
let owner;
window.addEventListener('smena:device-view-reset', event => {
  if (localViewResetApplies(event, 'other')) owner = undefined;
});
export function prepareGraphClusters() {
  const scope = JSON.stringify([getSessionGeneration(), S.ui.activeWorkspace, D().ws.id || D().ws.url]);
  if (scope !== owner) {
    owner = scope;
    const entry = readLayoutPreferenceEntry('graph-clusters');
    S.ui.graphClustersChosen = entry.stored && typeof entry.value === 'boolean';
    S.ui.graphClustersEnabled = S.ui.graphClustersChosen ? entry.value : false;
    S.ui.graphClustersExpanded = [];
  }
}
export function toggleGraphClusters() {
  prepareGraphClusters();
  S.ui.graphClustersEnabled = !S.ui.graphClustersEnabled;
  S.ui.graphClustersChosen = true;
  S.ui.graphClustersAutomatic = false;
  S.ui.graphClustersExpanded = [];
  writeLayoutPreference('graph-clusters', S.ui.graphClustersEnabled);
}
