import { COMBO_TIMEOUT, COMBO_MAX_MULT, SCORE } from './config.js';

export function createCombo() {
  return { count: 0, timer: 0, best: 0 };
}

export function comboHit(combo) {
  combo.count += 1;
  combo.timer = COMBO_TIMEOUT;
  if (combo.count > combo.best) combo.best = combo.count;
  return combo;
}

export function comboTick(combo, dt) {
  if (combo.count > 0) {
    combo.timer -= dt;
    if (combo.timer <= 0) {
      combo.count = 0;
      combo.timer = 0;
    }
  }
  return combo;
}

export function comboMultiplier(combo) {
  return Math.min(COMBO_MAX_MULT, 1 + combo.count / 10);
}

export function pointsFor(kind, combo, statsMult = 1) {
  const base = SCORE[kind] ?? 0;
  return Math.round(base * comboMultiplier(combo) * statsMult);
}

export function finalScore(rawScore, diffCfg) {
  return Math.round(rawScore * diffCfg.mult);
}

// Репутация за забег: корень из очков + бонус за дни.
export function reputationFor(score, day, missionsDone) {
  return Math.round(Math.sqrt(Math.max(0, score)) * 1.2 + day * 6 + missionsDone * 40);
}

export function formatMoney(n) {
  const r = Math.round(n);
  return r.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₽';
}

export function formatScore(n) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function shareText(entry) {
  return `Максим против микрозаймов · ${entry.dateLabel} · ${formatScore(entry.score)} очков · день ${entry.day} · 🧾×${entry.torn}` +
    (entry.daily ? ' · ежедневный вызов' : ` · ${entry.diffName}`);
}
