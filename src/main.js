import { GanLink } from './gan.js';
import { Session } from './session.js';
import { TimerTab } from './timerTab.js';
import { HistoryTab } from './historyTab.js';
import { LearnTab } from './learnTab.js';
import { ReverseDrill, MuscleDrill, AlgDrill } from './drills.js';
import { glow } from './ui.js';
import { game } from './game.js';
import { AchievementsTab } from './achievementsTab.js';
import '@fontsource-variable/fredoka';
import '@fontsource-variable/nunito';
import { settings, solves, cubeMac } from './store.js';
import { warmUpSolver } from './solver.js';
import { warmUpCross } from './cross.js';

const $ = (s) => document.querySelector(s);
let list = solves.all();
let cfg = settings.get();
let timer = null; // assigned below; session and link callbacks can fire before that

const saveSolve = (record) => {
  const prev = list;
  list = solves.add(record);
  const pb = game.solve(record, prev);
  timer.showSolve(record, pb);
  if (activeView === 'history') historyTab.render();
};

// ---------- Cube connection ----------

const pill = $('#conn-pill'), connText = $('#conn-text'), connectBtn = $('#connect-btn');
let battery = null, wantConnected = false, retryTimer = null;

function askMac(name) {
  const dlg = $('#mac-dialog');
  dlg.querySelector('h2').textContent = `Address for ${name}`;
  dlg.querySelector('input').value = '';
  dlg.showModal();
  return new Promise((resolve) => {
    dlg.addEventListener('close', () => {
      const v = dlg.querySelector('input').value.trim();
      resolve(dlg.returnValue === 'ok' && /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(v) ? v.toUpperCase() : null);
    }, { once: true });
  });
}

const link = new GanLink({
  askMac,
  onStatus({ state, name, error, detail }) {
    pill.className = 'pill ' + state;
    connText.textContent = state === 'connected' ? name + (battery != null ? ` · ${battery}%` : '')
      : state === 'connecting' ? detail || 'Looking for cube…' : error ? 'Not connected · ' + shortError(error) : 'Not connected';
    connectBtn.textContent = state === 'connected' ? 'Disconnect' : 'Connect cube';
    connectBtn.disabled = state === 'connecting';
    if (state === 'connected') sessionStorage.setItem('connectedOnce', '1');
    if (state === 'disconnected' && wantConnected) scheduleRetry();
    timer?.render();
    drillViews[activeView]?.render();
  },
  onEvent(e) {
    if (e.type === 'MOVE') {
      // The CFOP session owns the live cube model; other views just read it.
      if (activeView === 'cfop') {
        session.move(e);
        timer.animate(e);
      } else {
        session.cube.turn(e.move[0], e.direction ? 3 : 1);
        drillViews[activeView]?.onMove(e);
        stale = true;
      }
    } else if (e.type === 'FACELETS') {
      if (pendingSync || session.mode !== 'solving') {
        pendingSync = false;
        if (e.facelets !== session.cube.toString()) {
          session.sync(e.facelets);
          for (const d of Object.values(drillViews)) d.resync();
        }
      }
    } else if (e.type === 'BATTERY') {
      battery = e.batteryLevel;
      connText.textContent = `${link.conn?.deviceName ?? 'Cube'} · ${battery}%`;
    }
  },
});
let pendingSync = false;
let stale = false; // cube turned outside the CFOP view: its scramble needs redoing

function shortError(msg) {
  if (/cancel|NotFound|No device/i.test(msg)) return 'cube not found, is it awake?';
  if (/MAC/i.test(msg)) return 'cube address missing';
  return msg.slice(0, 60);
}

// Web Bluetooth needs a user gesture; the main process can grant one so the
// app can (re)connect by itself.
async function connect(auto = false) {
  wantConnected = true;
  clearTimeout(retryTimer);
  if (auto && window.native) await window.native.connectWithGesture();
  else await link.connect();
}
window.__connectCube = () => link.connect();

function scheduleRetry() {
  clearTimeout(retryTimer);
  if (cfg.autoConnect && window.native) retryTimer = setTimeout(() => connect(true), 4000);
}

connectBtn.onclick = () => {
  if (link.connected) { wantConnected = false; link.disconnect(); }
  else connect();
};

// ---------- Session & tabs ----------

const session = new Session({
  inspection: cfg.inspection,
  onChange: () => timer?.render(),
  onSolve: saveSolve,
});

const actions = {
  sync: () => { pendingSync = true; link.send('REQUEST_FACELETS'); },
  markSolved: () => {
    link.send('REQUEST_RESET');
    session.markSolved();
    for (const d of Object.values(drillViews)) d.resync();
  },
  setTraining: (training) => { showView('cfop', training); },
};
$('#sync-btn').onclick = actions.sync;
$('#solved-btn').onclick = actions.markSolved;

timer = new TimerTab($('#tab-timer'), {
  session,
  getSolves: () => list,
  isConnected: () => link.connected,
  onManualSolve: saveSolve,
  actions,
});
timer.setSolveView(cfg.solveView);

const historyTab = new HistoryTab($('#tab-history'), {
  getSolves: () => list,
  update: (id, patch) => { solves.update(id, patch); list = solves.all(); timer.render(); },
  remove: (id) => { solves.remove(id); list = solves.all(); timer.render(); },
});
const learn = new LearnTab($('#tab-learn'), { getSolves: () => list });
const achievements = new AchievementsTab($('#tab-achievements'));

// Player card: level ring, title, XP, streak and today's goal.
game.getSolves = () => list;
game.quietCheck();
function renderPlayer(sum = game.summary()) {
  $('#player').innerHTML = `
    <div class="level-badge" style="--p:${sum.into / sum.need}"><span>${sum.level}</span></div>
    <div class="player-info">
      <b>${sum.title}</b>
      <div class="xp-bar"><i style="width:${(sum.into / sum.need) * 100}%"></i></div>
      <span>${sum.into} / ${sum.need} XP</span>
    </div>
    <div class="player-chips">
      <span class="chip flame ${sum.streak ? '' : 'cold'}" title="Days in a row">🔥 ${sum.streak}</span>
      <span class="chip goal" title="Today's goal: ${sum.goal} activities"><i style="width:${Math.min(1, sum.today / sum.goal) * 100}%"></i>${Math.min(sum.today, sum.goal)}/${sum.goal}</span>
    </div>`;
  if (activeView === 'achievements') achievements.render();
}
game.onChange(renderPlayer);

const drillOpts = { getCube: () => session.cube, isConnected: () => link.connected };
const drillViews = {
  reverse: new ReverseDrill($('#tab-reverse'), drillOpts),
  muscle: new MuscleDrill($('#tab-muscle'), drillOpts),
  algs: new AlgDrill($('#tab-algs'), drillOpts),
};

// ---------- Sidebar navigation ----------

let activeView = null;
function showView(view, training) {
  if (view === 'cfop' && session.mode === 'solving' && training && training !== session.training) return;
  const prev = activeView;
  activeView = view;
  glow.clear();
  drillViews[prev]?.hide();
  timer.active = view === 'cfop';
  const section = view === 'cfop' ? 'timer' : view;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + section));
  document.querySelectorAll('.side-nav [data-view]').forEach((b) => b.classList.toggle('active',
    b.dataset.view === view && (view !== 'cfop' || b.dataset.train === (training || session.training))));
  if (view === 'cfop') {
    if (training && training !== session.training) {
      settings.set({ training });
      cfg = settings.get();
      session.setTraining(training);
      stale = false;
    } else if (stale && session.mode !== 'solving') {
      session.fresh();
      stale = false;
    }
    timer.view.setState(session.cube.toString());
    timer.render();
  }
  drillViews[view]?.show();
  if (view === 'history') historyTab.render();
  if (view === 'learn') learn.render();
  if (view === 'achievements') achievements.render();
  document.querySelector('#player').classList.toggle('active', view === 'achievements');
  settings.set({ view });
}
for (const el of [document.querySelector('.side-nav'), $('#player')]) {
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]');
    if (b) showView(b.dataset.view, b.dataset.train);
  });
}
session.setTraining(cfg.training);
renderPlayer();
showView(cfg.view || 'cfop', cfg.training);

// ---------- Theme ----------

const darkQuery = matchMedia('(prefers-color-scheme: dark)');
const SUN = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON = '<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';
function applyTheme() {
  const dark = cfg.theme === 'dark' || (cfg.theme === 'system' && darkQuery.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('#theme-btn').innerHTML = dark ? SUN : MOON;
}
darkQuery.addEventListener('change', applyTheme);
$('#theme-btn').onclick = () => {
  settings.set({ theme: document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark' });
  cfg = settings.get();
  applyTheme();
};
applyTheme();

// ---------- Settings ----------

const dlg = $('#settings-dialog'), form = dlg.querySelector('form');
$('#settings-btn').onclick = () => {
  form.inspection.checked = cfg.inspection;
  form.autoConnect.checked = cfg.autoConnect;
  form.solveView.value = cfg.solveView;
  form.theme.value = cfg.theme;
  dlg.showModal();
};
dlg.addEventListener('close', () => {
  settings.set({ inspection: form.inspection.checked, autoConnect: form.autoConnect.checked, solveView: form.solveView.value, theme: form.theme.value });
  cfg = settings.get();
  applyTheme();
  session.inspection = cfg.inspection;
  timer.setSolveView(cfg.solveView);
});
$('#forget-mac-btn').onclick = (e) => { cubeMac.clear(); e.target.textContent = 'Forgotten'; };
$('#export-btn').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(list, null, 1)], { type: 'application/json' }));
  a.download = `speedcuber356-solves-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
};
$('#import-btn').onclick = () => {
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json' });
  input.onchange = async () => {
    try {
      const incoming = JSON.parse(await input.files[0].text());
      const ids = new Set(list.map((s) => s.id));
      const merged = list.concat(incoming.filter((s) => s.id && s.time && !ids.has(s.id)))
        .sort((a, b) => a.date.localeCompare(b.date));
      solves.save(merged);
      list = merged;
      timer.render();
      $('#import-btn').textContent = `Imported ${merged.length - ids.size}`;
    } catch {
      $('#import-btn').textContent = 'Not a solves file';
    }
  };
  input.click();
};

warmUpSolver();
warmUpCross();
if (cfg.autoConnect && window.native) connect(true);

// Dev only: drive the app without a cube, e.g. __debug.fakeCube() then __debug.turns("R U R' U'").
if (import.meta.env.DEV) {
  let t = 0;
  window.__debug = {
    session, link,
    fakeCube() {
      link.conn = { deviceName: 'GAN-sim', sendCubeCommand: async () => {}, disconnect: async () => {} };
      link.onStatus({ state: 'connected', name: 'GAN-sim' });
    },
    turns(alg, gap = 120) {
      for (const m of alg.split(' ').filter(Boolean)) {
        const reps = m.endsWith('2') ? 2 : 1;
        for (let r = 0; r < reps; r++) {
          t += gap;
          link.onEvent({ type: 'MOVE', move: m[0] + (m.endsWith("'") ? "'" : ''), face: 'URFDLB'.indexOf(m[0]),
            direction: m.endsWith("'") ? 1 : 0, localTimestamp: performance.now(), cubeTimestamp: t });
        }
      }
    },
  };
}
