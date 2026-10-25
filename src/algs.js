// Algorithms for the beginner → CFOP path. All are written for yellow on top,
// white on bottom, and are checked in test/cube.test.js.

export const OLL_EDGES = [
  { id: 'oll-line', name: 'Line', alg: "F R U R' U' F'", note: 'Hold the line horizontally.' },
  { id: 'oll-l', name: 'L shape', alg: "f R U R' U' f'", note: 'Hold the L in the back-left.' },
  { id: 'oll-dot', name: 'Dot', alg: "F R U R' U' F' f R U R' U' f'", note: 'Line, then L.' },
];

export const OLL_CORNERS = [
  { id: 'oll-sune', name: 'Sune', alg: "R U R' U R U2 R'" },
  { id: 'oll-antisune', name: 'Antisune', alg: "R U2 R' U' R U' R'" },
  { id: 'oll-h', name: 'H', alg: "R U R' U R U' R' U R U2 R'" },
  { id: 'oll-pi', name: 'Pi', alg: "R U2 R2 U' R2 U' R2 U2 R" },
  { id: 'oll-headlights', name: 'Headlights', alg: "R2 D R' U2 R D' R' U2 R'" },
  { id: 'oll-t', name: 'T', alg: "r U R' U' r' F R F'" },
  { id: 'oll-bowtie', name: 'Bowtie', alg: "F' r U R' U' r' F R" },
];

export const PLL_CORNERS = [
  { id: 'pll-a', name: 'Headlights (Aa)', alg: "x R' U R' D2 R U' R' D2 R2 x'", note: 'Headlights in the back.' },
  { id: 'pll-y', name: 'Diagonal (Y)', alg: "F R U' R' U' R U R' F' R U R' U' R' F R F'" },
];

export const PLL_EDGES = [
  { id: 'pll-ua', name: 'Ua', alg: "R U' R U R U R U' R' U' R2", note: 'Solved bar in the back.' },
  { id: 'pll-ub', name: 'Ub', alg: "R2 U R U R' U' R' U' R' U R'", note: 'Solved bar in the back.' },
  { id: 'pll-h', name: 'H', alg: 'M2 U M2 U2 M2 U M2' },
  { id: 'pll-z', name: 'Z', alg: "M2 U M2 U M' U2 M2 U2 M' U2" },
];

// Finger-trick drills. Each one repeated `reps` times returns the cube to
// where it started (checked in test/cube.test.js).
export const TRIGGERS = [
  { id: 'sexy', name: 'Sexy move', alg: "R U R' U'", reps: 6, note: 'Right index flicks U, wrist turns R.' },
  { id: 'reverse-sexy', name: 'Reverse sexy', alg: "U R U' R'", reps: 6 },
  { id: 'left-sexy', name: 'Left sexy', alg: "L' U' L U", reps: 6, note: 'Mirror of the sexy move.' },
  { id: 'sledge', name: 'Sledgehammer', alg: "R' F R F'", reps: 6, note: 'Left thumb or index pushes F.' },
  { id: 'hedge', name: 'Hedgeslammer', alg: "F R' F' R", reps: 6 },
  { id: 'sune', name: 'Sune', alg: "R U R' U R U2 R'", reps: 6, note: 'Use U2 as a double flick.' },
  { id: 'antisune', name: 'Antisune', alg: "R U2 R' U' R U' R'", reps: 6 },
];

export const SECTIONS = [
  { title: '2-look OLL · step 1: yellow cross', kind: 'oll', algs: OLL_EDGES },
  { title: '2-look OLL · step 2: yellow face', kind: 'oll', algs: OLL_CORNERS },
  { title: '2-look PLL · step 1: corners', kind: 'pll', algs: PLL_CORNERS },
  { title: '2-look PLL · step 2: edges', kind: 'pll', algs: PLL_EDGES },
];

export const ROADMAP = [
  {
    goal: 'Under 2:00',
    items: [
      'Solve the white cross on the bottom, not the top. You stop flipping the cube to look for pieces.',
      'Learn finger tricks for R U R\' U\': right index finger flicks U, wrist turns R.',
    ],
  },
  {
    goal: 'Under 1:30',
    items: [
      'Learn 4-look last layer: the 16 algorithms below. It replaces the long beginner last-layer steps.',
      'Use the splits on the Timer tab: whichever phase is longest is the one to practise.',
    ],
  },
  {
    goal: 'Under 1:00',
    items: [
      'Plan the whole cross during inspection, then do it without stopping (aim for under 8 moves).',
      'Switch to intuitive F2L: pair a corner with its edge and insert them together.',
    ],
  },
  {
    goal: 'Under 0:30',
    items: [
      'Slow, pause-free solves to build look-ahead: find the next pair while you insert the current one.',
      'Full OLL (57) and PLL (21), starting with the most common cases.',
    ],
  },
];
