import { CubeView, GAN_SCHEME } from './view3d.js';
import { Cube } from './cube.js';
import { netSvg } from './net.js';
import { PHASES, fmt, average, best, effective, phaseAverages, phaseDurations, coachingTip, trainOf, TRAIN_LABEL } from './stats.js';
import { TRAINING } from './session.js';
import { movesHtml, glow } from './ui.js';
import { now } from './gan.js';
import { randomScramble } from './scramble.js';


export function phaseBar(durations, total) {
  if (!durations) return '';
  return `<div class="bar">${PHASES.filter((p) => durations[p.key] != null).map((p) =>
    `<div style="--c:${p.color};flex:${Math.max(durations[p.key], 1) / total}" title="${p.label} ${fmt(durations[p.key])}"></div>`).join('')}</div>`;
}

export const phaseLegend = () =>
  `<div class="legend">${PHASES.map((p) => `<span><i style="--c:${p.color}"></i>${p.label}</span>`).join('')}</div>`;

/**
 * Timer tab. Smart-cube solves run through `session`; without a cube the
 * spacebar works like a normal timer (hold, release to start, any key to stop).
 */
export class TimerTab {
  constructor(el, { session, getSolves, isConnected, onManualSolve, actions }) {
    this.session = session;
    this.getSolves = getSolves;
    this.isConnected = isConnected;
    this.onManualSolve = onManualSolve;
    this.last = null;
    this.manual = { state: 'idle', scramble: randomScramble() };

    el.innerHTML = `
      <div class="timer-layout">
        <section class="center">
          <div class="view-title" id="view-title"></div>
          <div class="clock">
            <div class="pb-badge" id="pb-badge" hidden>New personal best!</div>
            <div class="time" id="time">0.00</div>
            <div class="status" id="status"></div>
            <div class="phase-strip" id="splits" aria-label="Split times"></div>
          </div>
          <div class="cube-stage" id="cube-stage">
            <div class="net-overlay" id="net"></div>
            <div class="cube-tools">
              <div class="seg" id="view-seg"><button data-v="3d" class="on">3D</button><button data-v="net">Net</button></div>
              <span class="spacer"></span>
            </div>
          </div>
          <div class="scramble-bar">
            <div class="moves" id="moves"></div>
            <div class="fixes" id="fixes"></div>
            <div class="scramble-label" id="scramble-label"></div>
            <div class="done-actions" id="done-actions" hidden>
              <button class="btn big" id="again-btn" title="Same scramble: guides you back to it">Try again</button>
              <button class="btn big" id="asis-btn" title="Scrambled it yourself? Start solving from its current state">Solve as is</button>
              <button class="btn big primary" id="next-btn">New scramble</button>
            </div>
            <div class="scramble-actions" id="scramble-actions">
              <button class="btn small" id="pause-btn" title="Turn freely without the guide (Space)">Pause</button>
              <div class="menu-wrap">
                <button class="btn small" id="restart-btn" title="Get back to where the scramble started">Restart ▾</button>
                <div class="menu" id="restart-menu" hidden>
                  <div class="menu-title" id="restart-title"></div>
                  <button data-back="trace"><b>Trace back</b><span id="trace-info"></span></button>
                  <button data-back="short"><b>Shortest way</b><span id="short-info"></span></button>
                </div>
              </div>
              <button class="btn small" id="skip-btn" title="Cube already scrambled? Start solving from its current state">Solve as is</button>
              <button class="btn small" id="new-btn">New scramble</button>
            </div>
          </div>
        </section>

        <aside class="panel right">
          <div class="card">
            <div class="stats" id="stats"></div>
            <div id="avg-bar"></div>
          </div>
          <div class="card cross-report" id="cross-report" hidden></div>
          <div class="card tip"><h3>Next thing to practise</h3><p id="tip"></p></div>
          <div class="card recent-card">
            <h3>Recent</h3>
            <ol class="recent" id="recent"></ol>
          </div>
        </aside>
      </div>`;

    this.$ = (id) => el.querySelector('#' + id);
    this.view = new CubeView(this.$('cube-stage'));
    this.$('view-seg').addEventListener('click', (e) => {
      const v = e.target.dataset.v;
      if (!v) return;
      this.$('view-seg').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
      this.$('cube-stage').classList.toggle('show-net', v === 'net');
    });
    this.$('new-btn').onclick = () => (this.isConnected() ? session.newScramble() : this.newManualScramble());
    this.$('skip-btn').onclick = () => session.skipScramble();
    this.$('asis-btn').onclick = () => session.skipScramble();
    this.$('pause-btn').onclick = () => session.togglePause();
    this.$('cross-report').addEventListener('click', (e) => {
      if (e.target.closest('[data-demo]') && this.reportRecord) this.playBest(this.reportRecord);
    });
    this.$('again-btn').onclick = () => session.tryAgain();
    this.$('next-btn').onclick = () => session.newScramble();
    this.$('restart-btn').onclick = () => this.toggleRestartMenu();
    this.$('restart-menu').addEventListener('click', (e) => {
      const kind = e.target.closest('[data-back]')?.dataset.back;
      if (!kind) return;
      this.$('restart-menu').hidden = true;
      if (kind === 'trace') session.goBack(session.traceBack(), 'trace');
      else this.shortest.then((alg) => session.goBack(alg, 'short'));
    });
    addEventListener('click', (e) => {
      if (!e.target.closest('.menu-wrap')) this.$('restart-menu').hidden = true;
    });

    this.bindKeys();
    const tick = () => { this.renderClock(); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    this.render();
  }

  setSolveView(name) { this.solveView = name; this.render(); }

  /** Animate a move on the 3D cube (state comes from the session model). */
  animate(e) {
    this.view.turn(e.move[0], e.direction ? 3 : 1, this.session.cube.toString());
    // The session has already handled the move: flash it red if it was a wrong turn.
    const s = this.session, t = s.mode === 'scramble' ? (s.returning ? s.returning.tracker : s.tracker) : null;
    if (t && t === this.flashTracker && t.mistakes > this.flashMistakes) this.view.wrong();
    this.flashTracker = t;
    this.flashMistakes = t?.mistakes ?? 0;
  }

  showSolve(record, pb = false) {
    this.last = record;
    // Attempts on the same scramble (Try again), for the report card.
    if (this.retry?.scramble === record.scramble && record.scramble) this.retry.attempts.push(record);
    else this.retry = { scramble: record.scramble, attempts: [record] };
    this.lastPB = pb;
    this.render();
  }

  newManualScramble() {
    this.manual = { state: 'idle', scramble: randomScramble() };
    this.render();
  }

  toggleRestartMenu() {
    const menu = this.$('restart-menu'), s = this.session;
    menu.hidden = !menu.hidden;
    if (menu.hidden) return;
    this.$('restart-title').textContent = s.mode === 'scramble'
      ? 'Back to where the scramble started' : 'Back to the scrambled state, then retry';
    const trace = s.traceBack();
    this.$('trace-info').textContent = trace ? `${trace.split(' ').length} moves, undo in reverse order` : 'already at the start';
    this.$('short-info').textContent = 'working it out…';
    this.shortest = s.shortestBack();
    this.shortest.then((alg) => {
      this.$('short-info').textContent = !alg ? 'already at the start'
        : alg === trace ? `${alg.split(' ').length} moves, same as trace back` : `${alg.split(' ').length} moves, computed`;
    });
  }

  /** Watch the best white cross played from the scrambled state of `record`. */
  playBest(record) {
    if (!this.demo) {
      const dlg = document.createElement('dialog');
      dlg.className = 'demo-dialog';
      dlg.innerHTML = `
        <h2>Best white cross</h2>
        <p class="muted">From your scramble, white on top so you can watch the cross form.</p>
        <div class="demo-stage"></div>
        <div class="moves small demo-moves"></div>
        <div class="row end gap"><button class="btn" data-act="replay">Replay</button><button class="btn primary" data-act="close">Close</button></div>`;
      document.body.appendChild(dlg);
      this.demo = { dlg, view: new CubeView(dlg.querySelector('.demo-stage'), { speed: 280 }) };
      dlg.addEventListener('click', (e) => {
        const act = e.target.closest('[data-act]')?.dataset.act;
        if (act === 'close') dlg.close();
        if (act === 'replay') this.runDemo();
      });
      dlg.addEventListener('close', () => clearTimeout(this.demo.timer));
    }
    this.demo.record = record;
    this.demo.dlg.showModal();
    this.runDemo();
  }

  runDemo() {
    const d = this.demo, moves = d.record.cross.alg.split(' ').filter(Boolean);
    clearTimeout(d.timer);
    const model = new Cube(d.record.start);
    d.view.setState(model.toString());
    const chips = d.dlg.querySelector('.demo-moves');
    const show = (k) => { chips.innerHTML = moves.map((m, i) => `<span class="${i < k ? 'done' : i === k ? 'now' : ''}">${m}</span>`).join(''); };
    show(-1);
    let k = 0;
    const step = () => {
      if (k >= moves.length) { show(moves.length); return; }
      const m = moves[k], amount = m.endsWith("'") ? 3 : m.endsWith('2') ? 2 : 1;
      model.turn(m[0], amount);
      d.view.turn(m[0], amount, model.toString());
      show(k);
      k++;
      d.timer = setTimeout(step, 900);
    };
    d.timer = setTimeout(step, 700);
  }

  render() {
    const s = this.session, connected = this.isConnected();
    if (!this.view.anim) this.view.setState(s.cube.toString());
    this.view.orient(s.mode === 'solving' || s.mode === 'ready' ? this.solveView : 'white-top');
    this.$('net').innerHTML = netSvg(s.cube.toString(), GAN_SCHEME);
    this.$('skip-btn').disabled = !connected;
    this.$('asis-btn').disabled = s.cube.isSolved();

    // Scramble (or the way back to its start)
    const scrambling = connected && s.mode === 'scramble';
    const guide = scrambling && s.returning ? s.returning.tracker : scrambling ? s.tracker : null;
    const scramble = connected ? s.scramble : this.manual.scramble;
    if (!connected) this.$('moves').innerHTML = scramble.split(' ').map((m) => `<span>${m}</span>`).join('');
    else if (guide) this.$('moves').innerHTML = movesHtml(guide, s.returning ? s.returning.alg : scramble);
    else this.$('moves').innerHTML = `<span class="done">${scramble || 'Own scramble'}</span>`;
    this.$('moves').classList.toggle('paused', !!(scrambling && s.paused));
    const where = s.returning?.dest === 'ready' ? 'Back to the scrambled state' : 'Back to the start';
    this.$('scramble-label').textContent = !connected ? ''
      : s.returning ? `${where} · ${s.returning.kind === 'trace' ? 'trace back' : 'shortest way'}`
        : s.paused ? (scrambling ? 'Paused · turn freely, press Space to resume' : 'Paused · press Space to resume')
          : scrambling && TRAINING[s.training].setup ? TRAINING[s.training].setup : '';
    if (scrambling && s.preparing) this.$('moves').innerHTML = `<span class="done">Preparing a ${TRAIN_LABEL[s.training]} case…</span>`;
    this.$('view-title').textContent = s.training === 'full' ? 'Full solve' : `${TRAIN_LABEL[s.training]} training`;
    const fixes = guide && !s.paused ? guide.fixes() : [];
    if (this.active) glow.update(guide && !s.paused ? guide : null, fixes.length > 0);
    this.view.setHint(guide && !s.paused ? fixes[0] || guide.remaining() || null : null);
    this.$('fixes').textContent = fixes.length ? `Undo first: ${fixes.join(' ')}` : '';
    const done = connected && s.mode === 'done';
    this.$('done-actions').hidden = !done;
    this.$('scramble-actions').hidden = done;
    if (done) {
      this.$('moves').innerHTML = '';
      this.$('scramble-label').textContent = this.lastPB ? 'New personal best! Go again?' : 'Solved! What next?';
    }
    this.$('pause-btn').textContent = s.paused ? 'Resume' : 'Pause';
    this.$('pause-btn').disabled = !connected || !s.canPause;
    this.$('restart-btn').disabled = !connected || !s.history.length || !['scramble', 'ready', 'solving'].includes(s.mode);

    // Splits: live while solving, otherwise the last solve
    const live = s.mode === 'solving';
    // Which phases this training mode times: one phase, or all four for a full solve.
    const timed = (key) => s.training === 'full' || s.training === key;
    // The last solve only shows here if it was the same kind of practice.
    const last = this.last && trainOf(this.last) === s.training ? this.last : null;
    const d = live ? null : last && phaseDurations(last);
    // Live: each phase's own duration once reached; the first unreached one is in progress.
    const sp = live ? s.liveSplits() : {};
    let prev = 0, current = -1;
    const liveDur = PHASES.map((p, i) => {
      const m = sp[p.key];
      if (!timed(p.key)) { if (m != null) prev = Math.max(prev, m); return null; }
      if (m == null) { if (current < 0) current = i; return null; }
      const v = Math.max(0, m - prev);
      prev = m;
      return v;
    });
    // Strip of split chips under the clock, only for the phases this mode times.
    const chips = PHASES.map((p, i) => {
      if (!timed(p.key)) return '';
      const value = live ? liveDur[i] : d?.[p.key];
      const state = value != null ? 'done' : live && i === current ? 'current' : 'pending';
      return `<span class="phase-chip ${state}" style="--c:${p.color}"><i></i>${p.label}<b>${value != null ? fmt(value) : state === 'current' ? '…' : '–'}</b></span>`;
    }).join('');
    // Cross training has its own report (in face turns), so no quarter-turn count here.
    const lastMoves = !live && s.training !== 'cross' && last?.moves?.length;
    const meta = lastMoves && last.time > 0 ? `<span class="phase-meta">${lastMoves} moves · ${(lastMoves / (last.time / 1000)).toFixed(1)} TPS</span>` : '';
    this.$('splits').innerHTML = (live || last) && chips ? chips + meta : '';

    // Cross training report: your white cross vs the shortest one.
    // It stays up while retrying the same scramble, including during the solve.
    const retrying = this.retry && this.retry.scramble === s.scramble && s.mode !== 'done';
    const c = (!live || retrying) && last?.cross, rep = this.$('cross-report');
    rep.hidden = !c;
    this.reportRecord = c ? last : null;
    if (c) {
      const starsOf = (x) => (x.moves <= x.best ? 3 : x.moves <= x.best + 2 ? 2 : 1);
      const stars = starsOf(c);
      const tries = (this.retry?.attempts || []).filter((x) => x.cross);
      const heading = live ? `Attempt ${tries.length + 1}: beat ${c.moves} moves`
        : retrying && s.mode !== 'scramble' ? `Attempt ${tries.length + 1}: best possible is ${c.best}`
          : c.moves <= c.best ? 'Best possible cross!' : `${c.moves - c.best} move${c.moves - c.best > 1 ? 's' : ''} more than the best`;
      rep.innerHTML = `
        <div class="stars" aria-label="${stars} of 3 stars">${[1, 2, 3].map((k) => `<span class="${k <= stars ? 'on' : ''}">★</span>`).join('')}</div>
        <h3>${heading}</h3>
        ${tries.length > 1 ? `<ol class="attempts">${tries.map((x, i) => `<li><span>Try ${i + 1}</span><b>${x.cross.moves} moves</b><em>${'★'.repeat(starsOf(x.cross))}</em><span>${fmt(x.time)}</span></li>`).join('')}</ol>` : ''}
        <div class="cross-vs"><div><b>${c.moves}</b><span>your moves</span></div><div class="best"><b>${c.best}</b><span>best possible</span></div></div>
        <div class="cross-alg"><span>Best white cross</span>
          <button class="help-btn" data-demo title="Watch the best cross" aria-label="Watch the best cross">?</button>
          <div class="moves small">${c.alg.split(' ').map((m) => `<span>${m}</span>`).join('')}</div></div>
        <div class="cross-alg"><span>Yours</span><code>${c.yours}</code></div>`;
    }

    // Stats
    // Best and averages only compare like with like: this training mode's solves.
    const list = this.getSolves();
    const pool = list.filter((x) => trainOf(x) === s.training);
    const avg = phaseAverages(list);
    this.$('stats').innerHTML = (s.training === 'full' ? '' : `<div class="stats-for">${TRAIN_LABEL[s.training]} training</div>`) + [
      ['Best', fmt(best(pool))],
      ['Solves', String(pool.length)],
      ['Ao5', fmt(average(pool, 5))],
      ['Ao12', fmt(average(pool, 12))],
    ].map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
    this.$('recent').innerHTML = list.length
      ? list.slice(-12).reverse().map((x, i) => `<li><span class="n">${list.length - i}</span>
          <span class="t">${fmt(effective(x))}${x.penalty === '+2' ? '+' : ''}${x.paused ? ' <small title="Paused during the solve">⏸</small>' : ''}</span>
          <span class="m">${x.train ? `<span class="tag">${TRAIN_LABEL[x.train]}</span>` : x.moves ? x.moves.length + ' moves' : ''}</span></li>`).join('')
      : '<li class="muted">No solves yet</li>';
    this.$('avg-bar').innerHTML = avg
      ? `<div class="muted" style="margin-top:12px;font-size:12px">Average phase times · last ${avg.count} smart solves</div>
         ${phaseBar(avg, PHASES.reduce((a, p) => a + avg[p.key], 0))}
         <div class="legend">${PHASES.map((p) => `<span><i style="--c:${p.color}"></i>${p.label} ${fmt(avg[p.key])}</span>`).join('')}</div>`
      : '';
    this.$('tip').textContent = coachingTip(list);
  }

  /** Runs every frame; draws into stand-ins and only touches the DOM on change. */
  renderClock() {
    const time = { className: 'time', textContent: '', classList: { add(c) { time.className += ' ' + c; } } };
    const status = { textContent: '', set innerHTML(v) { this.textContent = v; this.html = true; } };
    this.drawClock(time, status);
    // Gold time and a badge after a personal best, until the next solve starts.
    if (this.session.mode === 'solving') this.lastPB = false;
    const pb = !!this.lastPB && this.session.mode !== 'solving';
    if (pb) time.className += ' pb';
    const badge = this.$('pb-badge');
    if (badge.hidden === pb) badge.hidden = !pb;
    const t = this.$('time'), st = this.$('status');
    if (t.className !== time.className) t.className = time.className;
    if (t.textContent !== time.textContent) t.textContent = time.textContent;
    if (st.dataset.v !== status.textContent) {
      st.dataset.v = status.textContent;
      st[status.html ? 'innerHTML' : 'textContent'] = status.textContent;
    }
  }

  drawClock(time, status) {
    const s = this.session;
    if (!this.isConnected()) return this.renderManualClock(time, status);

    if (s.mode === 'done') {
      time.textContent = this.last ? fmt(this.last.time) : '0.00';
      status.textContent = 'Same scramble again to beat it, or a new one?';
    } else if (s.mode === 'scramble') {
      time.textContent = this.last ? fmt(this.last.time) : '0.00';
      const t = s.returning ? s.returning.tracker : s.tracker;
      status.innerHTML = s.paused ? 'Paused'
        : t.stack.length ? 'Wrong turn: undo the red moves'
          : s.returning ? 'Follow the moves back, then go again'
            : s.preparing ? 'Working out a scramble from your cube’s current state…'
              : 'Turn your cube to follow the scramble (white top, green front)';
    } else if (s.mode === 'ready') {
      const waited = (s.paused ? s.pausedAt : now()) - s.readyAt;
      time.classList.add('ready');
      if (s.inspecting) {
        const left = 15 - Math.floor(waited / 1000);
        time.textContent = left > 0 ? String(left) : left > -2 ? '+2' : 'DNF';
        status.textContent = s.paused ? 'Inspection paused · Space to resume'
          : s.training === 'cross' && s.crossBest != null ? `Plan your white cross: the best possible is ${s.crossBest.split(' ').filter(Boolean).length} moves. Can you match it?`
            : s.training !== 'full' ? `${TRAIN_LABEL[s.training]} training: the timer stops when ${TRAIN_LABEL[s.training]} is done.`
            : 'Inspection: plan your cross. The timer starts with your first turn.';
      } else {
        time.textContent = '0.00';
        status.textContent = s.scramble ? 'Ready. The timer starts with your first turn.'
          : `Your cube is already scrambled: solve it as is. ${s.training === 'full' ? 'The timer' : `${TRAIN_LABEL[s.training]} training: the timer`} starts with your first turn.`;
      }
    } else if (s.mode === 'solving') {
      time.textContent = fmt(s.elapsed());
      if (s.paused) time.classList.add('held');
      status.innerHTML = `${s.paused ? 'Paused · Space to resume · ' : ''}${s.solve.moves.length} moves${s.solve.penalty ? ` · <span class="penalty">${s.solve.penalty}</span>` : ''}`;
    }
  }

  renderManualClock(time, status) {
    const m = this.manual;
    if (m.state === 'running') {
      time.textContent = fmt(now() - m.start);
      status.textContent = 'Press any key to stop';
    } else if (m.state === 'holding') {
      const ready = now() - m.holdStart > 300;
      time.classList.add(ready ? 'ready' : 'held');
      time.textContent = '0.00';
      status.textContent = ready ? 'Release to start' : 'Keep holding…';
    } else {
      time.textContent = this.last ? fmt(this.last.time) : '0.00';
      status.textContent = 'No smart cube connected: hold space, release to start.';
    }
  }

  bindKeys() {
    addEventListener('keydown', (e) => {
      if (!document.querySelector('#tab-timer.active') || document.querySelector('dialog[open]')) return;
      if (this.isConnected()) {
        if (e.key === 'Escape' && this.session.mode !== 'scramble') this.session.cancel();
        if (e.code === 'Space' && !e.repeat) { e.preventDefault(); this.session.togglePause(); }
        return;
      }
      const m = this.manual;
      if (m.state === 'running') {
        e.preventDefault();
        const time = now() - m.start;
        this.onManualSolve({ id: Date.now().toString(36), date: new Date().toISOString(), time, penalty: null, scramble: m.scramble });
        this.newManualScramble();
        // Stopping with space must not also start a hold on the same press.
        this.manual.state = e.code === 'Space' ? 'stopped' : 'idle';
      } else if (e.code === 'Space' && m.state === 'idle' && !e.repeat) {
        e.preventDefault();
        m.state = 'holding';
        m.holdStart = now();
      }
    });
    addEventListener('keyup', (e) => {
      const m = this.manual;
      if (e.code !== 'Space') return;
      if (m.state === 'holding') {
        if (now() - m.holdStart > 300) { m.state = 'running'; m.start = now(); } else m.state = 'idle';
      } else if (m.state === 'stopped') m.state = 'idle';
    });
  }
}
