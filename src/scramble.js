import { formatMove } from './cube.js';

const AXIS = { U: 0, D: 0, R: 1, L: 1, F: 2, B: 2 };

/** 20-move random-turn scramble: no repeated face, no A B A on one axis. */
export function randomScramble(length = 20) {
  const faces = Object.keys(AXIS);
  const out = [];
  while (out.length < length) {
    const f = faces[Math.floor(Math.random() * 6)];
    const prev = out[out.length - 1], prev2 = out[out.length - 2];
    if (prev && prev.base === f) continue;
    if (prev && prev2 && AXIS[prev.base] === AXIS[f] && AXIS[prev2.base] === AXIS[f]) continue;
    out.push({ base: f, amount: 1 + Math.floor(Math.random() * 3) });
  }
  return out.map(formatMove).join(' ');
}

/** Merge neighbouring turns of the same face (R R → R2, R R' → nothing). */
export function simplify(moves) {
  const out = [];
  for (const m of moves) {
    const top = out[out.length - 1];
    if (top && top.base === m.base) {
      top.amount = (top.amount + m.amount) % 4;
      if (!top.amount) out.pop();
    } else out.push({ ...m });
  }
  return out;
}

/**
 * Follows a scramble as the user turns the smart cube. Each step keeps the
 * quarter turns still owed, so R2 can be done either way. Wrong turns go on a
 * fix stack that has to be undone before the scramble continues.
 */
export class ScrambleTracker {
  constructor(scramble) {
    this.steps = scramble.split(' ').filter(Boolean).map((m) => ({
      base: m[0], amount: m.endsWith("'") ? 3 : m.endsWith('2') ? 2 : 1,
    }));
    this.index = 0;
    this.left = this.steps[0]?.amount ?? 0;
    this.stack = [];
    this.mistakes = 0;
  }

  /**
   * amount: 1 = clockwise, 3 = counter-clockwise. `mistakes` counts turns that
   * moved the cube further from the scramble (for the wrong-move flash).
   */
  push(face, amount) {
    const dist = (a) => Math.min(a, 4 - a); // quarter turns still owed
    const top = this.stack[this.stack.length - 1];
    if (top) {
      if (top.base === face) {
        const before = dist(top.amount);
        top.amount = (top.amount + amount) % 4;
        if (dist(top.amount) > before) this.mistakes++;
        if (!top.amount) this.stack.pop();
      } else {
        this.stack.push({ base: face, amount });
        this.mistakes++;
      }
      return;
    }
    const step = this.steps[this.index];
    if (step && step.base === face) {
      const before = dist(this.left);
      this.left = (this.left - amount + 4) % 4;
      if (dist(this.left) > before) this.mistakes++;
      if (!this.left) {
        this.index++;
        this.left = this.steps[this.index]?.amount ?? 0;
      }
    } else {
      this.stack.push({ base: face, amount });
      this.mistakes++;
    }
  }

  fixes() {
    return this.stack.slice().reverse().map((m) => formatMove({ base: m.base, amount: 4 - m.amount }));
  }

  /** What is still owed on the current step, e.g. "R" after half of an R2. */
  remaining() {
    const step = this.steps[this.index];
    return step ? formatMove({ base: step.base, amount: this.left }) : '';
  }

  done() { return this.index >= this.steps.length && !this.stack.length; }
}
