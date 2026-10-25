// Averages follow WCA rules: drop the best and worst (5% each for ao50+),
// a DNF counts as the worst, two or more DNFs in an ao5/ao12 make it DNF.

export const PHASES = [
  { key: 'cross', label: 'Cross', color: 'var(--phase-cross)' },
  { key: 'f2l', label: 'F2L', color: 'var(--phase-f2l)' },
  { key: 'oll', label: 'OLL', color: 'var(--phase-oll)' },
  { key: 'pll', label: 'PLL', color: 'var(--phase-pll)' },
];

/** Phased-training solves time one phase only (`train`); full solves have none. */
export const trainOf = (s) => s.train || 'full';
export const fullSolves = (list) => list.filter((s) => !s.train && !s.goal);
export const TRAIN_LABEL = { full: 'Full solve', cross: 'Cross', f2l: 'F2L', oll: 'OLL', pll: 'PLL' };

export function effective(s) {
  if (s.penalty === 'DNF') return Infinity;
  return s.time + (s.penalty === '+2' ? 2000 : 0);
}

export function average(list, n) {
  if (list.length < n) return null;
  const times = list.slice(-n).map(effective).sort((a, b) => a - b);
  const trim = n < 50 ? 1 : Math.ceil(n * 0.05);
  const kept = times.slice(trim, n - trim);
  if (kept.includes(Infinity)) return Infinity;
  return kept.reduce((a, b) => a + b, 0) / kept.length;
}

export function best(list) {
  return list.length ? Math.min(...list.map(effective)) : null;
}

/** ms → "1:23.45" / "12.34" / "DNF" */
export function fmt(ms) {
  if (ms == null) return '–';
  if (ms === Infinity) return 'DNF';
  const t = Math.floor(ms / 10), cs = t % 100, sec = Math.floor(t / 100) % 60, min = Math.floor(t / 6000);
  const tail = String(cs).padStart(2, '0');
  return min ? `${min}:${String(sec).padStart(2, '0')}.${tail}` : `${sec}.${tail}`;
}

/** Durations of each phase, from split timestamps (ms since first move). */
export function phaseDurations(s) {
  const sp = s.splits;
  if (!sp || sp.cross == null) return null;
  if (s.train) return { [s.train]: s.time };
  const goal = s.goal || 'pll', marks = { ...sp, pll: s.time, [goal]: s.time };
  const out = {};
  let prev = 0;
  for (const p of PHASES.slice(0, PHASES.findIndex((x) => x.key === goal) + 1)) {
    const m = marks[p.key] ?? s.time;
    out[p.key] = Math.max(0, m - prev);
    prev = Math.max(prev, m);
  }
  return out; // phases after the goal are left out
}

/** Average phase durations over the last n smart solves that have splits. */
export function phaseAverages(list, n = 12) {
  const rows = fullSolves(list).filter((s) => s.penalty !== 'DNF').map(phaseDurations).filter(Boolean).slice(-n);
  if (!rows.length) return null;
  const avg = {};
  for (const p of PHASES) avg[p.key] = rows.reduce((a, r) => a + r[p.key], 0) / rows.length;
  avg.count = rows.length;
  return avg;
}

/** One concrete thing to practise, based on where the time goes. */
export function coachingTip(list) {
  const smart = fullSolves(list).filter((s) => s.moves && s.penalty !== 'DNF').slice(-12);
  const avg = phaseAverages(list);
  if (!avg || avg.count < 3) return 'Do a few solves with the smart cube and you will get a tip based on your splits.';
  const total = PHASES.reduce((a, p) => a + avg[p.key], 0);
  const share = (k) => avg[k] / total;
  const tps = smart.reduce((a, s) => a + s.moves.length / (s.time / 1000), 0) / smart.length;
  if (share('oll') + share('pll') > 0.4) {
    return `The last layer takes ${Math.round((share('oll') + share('pll')) * 100)}% of your solve. Learn 2-look OLL and PLL on the Learn tab: it is the biggest single time saver right now.`;
  }
  if (share('cross') > 0.15) {
    return `The cross takes ${fmt(avg.cross)} on average. Plan it fully during inspection and solve it on the bottom; aim for under 8 moves.`;
  }
  if (tps < 2) {
    return `You turn ${tps.toFixed(1)} times per second, so most of the solve is spent looking for pieces. Practise slow solves without stopping, looking for the next piece while you turn.`;
  }
  if (share('f2l') > 0.6) {
    return 'F2L is most of your solve. Learn intuitive F2L: pair each corner with its edge and insert them together.';
  }
  return 'Your phases are balanced. Keep doing averages of 12 and work on turning without pauses.';
}
