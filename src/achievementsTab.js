import { game, ACHIEVEMENTS, levelOf, titleOf } from './game.js';

/** Trophy room: every badge with its progress, unlocked ones first. */
export class AchievementsTab {
  constructor(el) { this.el = el; }

  render() {
    const sum = game.summary(), ctx = game.ctx(), unlocked = game.state.unlocked;
    const rows = ACHIEVEMENTS.map((a) => {
      const [v, goal] = a.progress(ctx);
      return { a, v: Math.min(v, goal), goal, done: !!unlocked[a.id] };
    }).sort((x, y) => (y.done - x.done) || (y.v / y.goal - x.v / x.goal));
    const got = rows.filter((r) => r.done).length;
    this.el.innerHTML = `
      <div class="trophy-room">
        <header class="trophy-head">
          <div class="level-badge big" style="--p:${sum.into / sum.need}"><span>${sum.level}</span></div>
          <div>
            <h1>${sum.title}</h1>
            <p>Level ${sum.level} · ${sum.xp} XP total · ${sum.need - sum.into} XP to level ${sum.level + 1}${sum.level + 1 >= 3 && titleOf(sum.level + 1) !== sum.title ? ` (${titleOf(sum.level + 1)})` : ''}</p>
            <div class="xp-bar"><i style="width:${(sum.into / sum.need) * 100}%"></i></div>
          </div>
          <div class="trophy-count"><b>${got}</b><span>of ${rows.length} badges</span></div>
        </header>
        <div class="badges">${rows.map(({ a, v, goal, done }) => `
          <div class="badge ${done ? 'got' : ''}">
            <div class="badge-icon">${a.icon}</div>
            <b>${a.name}</b>
            <span>${a.desc}</span>
            ${done ? `<em>Unlocked ${new Date(unlocked[a.id]).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</em>`
              : `<div class="xp-bar small"><i style="width:${(v / goal) * 100}%"></i></div><em>${goal > 1 ? `${v} / ${goal}` : 'Locked'}</em>`}
          </div>`).join('')}
        </div>
      </div>`;
  }
}

export { levelOf };
