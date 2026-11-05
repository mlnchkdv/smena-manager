import { D, S } from './store.js';
import { getSessionGeneration } from './api.js';
import { readLayoutPreference, writeLayoutPreference } from './view-layout-preferences.js';
let owner;
export function prepareGraphClusters() {
  const scope = JSON.stringify([getSessionGeneration(), S.ui.activeWorkspace, D().ws.id || D().ws.url]);
  if (scope !== owner) {
    owner = scope;
    S.ui.graphClustersEnabled = readLayoutPreference('graph-clusters', false);
    S.ui.graphClustersExpanded = [];
  }
}
export function toggleGraphClusters() {
  prepareGraphClusters();
  S.ui.graphClustersEnabled = !S.ui.graphClustersEnabled;
  S.ui.graphClustersExpanded = [];
  writeLayoutPreference('graph-clusters', S.ui.graphClustersEnabled);
}
