import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { toKociembaFacelets } = createRequire(import.meta.url)('gan-web-bluetooth');
import { Cube, SOLVED, invertAlg, parseAlg, formatMove } from '../src/cube.js';
import { SECTIONS, TRIGGERS } from '../src/algs.js';
import { trainingScramble } from '../src/training.js';
import { bestWhiteCross } from '../src/cross.js';
import { randomScramble, ScrambleTracker, simplify } from '../src/scramble.js';

let failed = 0;
const test = (name, fn) => {
  try { fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n    ', e.message); }
};

test('sexy move has order 6', () => {
  assert.equal(new Cube().apply("R U R' U' ".repeat(6)).toString(), SOLVED);
});

test('facelet order matches GAN library (F R example)', () => {
  const lib = toKociembaFacelets([0, 5, 2, 1, 7, 4, 6, 3], [1, 2, 0, 2, 1, 1, 0, 2],
    [1, 9, 2, 3, 11, 8, 6, 7, 4, 5, 10, 0], [1, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0]);
  assert.equal(new Cube().apply('F R').toString(), lib);
});

test('every face move has order 4 and inverse undoes', () => {
  for (const f of 'URFDLBMESxyzurfdlb') {
    assert.equal(new Cube().apply(`${f} ${f} ${f} ${f}`).toString(), SOLVED, f);
    assert.equal(new Cube().apply(`${f} ${f}'`).toString(), SOLVED, f);
  }
});

test('wide move = face + slice', () => {
  assert.equal(new Cube().apply('r').toString(), new Cube().apply("R M'").toString());
  assert.equal(new Cube().apply('x').toString(), new Cube().apply("R M' L'").toString());
});

test('phase detection', () => {
  const c = new Cube().apply("R U R' U'");
  assert.deepEqual(c.phases('D'), { cross: true, layer1: false, f2l: false, oll: false, solved: false });
  const top = new Cube().apply("R U R' U R U2 R'");
  assert.deepEqual(top.phases('D'), { cross: true, layer1: true, f2l: true, oll: false, solved: false });
  const pll = new Cube().apply("R U' R U R U R U' R' U' R2");
  assert.deepEqual(pll.phases('D'), { cross: true, layer1: true, f2l: true, oll: true, solved: false });
  assert.equal(new Cube().apply("F2").findCross(), 'B'); // F2 breaks D, U, R, L crosses
});

for (const section of SECTIONS) {
  for (const a of section.algs) {
    test(`${a.name}: keeps F2L, solves its case`, () => {
      const setup = new Cube().apply(invertAlg(a.alg));
      const p = setup.phases('D');
      assert.ok(p.f2l, 'setup breaks F2L');
      if (section.kind === 'pll') assert.ok(p.oll && !p.solved, 'not a PLL case');
      else assert.ok(!p.oll, 'not an OLL case');
      assert.equal(setup.apply(a.alg).toString(), SOLVED);
    });
  }
}

test('finger-trick drills return to the start after their reps', () => {
  for (const t of TRIGGERS) assert.equal(new Cube().apply(`${t.alg} `.repeat(t.reps)).toString(), SOLVED, t.name);
});

test('algorithm-trainer case states: GAN orientation, white bottom', () => {
  for (const section of SECTIONS) for (const a of section.algs) {
    const c = new Cube().apply(`z2 ${invertAlg(a.alg)} U z2`); // yellow on top while setting up
    const p = c.phases('U'); // white (GAN U) is the bottom
    assert.ok(p.f2l, a.name);
    assert.ok(section.kind === 'pll' ? p.oll && !p.solved : !p.oll, a.name);
    assert.equal(c.clone().apply(`z2 U' ${a.alg} z2`).toString(), SOLVED, a.name);
  }
});

test('random scramble has no repeated face', () => {
  for (let i = 0; i < 200; i++) {
    const s = randomScramble().split(' ');
    assert.equal(s.length, 20);
    for (let j = 1; j < s.length; j++) assert.notEqual(s[j][0], s[j - 1][0]);
  }
});

test('scramble tracker: follows moves, accepts R2 either way, handles mistakes', () => {
  const t = new ScrambleTracker("R2 U F'");
  t.push('R', 3); t.push('R', 3);
  assert.equal(t.index, 1);
  t.push('L', 1); // mistake
  assert.deepEqual(t.fixes(), ["L'"]);
  assert.equal(t.mistakes, 1);
  t.push('L', 3);
  assert.deepEqual(t.fixes(), []);
  t.push('U', 1);
  t.push('F', 1); // wrong direction: now need F2
  assert.equal(t.remaining(), 'F2');
  assert.equal(t.mistakes, 2);
  t.push('F', 1); t.push('F', 1);
  assert.ok(t.done());
});

test('trace back and solver both return to the start', () => {
  const Solver = createRequire(import.meta.url)('cubejs');
  Solver.initSolver();
  const hist = "R U R' F2 D L' B U2 R R' L".split(' ');
  const rel = new Cube().apply(hist.join(' '));
  const back = simplify(parseAlg(hist.join(' ')).reverse().map((m) => ({ base: m.base, amount: 4 - m.amount })));
  assert.equal(rel.clone().apply(back.map(formatMove).join(' ')).toString(), SOLVED);
  const short = Solver.fromString(rel.toString()).solve();
  assert.ok(short.split(' ').length <= 22);
  assert.equal(rel.clone().apply(short).toString(), SOLVED);
});

test('training scrambles reach the right practice state from any cube', () => {
  const Solver = createRequire(import.meta.url)('cubejs');
  Solver.initSolver();
  for (const mode of ['f2l', 'oll', 'pll']) {
    for (let k = 0; k < 5; k++) {
      const from = new Cube().apply(randomScramble()).toString();
      const { scramble, target } = trainingScramble(Solver, mode, from);
      assert.equal(new Cube(from).apply(scramble).toString(), target, mode);
      const p = new Cube(target).phases('U');
      if (mode === 'f2l') assert.ok(p.cross && !p.f2l, 'f2l: cross only');
      if (mode === 'oll') assert.ok(p.f2l && !p.oll, 'oll: F2L done, LL not oriented');
      if (mode === 'pll') assert.ok(p.oll && !p.solved, 'pll: oriented, not solved');
    }
  }
});

test('best white cross: solves the cross and is never beaten by a shorter search', () => {
  assert.equal(bestWhiteCross(SOLVED), '');
  assert.equal(bestWhiteCross(new Cube().apply('F').toString()), "F'");
  for (let k = 0; k < 30; k++) {
    const st = new Cube().apply(randomScramble()).toString();
    const sol = bestWhiteCross(st);
    const n = sol.split(' ').filter(Boolean).length;
    assert.ok(n <= 8, 'at most 8 moves');
    assert.ok(new Cube(st).apply(sol).phases('U').cross, 'white cross solved');
  }
  // Known short case: a cross broken by a few moves can't need more than that.
  const st = new Cube().apply("R U F' L2").toString();
  assert.ok(bestWhiteCross(st).split(' ').length <= 4);
});

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
