// Practice states for phased training, built on cubejs (Kociemba) cube
// arrays. White is GAN's U face, so the cross sits on U and the last layer is
// the D (yellow) layer.
//
// cubejs indices — corners: URF UFL ULB UBR DFR DLF DBL DRB (0-7);
// edges: UR UF UL UB DR DF DL DB FR FL BL BR (0-11).

const range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);
const CROSS_EDGES = range(0, 4);
const LL_CORNERS = range(4, 8), LL_EDGES = range(4, 8);
const ALL_CORNERS = range(0, 8), F2L_EDGES = range(4, 12);

const randInt = (n) => Math.floor(Math.random() * n);

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function parity(perm) {
  let swaps = 0;
  const p = perm.slice();
  for (let i = 0; i < p.length; i++) {
    while (p[i] !== i) {
      const j = p[i];
      [p[i], p[j]] = [p[j], p[i]];
      swaps++;
    }
  }
  return swaps % 2;
}

/** Shuffle the pieces at `slots` among themselves. */
function scramblePerm(perm, slots) {
  const vals = shuffle(slots.slice());
  slots.forEach((s, i) => { perm[s] = vals[i]; });
}

/** Random orientations at `slots`, keeping the total valid (mod n). */
function scrambleOri(ori, slots, n) {
  let sum = 0;
  slots.slice(0, -1).forEach((s) => { ori[s] = randInt(n); sum += ori[s]; });
  ori[slots[slots.length - 1]] = (n - (sum % n)) % n;
}

/**
 * Random target state for a training mode, as a cubejs Cube:
 * f2l — cross solved, rest random; oll — first two layers solved, last layer
 * random; pll — last layer oriented, only permuted. Never already finished.
 */
export function trainingTarget(Cube, mode) {
  const corners = { f2l: ALL_CORNERS, oll: LL_CORNERS, pll: LL_CORNERS }[mode];
  const edges = { f2l: F2L_EDGES, oll: LL_EDGES, pll: LL_EDGES }[mode];
  for (;;) {
    const c = new Cube();
    scramblePerm(c.cp, corners);
    scramblePerm(c.ep, edges);
    // Corner and edge permutation parity must match on a real cube.
    if (parity(c.cp) !== parity(c.ep)) [c.ep[edges[0]], c.ep[edges[1]]] = [c.ep[edges[1]], c.ep[edges[0]]];
    if (mode !== 'pll') {
      scrambleOri(c.co, corners, 3);
      scrambleOri(c.eo, edges, 2);
    }
    const llOriented = LL_CORNERS.every((i) => !c.co[i]) && LL_EDGES.every((i) => !c.eo[i]);
    if (mode === 'oll' && llOriented) continue; // OLL skip
    if (c.isSolved()) continue; // PLL skip
    return c;
  }
}

function inverse(Cube, a) {
  const inv = new Cube();
  for (let i = 0; i < 8; i++) { inv.cp[a.cp[i]] = i; inv.co[a.cp[i]] = (3 - a.co[i]) % 3; }
  for (let i = 0; i < 12; i++) { inv.ep[a.ep[i]] = i; inv.eo[a.ep[i]] = a.eo[i]; }
  return inv;
}

/** Face turns from one state to another (both facelet strings or cubejs Cubes). */
export function scrambleTo(Cube, from, to) {
  const a = typeof from === 'string' ? Cube.fromString(from) : from;
  const b = typeof to === 'string' ? Cube.fromString(to) : to;
  // M with A·M = B is A⁻¹·B; the solver gives Q with (A⁻¹·B)·Q = I, so M = Q⁻¹.
  return Cube.inverse(inverse(Cube, a).multiply(b).solve());
}

/**
 * Face turns that take the cube from `facelets` to a fresh practice state.
 * Returns { scramble, target } with target as a facelet string.
 */
export function trainingScramble(Cube, mode, facelets) {
  const target = trainingTarget(Cube, mode);
  return { scramble: scrambleTo(Cube, facelets, target), target: target.asString() };
}
