let worker = null, seq = 0;
const pending = new Map();

/** Start the solver early so its tables are ready when needed. */
export function warmUpSolver() {
  if (worker) return;
  worker = new Worker(new URL('./solver.worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    pending.get(data.id)?.(data.result);
    pending.delete(data.id);
  };
}

function ask(msg) {
  warmUpSolver();
  const id = ++seq;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    worker.postMessage({ id, ...msg });
  });
}

/** Short (≈20 moves or fewer) face-turn solution for a facelet string. */
export const solve = (facelets) => ask({ type: 'solve', facelets });

/** Face turns from `facelets` to the `target` facelet state. */
export const scrambleTo = (facelets, target) => ask({ type: 'to', facelets, target });

/** Scramble from `facelets` to a random f2l / oll / pll practice state: { scramble, target }. */
export const trainingScramble = (mode, facelets) => ask({ type: 'train', mode, facelets });
