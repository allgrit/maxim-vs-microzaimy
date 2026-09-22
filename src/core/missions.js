// Миссии забега. Каждая: id, текст, целевой счётчик, проверка по статистике забега.
export const MISSION_POOL = [
  { id: 'tear100', tier: 1, text: 'Порвать 100 договоров', stat: 'torn', goal: 100 },
  { id: 'tear300', tier: 2, text: 'Порвать 300 договоров', stat: 'torn', goal: 300 },
  { id: 'popups15', tier: 1, text: 'Закрыть 15 поп-апов', stat: 'popups', goal: 15 },
  { id: 'calls10', tier: 1, text: 'Сбросить 10 звонков рывком', stat: 'callsDashed', goal: 10 },
  { id: 'cleanDay', tier: 1, text: 'Провести день без подписи', stat: 'cleanDays', goal: 1 },
  { id: 'cleanDays3', tier: 2, text: 'Три чистых дня', stat: 'cleanDays', goal: 3 },
  { id: 'combo25', tier: 1, text: 'Серия из 25 разрывов', stat: 'bestCombo', goal: 25 },
  { id: 'combo50', tier: 2, text: 'Серия из 50 разрывов', stat: 'bestCombo', goal: 50 },
  { id: 'day10', tier: 2, text: 'Дожить до 10-го дня', stat: 'day', goal: 10 },
  { id: 'boss1', tier: 2, text: 'Победить первого босса', stat: 'bosses', goal: 1 },
  { id: 'boss3', tier: 3, text: 'Победить трёх боссов', stat: 'bosses', goal: 3 },
  { id: 'collectors5', tier: 2, text: 'Порвать 5 коллекторов', stat: 'collectors', goal: 5 },
  { id: 'ult3', tier: 2, text: 'Подать 3 заявления в полицию', stat: 'ults', goal: 3 },
  { id: 'mimics5', tier: 2, text: 'Разоблачить 5 мимиков', stat: 'mimics', goal: 5 },
  { id: 'traps10', tier: 1, text: 'Стереть 10 ловушек', stat: 'traps', goal: 10 },
  { id: 'lowDebt', tier: 3, text: 'Пройти 10-й день с долгом < 20 000 ₽', stat: 'day10LowDebt', goal: 1 },
];

export function rollMissions(rng) {
  const t1 = rng.pick(MISSION_POOL.filter((m) => m.tier === 1));
  const t2 = rng.pick(MISSION_POOL.filter((m) => m.tier === 2));
  const t3 = rng.pick(MISSION_POOL.filter((m) => m.tier === 3));
  return [t1, t2, t3].map((m) => ({ ...m, done: false }));
}

export function emptyRunStats() {
  return {
    torn: 0, popups: 0, callsDashed: 0, cleanDays: 0, bestCombo: 0, day: 1, bosses: 0,
    collectors: 0, ults: 0, mimics: 0, traps: 0, day10LowDebt: 0, signed: 0, dashes: 0,
    refuses: 0, damageTaken: 0, healed: 0, kills: 0, moved: 0,
  };
}

// Возвращает список только что выполненных миссий и помечает их done.
export function checkMissions(missions, stats) {
  const completed = [];
  for (const m of missions) {
    if (m.done) continue;
    if ((stats[m.stat] || 0) >= m.goal) {
      m.done = true;
      completed.push(m);
    }
  }
  return completed;
}

export function missionProgress(m, stats) {
  return Math.min(m.goal, stats[m.stat] || 0);
}

export const ACHIEVEMENTS = [
  { id: 'firstBoss', name: 'Директор уволен', desc: 'Победить первого босса', check: (p) => p.totalBosses >= 1 },
  { id: 'torn500', name: 'Шредер-человек', desc: '500 порванных договоров суммарно', check: (p) => p.totalTorn >= 500 },
  { id: 'combo50', name: 'Бумажный шторм', desc: 'Серия из 50 разрывов', check: (p) => p.bestCombo >= 50 },
  { id: 'day25', name: 'Дело закрыто', desc: 'Дожить до 25-го дня', check: (p) => p.bestDay >= 25 },
  { id: 'nightmare10', name: 'Кошмарный сон МФО', desc: 'День 10 на Кошмаре', check: (p) => p.bestDayNightmare >= 10 },
  { id: 'noSign', name: 'Не подписывал', desc: 'Пройти 5 дней без единой подписи', check: (p) => p.bestCleanStreak >= 5 },
  { id: 'debtFree', name: 'Чист перед банком', desc: 'Закончить забег с нулевым долгом после 5-го дня', check: (p) => p.debtFreeRun },
];
