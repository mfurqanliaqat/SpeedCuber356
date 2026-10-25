import { Cube, SOLVED, formatMove } from './cube.js';
import { randomScramble, ScrambleTracker, simplify } from './scramble.js';
import { solve, trainingScramble } from './solver.js';
import { fitTimes, now } from './gan.js';
import { bestWhiteCross } from './cross.js';

const SPLITS = ['layer1', 'f2l', 'oll'];
const ACTIVE = ['scramble', 'ready', 'solving'];

/** Phased training: what each mode times (the phase whose end stops the clock). */
export const TRAINING = {
  full: { goal: 'pll', label: 'Full solve' },
  cross: { goal: 'cross', label: 'Cross', setup: 'Random scramble · solve the white cross, the timer stops when it is done' },
  f2l: { goal: 'f2l', label: 'F2L', setup: 'Sets up a solved white cross · solve the first two layers' },
  oll: { goal: 'oll', label: 'OLL', setup: 'Sets up a random last layer · orient it (yellow on top)' },
  pll: { goal: 'pll', label: 'PLL', setup: 'Sets up a random PLL case · permute the last layer' },
};

/**
 * Smart-cube solve flow: scramble → ready (inspection) → solving → saved.
 * Holds the live cube model; the UI only renders what this exposes.
 *
 * `anchor` is the state Restart leads back to: the scramble's start while
 * scrambling, the scrambled state once inspection or the solve has begun.
 * `history` is every turn since the anchor.
 */
export class Session {
  constructor({ onChange, onSolve, inspection }) {
    this.onChange = onChange;
    this.onSolve = onSolve;
    this.inspection = inspection;
    this.training = 'full';
    this.req = 0;
    this.cube = new Cube();
    this.newScramble();
  }

  get goal() { return TRAINING[this.training].goal; }

  setTraining(mode) {
    if (this.mode === 'solving' || !TRAINING[mode]) return;
    this.training = mode;
    this.fresh();
  }

  /**
   * The cube already holds a state this mode can start from (scrambled for
   * full / cross, cross done for F2L, F2L done for OLL, OLL done for PLL).
   */
  canSolveAsIs() {
    const c = this.cube;
    if (c.isSolved()) return false;
    if (['full', 'cross'].includes(this.training)) return true;
    const bottom = c.findCross();
    if (!bottom) return false;
    const p = c.phases(bottom);
    return { f2l: !p.f2l, oll: p.f2l && !p.oll, pll: p.oll }[this.training];
  }

  /** After connecting or switching modes: solve a scrambled cube as is, else scramble. */
  fresh() {
    if (this.canSolveAsIs()) this.skipScramble(true);
    else this.newScramble();
  }

  /**
   * Full and cross practice use a random-turn scramble. F2L / OLL / PLL ask
   * the solver for turns from the current state to a random practice case.
   */
  newScramble() {
    const mode = this.training, req = ++this.req;
    this.preparing = !['full', 'cross'].includes(mode);
    if (!this.preparing) {
      this.scramble = randomScramble();
      this.target = this.cube.clone().apply(this.scramble).toString();
      return this.restartScramble();
    }
    this.scramble = '';
    this.target = null;
    this.restartScramble();
    const from = this.cube.toString();
    trainingScramble(mode, from).then(({ scramble, target }) => {
      if (req !== this.req) return; // superseded
      if (this.cube.toString() !== from) return this.newScramble(); // turned meanwhile
      this.preparing = false;
      this.scramble = scramble;
      this.target = target;
      this.restartScramble();
    });
  }

  /** Follow the scramble from move 1, starting from the current state. */
  restartScramble() {
    this.mode = 'scramble';
    this.tracker = new ScrambleTracker(this.scramble);
    this.solve = null;
    this.setAnchor();
    this.onChange();
  }

  setAnchor() {
    this.anchor = this.cube.toString();
    this.history = [];
    this.paused = false;
    this.pausedAt = null;
    this.returning = null;
  }

  /**
   * Solve from whatever state the cube is in now. `auto`: the app chose this
   * (not the user), so no inspection countdown runs out while nobody's looking.
   */
  skipScramble(auto = false) {
    this.req++; // drop a scramble still being prepared
    this.preparing = false;
    this.scramble = '';
    this.toReady(auto);
  }

  toReady(auto = false) {
    this.mode = 'ready';
    this.readyAt = now();
    this.inspecting = this.inspection && !auto;
    this.solve = null;
    this.setAnchor();
    // Cross training: the shortest white cross for this scramble, to beat.
    this.crossBest = this.training === 'cross' ? bestWhiteCross(this.anchor) : null;
    this.onChange();
  }

  cancel() {
    this.newScramble();
  }

  get canPause() {
    return ACTIVE.includes(this.mode) && !this.returning;
  }

  /**
   * Space. Scrambling: stop checking turns (resuming lists what to undo).
   * Inspection and solving: freeze the clock; paused time doesn't count.
   */
  togglePause() {
    if (!this.canPause) return;
    const t = now();
    if (!this.paused) {
      this.paused = true;
      this.pausedAt = t;
    } else {
      if (this.mode === 'ready') this.readyAt += t - this.pausedAt;
      if (this.mode === 'solving') this.solve.pauses.push([this.pausedAt, t]);
      this.paused = false;
      this.pausedAt = null;
    }
    this.onChange();
  }

  /** Undo every turn since the anchor, newest first. */
  traceBack() {
    return simplify(this.history.slice().reverse().map((m) => ({ base: m.base, amount: 4 - m.amount })))
      .map(formatMove).join(' ');
  }

  /**
   * Shortest way back to the anchor: the solver's answer (≈20 moves at most),
   * or the trace back when that is shorter, as it is after a few turns.
   */
  async shortestBack() {
    const rel = new Cube(SOLVED);
    for (const m of this.history) rel.turn(m.base, m.amount);
    if (rel.isSolved()) return '';
    const trace = this.traceBack(), solved = await solve(rel.toString());
    const len = (a) => a.split(' ').filter(Boolean).length;
    return len(solved) < len(trace) ? solved : trace;
  }

  /**
   * Guide the user back to the anchor along `alg`. From a scramble that
   * restarts it; from inspection or a solve it drops the attempt, and
   * inspection starts again on the same scrambled cube.
   */
  goBack(alg, kind) {
    if (![...ACTIVE, 'done'].includes(this.mode)) return;
    const dest = this.returning?.dest ?? (this.mode === 'scramble' ? 'scramble' : 'ready');
    if (!alg.trim() || this.cube.toString() === this.anchor) return this.arrive(dest);
    this.mode = 'scramble';
    this.solve = null;
    this.paused = false;
    this.returning = { kind, alg, dest, tracker: new ScrambleTracker(alg) };
    this.onChange();
  }

  arrive(dest) {
    if (dest === 'ready') this.toReady();
    else this.restartScramble();
  }

  /** The cube reported its full state (on connect or on request). */
  sync(facelets) {
    if (this.mode === 'solving') return;
    this.cube = new Cube(facelets);
    this.fresh();
  }

  markSolved() {
    this.cube = new Cube(SOLVED);
    this.newScramble();
  }

  /** e: GAN move event. amount: 1 = clockwise, 3 = counter-clockwise. */
  move(e) {
    const face = e.move[0], amount = e.direction ? 3 : 1;
    this.cube.turn(face, amount);
    this.history.push({ base: face, amount });
    if (this.mode === 'done') return this.onChange(); // turning before choosing: Try again still finds the way back

    if (this.mode === 'scramble') {
      if (this.returning) {
        this.returning.tracker.push(face, amount);
        if (this.cube.toString() === this.anchor) this.arrive(this.returning.dest);
        else this.onChange();
        return;
      }
      this.tracker.push(face, amount);
      if (!this.paused && this.cube.toString() === this.target) this.toReady();
      else this.onChange();
      return;
    }

    if (this.mode === 'ready') {
      // A turn always starts the solve, even if inspection was paused.
      const waited = (this.paused ? this.pausedAt : now()) - this.readyAt;
      this.mode = 'solving';
      this.paused = false;
      this.pausedAt = null;
      this.solve = {
        startedAt: e.localTimestamp ?? now(),
        moves: [],
        pauses: [],
        at: {},
        // White cross is on GAN's U face in the set-up practice states.
        bottom: ['cross', 'f2l', 'oll', 'pll'].includes(this.training) && this.scramble ? 'U' : null,
        penalty: this.inspecting ? (waited > 17000 ? 'DNF' : waited > 15000 ? '+2' : null) : null,
      };
    }

    if (this.mode === 'solving') {
      const s = this.solve, i = s.moves.length;
      s.moves.push({ move: e.move, face: e.face, direction: e.direction, localTimestamp: e.localTimestamp, cubeTimestamp: e.cubeTimestamp });
      if (!s.bottom) s.bottom = this.cube.findCross();
      if (s.bottom) {
        const p = this.cube.phases(s.bottom);
        for (const k of ['cross', ...SPLITS]) if (s.at[k] == null && p[k]) s.at[k] = i;
      }
      if (this.goalReached()) return this.finish();
      this.onChange();
    }
  }

  /** Full solve, or the last checked phase in the splits for practice. */
  goalReached() {
    if (this.goal === 'pll') return this.cube.isSolved();
    return this.solve.at[this.goal] != null;
  }

  /** Cross training: your white cross (in face turns, R R = R2) vs the shortest one. */
  crossReport(s) {
    if (this.training !== 'cross' || this.crossBest == null || s.at.cross == null) return undefined;
    const yours = simplify(s.moves.slice(0, s.at.cross + 1).map((m) => ({ base: m.move[0], amount: m.direction ? 3 : 1 })));
    const best = this.crossBest.split(' ').filter(Boolean);
    return { moves: yours.length, best: best.length, alg: this.crossBest, yours: yours.map(formatMove).join(' ') };
  }

  t0() {
    return this.solve.moves[0]?.localTimestamp ?? this.solve.startedAt;
  }

  /** Pause intervals as ms since the first move, including one still open. */
  pauseSpans() {
    const t0 = this.t0();
    const spans = this.solve.pauses.map(([a, b]) => [a - t0, b - t0]);
    if (this.paused) spans.push([this.pausedAt - t0, now() - t0]);
    return spans;
  }

  /** ms since the first move at time t, minus any paused time before t. */
  activeTime(t, spans) {
    return t - spans.reduce((sum, [a, b]) => sum + Math.max(0, Math.min(b, t) - Math.max(a, 0)), 0);
  }

  /** Running solve time for the clock. */
  elapsed() {
    return this.activeTime((this.paused ? this.pausedAt : now()) - this.t0(), this.pauseSpans());
  }

  /** Live split times (host clock) for the solve in progress. */
  liveSplits() {
    const s = this.solve;
    if (!s) return {};
    const t0 = this.t0(), spans = this.pauseSpans(), out = {};
    for (const [k, i] of Object.entries(s.at)) out[k] = this.activeTime((s.moves[i].localTimestamp ?? now()) - t0, spans);
    return out;
  }

  finish() {
    const s = this.solve, spans = this.pauseSpans();
    const times = fitTimes(s.moves).map((t) => this.activeTime(t, spans));
    const splits = {};
    for (const [k, i] of Object.entries(s.at)) splits[k] = times[i];
    const record = {
      id: Date.now().toString(36),
      date: new Date().toISOString(),
      time: times[times.length - 1],
      penalty: s.penalty,
      train: this.training === 'full' ? undefined : this.training,
      cross: this.crossReport(s),
      paused: spans.length > 0 || undefined,
      scramble: this.scramble,
      bottom: s.bottom,
      splits,
      start: this.anchor,
      moves: s.moves.map((m, i) => [m.move, times[i]]),
    };
    this.onSolve(record);
    // Wait for the choice: try the same scramble again, or a new one.
    this.mode = 'done';
    this.solve = null;
    this.onChange();
  }

  /** After a solve: guide back to the same scrambled state, then inspect again. */
  async tryAgain() {
    if (this.mode !== 'done') return;
    const alg = await this.shortestBack();
    if (this.mode === 'done') this.goBack(alg, 'short');
  }
}
