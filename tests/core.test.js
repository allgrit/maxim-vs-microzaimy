import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, dailySeed, hashSeed } from '../src/core/rng.js';
import { difficultyFor, spawnInterval, pickEnemy, availableEnemies, bossForDay, isBossDay, pickModifier, sceneForDay } from '../src/core/waves.js';
import { computeStats, rollChoices, upgradeLevel, UPGRADES, xpForLevel, buyMeta, canBuyMeta, META_UPGRADES, baseStats } from '../src/core/upgrades.js';
import { createCombo, comboHit, comboTick, comboMultiplier, pointsFor, finalScore, reputationFor, formatMoney, shareText } from '../src/core/score.js';
import { rollMissions, checkMissions, emptyRunStats, ACHIEVEMENTS, MISSION_POOL } from '../src/core/missions.js';
import { createStore, memoryStorage, addLeaderboardEntry, getLeaderboard, applyRunToProfile, defaultProfile } from '../src/core/save.js';
import { DIFFICULTIES, ENEMIES, BOSSES, DAY_MODIFIERS } from '../src/core/config.js';

test('rng детерминирован по сиду и даёт значения в [0,1)', () => {
  const a = createRng('seed-1');
  const b = createRng('seed-1');
  const seqA = Array.from({ length: 5 }, () => a.next());
  const seqB = Array.from({ length: 5 }, () => b.next());
  assert.deepEqual(seqA, seqB);
  for (const v of seqA) assert.ok(v >= 0 && v < 1);
  assert.notEqual(createRng('seed-2').next(), seqA[0]);
});

test('rng.int включает границы, shuffle не теряет элементы', () => {
  const r = createRng(42);
  const seen = new Set();
  for (let i = 0; i < 500; i++) seen.add(r.int(1, 3));
  assert.deepEqual([...seen].sort(), [1, 2, 3]);
  const sh = r.shuffle([1, 2, 3, 4, 5]);
  assert.deepEqual(sh.slice().sort(), [1, 2, 3, 4, 5]);
});

test('dailySeed зависит от даты, hashSeed стабилен', () => {
  assert.equal(dailySeed(new Date(2026, 8, 22)), 'daily-2026-09-22');
  assert.equal(hashSeed('abc'), hashSeed('abc'));
  assert.notEqual(hashSeed('abc'), hashSeed('abd'));
});

test('сложность растёт монотонно, интервал спавна падает', () => {
  let prev = 0;
  for (let d = 1; d <= 30; d++) {
    const cur = difficultyFor(d);
    assert.ok(cur > prev);
    prev = cur;
  }
  const i1 = spawnInterval(1, 0, DIFFICULTIES.normal, null);
  const i10 = spawnInterval(10, 0, DIFFICULTIES.normal, null);
  const i10end = spawnInterval(10, 1, DIFFICULTIES.normal, null);
  assert.ok(i10 < i1);
  assert.ok(i10end < i10);
  assert.ok(spawnInterval(40, 1, DIFFICULTIES.nightmare, { spawn: 3 }) >= 0.18);
  assert.ok(spawnInterval(5, 0, DIFFICULTIES.easy, null) > spawnInterval(5, 0, DIFFICULTIES.nightmare, null));
});

test('враги открываются по дням, модификатор меняет веса', () => {
  const d1 = availableEnemies(1).map((e) => e.id);
  assert.deepEqual(d1, ['contract']);
  const d11 = availableEnemies(11).map((e) => e.id);
  assert.equal(d11.length, Object.keys(ENEMIES).length);
  const promo = availableEnemies(3, { contractMult: 1.5 }).find((e) => e.id === 'contract');
  assert.equal(promo.weight, ENEMIES.contract.weight * 1.5);
  const r = createRng(1);
  for (let i = 0; i < 100; i++) assert.equal(pickEnemy(r, 1), 'contract');
  const picks = new Set();
  for (let i = 0; i < 400; i++) picks.add(pickEnemy(r, 11));
  assert.ok(picks.size >= 6);
});

test('боссы каждые 5 дней, после 25-го — по кругу с ростом хп', () => {
  assert.equal(bossForDay(3), null);
  assert.ok(isBossDay(5));
  assert.equal(bossForDay(5).id, 'director');
  assert.equal(bossForDay(25).id, 'history');
  const b30 = bossForDay(30);
  assert.equal(b30.id, 'director');
  assert.ok(b30.hp > BOSSES[0].hp);
});

test('модификатор дня: до 3-го дня и в дни боссов — обычный', () => {
  const r = createRng(7);
  assert.equal(pickModifier(r, 1).id, 'none');
  assert.equal(pickModifier(r, 10).id, 'none');
  const ids = new Set();
  for (let i = 0; i < 200; i++) ids.add(pickModifier(r, 12).id);
  assert.ok(ids.size > 3);
  for (const id of ids) assert.ok(DAY_MODIFIERS.some((m) => m.id === id));
  assert.equal(sceneForDay(1).name, 'Двор');
  assert.equal(sceneForDay(12).name, 'Колл-центр');
  assert.equal(sceneForDay(99).name, 'Отделение полиции');
});

test('перки применяются и стакаются, редкие считаются за два уровня', () => {
  const base = baseStats();
  const s1 = computeStats([{ id: 'fastHands', rare: false }]);
  assert.ok(Math.abs(s1.tearRate - base.tearRate * 1.25) < 1e-9);
  const s2 = computeStats([{ id: 'fastHands', rare: true }]);
  assert.ok(Math.abs(s2.tearRate - base.tearRate * 1.5) < 1e-9);
  assert.equal(upgradeLevel([{ id: 'fastHands', rare: true }, { id: 'fastHands', rare: false }], 'fastHands'), 3);
  const s3 = computeStats([{ id: 'doubleDash', rare: false }], { nerves: 2 }, { speedMult: 0.95, scoreMult: 1.1 });
  assert.equal(s3.dashCharges, 2);
  assert.equal(s3.maxNerves, 120);
  assert.ok(Math.abs(s3.speed - base.speed * 0.95) < 1e-9);
  assert.equal(s3.scoreMult, 1.1);
});

test('выбор перков не предлагает максимальные и не дублирует', () => {
  const r = createRng(3);
  const taken = [];
  for (let i = 0; i < 5; i++) taken.push({ id: 'fastHands', rare: false });
  for (let i = 0; i < 50; i++) {
    const ch = rollChoices(r, taken);
    assert.equal(ch.length, 3);
    assert.ok(!ch.some((c) => c.id === 'fastHands'));
    assert.equal(new Set(ch.map((c) => c.id)).size, 3);
  }
  const all = UPGRADES.flatMap((u) => Array.from({ length: u.max }, () => ({ id: u.id, rare: false })));
  assert.equal(rollChoices(r, all).length, 0);
  assert.ok(xpForLevel(2) > xpForLevel(1));
});

test('мета-магазин списывает репутацию и уважает максимум', () => {
  let meta = {};
  let rep = 1000;
  assert.ok(canBuyMeta(meta, rep, 'nerves'));
  const cost0 = META_UPGRADES.find((u) => u.id === 'nerves').cost(0);
  ({ meta, reputation: rep } = buyMeta(meta, rep, 'nerves'));
  assert.equal(meta.nerves, 1);
  assert.equal(rep, 1000 - cost0);
  assert.equal(buyMeta(meta, 0, 'nerves').ok, false);
  for (let i = 0; i < 10; i++) ({ meta, reputation: rep } = buyMeta(meta, 100000, 'nerves'));
  assert.equal(meta.nerves, 5);
});

test('комбо: множитель растёт, сбрасывается по таймеру, кап ×5', () => {
  const c = createCombo();
  assert.equal(comboMultiplier(c), 1);
  for (let i = 0; i < 10; i++) comboHit(c);
  assert.equal(comboMultiplier(c), 2);
  assert.equal(pointsFor('contract', c), 20);
  comboTick(c, 2.6);
  assert.equal(c.count, 0);
  assert.equal(c.best, 10);
  for (let i = 0; i < 100; i++) comboHit(c);
  assert.equal(comboMultiplier(c), 5);
});

test('итоговые очки и репутация', () => {
  assert.equal(finalScore(1000, DIFFICULTIES.nightmare), 1500);
  assert.equal(finalScore(1000, DIFFICULTIES.easy), 700);
  assert.ok(reputationFor(10000, 10, 2) > reputationFor(10000, 10, 0));
  assert.equal(formatMoney(1234567), '1 234 567 ₽');
  const txt = shareText({ dateLabel: '22.09', score: 41230, day: 12, torn: 212, daily: true });
  assert.ok(txt.includes('41 230') && txt.includes('ежедневный'));
});

test('миссии: три уровня, выполняются один раз', () => {
  const r = createRng(9);
  const ms = rollMissions(r);
  assert.deepEqual(ms.map((m) => m.tier), [1, 2, 3]);
  const stats = emptyRunStats();
  const m = ms.find((x) => x.tier === 1);
  stats[m.stat] = m.goal;
  const done = checkMissions(ms, stats);
  assert.equal(done.length, 1);
  assert.equal(checkMissions(ms, stats).length, 0);
  for (const p of MISSION_POOL) assert.ok(p.stat in stats, `нет счётчика ${p.stat}`);
});

test('сохранение: профиль, лидерборд топ-10, достижения', () => {
  const store = createStore(memoryStorage());
  const p = store.load();
  assert.equal(p.reputation, 0);
  for (let i = 0; i < 15; i++) {
    addLeaderboardEntry(p, { score: i * 100, day: i, difficulty: 'normal', daily: false });
  }
  const b = getLeaderboard(p, 'normal');
  assert.equal(b.length, 10);
  assert.equal(b[0].score, 1400);
  const pos = addLeaderboardEntry(p, { score: 99999, day: 1, difficulty: 'normal', daily: false });
  assert.equal(pos, 1);
  assert.equal(addLeaderboardEntry(p, { score: 1, day: 1, difficulty: 'normal', daily: false }), 0);
  addLeaderboardEntry(p, { score: 5, day: 1, daily: true, seed: 'daily-2026-09-22' });
  assert.equal(getLeaderboard(p, null, 'daily-2026-09-22').length, 1);
  store.save(p);
  assert.equal(store.load().leaderboards.normal[0].score, 99999);

  const run = { stats: { ...emptyRunStats(), torn: 600, bosses: 1, bestCombo: 55 }, day: 6, difficulty: 'normal', debt: 0, reputation: 50 };
  const fresh = applyRunToProfile(p, run, ACHIEVEMENTS);
  const ids = fresh.map((a) => a.id);
  assert.ok(ids.includes('firstBoss') && ids.includes('torn500') && ids.includes('combo50') && ids.includes('debtFree'));
  assert.equal(p.reputation, 50);
  assert.equal(applyRunToProfile(p, run, ACHIEVEMENTS).length, 0);
  assert.ok(defaultProfile().leaderboards.daily);
});

test('редкий перк не превышает максимум уровня', () => {
  const r = createRng(11);
  const taken = [{ id: 'doubleDash', rare: false }];
  for (let i = 0; i < 200; i++) {
    for (const c of rollChoices(r, taken)) {
      if (c.id === 'doubleDash') assert.equal(c.rare, false);
    }
  }
});

test('загрузка профиля нормализует повреждённые поля', () => {
  const st = memoryStorage();
  st.setItem('maxim-vs-mfo-v1', JSON.stringify({ achievements: null, seenHints: null, leaderboards: { normal: 'x', daily: null }, reputation: 'abc' }));
  const p = createStore(st).load();
  assert.ok(Array.isArray(p.achievements) && Array.isArray(p.seenHints));
  assert.ok(Array.isArray(p.leaderboards.normal));
  assert.equal(typeof p.leaderboards.daily, 'object');
  assert.equal(p.reputation, 0);
});
