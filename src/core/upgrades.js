// Перки в забеге и мета-прокачка. Чистые функции над объектом stats.

export const UPGRADES = [
  { id: 'fastHands', name: 'Быстрые руки', icon: '✋', desc: 'Скорость разрыва +25%', max: 5, apply: (s, k) => { s.tearRate *= 1 + 0.25 * k; } },
  { id: 'longHands', name: 'Длинные руки', icon: '📏', desc: 'Радиус разрыва +20%', max: 4, apply: (s, k) => { s.tearRadius *= 1 + 0.2 * k; } },
  { id: 'sneakers', name: 'Кроссовки', icon: '👟', desc: 'Скорость +10%', max: 4, apply: (s, k) => { s.speed *= 1 + 0.1 * k; } },
  { id: 'doubleDash', name: 'Второй рывок', icon: '💨', desc: '+1 заряд рывка', max: 2, apply: (s, k) => { s.dashCharges += k; } },
  { id: 'loudNo', name: 'Громкий отказ', icon: '📢', desc: 'Радиус «Отказа» +30%, кулдаун −15%', max: 3, apply: (s, k) => { s.refuseRadius *= 1 + 0.3 * k; s.refuseCooldown *= 1 - 0.15 * k; } },
  { id: 'thickSkin', name: 'Толстая кожа', icon: '🛡️', desc: 'Макс. нервы +20', max: 4, apply: (s, k) => { s.maxNerves += 20 * k; } },
  { id: 'lawyer', name: 'Юрист по телефону', icon: '⚖️', desc: 'Проценты −25%', max: 3, apply: (s, k) => { s.interestMult *= 1 - 0.25 * k; } },
  { id: 'shredder', name: 'Шредер', icon: '🗞️', desc: 'Разрыв с шансом 20% рвёт соседний договор', max: 3, apply: (s, k) => { s.shredChance += 0.2 * k; } },
  { id: 'antispam', name: 'Антиспам', icon: '🚫', desc: 'СМС-спам медленнее на 30%', max: 2, apply: (s, k) => { s.smsSlow *= 1 - 0.3 * k; } },
  { id: 'adblock', name: 'Блокировщик рекламы', icon: '🧱', desc: 'Поп-апы закрываются в 2 раза быстрее', max: 2, apply: (s, k) => { s.popupDamage *= 1 + 1 * k; } },
  { id: 'blacklist', name: 'Чёрный список', icon: '📵', desc: 'Звонки живут на 30% меньше', max: 2, apply: (s, k) => { s.callLife *= 1 - 0.3 * k; } },
  { id: 'magnet', name: 'Магнит улик', icon: '🧲', desc: 'Радиус подбора ×1.6', max: 2, apply: (s, k) => { s.pickupRadius *= 1 + 0.6 * k; } },
  { id: 'lemonTea', name: 'Чай с лимоном', icon: '🍋', desc: 'Чай лечит в 2 раза больше', max: 2, apply: (s, k) => { s.teaHeal *= 1 + 1 * k; } },
  { id: 'coldBlood', name: 'Хладнокровие', icon: '🧊', desc: 'Нервы восстанавливаются 1/с', max: 3, apply: (s, k) => { s.regen += 1 * k; } },
  { id: 'fastReport', name: 'Заявление быстрее', icon: '🚔', desc: 'Ульта копится на 25% быстрее', max: 3, apply: (s, k) => { s.ultGain *= 1 + 0.25 * k; } },
  { id: 'refund', name: 'Возврат', icon: '💸', desc: 'Порванный договор снижает долг на 50 ₽', max: 4, apply: (s, k) => { s.refundPerTear += 50 * k; } },
];

export const RARE_CHANCE = 0.15;

export function baseStats() {
  return {
    speed: 190,
    maxNerves: 100,
    tearRate: 2.2, // разрывов в секунду
    tearRadius: 58,
    dashCharges: 1,
    dashCooldown: 1.6,
    refuseRadius: 120,
    refuseCooldown: 3.0,
    interestMult: 1,
    shredChance: 0,
    smsSlow: 1,
    popupDamage: 1,
    callLife: 1,
    pickupRadius: 40,
    teaHeal: 25,
    regen: 0,
    ultGain: 1,
    refundPerTear: 0,
    scoreMult: 1,
  };
}

// Пересчитать stats из базы, мета-бонусов, стиля и списка взятых перков.
export function computeStats(taken, meta = {}, style = null) {
  const s = baseStats();
  if (meta.nerves) s.maxNerves += 10 * meta.nerves;
  if (style) {
    if (style.speedMult) s.speed *= style.speedMult;
    if (style.scoreMult) s.scoreMult *= style.scoreMult;
    if (style.regen) s.regen += style.regen;
    if (style.nerves) s.maxNerves += style.nerves;
  }
  for (const t of taken) {
    const u = UPGRADES.find((x) => x.id === t.id);
    if (u) u.apply(s, t.rare ? 2 : 1);
  }
  s.maxNerves = Math.max(30, s.maxNerves);
  return s;
}

export function upgradeLevel(taken, id) {
  return taken.filter((t) => t.id === id).reduce((n, t) => n + (t.rare ? 2 : 1), 0);
}

// Три варианта на выбор: только не достигшие максимума, без дублей.
export function rollChoices(rng, taken, count = 3) {
  const pool = UPGRADES.filter((u) => upgradeLevel(taken, u.id) < u.max);
  const shuffled = rng.shuffle(pool).slice(0, count);
  // Редкий вариант даёт два уровня — предлагаем его, только если до максимума осталось ≥ 2.
  return shuffled.map((u) => ({ id: u.id, rare: u.max - upgradeLevel(taken, u.id) >= 2 && rng.chance(RARE_CHANCE) }));
}

export function xpForLevel(level) {
  return Math.round(8 + level * 6 + Math.pow(level, 1.6) * 2);
}

// Мета-магазин
export const META_UPGRADES = [
  { id: 'startLevel', name: 'Знакомый юрист', desc: 'Начинать забег с +1 уровнем', max: 3, cost: (l) => 150 + l * 200 },
  { id: 'nerves', name: 'Крепкие нервы', desc: '+10 к макс. нервам', max: 5, cost: (l) => 80 + l * 90 },
  { id: 'debtLimit', name: 'Финансовая подушка', desc: '+10 000 ₽ к лимиту долга', max: 5, cost: (l) => 100 + l * 100 },
  { id: 'reroll', name: 'Второе мнение', desc: '+1 реролл перков за забег', max: 2, cost: (l) => 200 + l * 250 },
  { id: 'startUlt', name: 'Черновик заявления', desc: 'Начинать с 25% ульты', max: 2, cost: (l) => 180 + l * 220 },
];

export const STYLES = [
  { id: 'cap', name: 'В кепке', desc: 'Классика двора. Без бонусов.', unlock: null },
  { id: 'suit', name: 'В костюме', desc: '+10% очков, −5% скорости', unlock: 'firstBoss', scoreMult: 1.1, speedMult: 0.95 },
  { id: 'robe', name: 'В халате', desc: '+1 нерв/с, −20 макс. нервов', unlock: 'combo50', regen: 1, nerves: -20 },
];

export function metaLevel(meta, id) {
  return meta[id] || 0;
}

export function canBuyMeta(meta, reputation, id) {
  const u = META_UPGRADES.find((x) => x.id === id);
  const l = metaLevel(meta, id);
  if (!u || l >= u.max) return false;
  return reputation >= u.cost(l);
}

export function buyMeta(meta, reputation, id) {
  if (!canBuyMeta(meta, reputation, id)) return { meta, reputation, ok: false };
  const u = META_UPGRADES.find((x) => x.id === id);
  const l = metaLevel(meta, id);
  return { meta: { ...meta, [id]: l + 1 }, reputation: reputation - u.cost(l), ok: true };
}
