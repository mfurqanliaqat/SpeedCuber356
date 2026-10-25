import { CubeView } from './view3d.js';
import { Cube, parseAlg, formatMove, invertAlg } from './cube.js';
import { LL_SCHEME, llSvg } from './net.js';
import { SECTIONS, ROADMAP } from './algs.js';
import { average, fullSolves } from './stats.js';
import { learned } from './store.js';
import { game } from './game.js';

const ALL = SECTIONS.flatMap((s) => s.algs.map((a) => ({ ...a, kind: s.kind })));
const caseOf = (alg) => new Cube().apply(invertAlg(alg)).toString();

export class LearnTab {
  constructor(el, { getSolves }) {
    this.el = el;
    this.getSolves = getSolves;
    el.innerHTML = `
      <div class="learn-layout">
        <div>
          <div class="roadmap" id="roadmap"></div>
          <div id="sections"></div>
        </div>
        <div class="card demo">
          <h3 id="demo-title">Watch an algorithm</h3>
          <div class="stage" id="demo-stage"></div>
          <div class="controls" style="display:flex;gap:6px;margin-top:10px">
            <button class="btn small" id="demo-play" disabled>Play</button>
            <button class="btn small" id="demo-reset" disabled>Reset</button>
          </div>
          <code id="demo-alg" class="muted">Click "Show" on any card.</code>
        </div>
      </div>`;
    this.$ = (id) => el.querySelector('#' + id);
    this.view = new CubeView(this.$('demo-stage'), { scheme: LL_SCHEME, speed: 260 });
    this.$('demo-play').onclick = () => this.play();
    this.$('demo-reset').onclick = () => this.pick(this.current);
    el.addEventListener('click', (e) => {
      const card = e.target.closest('[data-alg]');
      if (!card) return;
      if (e.target.matches('input[type=checkbox]')) { learned.toggle(card.dataset.alg); this.render(); game.check(); }
      else if (e.target.matches('[data-show]')) { this.pick(ALL.find((a) => a.id === card.dataset.alg)); this.play(); }
    });
  }

  render() {
    const ao12 = average(fullSolves(this.getSolves()), 12);
    const goals = [120000, 90000, 60000, 30000];
    const here = ao12 == null ? 0 : Math.max(0, goals.findIndex((g) => ao12 >= g));
    this.$('roadmap').innerHTML = ROADMAP.map((r, i) => `
      <div class="card ${i === here ? 'here' : ''}">
        <div class="goal">${r.goal}</div>
        <ul>${r.items.map((t) => `<li>${t}</li>`).join('')}</ul>
      </div>`).join('');

    const done = learned.all();
    this.$('sections').innerHTML = SECTIONS.map((s) => `
      <div class="alg-section">
        <h3>${s.title} · ${s.algs.filter((a) => done.has(a.id)).length}/${s.algs.length} learned</h3>
        <div class="alg-grid">${s.algs.map((a) => `
          <div class="card alg ${done.has(a.id) ? 'learned' : ''}" data-alg="${a.id}">
            ${llSvg(caseOf(a.alg), s.kind)}
            <div class="name">${a.name}
              <label><input type="checkbox" ${done.has(a.id) ? 'checked' : ''}/> learned</label></div>
            <code>${a.alg}</code>
            ${a.note ? `<div class="note">${a.note}</div>` : ''}
            <button class="btn small" data-show>Show</button>
          </div>`).join('')}
        </div>
      </div>`).join('');
  }

  pick(a) {
    clearTimeout(this.timer);
    this.current = a;
    this.step = 0;
    this.moves = parseAlg(a.alg);
    this.model = new Cube(caseOf(a.alg));
    this.view.setState(this.model.toString());
    this.$('demo-title').textContent = a.name;
    this.$('demo-play').disabled = this.$('demo-reset').disabled = false;
    this.renderAlg();
  }

  renderAlg() {
    this.$('demo-alg').className = '';
    this.$('demo-alg').innerHTML = this.moves.map((m, i) => `<span class="${i === this.step - 1 ? 'on' : ''}">${formatMove(m)}</span>`).join(' ');
  }

  play() {
    clearTimeout(this.timer);
    if (this.step >= this.moves.length) this.pick(this.current);
    const next = () => {
      if (this.step >= this.moves.length) return;
      const m = this.moves[this.step++];
      this.model.turn(m.base, m.amount);
      this.view.turn(m.base, m.amount, this.model.toString());
      this.renderAlg();
      this.timer = setTimeout(next, 420);
    };
    this.timer = setTimeout(next, 400);
  }
}
