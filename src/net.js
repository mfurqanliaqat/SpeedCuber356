// Flat SVG drawings of the cube: the unfolded net, and last-layer case diagrams.

// For algorithms: yellow on top, green in front.
export const LL_SCHEME = { U: '#ffd21f', D: '#f4f4f0', F: '#18b04a', B: '#1f6fe0', R: '#ff7a1a', L: '#e0322d' };
const GRAY = '#d4d4d4';

const sticker = (x, y, w, h, fill) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(w, h) * 0.18}" fill="${fill}"/>`;

const face = (facelets, f) => facelets.slice('URFDLB'.indexOf(f) * 9, 'URFDLB'.indexOf(f) * 9 + 9);

/** Unfolded net: U on top, L F R B across, D below. */
export function netSvg(facelets, scheme) {
  const s = 14, gap = 2, fw = s * 3 + gap * 4;
  const at = { U: [1, 0], L: [0, 1], F: [1, 1], R: [2, 1], B: [3, 1], D: [1, 2] };
  let out = '';
  for (const [f, [cx, cy]] of Object.entries(at)) {
    const st = face(facelets, f);
    for (let i = 0; i < 9; i++) {
      out += sticker(cx * fw + gap + (i % 3) * (s + gap), cy * fw + gap + Math.floor(i / 3) * (s + gap), s, s, scheme[st[i]]);
    }
  }
  return `<svg viewBox="0 0 ${fw * 4} ${fw * 3}" class="net" role="img" aria-label="Cube net">${out}</svg>`;
}

/** Top view of the last layer with the side stickers around it. */
export function llSvg(facelets, kind) {
  const U = face(facelets, 'U'), F = face(facelets, 'F'), R = face(facelets, 'R');
  const B = face(facelets, 'B'), L = face(facelets, 'L');
  const color = (c) => (kind === 'oll' ? (c === 'U' ? LL_SCHEME.U : GRAY) : LL_SCHEME[c]);
  const s = 22, gap = 3, side = 7, o = side + gap * 2;
  let out = '';
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    out += sticker(o + c * (s + gap), o + r * (s + gap), s, s, color(U[r * 3 + c]));
  }
  const far = o + 3 * (s + gap);
  for (let i = 0; i < 3; i++) {
    const p = o + i * (s + gap);
    out += sticker(p, gap, s, side, color(B[2 - i]));
    out += sticker(p, far, s, side, color(F[i]));
    out += sticker(gap, p, side, s, color(L[i]));
    out += sticker(far, p, side, s, color(R[2 - i]));
  }
  const size = far + side + gap;
  return `<svg viewBox="0 0 ${size} ${size}" class="ll" role="img" aria-label="Case diagram">${out}</svg>`;
}
