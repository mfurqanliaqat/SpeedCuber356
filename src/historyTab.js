import { CubeView } from './view3d.js';
import { Cube } from './cube.js';
import { fmt, effective, average, phaseDurations, PHASES, fullSolves, TRAIN_LABEL } from './stats.js';
import { phaseLegend } from './timerTab.js';

const SVG_H = 220, PAD = { l: 44, r: 12, t: 12, b: 24 };

/** Times (dots) and rolling ao5 (line) for the last 100 solves. */
function chartSvg(list, SVG_W) {
  const pts = list.slice(-100);
  const offset = list.length - pts.length;
  const ao5 = pts.map((_, i) => average(list.slice(0, offset + i + 1), 5));
  const vals = pts.map(effective).concat(ao5).filter((v) => v != null && v !== Infinity);
  if (!vals.length) return null;
  const max = Math.max(...vals) * 1.08, min = Math.max(0, Math.min(...vals) * 0.9);
  const x = (i) => PAD.l + (pts.length < 2 ? 0 : (i / (pts.length - 1)) * (SVG_W - PAD.l - PAD.r));
  const y = (v) => PAD.t + (1 - (v - min) / (max - min || 1)) * (SVG_H - PAD.t - PAD.b);
  const ticks = [0, 1, 2, 3].map((k) => min + ((max - min) * k) / 3);
  const grid = ticks.map((t) => `<line x1="${PAD.l}" x2="${SVG_W - PAD.r}" y1="${y(t)}" y2="${y(t)}"/>`).join('');
  const label = (t) => (max - min < 10000 ? fmt(t) : fmt(t).replace(/\.\d+$/, ''));
  const labels = ticks.map((t) => `<text x="${PAD.l - 8}" y="${y(t) + 4}" text-anchor="end">${label(t)}</text>`).join('');
  const dots = pts.map((s, i) => (effective(s) === Infinity ? '' : `<circle class="single" cx="${x(i)}" cy="${y(effective(s))}" r="4"/>`)).join('');
  let path = '', pen = false;
  ao5.forEach((v, i) => {
    if (v == null || v === Infinity) { pen = false; return; }
    path += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    pen = true;
  });
  return {
    pts, ao5, x, offset, W: SVG_W,
    svg: `<svg class="chart" viewBox="0 0 ${SVG_W} ${SVG_H}" role="img" aria-label="Solve times and average of 5">
      <g class="grid">${grid}</g><g class="axis">${labels}</g>
      ${dots}<path class="ao5" d="${path}"/>
      <line class="cross" id="xhair" y1="${PAD.t}" y2="${SVG_H - PAD.b}" style="display:none"/>
    </svg>`,
  };
}

export class HistoryTab {
  constructor(el, { getSolves, update, remove }) {
    this.el = el;
    this.getSolves = getSolves;
    this.update = update;
    this.remove = remove;
    this.selected = null;
    el.innerHTML = `
      <div class="history-layout">
        <div>
          <div class="card" style="margin-bottom:16px">
            <h3>Progress · full solves</h3>
            <div class="legend" style="margin:0 0 8px"><span><i style="--c:var(--text-muted);border-radius:50%"></i>Single</span><span><i style="--c:var(--accent)"></i>Ao5</span></div>
            <div class="chart-wrap" id="chart"></div>
          </div>
          <div class="card"><div id="table"></div></div>
        </div>
        <div class="card replay">
          <h3>Replay</h3>
          <div class="stage" id="replay-stage"></div>
          <div class="controls">
            <button class="btn small" id="play">Play</button>
            <select id="speed" class="btn small"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option></select>
            <input type="range" id="scrub" min="0" max="0" value="0" />
          </div>
          <div class="info" id="replay-info">Pick a smart-cube solve to watch it again.</div>
          ${phaseLegend()}
        </div>
      </div>`;
    this.$ = (id) => el.querySelector('#' + id);
    this.view = new CubeView(this.$('replay-stage'));
    this.$('play').onclick = () => this.togglePlay();
    this.$('scrub').oninput = (e) => { this.stop(); this.seek(+e.target.value); };
    this.$('table').addEventListener('click', (e) => this.onTableClick(e));
  }

  render() {
    const list = this.getSolves();
    const chart = chartSvg(fullSolves(list), this.$('chart').clientWidth || 800);
    this.$('chart').innerHTML = chart ? chart.svg + '<div class="tooltip" id="tip"></div>' : '<div class="empty">No solves yet.</div>';
    if (chart) this.bindHover(chart, list);

    if (!list.length) { this.$('table').innerHTML = '<div class="empty">Your solves will show up here.</div>'; return; }
    const rows = list.map((s, i) => ({ s, i })).reverse().map(({ s, i }) => {
      const d = phaseDurations(s);
      const mini = d ? `<div class="mini">${PHASES.filter((p) => d[p.key] != null).map((p) => `<div style="--c:${p.color};flex:${Math.max(d[p.key], 1)}"></div>`).join('')}</div>` : '';
      const t = s.penalty === 'DNF' ? `DNF (${fmt(s.time)})` : fmt(effective(s)) + (s.penalty === '+2' ? '+' : '');
      const mark = (s.paused ? ' <small class="muted" title="Paused during the solve">⏸</small>' : '')
        + (s.train ? ` <span class="tag">${TRAIN_LABEL[s.train]}</span>` : '');
      return `<tr data-id="${s.id}" class="${this.selected === s.id ? 'sel' : ''}">
        <td class="muted">${i + 1}</td><td class="t">${t}${mark}</td>
        <td>${s.moves ? s.moves.length : '–'}</td>
        <td>${s.moves ? (s.moves.length / (s.time / 1000)).toFixed(1) : '–'}</td>
        <td>${mini}</td>
        <td class="muted">${new Date(s.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</td>
        <td><div class="acts">
          <button class="btn small" data-act="+2">+2</button>
          <button class="btn small" data-act="DNF">DNF</button>
          <button class="btn small" data-act="del" title="Delete">✕</button>
        </div></td></tr>`;
    }).join('');
    this.$('table').innerHTML = `<table class="solves"><thead><tr>
      <th>#</th><th>Time</th><th>Moves</th><th>TPS</th><th>Phases</th><th>Date</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  bindHover(chart, list) {
    const svg = this.$('chart').querySelector('svg'), tip = this.$('tip'), xh = svg.querySelector('#xhair');
    svg.addEventListener('mousemove', (e) => {
      const r = svg.getBoundingClientRect();
      const vx = ((e.clientX - r.left) / r.width) * chart.W;
      let i = 0;
      chart.pts.forEach((_, k) => { if (Math.abs(chart.x(k) - vx) < Math.abs(chart.x(i) - vx)) i = k; });
      const s = chart.pts[i];
      xh.setAttribute('x1', chart.x(i)); xh.setAttribute('x2', chart.x(i)); xh.style.display = '';
      tip.innerHTML = `Solve ${chart.offset + i + 1}<br>Time <b>${fmt(effective(s))}</b><br>Ao5 <b>${fmt(chart.ao5[i])}</b>`;
      tip.style.display = 'block';
      const px = (chart.x(i) / chart.W) * r.width;
      tip.style.left = Math.min(px + 12, r.width - 130) + 'px';
      tip.style.top = '8px';
    });
    svg.addEventListener('mouseleave', () => { tip.style.display = 'none'; xh.style.display = 'none'; });
  }

  onTableClick(e) {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const id = tr.dataset.id, act = e.target.dataset.act;
    const s = this.getSolves().find((x) => x.id === id);
    if (act === 'del') { this.remove(id); if (this.selected === id) this.selected = null; }
    else if (act) this.update(id, { penalty: s.penalty === act ? null : act });
    else this.load(s);
    this.render();
  }

  load(s) {
    this.stop();
    this.selected = s.id;
    this.solve = s.moves?.length ? s : null;
    const scrub = this.$('scrub');
    if (!this.solve) {
      this.$('replay-info').textContent = 'This solve was timed without the smart cube, so there is nothing to replay.';
      scrub.max = 0;
      return;
    }
    // Precompute every state so scrubbing is instant.
    const c = new Cube(s.start);
    this.states = [c.toString()];
    for (const [m] of s.moves) this.states.push(c.turn(m[0], m.endsWith("'") ? 3 : 1).toString());
    // GAN's U face is white, so a white cross on the bottom shows up as bottom = U.
    this.view.orient(s.bottom === 'U' ? 'yellow-top' : 'white-top');
    scrub.max = s.moves.length;
    this.seek(0);
  }

  seek(k) {
    this.pos = k;
    this.view.setState(this.states[k]);
    this.$('scrub').value = k;
    this.info();
  }

  info() {
    const s = this.solve, k = this.pos;
    const t = k ? s.moves[k - 1][1] : 0;
    const at = s.splits || {};
    const phase = at.oll != null && t >= at.oll ? 'PLL' : at.f2l != null && t >= at.f2l ? 'OLL'
      : at.cross != null && t >= at.cross ? 'F2L' : 'Cross';
    const next = s.moves.slice(k, k + 6).map((m) => m[0]).join(' ');
    this.$('replay-info').textContent = `${fmt(t)} · move ${k}/${s.moves.length} · ${k === s.moves.length ? 'solved' : phase} ${next ? '· next ' + next : ''}`;
  }

  togglePlay() {
    if (this.timer) return this.stop();
    if (!this.solve) return;
    if (this.pos >= this.solve.moves.length) this.seek(0);
    this.$('play').textContent = 'Pause';
    const speed = +this.$('speed').value;
    const step = () => {
      const k = this.pos, s = this.solve;
      if (k >= s.moves.length) return this.stop();
      const [m, t] = s.moves[k];
      this.view.speed = 90 / speed;
      this.view.turn(m[0], m.endsWith("'") ? 3 : 1, this.states[k + 1]);
      this.pos = k + 1;
      this.$('scrub').value = this.pos;
      this.info();
      const gap = k + 1 < s.moves.length ? (s.moves[k + 1][1] - t) / speed : 0;
      this.timer = setTimeout(step, Math.max(gap, 30));
    };
    step();
  }

  stop() {
    clearTimeout(this.timer);
    this.timer = null;
    this.$('play').textContent = 'Play';
  }
}
