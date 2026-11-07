export class CollectionLocationHistory {
  constructor(limit = 20) {
    this.limit = limit;
    this.locations = new Map();
    this.history = [];
  }
  remember(frame) {
    this.locations.delete(frame.key);
    this.locations.set(frame.key, structuredClone(frame));
    while (this.locations.size > this.limit) this.locations.delete(this.locations.keys().next().value);
  }
  enter(current, targetKey) {
    if (current.key === targetKey) return null;
    this.remember(current);
    this.history.push(current.key);
    this.history = this.history.slice(-this.limit);
    return this.locations.has(targetKey) ? structuredClone(this.locations.get(targetKey)) : null;
  }
  canBack(currentKey, allowed) {
    return this.history.some(key => key !== currentKey && this.locations.has(key) && allowed(this.locations.get(key)));
  }
  back(current, allowed) {
    this.remember(current);
    while (this.history.length) {
      const key = this.history.pop(),
        frame = this.locations.get(key);
      if (key !== current.key && frame && allowed(frame)) return structuredClone(frame);
    }
    return null;
  }
}
