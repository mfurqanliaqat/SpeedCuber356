import { CubeView } from './view3d.js';
import { Cube, SOLVED, invertAlg } from './cube.js';
import { randomScramble, ScrambleTracker } from './scramble.js';
import { scrambleTo } from './solver.js';
import { SECTIONS, TRIGGERS } from './algs.js';
import { llSvg } from './net.js';
import { fmt } from './stats.js';
import { drills, learned } from './store.js';
import { movesHtml, glow } from './ui.js';
import { now } from './gan.js';
import { game } from './game.js';

const tsOf = (e) => e.localTimestamp ?? now();
const count = (alg) => alg.split(' ').filter(Boolean).length;

/**
 * Shared frame for the practice drills: a title, clock, live cube and a move
 * bar, plus a side panel the drill fills in. `getCube` returns the live cube
 * model, which main.js keeps up to date before calling onMove.
 */
class DrillView {
  constructor(el, { getCube, isConnected, title, subtitle }) {
    this.el = el;
    this.getCube = getCube;
    this.isConnected = isConnected;
    this.active = false;
    el.innerHTML = `
      <div class="drill-layout">
        <section class="center">
          <div class="view-title">${title}<span>${subtitle}</span></div>
          <div class="clock"><div class="time" data-id="time">0.00</div><div class="status" data-id="status"></div></div>
          <div class="cube-stage" data-id="stage"></div>
          <div class="scramble-bar">
            <div class="scramble-label" data-id="label"></div>
            <div class="moves" data-id="moves"></div>
            <div class="fixes" data-id="fixes"></div>
            <div class="scramble-actions" data-id="actions"></div>
          </div>
        </section>
        <aside class="panel right" data-id="side"></aside>
      </div>`;
    this.$ = (id) => el.querySelector(`[data-id="${id}"]`);
    this.view = new CubeView(this.$('stage'));
    this.$('actions').addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act) this.action(act);
    });
    this.$('side').addEventListener('click', (e) => this.sideClick(e));
    const tick = () => { if (this.active) this.tick(); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }

  show() {
    this.active = true;
    this.view.setState(this.getCube().toString());
    if (!this.started) { this.started = true; this.reset(); }
    this.render();
  }

  hide() { this.active = false; }

  /** The cube state changed outside this view (sync, other views): start over. */
  resync() {
    this.view.setState(this.getCube().toString());
    if (this.started) this.reset();
  }

  onMove(e) {
    const face = e.move[0], amount = e.direction ? 3 : 1;
    this.view.turn(face, amount, this.getCube().toString());
    const t = this.guided, before = t?.mistakes ?? 0;
    this.handle(face, amount, e);
    if (t && t.mistakes > before) this.view.wrong();
    this.render();
  }

  /** Move chips, undo hints, arrows and the wrong-turn glow for one tracker. */
  guide(tracker, alg, { hints = true } = {}) {
    this.guided = tracker;
    this.$('moves').innerHTML = tracker ? movesHtml(tracker, alg) : '';
    const fixes = tracker ? tracker.fixes() : [];
    this.$('fixes').textContent = hints && fixes.length ? `Undo first: ${fixes.join(' ')}` : '';
    this.view.setHint(tracker && hints ? fixes[0] || tracker.remaining() || null : null);
    if (this.active) glow.update(tracker, fixes.length > 0);
  }

  buttons(list) {
    this.$('actions').innerHTML = list.map(([act, label]) => `<button class="btn small" data-act="${act}">${label}</button>`).join('');
  }

  setClock(text, cls = '') {
    const t = this.$('time');
    if (t.textContent !== text) t.textContent = text;
    if (t.className !== 'time ' + cls) t.className = 'time ' + cls;
  }

  setStatus(text) {
    const s = this.$('status');
    if (s.textContent !== text) s.textContent = text;
  }

  sideClick() {}
}

/**
 * Reverse moves: do a few moves, then undo them from memory. Each success
 * adds a move. Builds notation fluency and the "trace back" skill.
 */
export class ReverseDrill extends DrillView {
  constructor(el, opts) {
    super(el, { ...opts, title: 'Reverse moves', subtitle: 'Do the moves, then undo them from memory' });
  }

  reset() {
    const st = drills.get('reverse', { level: 1, best: 0 });
    this.level = st.level;
    this.best = st.best;
    this.newRound();
  }

  newRound() {
    this.anchor = this.getCube().toString();
    this.seq = randomScramble(2 + this.level);
    this.target = new Cube(this.anchor).apply(this.seq).toString();
    this.tracker = new ScrambleTracker(this.seq);
    this.phase = 'show';
    this.assisted = false;
    this.startT = null;
  }

  action(act) {
    if (act === 'hint') this.assisted = true;
    if (act === 'new') this.newRound();
    if (act === 'easier') { this.level = Math.max(1, this.level - 1); this.save(); this.newRound(); }
    this.render();
  }

  save() { drills.set('reverse', { level: this.level, best: this.best }); }

  handle(face, amount, e) {
    const cube = this.getCube().toString();
    if (this.phase === 'show') {
      this.tracker.push(face, amount);
      if (cube === this.target) {
        this.phase = 'undo';
        this.undo = invertAlg(this.seq);
        this.undoTracker = new ScrambleTracker(this.undo);
      }
      return;
    }
    if (this.phase === 'undo') {
      this.startT ??= tsOf(e);
      this.undoTracker.push(face, amount);
      if (cube === this.anchor) {
        this.result = { time: tsOf(e) - this.startT, moves: count(this.seq), assisted: this.assisted };
        if (!this.assisted) {
          this.best = Math.max(this.best, count(this.seq));
          this.level++;
          this.save();
        }
        game.reverse(this.result.moves, this.assisted);
        this.newRound();
      }
    }
  }

  tick() {
    if (this.phase === 'undo' && this.startT) this.setClock(fmt(now() - this.startT));
    else this.setClock(this.result ? fmt(this.result.time) : '0.00', this.result && !this.result.assisted ? 'ready' : '');
  }

  render() {
    if (!this.started) return;
    const n = count(this.seq);
    if (this.phase === 'show') {
      this.$('label').textContent = `Level ${this.level} · do these ${n} moves`;
      this.guide(this.tracker, this.seq);
      this.setStatus(this.result
        ? (this.result.assisted ? 'Done with help. Same length again.' : `Undone in ${fmt(this.result.time)}. Next: ${n} moves.`)
        : 'Do the moves, then undo them without looking.');
    } else {
      this.$('label').textContent = this.assisted ? 'Undo · showing the way back' : `Undo all ${n} moves from memory`;
      if (this.assisted) this.guide(this.undoTracker, this.undo);
      else {
        this.guide(this.undoTracker, '', { hints: false });
        const t = this.undoTracker;
        this.$('moves').innerHTML = Array.from({ length: n }, (_, i) => `<span class="${i < t.index ? 'done' : ''}">${i < t.index ? '✓' : '?'}</span>`).join('');
      }
      this.setStatus(this.undoTracker.stack.length && !this.assisted
        ? 'That turn was not the way back. Think about which move came last.' : 'Undo the moves in reverse order: last move first.');
    }
    this.buttons(this.phase === 'undo' && !this.assisted
      ? [['hint', 'Show me'], ['new', 'New moves']]
      : [['new', 'New moves'], ['easier', 'Fewer moves']]);
    this.$('side').innerHTML = `
      <div class="card"><div class="stats">
        <div class="stat"><div class="k">Level</div><div class="v">${this.level}</div></div>
        <div class="stat"><div class="k">Moves</div><div class="v">${n}</div></div>
        <div class="stat"><div class="k">Best</div><div class="v">${this.best || '–'}</div></div>
        <div class="stat"><div class="k">Last undo</div><div class="v">${this.result ? fmt(this.result.time) : '–'}</div></div>
      </div></div>
      <div class="card tip"><h3>How it works</h3><p>Follow the moves with the arrows. Then the moves hide: turn the cube back to where it started,
        last move first, so R U F becomes F' U' R'. Each success adds one move. "Show me" reveals the way back but doesn't level up.</p></div>`;
  }
}

/**
 * Muscle training: finger-trick triggers repeated until the cube is back where
 * it started (6 reps each). Times the set and shows turns per second.
 */
export class MuscleDrill extends DrillView {
  constructor(el, opts) {
    super(el, { ...opts, title: 'Muscle training', subtitle: 'Finger-trick drills, 6 reps per set' });
  }

  reset() {
    this.trigger = TRIGGERS.find((t) => t.id === drills.get('muscle-pick', 'sexy')) || TRIGGERS[0];
    this.newSet();
  }

  newSet() {
    this.anchor = this.getCube().toString();
    this.seq = `${this.trigger.alg} `.repeat(this.trigger.reps).trim();
    this.tracker = new ScrambleTracker(this.seq);
    this.startT = null;
  }

  action(act) {
    if (act === 'restart') this.newSet();
    this.render();
  }

  sideClick(e) {
    const id = e.target.closest('[data-trigger]')?.dataset.trigger;
    if (!id || this.startT) return;
    this.trigger = TRIGGERS.find((t) => t.id === id);
    drills.set('muscle-pick', id);
    this.newSet();
    this.render();
  }

  handle(face, amount, e) {
    this.startT ??= tsOf(e);
    this.tracker.push(face, amount);
    if (this.tracker.done() && this.getCube().toString() === this.anchor) {
      const time = tsOf(e) - this.startT, moves = count(this.seq);
      const stats = drills.get('muscle', {});
      const prev = stats[this.trigger.id] || {};
      stats[this.trigger.id] = { best: Math.min(prev.best ?? Infinity, time), last: time, sets: (prev.sets || 0) + 1 };
      drills.set('muscle', stats);
      this.result = { time, tps: moves / (time / 1000), best: time <= (prev.best ?? Infinity) };
      game.muscleSet(this.trigger.name, this.result.best && prev.best != null);
      this.newSet();
    }
  }

  tick() {
    if (this.startT) this.setClock(fmt(now() - this.startT));
    else this.setClock(this.result ? fmt(this.result.time) : '0.00', this.result?.best ? 'ready' : '');
  }

  render() {
    if (!this.started) return;
    const per = count(this.trigger.alg), rep = Math.min(this.trigger.reps, Math.floor(this.tracker.index / per) + 1);
    this.$('label').textContent = `${this.trigger.name} · rep ${this.startT ? rep : 1} of ${this.trigger.reps}`;
    this.guide(this.tracker, this.seq);
    this.setStatus(this.startT ? 'Keep a steady rhythm. Smooth beats fast.'
      : this.result ? `${this.result.tps.toFixed(1)} turns/s${this.result.best ? ', a new best' : ''}. Go again: the timer starts on your first turn.`
        : 'Hold the cube white on top, green in front. The timer starts on your first turn.');
    this.buttons([['restart', 'Restart set']]);
    const stats = drills.get('muscle', {});
    this.$('side').innerHTML = `
      <div class="card"><h3>Drills</h3><div class="pick-list">${TRIGGERS.map((t) => {
        const st = stats[t.id];
        return `<button class="pick ${t.id === this.trigger.id ? 'on' : ''}" data-trigger="${t.id}" ${this.startT ? 'disabled' : ''}>
          <b>${t.name}</b><code>${t.alg}</code><span>${st ? `best ${fmt(st.best)} · ${st.sets} sets` : 'not done yet'}</span></button>`;
      }).join('')}</div></div>
      ${this.trigger.note ? `<div class="card tip"><h3>Finger trick</h3><p>${this.trigger.note}</p></div>` : ''}`;
  }
}

/**
 * Algorithm training: the solver sets up a random OLL / PLL case (with a
 * random U turn), then times the algorithm. Times are kept per case.
 */
export class AlgDrill extends DrillView {
  constructor(el, opts) {
    super(el, { ...opts, title: 'Algorithm training', subtitle: '2-look OLL and PLL on your cube' });
  }

  reset() {
    this.opts = drills.get('alg-opts', { sections: SECTIONS.map((_, i) => i), learnedOnly: false, showAlg: true });
    this.nextCase();
  }

  pool() {
    const done = learned.all();
    const all = this.opts.sections.flatMap((i) => SECTIONS[i].algs.map((a) => ({ ...a, kind: SECTIONS[i].kind })));
    const picked = this.opts.learnedOnly ? all.filter((a) => done.has(a.id)) : all;
    return picked.length ? picked : all;
  }

  nextCase(same = false) {
    const pool = this.pool();
    if (!same) {
      const others = pool.filter((a) => a.id !== this.case?.id);
      this.case = (others.length ? others : pool)[Math.floor(Math.random() * (others.length || pool.length))];
      this.auf = Math.floor(Math.random() * 4);
    }
    // Algorithms are written yellow-on-top; GAN reports white on U, so wrap in z2.
    this.target = new Cube().apply(`z2 ${invertAlg(this.case.alg)} ${'U '.repeat(this.auf)}z2`).toString();
    this.phase = 'preparing';
    this.startT = null;
    const from = this.getCube().toString(), req = (this.req = (this.req || 0) + 1);
    if (from === this.target) return this.toReady();
    scrambleTo(from, this.target).then((setup) => {
      if (req !== this.req) return;
      if (this.getCube().toString() !== from) return this.nextCase(true); // turned meanwhile
      this.setup = setup;
      this.tracker = new ScrambleTracker(setup);
      this.phase = 'setup';
      this.render();
    });
  }

  toReady() {
    this.phase = 'ready';
    this.view.orient('yellow-top');
    this.render();
  }

  action(act) {
    if (act === 'skip') this.nextCase();
    if (act === 'retry') this.nextCase(true);
    if (act === 'toggle-alg') { this.opts.showAlg = !this.opts.showAlg; drills.set('alg-opts', this.opts); }
    this.render();
  }

  sideClick(e) {
    const sec = e.target.closest('[data-section]')?.dataset.section;
    if (sec != null) {
      const i = +sec, s = new Set(this.opts.sections);
      s.has(i) ? s.size > 1 && s.delete(i) : s.add(i);
      this.opts.sections = [...s].sort();
    } else if (e.target.closest('[data-learned]')) this.opts.learnedOnly = !this.opts.learnedOnly;
    else return;
    drills.set('alg-opts', this.opts);
    if (this.phase !== 'running') this.nextCase();
    this.render();
  }

  handle(face, amount, e) {
    const cube = this.getCube();
    if (this.phase === 'setup') {
      this.tracker.push(face, amount);
      if (cube.toString() === this.target) this.toReady();
      return;
    }
    if (this.phase === 'ready') {
      this.phase = 'running';
      this.startT = tsOf(e);
      this.moves = 0;
    }
    if (this.phase === 'running') {
      this.moves++;
      const p = cube.phases('U'); // white (GAN U) on the bottom
      if (this.case.kind === 'pll' ? p.solved : p.oll) {
        const time = tsOf(e) - this.startT;
        const times = drills.get('alg-times', {});
        times[this.case.id] = [...(times[this.case.id] || []), time].slice(-20);
        drills.set('alg-times', times);
        this.result = { name: this.case.name, time, moves: this.moves };
        game.algCase(this.case.name);
        this.view.orient('white-top');
        this.nextCase();
      }
    }
  }

  tick() {
    if (this.phase === 'running') this.setClock(fmt(now() - this.startT));
    else this.setClock(this.phase === 'ready' ? '0.00' : this.result ? fmt(this.result.time) : '0.00', this.phase === 'ready' ? 'ready' : '');
  }

  render() {
    if (!this.started) return;
    const c = this.case, solving = this.phase === 'ready' || this.phase === 'running';
    this.view.orient(solving ? 'yellow-top' : 'white-top');
    if (this.phase === 'preparing') {
      this.$('label').textContent = 'Setting up the next case…';
      this.guide(null, '');
      this.setStatus(this.result ? `${this.result.name} in ${fmt(this.result.time)}` : 'Working out the setup moves…');
    } else if (this.phase === 'setup') {
      this.$('label').textContent = 'Set up the case · white on top, green in front';
      this.guide(this.tracker, this.setup);
      this.setStatus(this.result ? `${this.result.name} in ${fmt(this.result.time)} · ${this.result.moves} moves. Next case:` : 'Follow the setup moves.');
    } else {
      this.$('label').textContent = `${c.name} · turn yellow to the top, green in front`;
      this.guide(null, '');
      this.$('moves').innerHTML = this.opts.showAlg ? c.alg.split(' ').map((m) => `<span>${m}</span>`).join('') : '<span class="done">Algorithm hidden</span>';
      this.setStatus(this.phase === 'ready' ? 'Recognise the case, then go. The timer starts on your first turn. You may need a U turn first.' : 'Go!');
    }
    this.buttons([['toggle-alg', this.opts.showAlg ? 'Hide algorithm' : 'Show algorithm'], ['retry', 'Set up again'], ['skip', 'Skip case']]);

    const times = drills.get('alg-times', {}), done = learned.all();
    const row = (a) => {
      const t = times[a.id] || [];
      const avg = t.length ? t.reduce((x, y) => x + y, 0) / t.length : null;
      return `<li class="${a.id === c.id ? 'on' : ''}">${llSvg(new Cube().apply(invertAlg(a.alg)).toString(), a.kind)}
        <b>${a.name}</b><span>${avg != null ? `avg ${fmt(avg)} · ${t.length}×` : 'new'}${done.has(a.id) ? ' · learned' : ''}</span></li>`;
    };
    this.$('side').innerHTML = `
      <div class="card"><h3>Practise</h3>
        ${SECTIONS.map((s, i) => `<label class="row-check"><input type="checkbox" data-section="${i}" ${this.opts.sections.includes(i) ? 'checked' : ''}/> ${s.title.replace('2-look ', '')}</label>`).join('')}
        <label class="row-check"><input type="checkbox" data-learned ${this.opts.learnedOnly ? 'checked' : ''}/> Only cases marked learned</label>
      </div>
      <div class="card recent-card"><h3>Cases</h3><ul class="case-list">${this.pool().map(row).join('')}</ul></div>`;
  }
}
