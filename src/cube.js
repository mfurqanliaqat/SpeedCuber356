// 3x3 facelet model. Stickers live in 54 fixed slots, ordered like Kociemba
// facelet strings (U R F D L B, 9 each). Moves are permutations derived from
// geometry, so there are no hand-typed tables to get wrong.
//
// Coordinates: x = R(+1)/L(-1), y = U(+1)/D(-1), z = F(+1)/B(-1).

export const FACES = ['U', 'R', 'F', 'D', 'L', 'B'];

const NORMAL = {
  U: [0, 1, 0], R: [1, 0, 0], F: [0, 0, 1],
  D: [0, -1, 0], L: [-1, 0, 0], B: [0, 0, -1],
};

// Position of sticker (row, col) on each face, as seen in the Kociemba net.
const LAYOUT = {
  U: (r, c) => [c - 1, 1, r - 1],
  R: (r, c) => [1, 1 - r, 1 - c],
  F: (r, c) => [c - 1, 1 - r, 1],
  D: (r, c) => [c - 1, -1, 1 - r],
  L: (r, c) => [-1, 1 - r, c - 1],
  B: (r, c) => [1 - c, 1 - r, -1],
};

export const SLOTS = [];
for (const f of FACES) {
  for (let i = 0; i < 9; i++) {
    SLOTS.push({ face: f, pos: LAYOUT[f](Math.floor(i / 3), i % 3), n: NORMAL[f] });
  }
}

export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const key = (p, n) => p.join(',') + '|' + n.join(',');
const slotIndex = new Map(SLOTS.map((s, i) => [key(s.pos, s.n), i]));

// Clockwise quarter turn seen from outside along axis a: v' = n(n·v) - n×v
const rot = (a, v) => {
  const c = cross(a, v), d = dot(a, v);
  return [a[0] * d - c[0], a[1] * d - c[1], a[2] * d - c[2]];
};

function buildPerm(axis, inLayer) {
  // perm[i] = slot that the sticker in slot i moves to
  return SLOTS.map((s, i) => {
    if (!inLayer(dot(s.pos, axis))) return i;
    return slotIndex.get(key(rot(axis, s.pos), rot(axis, s.n)));
  });
}

/** Every move as an axis plus which layers (by pos·axis) it turns. */
export const MOVES = {
  M: { axis: NORMAL.L, inLayer: (d) => d === 0 },
  E: { axis: NORMAL.D, inLayer: (d) => d === 0 },
  S: { axis: NORMAL.F, inLayer: (d) => d === 0 },
  x: { axis: NORMAL.R, inLayer: () => true },
  y: { axis: NORMAL.U, inLayer: () => true },
  z: { axis: NORMAL.F, inLayer: () => true },
};
for (const f of FACES) {
  MOVES[f] = { axis: NORMAL[f], inLayer: (d) => d === 1 };
  MOVES[f.toLowerCase()] = { axis: NORMAL[f], inLayer: (d) => d >= 0 };
}

/** Sticker permutation per move: perm[i] = slot the sticker in slot i moves to. */
export const BASE = {};
for (const [m, def] of Object.entries(MOVES)) BASE[m] = buildPerm(def.axis, def.inLayer);

export const SOLVED = FACES.map((f) => f.repeat(9)).join('');

/** Parse "R U2 R' (Rw U) x'" into [{base:'R', amount:1|2|3}] */
export function parseAlg(alg) {
  const out = [];
  const re = /([URFDLBurfdlbMESxyz])(w?)(\d*)('?)/g;
  for (const m of alg.replace(/[()[\]]/g, ' ').matchAll(re)) {
    let base = m[1];
    if (m[2]) base = base.toLowerCase();
    let amount = (m[3] ? parseInt(m[3], 10) : 1) % 4;
    if (m[4]) amount = (4 - amount) % 4;
    if (amount) out.push({ base, amount });
  }
  return out;
}

export function formatMove({ base, amount }) {
  return base + (amount === 1 ? '' : amount === 2 ? '2' : "'");
}

export function invertAlg(alg) {
  return parseAlg(alg).reverse().map((m) => formatMove({ base: m.base, amount: 4 - m.amount })).join(' ');
}

export class Cube {
  constructor(facelets = SOLVED) {
    this.s = facelets.split('');
  }
  clone() { return new Cube(this.toString()); }
  toString() { return this.s.join(''); }

  turn(base, amount = 1) {
    const p = BASE[base];
    if (!p) throw new Error('Unknown move ' + base);
    for (let k = 0; k < amount; k++) {
      const next = new Array(54);
      for (let i = 0; i < 54; i++) next[p[i]] = this.s[i];
      this.s = next;
    }
    return this;
  }

  apply(alg) {
    for (const m of parseAlg(alg)) this.turn(m.base, m.amount);
    return this;
  }

  /** Colour of the centre on face f (centres can move with M/E/S/rotations). */
  center(f) { return this.s[FACES.indexOf(f) * 9 + 4]; }

  /** True if every sticker in the given slots matches its face's centre. */
  slotsOk(slots) {
    return slots.every((i) => this.s[i] === this.center(SLOTS[i].face));
  }

  isSolved() { return this.slotsOk(ALL); }

  /** Which solve phases are complete, treating `bottom` as the first-layer face. */
  phases(bottom) {
    const g = GROUPS[bottom];
    return {
      cross: this.slotsOk(g.cross),
      layer1: this.slotsOk(g.layer1),
      f2l: this.slotsOk(g.f2l),
      oll: this.slotsOk(g.f2l) && this.slotsOk(g.top),
      solved: this.isSolved(),
    };
  }

  /** First face (D preferred) whose cross is solved, or null. */
  findCross() {
    for (const f of ['D', 'U', 'F', 'B', 'R', 'L']) if (this.slotsOk(GROUPS[f].cross)) return f;
    return null;
  }
}

const ALL = SLOTS.map((_, i) => i);
const nonZero = (p) => p.filter((v) => v !== 0).length;
const GROUPS = {};
for (const f of FACES) {
  const n = NORMAL[f];
  const pick = (pred) => ALL.filter((i) => pred(SLOTS[i]));
  GROUPS[f] = {
    cross: pick((s) => dot(s.pos, n) === 1 && nonZero(s.pos) <= 2),
    layer1: pick((s) => dot(s.pos, n) === 1),
    f2l: pick((s) => dot(s.pos, n) >= 0),
    top: pick((s) => dot(s.n, n) === -1),
  };
}
