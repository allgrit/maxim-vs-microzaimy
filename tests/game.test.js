import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, world } from '../src/game.js';
import { defaultProfile } from '../src/core/save.js';
import { ULT_CHARGE_NEEDED } from '../src/core/config.js';

// Заглушки внешних границ: звук, эффекты, ввод.
const audio = new Proxy({}, { get: () => () => {} });
const fx = new Proxy({}, { get: () => () => {} });
function makeInput(keys = []) {
  return { move: () => [0, 0], consume: (a) => keys.includes(a), endFrame() {} };
}
function makeGame(over = {}) {
  const g = new Game({ difficulty: 'normal', profile: defaultProfile(), audio, fx, input: makeInput(), ...over });
  g.enemies = []; // стартовый залп договоров мешает изолированным сценариям
  return g;
}

test('зона «Стейкинг» с игроком в центре не даёт NaN', () => {
  const g = makeGame();
  g.zones.push({ kind: 'stakingPull', x: g.player.x, y: g.player.y, r: 150, t: 0, dur: 4, pull: 110 });
  for (let i = 0; i < 3; i++) g.update(1 / 60);
  assert.ok(Number.isFinite(g.player.x) && Number.isFinite(g.player.y));
});

test('после победы урон не переводит забег в поражение', () => {
  const g = makeGame();
  g.day = 25;
  g.spawnBoss({ day: 25, id: 'history', name: 'x', hp: 10, radius: 44, quote: '' });
  g.spawnEnemy('collector', { x: g.player.x + 1, y: g.player.y });
  g.player.nerves = 5;
  g.damageBoss(1000);
  assert.equal(g.phase, 'victory');
  g.hurt(100);
  g.update(1 / 60);
  assert.equal(g.phase, 'victory');
});

test('подпись сверх лимита сразу даёт банкротство, ульта не спасает', () => {
  const g = makeGame();
  g.debt = g.debtLimit - 10;
  g.ult = ULT_CHARGE_NEEDED;
  g.sign(5000);
  assert.equal(g.phase, 'over');
  assert.equal(g.reason, 'debt');
});

test('ульта не заряжает сама себя договорами, которые уничтожила', () => {
  const g = makeGame();
  for (let i = 0; i < 40; i++) g.spawnEnemy('contract', { x: 100 + i, y: 400 });
  g.ult = ULT_CHARGE_NEEDED;
  g.activateUlt();
  assert.equal(g.ult, 0);
});

test('вторичный спавн уважает общий лимит сущностей', () => {
  const g = makeGame();
  for (let i = 0; i < 260; i++) g.spawnEnemy('contract', { x: 50, y: 400 });
  assert.ok(g.enemies.length <= 200);
  const e = g.spawnContractAt(10, 10, 5, 5);
  assert.ok(e.dead, 'при переполнении возвращается мёртвая заглушка');
});

test('отбрасывание реально смещает игрока, замедление действует в том же кадре', () => {
  const g = makeGame();
  const x0 = g.player.x;
  g.hurt(1, [400, 0]);
  g.update(1 / 60);
  g.update(1 / 60);
  assert.ok(g.player.x > x0 + 5, `игрок не сдвинулся: ${g.player.x - x0}`);
  const g2 = makeGame({ input: { move: () => [1, 0], consume: () => false, endFrame() {} } });
  g2.spawnEnemy('call', { x: g2.player.x, y: g2.player.y });
  g2.enemies[0].ringNow = 200;
  const x1 = g2.player.x;
  g2.update(1 / 60);
  const moved = g2.player.x - x1;
  assert.ok(moved < g2.stats.speed / 60 * 0.7, `замедление не сработало: ${moved}`);
});

test('поворот экрана переносит опорные координаты дрона', () => {
  const g = makeGame();
  const d = g.spawnEnemy('drone');
  const before = world.H;
  g.rescale(world.W, before * 2);
  assert.ok(Math.abs(d.baseY - d.y) < 60);
});

test('подсказка первой встречи ждёт появления цели в кадре', () => {
  const shown = [];
  const g = makeGame({ hooks: { onSpotlight: (k) => shown.push(k) } });
  g.queueSpotlight('promoter', { x: -200, y: 300, r: 16, dead: false }, { label: 'x', counter: 'tear' });
  g.update(1 / 60);
  assert.deepEqual(shown, []);
  g.pendingSpots[0].target.x = 200;
  g.update(1 / 60);
  assert.deepEqual(shown, ['promoter']);
});
