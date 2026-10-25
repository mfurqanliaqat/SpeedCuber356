// Gamification: XP and levels, a daily streak and goal, achievements, and the
// toasts / confetti that celebrate them. State lives in localStorage.
import { average, best, fullSolves, fmt } from './stats.js';
import { drills, learned } from './store.js';
import { OLL_EDGES, OLL_CORNERS, PLL_CORNERS, PLL_EDGES } from './algs.js';

const KEY = 'game';
const DAILY_GOAL = 10;
const load = () => {
  try { return { xp: 0, counters: {}, unlocked: {}, days: [], ...JSON.parse(localStorage.getItem(KEY)) }; } catch { return { xp: 0, counters: {}, unlocked: {}, days: [] }; }
};
const save = (s) => localStorage.setItem(KEY, JSON.stringify(s));
const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local time

/** XP to go from level L to L+1 grows by 50 each level. */
const stepXp = (level) => 100 + 50 * (level - 1);
export function levelOf(xp) {
  let level = 1, floor = 0;
  while (xp >= floor + stepXp(level)) { floor += stepXp(level); level++; }
  return { level, into: xp - floor, need: stepXp(level) };
}
const TITLES = [[1, 'Novice'], [3, 'Apprentice'], [5, 'Cuber'], [8, 'Speedcuber'], [12, 'Finger-trick pro'], [16, 'Sub-30 hunter'], [20, 'Grandmaster']];
export const titleOf = (level) => TITLES.filter(([l]) => level >= l).pop()[1];

/** Consecutive days with activity, ending today or yesterday. */
function streakOf(days) {
  const set = new Set(days);
  const d = new Date();
  if (!set.has(today())) d.setDate(d.getDate() - 1);
  let n = 0;
  while (set.has(d.toLocaleDateString('en-CA'))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

const fullBest = (list) => best(fullSolves(list));
const countLearned = (algs) => { const s = learned.all(); return algs.filter((a) => s.has(a.id)).length; };
const under = (ms) => (c) => { const b = fullBest(c.list); return b != null && b < ms; };

/**
 * Achievements. `progress` returns [value, goal] for the progress bar; a
 * badge unlocks when value >= goal.
 */
export const ACHIEVEMENTS = [
  { id: 'first', icon: '🧩', name: 'First solve', desc: 'Finish a full solve', progress: (c) => [fullSolves(c.list).length, 1] },
  { id: 'solves-10', icon: '🔟', name: 'Warming up', desc: '10 full solves', progress: (c) => [fullSolves(c.list).length, 10] },
  { id: 'solves-50', icon: '🎯', name: 'Committed', desc: '50 full solves', progress: (c) => [fullSolves(c.list).length, 50] },
  { id: 'solves-100', icon: '💯', name: 'Century', desc: '100 full solves', progress: (c) => [fullSolves(c.list).length, 100] },
  { id: 'solves-500', icon: '🏔️', name: 'Mountain of cubes', desc: '500 full solves', progress: (c) => [fullSolves(c.list).length, 500] },
  { id: 'sub-200', icon: '⏱️', name: 'Under 2:00', desc: 'Full solve under 2 minutes', time: 120000 },
  { id: 'sub-130', icon: '⌛', name: 'Under 1:30', desc: 'Full solve under 90 seconds', time: 90000 },
  { id: 'sub-100', icon: '🥉', name: 'Sub-minute', desc: 'Full solve under 1:00', time: 60000 },
  { id: 'sub-45', icon: '🥈', name: 'Under 45', desc: 'Full solve under 45 seconds', time: 45000 },
  { id: 'sub-30', icon: '🥇', name: 'Sub-30', desc: 'Full solve under 30 seconds', time: 30000 },
  { id: 'sub-20', icon: '🚀', name: 'Sub-20', desc: 'Full solve under 20 seconds', time: 20000 },
  { id: 'ao5-100', icon: '📈', name: 'Consistent', desc: 'Average of 5 under 1:00', check: (c) => { const a = average(fullSolves(c.list), 5); return a != null && a < 60000; } },
  { id: 'ao12-30', icon: '👑', name: 'Steady sub-30', desc: 'Average of 12 under 30 seconds', check: (c) => { const a = average(fullSolves(c.list), 12); return a != null && a < 30000; } },
  { id: 'cross-10', icon: '✚', name: 'Quick cross', desc: 'Cross done in under 10 seconds', check: (c) => c.list.some((s) => s.penalty !== 'DNF' && (s.train === 'cross' ? s.time : !s.train && s.splits?.cross) < 10000) },
  { id: 'cross-best-10', icon: '🎯', name: 'Cross planner', desc: 'Match the best possible white cross 10 times', progress: (c) => [c.list.filter((s) => s.cross && s.cross.moves <= s.cross.best).length, 10] },
  { id: 'tps-3', icon: '⚡', name: 'Fast fingers', desc: '3 turns per second in a full solve', check: (c) => fullSolves(c.list).some((s) => s.moves?.length && s.moves.length / (s.time / 1000) >= 3) },
  { id: 'phases', icon: '🧭', name: 'Every step', desc: 'Train cross, F2L, OLL and PLL once each', progress: (c) => [['cross', 'f2l', 'oll', 'pll'].filter((k) => c.list.some((s) => s.train === k)).length, 4] },
  { id: 'oll-2', icon: '📘', name: '2-look OLL', desc: 'Mark all 10 OLL algorithms learned', progress: () => [countLearned([...OLL_EDGES, ...OLL_CORNERS]), 10] },
  { id: 'pll-2', icon: '📗', name: '2-look PLL', desc: 'Mark all 6 PLL algorithms learned', progress: () => [countLearned([...PLL_CORNERS, ...PLL_EDGES]), 6] },
  { id: 'alg-50', icon: '🔁', name: 'Rep machine', desc: '50 cases in algorithm training', progress: (c) => [c.counters.algCases || 0, 50] },
  { id: 'muscle-20', icon: '💪', name: 'Finger gym', desc: '20 muscle-training sets', progress: (c) => [c.counters.muscleSets || 0, 20] },
  { id: 'sexy-5', icon: '🕺', name: 'Smooth mover', desc: 'Sexy move ×6 in under 5 seconds', check: () => (drills.get('muscle', {}).sexy?.best ?? Infinity) < 5000 },
  { id: 'reverse-10', icon: '🧠', name: 'Elephant memory', desc: 'Reach level 10 in Reverse moves', progress: () => [drills.get('reverse', { level: 1 }).level, 10] },
  { id: 'streak-3', icon: '🔥', name: 'On a roll', desc: 'Practise 3 days in a row', progress: (c) => [c.streak, 3] },
  { id: 'streak-7', icon: '🌋', name: 'Week streak', desc: 'Practise 7 days in a row', progress: (c) => [c.streak, 7] },
  { id: 'streak-30', icon: '☄️', name: 'Unstoppable', desc: 'Practise 30 days in a row', progress: (c) => [c.streak, 30] },
  { id: 'daily', icon: '✅', name: 'Daily goal', desc: `Do ${DAILY_GOAL} activities in one day`, progress: (c) => [c.todayCount, DAILY_GOAL] },
];
for (const a of ACHIEVEMENTS) {
  if (a.time) a.check = under(a.time);
  if (!a.progress) a.progress = (c) => [a.check(c) ? 1 : 0, 1];
}

/** XP per activity. */
const XP = { crossBest: 12, crossNear: 4, full: 20, dnf: 5, train: 8, pb: 30, trainPb: 10, ao5Pb: 15, muscle: 6, musclePb: 6, alg: 5, reverseWin: 4, reverseHelp: 2, firstToday: 15, dailyGoal: 40, badge: 25 };

class Game {
  constructor() {
    this.state = load();
    this.listeners = new Set();
    this.getSolves = () => [];
  }

  onChange(fn) { this.listeners.add(fn); }

  ctx() {
    const s = this.state;
    return {
      list: this.getSolves(), counters: s.counters, streak: streakOf(s.days),
      todayCount: s.today?.date === today() ? s.today.count : 0,
    };
  }

  summary() {
    const c = this.ctx(), lv = levelOf(this.state.xp);
    return { xp: this.state.xp, ...lv, title: titleOf(lv.level), streak: c.streak, today: c.todayCount, goal: DAILY_GOAL };
  }

  /**
   * Record an activity. `reasons` is a list of [label, xp] pairs; returns
   * nothing — toasts and confetti show what was earned.
   */
  award(reasons, { counter, celebrate } = {}) {
    const s = this.state, before = levelOf(s.xp).level, d = today();
    if (counter) s.counters[counter] = (s.counters[counter] || 0) + 1;
    if (!s.days.includes(d)) { s.days.push(d); s.days = s.days.slice(-400); reasons.push(['First practice today', XP.firstToday]); }
    s.today = s.today?.date === d ? { date: d, count: s.today.count + 1 } : { date: d, count: 1 };
    if (s.today.count === DAILY_GOAL) reasons.push(['Daily goal reached', XP.dailyGoal]);
    const gained = reasons.reduce((a, [, x]) => a + x, 0);
    s.xp += gained;
    save(s);
    toast(`+${gained} XP`, reasons.map(([l, x]) => `${l} +${x}`).join(' · '), 'xp');
    if (celebrate) confetti();
    this.check();
    const after = levelOf(s.xp).level;
    if (after > before) {
      toast(`Level ${after}!`, `You're now a ${titleOf(after)}`, 'level');
      confetti(180);
    }
    this.emit();
  }

  /** At startup: mark what's already earned without toasts or XP. */
  quietCheck() {
    const c = this.ctx();
    for (const a of ACHIEVEMENTS) {
      if (!this.state.unlocked[a.id] && a.progress(c)[0] >= a.progress(c)[1]) this.state.unlocked[a.id] = new Date().toISOString();
    }
    save(this.state);
  }

  /** Unlock any achievements whose condition now holds. */
  check() {
    const c = this.ctx(), s = this.state;
    let any = false;
    for (const a of ACHIEVEMENTS) {
      if (s.unlocked[a.id]) continue;
      const [v, goal] = a.progress(c);
      if (v >= goal) {
        s.unlocked[a.id] = new Date().toISOString();
        s.xp += XP.badge;
        toast(`${a.icon} ${a.name}`, `Achievement unlocked · ${a.desc} · +${XP.badge} XP`, 'badge');
        any = true;
      }
    }
    if (any) { save(s); confetti(140); this.emit(); }
  }

  emit() { for (const fn of this.listeners) fn(this.summary()); }

  // ---------- Activities ----------

  /** A saved solve; `prev` is the list before it was added. */
  solve(record, prev) {
    const pool = prev.filter((x) => (x.train || 'full') === (record.train || 'full'));
    const reasons = [];
    let pb = false;
    if (record.penalty === 'DNF') reasons.push(['Solve (DNF)', XP.dnf]);
    else if (record.train) {
      reasons.push([`${record.train.toUpperCase()} case`, XP.train]);
      const c = record.cross;
      if (c && c.moves <= c.best) reasons.push(['Best possible cross', XP.crossBest]);
      else if (c && c.moves === c.best + 1) reasons.push(['Near-best cross', XP.crossNear]);
      const b = best(pool);
      if (b != null && record.time < b) { reasons.push(['Training PB', XP.trainPb]); pb = true; }
    } else {
      reasons.push(['Full solve', XP.full]);
      const b = best(pool);
      if (b != null && record.time + (record.penalty === '+2' ? 2000 : 0) < b) { reasons.push(['New personal best', XP.pb]); pb = true; }
      const bestAo5 = Math.min(...pool.map((_, i) => average(pool.slice(0, i + 1), 5) ?? Infinity));
      const newAo5 = average([...pool, record], 5);
      if (newAo5 != null && bestAo5 !== Infinity && newAo5 < bestAo5) reasons.push([`Best Ao5 ${fmt(newAo5)}`, XP.ao5Pb]);
    }
    this.award(reasons, { celebrate: pb });
    return pb;
  }

  muscleSet(name, pb) {
    this.award([[`${name} set`, XP.muscle], ...(pb ? [['Drill PB', XP.musclePb]] : [])], { counter: 'muscleSets', celebrate: pb });
  }

  algCase(name) { this.award([[`${name}`, XP.alg]], { counter: 'algCases' }); }

  reverse(moves, assisted) {
    this.award([[assisted ? 'Reverse (with help)' : `Reversed ${moves} moves`, assisted ? XP.reverseHelp : XP.reverseWin + moves]], { counter: 'reverseWins' });
  }
}

export const game = new Game();

// ---------- Toasts and confetti ----------

function toast(title, body, kind) {
  let box = document.querySelector('.toasts');
  if (!box) {
    box = document.createElement('div');
    box.className = 'toasts';
    document.body.appendChild(box);
  }
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.innerHTML = `<b></b><span></span>`;
  t.querySelector('b').textContent = title;
  t.querySelector('span').textContent = body;
  box.appendChild(t);
  setTimeout(() => t.classList.add('out'), kind === 'xp' ? 2600 : 4200);
  setTimeout(() => t.remove(), kind === 'xp' ? 3000 : 4600);
}

/** A short burst of cube-coloured confetti from the top of the window. */
export function confetti(n = 120) {
  const c = document.createElement('canvas');
  c.className = 'confetti';
  c.width = innerWidth * devicePixelRatio;
  c.height = innerHeight * devicePixelRatio;
  document.body.appendChild(c);
  const g = c.getContext('2d'), dpr = devicePixelRatio;
  const colors = ['#f2f2ee', '#00a84f', '#e0202e', '#ffd60a', '#ff7a12', '#1f5fe0'];
  const parts = Array.from({ length: n }, () => ({
    x: innerWidth * (0.2 + Math.random() * 0.6), y: -10 - Math.random() * 40,
    vx: (Math.random() - 0.5) * 9, vy: 2 + Math.random() * 6, s: 6 + Math.random() * 6,
    r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3, c: colors[Math.floor(Math.random() * 6)],
  }));
  const start = performance.now();
  const frame = (t) => {
    const k = (t - start) / 1800;
    g.clearRect(0, 0, c.width, c.height);
    g.globalAlpha = Math.max(0, 1 - k * k);
    for (const p of parts) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.18; p.vx *= 0.99; p.r += p.vr;
      g.save();
      g.translate(p.x * dpr, p.y * dpr);
      g.rotate(p.r);
      g.fillStyle = p.c;
      g.fillRect(-p.s * dpr / 2, -p.s * dpr / 2, p.s * dpr, p.s * dpr * 0.7);
      g.restore();
    }
    if (k < 1) requestAnimationFrame(frame); else c.remove();
  };
  requestAnimationFrame(frame);
}
