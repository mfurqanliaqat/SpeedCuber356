// Local persistence. Electron keeps localStorage in the app's user-data folder.

const read = (k, fallback) => {
  try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; }
};
const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));

export const DEFAULT_SETTINGS = {
  inspection: true,
  solveView: 'yellow-top',
  autoConnect: true,
  training: 'full', // phased training tab on the Timer
  theme: 'system', // light, dark or system
};

export const settings = {
  get() { return { ...DEFAULT_SETTINGS, ...read('settings', {}) }; },
  set(patch) { write('settings', { ...this.get(), ...patch }); },
};

export const solves = {
  all() { return read('solves', []); },
  save(list) { write('solves', list); },
  add(s) { const l = this.all(); l.push(s); this.save(l); return l; },
  update(id, patch) { this.save(this.all().map((s) => (s.id === id ? { ...s, ...patch } : s))); },
  remove(id) { this.save(this.all().filter((s) => s.id !== id)); },
};

export const learned = {
  all() { return new Set(read('learned', [])); },
  toggle(id) {
    const s = this.all();
    s.has(id) ? s.delete(id) : s.add(id);
    write('learned', [...s]);
    return s;
  },
};

/** Practice-drill progress and options, one key per drill. */
export const drills = {
  get(key, fallback) { return read('drill:' + key, fallback); },
  set(key, value) { write('drill:' + key, value); },
};

export const cubeMac = {
  get(name) { return read('mac', {})[name] || null; },
  set(name, mac) { write('mac', { ...read('mac', {}), [name]: mac }); },
  clear() { localStorage.removeItem('mac'); },
};
