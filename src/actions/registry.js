// Shared tables must initialize before any module registers handlers. Keep this
// module dependency-free so lazy pages cannot enter actions.js's import cycle.
export const A = {},
  IN = {},
  KEY = {},
  DBL = {},
  BLUR = {};
