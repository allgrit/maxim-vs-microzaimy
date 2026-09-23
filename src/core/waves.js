import { ENEMIES, BOSSES, DAY_MODIFIERS, SCENES, BOSS_EVERY } from './config.js';

// Коэффициент сложности дня.
export function difficultyFor(day) {
  return 1.3 + day * 0.18 + Math.floor(day / BOSS_EVERY) * 0.35;
}

export function enemyHpScale(day, diffCfg) {
  return Math.pow(difficultyFor(day), 0.6) * diffCfg.enemyHp;
}

export function enemySpeedScale(day) {
  return Math.min(1.9, 1 + day * 0.02);
}

// Интервал между спавнами в секундах в момент t (0..1 внутри дня).
export function spawnInterval(day, t, diffCfg, modifier) {
  const base = 1.7 / difficultyFor(day);
  const withinDay = 1 - 0.35 * t; // к концу дня плотнее
  const mod = modifier && modifier.spawn ? 1 / modifier.spawn : 1;
  return Math.max(0.18, (base * withinDay * mod) / diffCfg.spawn);
}

export function isBossDay(day) {
  return day % BOSS_EVERY === 0;
}

export function bossForDay(day) {
  if (!isBossDay(day)) return null;
  const idx = day / BOSS_EVERY - 1;
  if (idx < BOSSES.length) return BOSSES[idx];
  // Бесконечный режим: боссы по кругу с ростом хп.
  const b = BOSSES[idx % BOSSES.length];
  const loops = Math.floor(idx / BOSSES.length);
  return { ...b, hp: Math.round(b.hp * (1 + loops * 0.6)), name: `${b.name} (возвращение ${loops})` };
}

// Список врагов, доступных в этот день, с весами.
export function availableEnemies(day, modifier = {}) {
  const list = [];
  for (const e of Object.values(ENEMIES)) {
    if (e.minDay > day) continue;
    let w = e.weight;
    if (e.id === 'contract' && modifier.contractMult) w *= modifier.contractMult;
    if (e.id === 'popup' && modifier.popupMult) w *= modifier.popupMult;
    if (e.id === 'mimic' && modifier.mimicMult) w *= modifier.mimicMult;
    if (e.id === 'collector' && modifier.collectorMult) w *= modifier.collectorMult;
    list.push({ id: e.id, weight: w });
  }
  return list;
}

export function pickEnemy(rng, day, modifier = {}) {
  const list = availableEnemies(day, modifier);
  const total = list.reduce((s, e) => s + e.weight, 0);
  let r = rng.next() * total;
  for (const e of list) {
    r -= e.weight;
    if (r <= 0) return e.id;
  }
  return list[list.length - 1].id;
}

export function pickModifier(rng, day) {
  if (day < 2 || isBossDay(day)) return DAY_MODIFIERS[0];
  const pool = DAY_MODIFIERS.filter((m) => m.minDay <= day && m.id !== 'none');
  if (rng.chance(0.3)) return DAY_MODIFIERS[0];
  return rng.pick(pool);
}

export function sceneForDay(day) {
  let s = SCENES[0];
  for (const sc of SCENES) if (day >= sc.from) s = sc;
  return s;
}
