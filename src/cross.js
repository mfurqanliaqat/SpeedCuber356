// Shortest white cross. Only the four white edges matter, so the state is
// where each one's white sticker sits (24 edge-sticker slots each). A
// breadth-first search from the solved cross gives the distance of every
// state (~190k reachable, at most 8 moves), built once on first use.
import { SLOTS, BASE, formatMove } from './cube.js';

const FACES = ['U', 'R', 'F', 'D', 'L', 'B'];
const MOVE_LIST = FACES.flatMap((f) => [1, 2, 3].map((amount) => ({ base: f, amount })));

// The 24 edge-sticker slots and, for each, the other sticker of the same edge.
const EDGE_SLOTS = SLOTS.map((s, i) => i).filter((i) => SLOTS[i].pos.filter((v) => v !== 0).length === 2);
const partner = new Map();
for (const i of EDGE_SLOTS) {
  const j = EDGE_SLOTS.find((k) => k !== i && SLOTS[k].pos.join() === SLOTS[i].pos.join());
  partner.set(i, j);
}
const edgeIndex = new Map(EDGE_SLOTS.map((slot, k) => [slot, k]));

// Each move as a permutation of the 24 edge-sticker indices.
const MOVE_PERM = MOVE_LIST.map(({ base, amount }) => EDGE_SLOTS.map((slot) => {
  let at = slot;
  for (let k = 0; k < amount; k++) at = BASE[base][at];
  return edgeIndex.get(at);
}));

// White edges in a fixed order (by their side colour), white is GAN's U face.
const SIDES = ['R', 'F', 'L', 'B'];
const encode = (a) => ((a[0] * 24 + a[1]) * 24 + a[2]) * 24 + a[3];

/** Where each white edge's white sticker is, as edge-sticker indices. */
function crossState(facelets) {
  const out = [0, 0, 0, 0];
  for (const slot of EDGE_SLOTS) {
    if (facelets[slot] !== 'U') continue;
    out[SIDES.indexOf(facelets[partner.get(slot)])] = edgeIndex.get(slot);
  }
  return out;
}

let dist = null;
function table() {
  if (dist) return dist;
  dist = new Int8Array(24 ** 4).fill(-1);
  const solved = crossState('UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB');
  let frontier = [solved];
  dist[encode(solved)] = 0;
  for (let d = 0; frontier.length; d++) {
    const next = [];
    for (const st of frontier) {
      for (const p of MOVE_PERM) {
        const n = [p[st[0]], p[st[1]], p[st[2]], p[st[3]]], k = encode(n);
        if (dist[k] < 0) { dist[k] = d + 1; next.push(n); }
      }
    }
    frontier = next;
  }
  return dist;
}

/** Shortest white cross from a facelet state, e.g. "F R' D2 L" ('' if already solved). */
export function bestWhiteCross(facelets) {
  const t = table();
  let st = crossState(facelets);
  const moves = [];
  while (t[encode(st)] > 0) {
    const d = t[encode(st)];
    const i = MOVE_PERM.findIndex((p) => t[encode([p[st[0]], p[st[1]], p[st[2]], p[st[3]]])] === d - 1);
    const p = MOVE_PERM[i];
    st = [p[st[0]], p[st[1]], p[st[2]], p[st[3]]];
    moves.push(formatMove(MOVE_LIST[i]));
  }
  return moves.join(' ');
}

/** Start building the table in idle time so the first lookup is instant. */
export function warmUpCross() {
  (window.requestIdleCallback || setTimeout)(() => table());
}
