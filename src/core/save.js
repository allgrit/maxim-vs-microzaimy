// Сохранение: localStorage с инъекцией хранилища для тестов.
const KEY = 'maxim-vs-mfo-v1';

export function defaultProfile() {
  return {
    reputation: 0,
    meta: {},
    style: 'cap',
    muted: false,
    totalTorn: 0,
    totalBosses: 0,
    bestCombo: 0,
    bestDay: 0,
    bestDayNightmare: 0,
    bestCleanStreak: 0,
    debtFreeRun: false,
    achievements: [],
    runs: 0,
    leaderboards: { easy: [], normal: [], nightmare: [], daily: {} },
    seenTutorial: false,
    seenHints: [],
  };
}

// Повреждённый, но синтаксически верный JSON не должен ронять игру: чиним типы полей.
export function normalizeProfile(parsed) {
  const d = defaultProfile();
  const p = { ...d, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
  for (const k of ['achievements', 'seenHints']) if (!Array.isArray(p[k])) p[k] = [];
  for (const k of ['reputation', 'totalTorn', 'totalBosses', 'bestCombo', 'bestDay', 'bestDayNightmare', 'bestCleanStreak', 'runs']) {
    if (typeof p[k] !== 'number' || !Number.isFinite(p[k])) p[k] = 0;
  }
  if (!p.meta || typeof p.meta !== 'object') p.meta = {};
  if (typeof p.style !== 'string') p.style = 'cap';
  const lb = p.leaderboards && typeof p.leaderboards === 'object' ? p.leaderboards : {};
  p.leaderboards = { ...d.leaderboards };
  for (const k of ['easy', 'normal', 'nightmare']) p.leaderboards[k] = Array.isArray(lb[k]) ? lb[k].filter((e) => e && typeof e.score === 'number') : [];
  p.leaderboards.daily = lb.daily && typeof lb.daily === 'object' && !Array.isArray(lb.daily) ? lb.daily : {};
  for (const k of Object.keys(p.leaderboards.daily)) if (!Array.isArray(p.leaderboards.daily[k])) delete p.leaderboards.daily[k];
  return p;
}

export function createStore(storage) {
  return {
    load() {
      try {
        const raw = storage.getItem(KEY);
        if (!raw) return defaultProfile();
        const parsed = JSON.parse(raw);
        return normalizeProfile(parsed);
      } catch {
        return defaultProfile();
      }
    },
    save(profile) {
      try {
        storage.setItem(KEY, JSON.stringify(profile));
        return true;
      } catch {
        return false;
      }
    },
    reset() {
      try { storage.removeItem(KEY); } catch { /* ignore */ }
    },
  };
}

export function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

// Добавить результат в таблицу; возвращает позицию (1-based) или 0, если не вошёл.
export function addLeaderboardEntry(profile, entry, { size = 10 } = {}) {
  let board;
  if (entry.daily) {
    profile.leaderboards.daily[entry.seed] = profile.leaderboards.daily[entry.seed] || [];
    board = profile.leaderboards.daily[entry.seed];
  } else {
    board = profile.leaderboards[entry.difficulty];
  }
  board.push(entry);
  board.sort((a, b) => b.score - a.score || b.day - a.day);
  const pos = board.indexOf(entry) + 1;
  board.splice(size);
  return pos <= size ? pos : 0;
}

export function getLeaderboard(profile, difficulty, seed = null) {
  if (seed) return profile.leaderboards.daily[seed] || [];
  return profile.leaderboards[difficulty] || [];
}

// Обновить постоянную статистику после забега; возвращает список новых достижений.
export function applyRunToProfile(profile, run, achievements) {
  profile.runs += 1;
  profile.totalTorn += run.stats.torn;
  profile.totalBosses += run.stats.bosses;
  profile.bestCombo = Math.max(profile.bestCombo, run.stats.bestCombo);
  profile.bestDay = Math.max(profile.bestDay, run.day);
  if (run.difficulty === 'nightmare') profile.bestDayNightmare = Math.max(profile.bestDayNightmare, run.day);
  profile.bestCleanStreak = Math.max(profile.bestCleanStreak, run.stats.bestCleanStreak || 0);
  if (run.day >= 5 && run.debt <= 0) profile.debtFreeRun = true;
  profile.reputation += run.reputation;
  const fresh = [];
  for (const a of achievements) {
    if (profile.achievements.includes(a.id)) continue;
    if (a.check(profile)) {
      profile.achievements.push(a.id);
      fresh.push(a);
    }
  }
  return fresh;
}
