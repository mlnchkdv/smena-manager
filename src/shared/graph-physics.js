// Bounded, opt-in settling. The renderer owns cancellation and never writes positions to workspace data.
export const graphPhysicsOptions = reducedMotion => ({
  name: 'cose',
  randomize: false,
  fit: false,
  animate: !reducedMotion,
  animationThreshold: 0,
  refresh: 15,
  numIter: 300,
  initialTemp: 100,
  coolingFactor: 0.95,
  minTemp: 1,
  nodeRepulsion: () => 5000,
  idealEdgeLength: () => 100,
  componentSpacing: 80,
  gravity: 0.8,
});
