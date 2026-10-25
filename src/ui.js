// Pieces shared by every view that guides moves on the cube.

/** Move chips for a tracker: done moves fade, the current one is highlighted. */
export function movesHtml(t, alg) {
  return alg.split(' ').filter(Boolean).map((m, i) => {
    if (i < t.index) return `<span class="done">${m}</span>`;
    if (i === t.index && !t.stack.length) return `<span class="now">${t.remaining()}</span>`;
    return `<span>${m}</span>`;
  }).join('');
}

/**
 * Red glow around the window: flashes on each wrong turn and stays dimly on
 * until the red undo moves are done. One overlay, shared by all views.
 */
class WrongGlow {
  update(tracker, pending) {
    if (!this.el) {
      this.el = document.createElement('div');
      this.el.className = 'wrong-glow';
      document.body.appendChild(this.el);
    }
    const g = this.el;
    if (tracker && (tracker !== this.tracker || tracker.mistakes > this.mistakes) && tracker.mistakes) {
      g.classList.remove('flash');
      void g.offsetWidth; // restart the animation
      g.classList.add('flash');
    }
    this.tracker = tracker;
    this.mistakes = tracker?.mistakes ?? 0;
    g.classList.toggle('on', !!pending);
  }

  clear() { this.update(null, false); }
}
export const glow = new WrongGlow();
