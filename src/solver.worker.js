// Kociemba two-phase solver (cubejs) off the main thread; building its tables takes ~1s.
import Cube from './vendor/cubejs.js';
import { trainingScramble, scrambleTo } from './training.js';

Cube.initSolver();
self.onmessage = ({ data: { id, type, facelets, mode, target } }) => {
  if (type === 'train') self.postMessage({ id, result: trainingScramble(Cube, mode, facelets) });
  else if (type === 'to') self.postMessage({ id, result: scrambleTo(Cube, facelets, target) });
  else self.postMessage({ id, result: Cube.fromString(facelets).solve() });
};
