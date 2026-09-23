import { DAY_LENGTH, dayLength, DEBT_LIMIT_BASE, INTEREST_RATE_BASE, ULT_CHARGE_NEEDED, ENEMIES, ENEMY_QUOTES, ENEMY_QUOTES_LATE, HEADLINES, HEADLINES_LATE, DIFFICULTIES, FINAL_BOSS_DAY } from './core/config.js';
import { createRng } from './core/rng.js';
import { spawnInterval, enemyHpScale, enemySpeedScale, isBossDay, bossForDay, pickEnemy, pickModifier, sceneForDay, difficultyFor } from './core/waves.js';
import { computeStats, rollChoices, xpForLevel, STYLES } from './core/upgrades.js';
const ENTITY_CAP = 200;
import { createCombo, comboHit, comboTick, comboMultiplier, pointsFor } from './core/score.js';
import { rollMissions, checkMissions, emptyRunStats } from './core/missions.js';

export const world = { W: 1000, H: 640, safeTop: 0 }; // safeTop — зона под HUD в портрете
const MARGIN = 26;

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

let uid = 1;

export class Game {
  constructor({ difficulty = 'normal', daily = false, seed = null, profile, audio, fx, input, hooks = {} }) {
    this.diff = DIFFICULTIES[difficulty];
    this.difficultyId = difficulty;
    this.daily = daily;
    this.seed = seed || `run-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    this.rng = createRng(this.seed); // волны, модификаторы, миссии — общие для ежедневного вызова
    this.rngPerks = createRng(`${this.seed}-perks`);
    this.rngFx = createRng(`${this.seed}-fx-${Date.now()}`); // косметика: реплики, разброс улик
    this.profile = profile;
    this.audio = audio;
    this.fx = fx;
    this.input = input;
    this.hooks = hooks;

    // Ежедневный вызов: общие условия для всех — без мета-бонусов и стиля.
    const meta = daily ? {} : (profile.meta || {});
    this.style = daily ? STYLES[0] : (STYLES.find((s) => s.id === profile.style) || STYLES[0]);
    this.taken = [];
    this.stats = computeStats(this.taken, meta, this.style);
    this.rerolls = meta.reroll || 0;
    this.debtLimit = DEBT_LIMIT_BASE + (meta.debtLimit || 0) * 10000;

    this.player = {
      x: world.W / 2, y: (world.H + world.safeTop) / 2, vx: 0, vy: 0, r: 16, nerves: this.stats.maxNerves,
      dashTimer: 0, dashCd: 0, dashCharges: this.stats.dashCharges, dashDir: [1, 0],
      refuseCd: 0, invuln: 0, stun: 0, slow: 1, chained: null, face: 1, hurtFlash: 0,
      inverted: 0, pulled: null, tearTimer: 0, signFlash: 0, trailT: 0, walk: 0,
      kx: 0, ky: 0, slowNext: 1, tearTarget: null, tearInterval: 0.45, tearFlash: null,
    };
    this.ult = (meta.startUlt || 0) * 0.25 * ULT_CHARGE_NEEDED;
    this.ultActive = 0;
    this.debt = 0;
    this.score = 0;
    this.xp = 0;
    this.level = 1;
    this.combo = createCombo();
    this.enemies = [];
    this.projectiles = [];
    this.pickups = [];
    this.zones = []; // телеграфы и зоны боссов
    this.boss = null;
    this.day = 1;
    this.dayTime = 0;
    this.time = 0;
    this.spawnTimer = 0.4;
    this.teaTimer = 10;
    this.certTimer = 35;
    this.modifier = pickModifier(this.rng, 1);
    this.scene = sceneForDay(1);
    this.runStats = emptyRunStats();
    this.missions = rollMissions(this.rng);
    this.daySigned = false;
    this.cleanStreak = 0;
    this.phase = 'play';
    this.pendingChoices = null;
    this.won = false;
    this.endless = false;
    this.slowmo = 0;
    this.pendingLevelUps = 0;
    this.headlineIdx = Math.floor(this.rng.next() * HEADLINES.length);

    this.pendingLevelUps = meta.startLevel || 0;
    this.tutorial = false; // первый забег: медленный старт, пока игрок не освоил разрыв
    this.tutorialStep = null; // id текущего шага — для отрисовки подсказок
    this.spotlight = null; // { label, counter, t, dur, target }
    this.pendingSpots = []; // подсказки, ждущие появления цели в кадре
    this.massKill = false; // ульта: облегчённые эффекты при массовом уничтожении
    this.runStats.moved = 0;
  }

  // Стартовый залп: сразу есть что рвать. Вызывается после установки хуков и флага обучения.
  openingVolley() {
    const n = this.tutorial ? 2 : 4;
    for (let i = 0; i < n; i++) this.spawnEnemy('contract');
  }

  // Спотлайт: короткое замедление и подсветка нового объекта — когда он уже в кадре.
  queueSpotlight(kind, target, hint) {
    if (this.pendingSpots.some((q) => q.kind === kind)) return;
    this.pendingSpots.push({ kind, target, hint });
  }

  inView(o) {
    return o.x > 10 && o.x < world.W - 10 && o.y > world.safeTop + 10 && o.y < world.H - 10;
  }

  updateSpotlights(rawDt) {
    if (this.spotlight) {
      this.spotlight.t += rawDt;
      if (this.spotlight.t >= this.spotlight.dur || this.spotlight.target.dead) this.spotlight = null;
    }
    this.pendingSpots = this.pendingSpots.filter((q) => !q.target.dead);
    if (this.spotlight || !this.pendingSpots.length) return;
    const idx = this.pendingSpots.findIndex((q) => this.inView(q.target));
    if (idx < 0) return;
    const [q] = this.pendingSpots.splice(idx, 1);
    this.spotlight = { target: q.target, label: q.hint.label, counter: q.hint.counter, t: 0, dur: 1.6 };
    this.slowmo = Math.max(this.slowmo, 1.3);
    this.audio.click();
    if (this.hooks.onSpotlight) this.hooks.onSpotlight(q.kind);
  }

  // Смена ориентации: пропорционально перенести всё на новую арену.
  rescale(nw, nh) {
    const kx = nw / world.W;
    const ky = nh / world.H;
    const mv = (o) => { o.x *= kx; o.y *= ky; };
    mv(this.player);
    for (const e of this.enemies) { mv(e); if (e.baseY !== undefined) e.baseY *= ky; }
    for (const e of this.projectiles) mv(e);
    for (const e of this.pickups) mv(e);
    for (const e of this.zones) mv(e);
    if (this.boss) mv(this.boss);
  }

  // ---------- ХЕЛПЕРЫ ----------
  addScore(kind) {
    const p = pointsFor(kind, this.combo, this.stats.scoreMult);
    this.score += p;
    return p;
  }

  randomEdgePos(pad = 30) {
    const side = this.rng.int(0, 3);
    if (side === 0) return { x: this.rng.range(0, world.W), y: -pad };
    if (side === 1) return { x: world.W + pad, y: this.rng.range(0, world.H) };
    if (side === 2) return { x: this.rng.range(0, world.W), y: world.H + pad };
    return { x: -pad, y: this.rng.range(0, world.H) };
  }

  randomInnerPos(minDistFromPlayer = 140) {
    for (let i = 0; i < 12; i++) {
      const p = { x: this.rng.range(60, world.W - 60), y: this.rng.range(world.safeTop + 60, world.H - 60) };
      if (dist(p, this.player) >= minDistFromPlayer) return p;
    }
    return { x: this.rng.range(60, world.W - 60), y: this.rng.range(world.safeTop + 60, world.H - 60) };
  }

  // Напряжение 0..1: долг, нервы и глубина забега. Управляет цветом, звуком и абсурдом реплик.
  tension() {
    const debtK = this.debt / this.debtLimit;
    const nerveK = 1 - this.player.nerves / this.stats.maxNerves;
    const dayK = Math.min(1, this.day / 25);
    return Math.max(0, Math.min(1, debtK * 0.6 + nerveK * 0.3 + dayK * 0.25));
  }

  quote(kind) {
    const late = this.tension() > 0.45 || this.day >= 12;
    const q = (late && this.rngFx.chance(0.7) ? ENEMY_QUOTES_LATE[kind] : null) || ENEMY_QUOTES[kind];
    return q ? this.rngFx.pick(q) : '';
  }

  headline() {
    const pool = this.day >= 10 ? (this.rng.chance(0.75) ? HEADLINES_LATE : HEADLINES) : HEADLINES;
    return pool[this.headlineIdx % pool.length];
  }

  // ---------- СПАВН ----------
  spawnEnemy(type, pos = null, extra = {}) {
    const def = ENEMIES[type];
    // Общий лимит сущностей: лёгкие враги при переполнении не создаются (заглушка, чтобы вызывающие не падали).
    const light = type === 'contract' || type === 'sms' || type === 'call' || type === 'mimic' || type === 'trap';
    if (this.enemies.length >= ENTITY_CAP && light) return { dead: true, x: 0, y: 0, type };
    if (this.enemies.length >= ENTITY_CAP + 40) return { dead: true, x: 0, y: 0, type };
    const hpScale = enemyHpScale(this.day, this.diff);
    const spScale = enemySpeedScale(this.day);
    const p = pos || (['call', 'trap', 'mimic', 'robocall'].includes(type) ? this.randomInnerPos() : this.randomEdgePos());
    const e = {
      id: uid++, type, x: p.x, y: p.y, vx: 0, vy: 0, r: def.radius,
      hp: Math.max(1, Math.round(def.hp * (def.hp > 1 ? hpScale : 1))), maxHp: Math.max(1, Math.round(def.hp * (def.hp > 1 ? hpScale : 1))),
      speed: def.speed * spScale, t: 0, life: def.life || Infinity, phase: this.rng.next() * 6.28,
      quote: this.quote(type), quoteT: 0, hitFlash: 0, dead: false, ...extra,
    };
    if (type === 'promoter' && this.modifier.promoterSpeed) e.speed *= this.modifier.promoterSpeed;
    if (type === 'call') {
      e.ring = def.ring * (this.modifier.callRing || 1);
      e.life = def.life * this.stats.callLife;
      e.ringNow = 0;
      this.audio.ring();
    }
    if (type === 'sms') {
      const target = { x: this.player.x + this.rng.range(-60, 60), y: this.player.y + this.rng.range(-60, 60) };
      const a = Math.atan2(target.y - e.y, target.x - e.x);
      e.vx = Math.cos(a) * e.speed * this.stats.smsSlow;
      e.vy = Math.sin(a) * e.speed * this.stats.smsSlow;
      e.life = 8;
    }
    if (type === 'trap') e.arm = 0;
    if (type === 'popup') {
      e.w = 150;
      e.h = 96;
      e.text = this.quote('popup');
    }
    if (type === 'drone') {
      const fromLeft = this.rng.chance(0.5);
      e.x = fromLeft ? -30 : world.W + 30;
      e.y = this.rng.range(80, world.H - 80);
      e.vx = (fromLeft ? 1 : -1) * e.speed;
      e.baseY = e.y;
      e.dropT = 0.6;
    }
    if (type === 'collector') e.chainT = 2.5;
    if (type === 'robocall') e.spawnT = 2;
    this.enemies.push(e);
    if (this.hooks.onFirstSeen) this.hooks.onFirstSeen(type, e);
    return e;
  }

  spawnContractAt(x, y, vx = 0, vy = 0) {
    const e = this.spawnEnemy('contract', { x, y });
    e.vx = vx;
    e.vy = vy;
    e.drift = 0.6;
    return e;
  }

  spawnPickup(kind, pos = null) {
    const p = pos || this.randomInnerPos(60);
    const k = { id: uid++, kind, x: p.x, y: p.y, t: 0, life: kind === 'xp' ? 18 : 25, value: 1 };
    this.pickups.push(k);
    if (this.hooks.onFirstSeen && kind !== 'xp') this.hooks.onFirstSeen(kind, k);
  }

  dropXp(x, y, n) {
    const mult = this.modifier.xp || 1;
    const count = Math.max(1, Math.round(n * mult));
    for (let i = 0; i < count; i++) {
      this.pickups.push({ id: uid++, kind: 'xp', x: x + this.rngFx.range(-14, 14), y: y + this.rngFx.range(-14, 14), t: 0, life: 18, value: 1 });
    }
  }

  // ---------- ПОДПИСЬ / УРОН ----------
  sign(amount, source = '') {
    const p = this.player;
    if (this.phase !== 'play' || p.invuln > 0) return false;
    const scaled = Math.round(amount * (1 + this.day * 0.05));
    this.debt += scaled;
    this.daySigned = true;
    this.cleanStreak = 0;
    this.runStats.signed++;
    this.combo.count = 0;
    p.signFlash = 0.5;
    p.invuln = 0.6;
    this.fx.flash('#d7263d', 0.3);
    this.fx.shake(8);
    this.fx.text(p.x, p.y - 30, `+${scaled.toLocaleString('ru-RU')} ₽`, '#ff4d5e', 20, 1.2);
    this.fx.ring(p.x, p.y, 10, 70, '#d7263d', 0.4, 4);
    this.audio.sign();
    if (source) this.fx.text(p.x, p.y - 52, source, '#ffd6dc', 12, 1);
    if (this.debt >= this.debtLimit) this.gameOver('debt');
    return true;
  }

  // Бумага коснулась игрока: рывок рвёт её, неуязвимость отбрасывает, иначе — подпись.
  paperTouch(e, debt, source) {
    const p = this.player;
    if (p.dashTimer > 0) { this.killEnemy(e, 'tear'); return; }
    if (p.invuln > 0) {
      const a = Math.atan2(e.y - p.y, e.x - p.x);
      e.vx = Math.cos(a) * 260;
      e.vy = Math.sin(a) * 260;
      e.pushed = 0.35;
      return;
    }
    if (this.sign(debt, source)) e.dead = true;
  }

  hurt(amount, knock = null) {
    const p = this.player;
    if (this.phase !== 'play' || p.invuln > 0) return false;
    p.nerves -= amount;
    p.hurtFlash = 0.3;
    p.invuln = 0.5;
    this.runStats.damageTaken += amount;
    this.fx.flash('#ff8c42', 0.2);
    this.fx.shake(6);
    this.fx.text(p.x, p.y - 30, `−${amount}`, '#ffb347', 18, 0.9);
    this.audio.hurt();
    if (knock) {
      p.kx += knock[0];
      p.ky += knock[1];
    }
    if (p.nerves <= 0) this.gameOver('nerves');
    return true;
  }

  heal(amount) {
    const p = this.player;
    const before = p.nerves;
    p.nerves = Math.min(this.stats.maxNerves, p.nerves + amount);
    this.runStats.healed += p.nerves - before;
  }

  // ---------- УБИЙСТВО ВРАГА ----------
  killEnemy(e, cause = 'tear') {
    if (e.dead) return;
    e.dead = true;
    const p = this.player;
    let kind = e.type;
    if (e.type === 'contract' || e.type === 'flyer') {
      comboHit(this.combo);
      this.runStats.torn++;
      this.runStats.bestCombo = Math.max(this.runStats.bestCombo, this.combo.best);
      if (cause !== 'ult') this.ult = Math.min(ULT_CHARGE_NEEDED, this.ult + 1 * this.stats.ultGain);
      if (this.stats.refundPerTear) this.debt = Math.max(0, this.debt - this.stats.refundPerTear);
      if (this.massKill) {
        this.fx.shreds(e.x, e.y, 2, '#fff8e7');
      } else {
        this.fx.shreds(e.x, e.y, 7, '#fff8e7');
        this.fx.shreds(e.x, e.y, 2, '#d7263d');
        this.audio.tear();
      }
      this.dropXp(e.x, e.y, 1);
      if (this.stats.shredChance > 0 && cause === 'tear' && this.rng.chance(this.stats.shredChance)) {
        const near = this.enemies.find((o) => !o.dead && o !== e && (o.type === 'contract' || o.type === 'flyer') && dist(o, e) < 90);
        if (near) {
          this.fx.ring(e.x, e.y, 5, 90, '#ffe74c', 0.3, 2);
          this.killEnemy(near, 'shred');
        }
      }
      kind = 'contract';
    } else if (e.type === 'promoter') {
      this.fx.shreds(e.x, e.y, 14, '#ffe74c');
      this.fx.text(e.x, e.y - 24, 'Уволен!', '#ffe74c', 14);
      this.audio.tear();
      this.audio.stamp();
      this.dropXp(e.x, e.y, 3);
    } else if (e.type === 'call') {
      this.fx.ring(e.x, e.y, e.ringNow, 0, '#35a7ff', 0.3, 3);
      this.fx.text(e.x, e.y - 20, cause === 'dash' ? 'Сброшен!' : 'Заблокирован', '#9be1ff', 13);
      if (cause === 'dash') this.runStats.callsDashed++;
      this.audio.popupClose();
      this.dropXp(e.x, e.y, 2);
    } else if (e.type === 'sms') {
      this.fx.sparks(e.x, e.y, 5, '#6bd425', 120);
      this.dropXp(e.x, e.y, 1);
      kind = 'flyer';
    } else if (e.type === 'trap') {
      this.runStats.traps++;
      this.fx.ring(e.x, e.y, e.r, 0, '#ff5964', 0.3, 3);
      this.fx.text(e.x, e.y - 20, 'Стёрто', '#fff', 13);
      kind = 'trap';
    } else if (e.type === 'popup') {
      this.runStats.popups++;
      this.fx.shreds(e.x, e.y, 16, '#ffffff', 220);
      this.fx.sparks(e.x, e.y, 8, '#35a7ff');
      this.audio.popupClose();
      this.dropXp(e.x, e.y, 3);
    } else if (e.type === 'collector') {
      this.runStats.collectors++;
      this.fx.shreds(e.x, e.y, 20, '#2b2d42', 240);
      this.fx.sparks(e.x, e.y, 14, '#ffd166', 260);
      this.fx.text(e.x, e.y - 30, 'Статья 163 УК', '#ffd166', 15, 1.4);
      this.fx.shake(10);
      this.audio.stamp();
      this.audio.tear();
      this.dropXp(e.x, e.y, 6);
      if (p.chained && p.chained.id === e.id) p.chained = null;
    } else if (e.type === 'robocall') {
      this.fx.sparks(e.x, e.y, 20, '#9a8bc4', 300);
      this.fx.text(e.x, e.y - 24, 'Отключён', '#d9d0ff', 13);
      this.audio.stamp();
      this.dropXp(e.x, e.y, 5);
    } else if (e.type === 'mimic') {
      this.runStats.mimics++;
      this.fx.shreds(e.x, e.y, 10, '#9bb27c');
      this.fx.text(e.x, e.y - 24, 'Разоблачён!', '#ffe74c', 14);
      this.audio.tear();
      this.dropXp(e.x, e.y, 3);
    } else if (e.type === 'drone') {
      this.fx.sparks(e.x, e.y, 16, '#38618c', 280);
      this.fx.text(e.x, e.y - 24, 'Сбит', '#cfe3ff', 13);
      this.audio.stamp();
      this.dropXp(e.x, e.y, 4);
    }
    this.runStats.kills++;
    const pts = this.addScore(kind);
    if (kind !== 'contract' && kind !== 'flyer') this.fx.text(e.x, e.y - 8, `+${pts}`, '#fff', 13, 0.8);
  }

  // ---------- ДЕЙСТВИЯ ИГРОКА ----------
  dash(dir) {
    const p = this.player;
    if (p.dashCharges <= 0 || p.dashTimer > 0) return;
    p.dashCharges--;
    p.dashTimer = 0.25;
    p.invuln = Math.max(p.invuln, 0.3);
    p.dashDir = dir;
    if (p.dashCd <= 0) p.dashCd = this.stats.dashCooldown;
    this.runStats.dashes++;
    if (p.chained) {
      this.fx.text(p.x, p.y - 30, 'Цепь порвана!', '#ffd166', 14);
      p.chained = null;
    }
    this.audio.dash();
  }

  refuse() {
    const p = this.player;
    if (p.refuseCd > 0) return;
    p.refuseCd = this.stats.refuseCooldown;
    this.runStats.refuses++;
    const R = this.stats.refuseRadius;
    this.fx.ring(p.x, p.y, 20, R, '#35a7ff', 0.35, 5);
    this.fx.ring(p.x, p.y, 10, R * 0.7, '#ffffff', 0.25, 3);
    this.fx.text(p.x, p.y - 40, 'ОТКАЗ!', '#35a7ff', 22, 0.8);
    this.fx.shake(4);
    this.audio.refuse();
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = dist(e, p);
      if (d > R + e.r) continue;
      if (e.type === 'contract' || e.type === 'flyer' || e.type === 'sms') {
        const a = Math.atan2(e.y - p.y, e.x - p.x);
        e.vx = Math.cos(a) * 520;
        e.vy = Math.sin(a) * 520;
        e.pushed = 0.5;
        if (e.type === 'sms') this.killEnemy(e, 'refuse');
      } else if (e.type === 'trap') {
        this.killEnemy(e, 'refuse');
      } else if (e.type === 'popup') {
        e.hp -= 2 * this.stats.popupDamage;
        e.hitFlash = 0.2;
        if (e.hp <= 0) this.killEnemy(e, 'refuse');
      } else if (e.type === 'mimic') {
        e.revealed = true;
        e.type = 'contract';
        e.r = 14;
        e.speed = 55;
        e.life = Infinity;
        this.runStats.mimics++;
        this.fx.text(e.x, e.y - 22, 'Это не чай!', '#ffe74c', 13);
      } else if (e.type === 'promoter' || e.type === 'collector' || e.type === 'drone') {
        const a = Math.atan2(e.y - p.y, e.x - p.x);
        e.vx += Math.cos(a) * 300;
        e.vy += Math.sin(a) * 300;
        e.hp -= 1;
        e.hitFlash = 0.2;
        if (e.hp <= 0) this.killEnemy(e, 'refuse');
      } else if (e.type === 'call') {
        e.hp -= 1;
        if (e.hp <= 0) this.killEnemy(e, 'refuse');
      }
    }
    if (this.boss && !this.boss.dead && dist(this.boss, p) < R + this.boss.r) this.damageBoss(8);
    if (p.chained) p.chained = null;
  }

  activateUlt() {
    if (this.ult < ULT_CHARGE_NEEDED || this.ultActive > 0) return;
    this.ult = 0;
    this.ultActive = 3;
    this.runStats.ults++;
    this.audio.siren();
    this.fx.flash('#2b5fd9', 0.5);
    this.fx.shake(14);
    this.fx.text(this.player.x, this.player.y - 60, 'ЗАЯВЛЕНИЕ В ПОЛИЦИЮ!', '#9be1ff', 26, 1.6);
    this.fx.ring(this.player.x, this.player.y, 20, 700, '#2b5fd9', 0.8, 8);
    this.massKill = true;
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (e.type === 'mimic') { e.type = 'contract'; this.runStats.mimics++; }
      this.killEnemy(e, 'ult');
    }
    this.massKill = false;
    this.audio.tear();
    this.audio.stamp();
    this.projectiles = [];
    this.zones = this.zones.filter((z) => z.kind !== 'stakingPull');
    this.debt = Math.round(this.debt * 0.8);
    if (this.boss && !this.boss.dead) {
      this.boss.stun = 3;
      this.damageBoss(40);
    }
  }

  // Тап по крестику поп-апа (мировые координаты). Возвращает true, если попали.
  tapAt(x, y) {
    if (this.phase !== 'play') return false;
    for (const e of this.enemies) {
      if (e.dead || e.type !== 'popup') continue;
      const bx = e.x + e.w / 2 - 14;
      const by = e.y - e.h / 2 + 14;
      if (Math.hypot(x - bx, y - by) < 26) {
        e.hp = 0;
        this.killEnemy(e, 'x');
        return true;
      }
    }
    return false;
  }

  // ---------- ЛЕВЕЛ-АП ----------
  queueLevelUp() {
    if (this.phase !== 'play') return;
    const choices = rollChoices(this.rngPerks, this.taken);
    if (choices.length === 0) {
      this.pendingLevelUps = 0;
      this.heal(15);
      return;
    }
    this.pendingChoices = choices;
    this.phase = 'levelup';
    this.audio.levelUp();
    this.fx.confetti(this.player.x, this.player.y, 40);
    if (this.hooks.onLevelUp) this.hooks.onLevelUp(choices, this.rerolls);
  }

  rerollChoices() {
    if (this.rerolls <= 0 || this.phase !== 'levelup') return null;
    this.rerolls--;
    this.pendingChoices = rollChoices(this.rngPerks, this.taken);
    return this.pendingChoices;
  }

  chooseUpgrade(idx) {
    if (this.phase !== 'levelup' || !this.pendingChoices) return;
    const c = this.pendingChoices[idx];
    if (!c) return;
    const beforeMax = this.stats.maxNerves;
    this.taken.push(c);
    this.stats = computeStats(this.taken, this.profile.meta || {}, this.style);
    const p = this.player;
    p.nerves = Math.min(this.stats.maxNerves, p.nerves + (this.stats.maxNerves - beforeMax) + 10);
    p.dashCharges = Math.min(this.stats.dashCharges, p.dashCharges + 1);
    this.pendingChoices = null;
    this.phase = 'play';
    this.audio.click();
  }

  gainXp(n) {
    this.xp += n;
    while (this.xp >= xpForLevel(this.level)) {
      this.xp -= xpForLevel(this.level);
      this.level++;
      this.pendingLevelUps++;
    }
  }

  // ---------- ДЕНЬ ----------
  endDay() {
    const p = this.player;
    this.addScore('dayClear');
    if (!this.daySigned) {
      this.cleanStreak++;
      this.runStats.cleanDays++;
      this.runStats.bestCleanStreak = Math.max(this.runStats.bestCleanStreak || 0, this.cleanStreak);
      this.addScore('cleanDay');
      this.fx.text(p.x, p.y - 50, 'ЧИСТЫЙ ДЕНЬ +300', '#6bd425', 20, 1.5);
    }
    if (this.day === 10 && this.debt < 20000) this.runStats.day10LowDebt = 1;
    this.day++;
    this.runStats.day = this.day;
    this.dayTime = 0;
    this.daySigned = false;
    this.modifier = pickModifier(this.rng, this.day);
    this.scene = sceneForDay(this.day);
    this.headlineIdx = this.headlineIdx + 1 + this.rng.int(0, 2);
    this.phase = 'transition';
    // Убираем бумаги, но не тяжёлых врагов — новый день, новые бумаги.
    for (const e of this.enemies) if (e.type === 'contract' || e.type === 'flyer' || e.type === 'sms' || e.type === 'trap') e.dead = true;
    this.audio.setTempo(132 + this.day * 3);
    const boss = bossForDay(this.day);
    if (this.hooks.onDayTransition) {
      this.hooks.onDayTransition({ day: this.day, headline: this.headline(), modifier: this.modifier, scene: this.scene, boss, tension: this.tension() });
    }
  }

  resumeAfterTransition() {
    if (this.phase !== 'transition') return;
    this.phase = 'play';
    const boss = bossForDay(this.day);
    if (boss) this.spawnBoss(boss);
  }

  // ---------- БОССЫ ----------
  spawnBoss(def) {
    const hp = Math.round(def.hp * this.diff.enemyHp);
    this.boss = {
      def, id: def.id, x: world.W / 2, y: world.safeTop + 110, vx: 0, vy: 0, r: def.radius, hp, maxHp: hp, t: 0,
      timers: { a: 2.5, b: 6, c: 4, d: 8 }, stun: 0, phase2: false, dead: false, hitFlash: 0,
      angle: 0, chargeDir: null, charging: 0, beamA: 0, target: null, scale: 1,
    };
    this.audio.bossAppear();
    this.fx.shake(12);
    this.fx.flash('#000', 0.4);
    this.fx.text(world.W / 2, 200, def.quote, '#fff', 18, 3);
    if (this.hooks.onBoss) this.hooks.onBoss(def);
    if (this.hooks.onFirstSeen) this.hooks.onFirstSeen('boss', this.boss);
  }

  damageBoss(n) {
    const b = this.boss;
    if (!b || b.dead) return;
    b.hp -= n;
    b.hitFlash = 0.15;
    this.fx.sparks(b.x + (Math.random() - 0.5) * 30, b.y + (Math.random() - 0.5) * 30, 4, '#fff', 160);
    this.audio.bossHit();
    if (!b.phase2 && b.hp <= b.maxHp * 0.5) {
      b.phase2 = true;
      b.scale = 1.35;
      b.r = Math.round(b.def.radius * 1.3);
      this.fx.text(b.x, b.y - 60, 'ПОВЫШЕНИЕ!', '#ff5964', 24, 1.6);
      this.fx.text(b.x, b.y - 90, b.def.phase2Quote || '', '#fff', 14, 3);
      this.fx.shreds(b.x, b.y, 30, '#fff8e7', 300);
      this.fx.shake(14);
      this.fx.flash('#000', 0.35);
      this.slowmo = 0.5;
      this.audio.bossAppear();
      this.audio.promote();
      if (this.hooks.onBossPhase2) this.hooks.onBossPhase2(b.def);
    }
    if (b.hp <= 0) this.killBoss();
  }

  killBoss() {
    const b = this.boss;
    b.dead = true;
    this.runStats.bosses++;
    const pts = this.addScore('boss');
    this.fx.text(b.x, b.y - 40, `+${pts}`, '#ffd166', 26, 2);
    this.fx.shreds(b.x, b.y, 60, '#fff8e7', 400);
    this.fx.confetti(b.x, b.y, 60);
    this.fx.shake(20);
    this.fx.flash('#fff', 0.6);
    this.slowmo = 0.7;
    this.audio.bossDie();
    for (let i = 0; i < 10; i++) this.spawnPickup('xp', { x: b.x + this.rng.range(-50, 50), y: b.y + this.rng.range(-50, 50) });
    this.spawnPickup('cert', { x: b.x, y: b.y });
    this.zones = [];
    for (const e of this.enemies) if (e.type !== 'collector') e.dead = true;
    this.player.chained = null;
    this.player.inverted = 0;
    if (this.day === FINAL_BOSS_DAY && !this.endless) {
      this.won = true;
      this.phase = 'victory';
      this.enemies = [];
      this.projectiles = [];
      this.audio.victory();
      if (this.hooks.onVictory) this.hooks.onVictory(this.result());
      return;
    }
    this.bossDoneTimer = 1.8;
  }

  updateBoss(dt) {
    const b = this.boss;
    const p = this.player;
    if (!b || b.dead) return;
    b.t += dt;
    b.hitFlash = Math.max(0, b.hitFlash - dt);
    if (b.stun > 0) {
      b.stun -= dt;
      return;
    }
    const spd = b.phase2 ? 1.35 : 1;
    for (const k of Object.keys(b.timers)) b.timers[k] -= dt * spd;
    const fn = this[`boss_${b.id}`];
    if (fn) fn.call(this, b, p, dt);
    b.x = Math.max(MARGIN + b.r, Math.min(world.W - MARGIN - b.r, b.x));
    b.y = Math.max(world.safeTop + MARGIN + b.r, Math.min(world.H - MARGIN - b.r, b.y));
    // столкновение с игроком
    if (dist(b, p) < b.r + p.r && b.id !== 'alena') {
      this.hurt(15, [(p.x - b.x) * 6, (p.y - b.y) * 6]);
    }
  }

  boss_director(b, p, dt) {
    b.x += Math.sin(b.t * 0.8) * 84 * dt;
    b.y = world.safeTop + 110 + Math.sin(b.t * 1.3) * 12;
    if (b.timers.a <= 0) {
      b.timers.a = 2.4;
      const base = Math.atan2(p.y - b.y, p.x - b.x);
      for (let i = -2; i <= 2; i++) {
        const a = base + i * 0.22;
        this.spawnContractAt(b.x, b.y + 20, Math.cos(a) * 170, Math.sin(a) * 170);
      }
      this.fx.text(b.x, b.y - 50, 'Подпишите!', '#fff', 14);
    }
    if (b.timers.b <= 0) {
      b.timers.b = 7;
      if (this.enemies.filter((e) => e.type === 'promoter').length < 4) {
        for (let i = 0; i < 2; i++) this.spawnEnemy('promoter', { x: b.x + (i ? 80 : -80), y: b.y + 30 });
      }
    }
    if (b.phase2 && b.timers.c <= 0) {
      b.timers.c = 2.6;
      this.zones.push({ kind: 'stamp', x: p.x, y: p.y, r: 60, t: 0, dur: 0.9, debt: 12000 });
    }
  }

  boss_vitek(b, p, dt) {
    if (b.charging > 0) {
      b.charging -= dt;
      b.x += b.chargeDir[0] * 560 * dt;
      b.y += b.chargeDir[1] * 560 * dt;
      if (dist(b, p) < b.r + p.r + 4) this.hurt(30, [b.chargeDir[0] * 400, b.chargeDir[1] * 400]);
      return;
    }
    const a = Math.atan2(p.y - b.y, p.x - b.x);
    b.x += Math.cos(a) * 55 * dt;
    b.y += Math.sin(a) * 55 * dt;
    if (b.timers.a <= 0) {
      b.timers.a = 5.5;
      const dir = [Math.cos(a), Math.sin(a)];
      this.zones.push({ kind: 'line', x: b.x, y: b.y, dir, len: 700, t: 0, dur: 0.9, onEnd: () => { b.chargeDir = dir; b.charging = 0.55; this.fx.shake(6); this.audio.stamp(); } });
    }
    if (b.timers.b <= 0) {
      b.timers.b = 6.5;
      this.zones.push({ kind: 'shock', x: b.x, y: b.y, r: 0, rMax: 240, t: 0, dur: 0.75, hit: false, dmg: 18 });
      this.fx.shake(10);
      this.audio.stamp();
    }
    if (b.timers.c <= 0) {
      b.timers.c = 4.5;
      for (let i = -1; i <= 1; i++) {
        const aa = a + i * 0.35;
        this.projectiles.push({ kind: 'chain', x: b.x, y: b.y, vx: Math.cos(aa) * 320, vy: Math.sin(aa) * 320, r: 9, life: 1.4, owner: b });
      }
      this.audio.chain();
    }
    if (b.phase2 && b.timers.d <= 0) {
      b.timers.d = 3.2;
      this.spawnEnemy('trap', { x: p.x + this.rng.range(-60, 60), y: p.y + this.rng.range(-60, 60) });
    }
  }

  boss_alena(b, p, dt) {
    b.x = world.W / 2 + Math.sin(b.t * 0.5) * Math.min(150, world.W * 0.3);
    b.y = (world.H + world.safeTop) / 2 + Math.cos(b.t * 0.4) * 80;
    const beamSpeed = b.phase2 ? 0.95 : 0.6;
    b.beamA += beamSpeed * dt;
    const beams = b.phase2 ? [b.beamA, b.beamA + Math.PI] : [b.beamA];
    for (const ang of beams) {
      const dx = Math.cos(ang);
      const dy = Math.sin(ang);
      const px = p.x - b.x;
      const py = p.y - b.y;
      const proj = px * dx + py * dy;
      if (proj > 0 && proj < 700) {
        const perp = Math.abs(px * dy - py * dx);
        if (perp < p.r + 8) {
          p.slowNext = Math.min(p.slowNext, 0.6);
          if (p.invuln <= 0 && this.phase === 'play') {
            p.nerves -= 12 * dt;
            p.hurtFlash = 0.1;
            this.runStats.damageTaken += 12 * dt;
                    if (p.nerves <= 0) this.gameOver('nerves');
          }
        }
      }
    }
    if (b.timers.a <= 0) {
      b.timers.a = 0.9;
      b.angle += 0.9;
      const R = 200;
      const pos = { x: b.x + Math.cos(b.angle) * R, y: b.y + Math.sin(b.angle) * R };
      pos.x = Math.max(40, Math.min(world.W - 40, pos.x));
      pos.y = Math.max(40, Math.min(world.H - 40, pos.y));
      const c = this.spawnEnemy('call', pos);
      c.life = 5;
    }
    if (b.timers.b <= 0) {
      b.timers.b = 4.5;
      for (let i = 0; i < 6; i++) {
        const pos = this.randomEdgePos();
        const e = this.spawnEnemy('sms', pos);
        e.life = 8;
      }
      this.fx.text(b.x, b.y - 50, 'Вам одобрено!', '#fff', 14);
    }
  }

  boss_microcoin(b, p, dt) {
    b.y += Math.sin(b.t * 3) * 36 * dt;
    if (b.timers.a <= 0) {
      b.timers.a = b.phase2 ? 2.4 : 3.2;
      this.fx.sparks(b.x, b.y, 20, '#61a88f', 300);
      const pos = this.randomInnerPos(160);
      b.x = pos.x;
      b.y = pos.y;
      this.audio.teleport();
      this.fx.ring(b.x, b.y, 0, 90, '#61a88f', 0.4, 4);
      for (let i = 0; i < 3; i++) {
        const m = this.spawnEnemy('mimic', { x: b.x + this.rng.range(-90, 90), y: b.y + this.rng.range(-90, 90) });
        m.token = true;
      }
    }
    if (b.timers.b <= 0) {
      b.timers.b = 6.5;
      const pos = this.randomInnerPos(0);
      this.zones.push({ kind: 'stakingPull', x: pos.x, y: pos.y, r: 150, t: 0, dur: 4, pull: 110 });
      this.fx.text(pos.x, pos.y - 40, 'СТЕЙКИНГ 300%', '#61a88f', 16, 1.5);
    }
    if (b.phase2 && b.timers.c <= 0) {
      b.timers.c = 8;
      p.inverted = 3;
      this.fx.text(p.x, p.y - 50, 'РЫНОК УПАЛ! Управление инвертировано', '#ff5964', 16, 2);
      this.audio.invert();
    }
  }

  boss_history(b, p, dt) {
    const a = Math.atan2(p.y - b.y, p.x - b.x);
    b.x += Math.cos(a) * 30 * dt;
    b.y += Math.sin(a) * 30 * dt;
    if (b.timers.a <= 0) {
      b.timers.a = 1.8;
      for (let i = -1; i <= 1; i++) {
        const aa = a + i * 0.3;
        this.projectiles.push({ kind: 'page', x: b.x, y: b.y, vx: Math.cos(aa) * 210, vy: Math.sin(aa) * 210, r: 12, life: 4, debt: 4000 });
      }
    }
    if (b.timers.b <= 0) {
      b.timers.b = 5;
      b.cycle = ((b.cycle || 0) + 1) % 4;
      if (b.cycle === 0) {
        for (let i = -2; i <= 2; i++) this.spawnContractAt(b.x, b.y, Math.cos(a + i * 0.25) * 170, Math.sin(a + i * 0.25) * 170);
      } else if (b.cycle === 1) {
        this.zones.push({ kind: 'shock', x: b.x, y: b.y, r: 0, rMax: 260, t: 0, dur: 0.8, hit: false, dmg: 18 });
        this.audio.stamp();
      } else if (b.cycle === 2) {
        for (let i = 0; i < 6; i++) this.spawnEnemy('sms', this.randomEdgePos());
      } else {
        this.fx.sparks(b.x, b.y, 20, '#fff', 300);
        const pos = this.randomInnerPos(180);
        b.x = pos.x;
        b.y = pos.y;
        this.audio.teleport();
        for (let i = 0; i < 2; i++) this.spawnEnemy('mimic', { x: b.x + this.rng.range(-90, 90), y: b.y + this.rng.range(-90, 90) });
      }
    }
    if (b.timers.c <= 0) {
      b.timers.c = 6;
      this.zones.push({ kind: 'stamp', x: p.x, y: p.y, r: 60, t: 0, dur: 0.9, debt: 15000 });
    }
    if (b.phase2 && b.timers.d <= 0) {
      b.timers.d = 7;
      this.spawnEnemy('collector', this.randomEdgePos());
    }
  }

  updateZones(dt) {
    const p = this.player;
    for (const z of this.zones) {
      z.t += dt;
      if (z.kind === 'stamp' && z.t >= z.dur && !z.done) {
        z.done = true;
        this.fx.shake(10);
        this.fx.ring(z.x, z.y, z.r, z.r * 0.5, '#2a9d3a', 0.3, 6);
        this.fx.shreds(z.x, z.y, 12, '#2a9d3a');
        this.audio.stamp();
        if (dist(z, p) < z.r + p.r * 0.5) this.sign(z.debt, 'ОДОБРЕНО');
      }
      if (z.kind === 'line' && z.t >= z.dur && !z.done) {
        z.done = true;
        if (z.onEnd) z.onEnd();
      }
      if (z.kind === 'shock') {
        z.r = (z.t / z.dur) * z.rMax;
        const d = dist(z, p);
        if (!z.hit && Math.abs(d - z.r) < 16 && p.invuln <= 0) {
          z.hit = true;
          this.hurt(z.dmg, [(p.x - z.x) * 4, (p.y - z.y) * 4]);
        }
      }
      if (z.kind === 'stakingPull') {
        const d = dist(z, p);
        if (d < z.r && d > 4 && p.dashTimer <= 0) {
          p.pulled = [(z.x - p.x) / d * z.pull, (z.y - p.y) / d * z.pull];
        }
      }
    }
    this.zones = this.zones.filter((z) => z.t < z.dur + (z.kind === 'stamp' ? 0.25 : 0));
  }

  // ---------- ОБНОВЛЕНИЕ ----------
  update(rawDt) {
    if (this.phase !== 'play') return;
    let dt = rawDt;
    this.updateSpotlights(rawDt);
    if (this.slowmo > 0) {
      this.slowmo -= rawDt;
      dt = rawDt * (this.spotlight ? 0.2 : 0.3);
    }
    this.time += dt;
    const p = this.player;
    const inp = this.input;

    // --- ввод ---
    let [mx, my] = inp.move();
    if (p.inverted > 0) {
      mx = -mx;
      my = -my;
      p.inverted -= dt;
    }
    if (inp.consume('dash')) {
      const dir = mx || my ? [mx, my] : [p.face, 0];
      const l = Math.hypot(dir[0], dir[1]) || 1;
      this.dash([dir[0] / l, dir[1] / l]);
    }
    if (inp.consume('refuse')) this.refuse();
    if (inp.consume('ult')) this.activateUlt();
    if (this.phase !== 'play') return;

    // --- движение ---
    // Замедления, назначенные после интеграции в прошлом кадре, действуют в этом.
    p.slow = p.slowNext;
    p.slowNext = 1;
    if (p.dashTimer > 0) {
      p.dashTimer -= dt;
      p.x += p.dashDir[0] * 720 * dt;
      p.y += p.dashDir[1] * 720 * dt;
      p.trailT -= dt;
      if (p.trailT <= 0) {
        p.trailT = 0.03;
        this.fx.ghost(p.x, p.y, p.r, 'rgba(53,167,255,0.5)');
      }
      // рывок сквозь центр звонка — сброс
      for (const e of this.enemies) {
        if (!e.dead && e.type === 'call' && dist(e, p) < 22) this.killEnemy(e, 'dash');
      }
    } else {
      if (p.stun > 0) p.stun -= dt;
      const sp = this.stats.speed * (p.stun > 0 ? 0 : 1);
      p.vx = mx * sp;
      p.vy = my * sp;
    }
    p.dashCd -= dt;
    if (p.dashCd <= 0 && p.dashCharges < this.stats.dashCharges) {
      p.dashCharges++;
      p.dashCd = this.stats.dashCooldown;
    }
    p.refuseCd = Math.max(0, p.refuseCd - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    p.hurtFlash = Math.max(0, p.hurtFlash - dt);
    p.signFlash = Math.max(0, p.signFlash - dt);
    if (mx) p.face = Math.sign(mx);
    if (mx || my) { p.walk += dt * 10; this.runStats.moved += Math.hypot(mx, my) * this.stats.speed * dt; }

    // цепь коллектора
    if (p.chained && !p.chained.dead) {
      const c = p.chained;
      const a = Math.atan2(c.y - p.y, c.x - p.x);
      p.vx += Math.cos(a) * 260;
      p.vy += Math.sin(a) * 260;
      p.chainT -= dt;
      if (p.chainT <= 0) p.chained = null;
    } else p.chained = null;
    if (p.pulled) {
      p.vx += p.pulled[0];
      p.vy += p.pulled[1];
      p.pulled = null;
    }

    // звонки замедляют
    for (const e of this.enemies) {
      if (!e.dead && e.type === 'call' && dist(e, p) < e.ringNow) {
        p.slow = Math.min(p.slow, 0.55);
        p.slowNext = Math.min(p.slowNext, 0.55);
        if (p.invuln <= 0) {
          p.nerves -= 6 * dt;
          this.runStats.damageTaken += 6 * dt;
          if (p.nerves <= 0) { this.gameOver('nerves'); return; }
        }
      }
    }
    if (p.dashTimer <= 0) {
      p.x += (p.vx * p.slow + p.kx) * dt;
      p.y += (p.vy * p.slow + p.ky) * dt;
    }
    const kd = Math.max(0, 1 - dt * 7);
    p.kx *= kd;
    p.ky *= kd;
    p.x = Math.max(MARGIN, Math.min(world.W - MARGIN, p.x));
    p.y = Math.max(world.safeTop + MARGIN, Math.min(world.H - MARGIN, p.y));

    // регенерация
    if (this.stats.regen) this.heal(this.stats.regen * dt);

    // --- проценты ---
    const rate = INTEREST_RATE_BASE * this.diff.interest * (this.modifier.interest || 1) * this.stats.interestMult;
    this.debt += this.debt * rate * dt;
    if (this.debt >= this.debtLimit) { this.gameOver('debt'); return; }

    // --- ульта активна ---
    if (this.ultActive > 0) {
      this.ultActive -= dt;
      if (Math.random() < 0.3) this.fx.flash(Math.random() < 0.5 ? '#2b5fd9' : '#d7263d', 0.12);
    }

    // --- авто-разрыв: одна цель за раз, в ритме tearRate ---
    p.tearTimer -= dt;
    p.tearInterval = 1 / this.stats.tearRate;
    {
      const R = this.stats.tearRadius;
      let best = null;
      let bestD = Infinity;
      for (const e of this.enemies) {
        if (e.dead || e.type === 'trap' || e.type === 'mimic') continue;
        const d = dist(e, p) - e.r;
        if (d < R && d < bestD) { bestD = d; best = e; }
      }
      if (this.boss && !this.boss.dead && dist(this.boss, p) - this.boss.r < R) {
        if (!best || bestD > 10) best = this.boss;
      }
      p.tearTarget = best; // подсвечивается прицелом: игрок видит, кого рвут следующим
      if (best && p.tearTimer <= 0) {
        p.tearTimer = p.tearInterval;
        p.tearFlash = { x: best.x, y: best.y, t: 0.18 };
        if (best === this.boss) {
          this.damageBoss(3);
          this.fx.shreds(best.x + this.rng.range(-20, 20), best.y + this.rng.range(-20, 20), 3, '#fff8e7');
        } else {
          const dmg = best.type === 'popup' ? this.stats.popupDamage : 1;
          best.hp -= dmg;
          best.hitFlash = 0.15;
          if (best.hp <= 0) this.killEnemy(best, 'tear');
          else {
            this.fx.shreds(best.x, best.y, 2, '#fff8e7', 90);
            this.audio.tear();
          }
        }
      } else if (!best) p.tearTimer = Math.min(p.tearTimer, 0.05);
    }
    if (p.tearFlash) { p.tearFlash.t -= dt; if (p.tearFlash.t <= 0) p.tearFlash = null; }
    if (this.phase !== 'play') return;

    // --- спавн ---
    const bossAlive = this.boss && !this.boss.dead;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      const tutorialSlow = this.tutorial && this.runStats.torn < 3 ? 1.6 : 1;
      const interval = spawnInterval(this.day, this.dayTime / dayLength(this.day), this.diff, this.modifier) * (bossAlive ? 2.2 : 1) * tutorialSlow;
      this.spawnTimer = interval;
      if (this.enemies.length < 140) {
        let type = pickEnemy(this.rng, this.day, this.modifier);
        const heavy = ['promoter', 'collector', 'robocall', 'popup', 'drone'];
        if (heavy.includes(type) && this.enemies.filter((e) => e.type === type).length >= 5) type = 'contract';
        this.spawnEnemy(type);
        if (this.day >= 3 && this.rng.chance(0.25)) this.spawnEnemy('contract');
      }
    }
    this.teaTimer -= dt;
    if (this.teaTimer <= 0) {
      this.teaTimer = 14 / (this.modifier.teaMult || 1);
      this.spawnPickup('tea');
    }
    this.certTimer -= dt;
    if (this.certTimer <= 0) {
      this.certTimer = 40;
      if (this.rng.chance(0.5)) this.spawnPickup('cert');
    }

    // --- враги ---
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.t += dt;
      e.life -= dt;
      e.hitFlash = Math.max(0, e.hitFlash - dt);
      if (e.life <= 0) { e.dead = true; continue; }
      if (this.ultActive > 0 && e.type !== 'collector') continue;
      const d = dist(e, p);
      const a = Math.atan2(p.y - e.y, p.x - e.x);
      switch (e.type) {
        case 'contract': {
          if (e.pushed > 0) {
            e.pushed -= dt;
            { const k = Math.pow(0.9, dt * 60); e.vx *= k; e.vy *= k; }
          } else if (e.drift > 0) {
            e.drift -= dt;
          } else {
            const wob = Math.sin(e.t * 6 + e.phase) * 40;
            e.vx = Math.cos(a) * e.speed + Math.cos(a + Math.PI / 2) * wob;
            e.vy = Math.sin(a) * e.speed + Math.sin(a + Math.PI / 2) * wob;
          }
          e.x += e.vx * dt; e.y += e.vy * dt;
          if (d < e.r + p.r) this.paperTouch(e, ENEMIES.contract.debt, e.revealed ? 'Мы из банка' : '');
          if (e.x < -80 || e.x > world.W + 80 || e.y < -80 || e.y > world.H + 80) e.dead = true;
          break;
        }
        case 'flyer': {
          e.x += e.vx * dt; e.y += e.vy * dt;
          if (e.pushed > 0) { e.pushed -= dt; }
          if (d < e.r + p.r) this.paperTouch(e, 2500, 'Листовка');
          if (e.x < -40 || e.x > world.W + 40 || e.y < -40 || e.y > world.H + 40) e.dead = true;
          break;
        }
        case 'promoter': {
          const want = 170;
          const orbit = a + Math.PI / 2 * (e.id % 2 ? 1 : -1);
          let vx = 0; let vy = 0;
          if (d > want + 30) { vx = Math.cos(a); vy = Math.sin(a); }
          else if (d < want - 30) { vx = -Math.cos(a); vy = -Math.sin(a); }
          else { vx = Math.cos(orbit); vy = Math.sin(orbit); }
          { const k = Math.pow(0.9, dt * 60); e.vx = e.vx * k + vx * e.speed * 1.5 * (1 - k); e.vy = e.vy * k + vy * e.speed * 1.5 * (1 - k); }
          e.x += e.vx * dt; e.y += e.vy * dt;
          e.throwT = (e.throwT ?? 1.2) - dt;
          if (e.throwT <= 0 && d < 340) {
            e.throwT = 2.6;
            e.quoteT = 1.2;
            e.quote = this.quote('promoter');
            for (let i = -1; i <= 1; i++) {
              const aa = a + i * 0.28;
              this.enemies.push({ id: uid++, type: 'flyer', x: e.x, y: e.y, vx: Math.cos(aa) * 150, vy: Math.sin(aa) * 150, r: 9, hp: 1, maxHp: 1, t: 0, life: 6, phase: 0, hitFlash: 0, dead: false, speed: 150 });
            }
          }
          e.quoteT -= dt;
          e.x = Math.max(10, Math.min(world.W - 10, e.x));
          e.y = Math.max(10, Math.min(world.H - 10, e.y));
          if (d < e.r + p.r) { this.hurt(4, [Math.cos(a) * 200, Math.sin(a) * 200]); }
          break;
        }
        case 'call': {
          e.ringNow = Math.min(e.ring, e.ringNow + e.ring * dt * 1.4);
          if (Math.floor(e.t * 2) !== Math.floor((e.t - dt) * 2) && e.t < 5 && Math.random() < 0.5) this.audio.ring();
          break;
        }
        case 'sms': {
          e.x += e.vx * dt; e.y += e.vy * dt;
          if (d < e.r + p.r) { if (this.hurt(ENEMIES.sms.damage)) e.dead = true; }
          if (e.x < -60 || e.x > world.W + 60 || e.y < -60 || e.y > world.H + 60) e.dead = true;
          break;
        }
        case 'trap': {
          if (d < e.r + 4) {
            e.arm += dt;
            if (e.arm >= ENEMIES.trap.armTime) { if (this.sign(ENEMIES.trap.debt, 'Подпишите здесь')) e.dead = true; }
          } else e.arm = Math.max(0, e.arm - dt * 2);
          break;
        }
        case 'popup': {
          { const k = Math.pow(0.95, dt * 60); e.vx = e.vx * k + Math.cos(a) * e.speed * (1 - k); e.vy = e.vy * k + Math.sin(a) * e.speed * (1 - k); }
          e.x += e.vx * dt; e.y += e.vy * dt;
          e.x = Math.max(e.w / 2, Math.min(world.W - e.w / 2, e.x));
          e.y = Math.max(e.h / 2, Math.min(world.H - e.h / 2, e.y));
          const bx = e.x + e.w / 2 - 14;
          const by = e.y - e.h / 2 + 14;
          if (Math.hypot(p.x - bx, p.y - by) < 18) { e.hp = 0; this.killEnemy(e, 'x'); }
          break;
        }
        case 'collector': {
          { const k = Math.pow(0.92, dt * 60); e.vx = e.vx * k + Math.cos(a) * e.speed * (1 - k); e.vy = e.vy * k + Math.sin(a) * e.speed * (1 - k); }
          e.x += e.vx * dt; e.y += e.vy * dt;
          e.chainT -= dt;
          e.quoteT -= dt;
          if (e.chainT <= 0 && d < 300 && d > 80) {
            e.chainT = 4.5;
            e.quoteT = 1.5;
            e.quote = this.quote('collector');
            this.projectiles.push({ kind: 'chain', x: e.x, y: e.y, vx: Math.cos(a) * 320, vy: Math.sin(a) * 320, r: 9, life: 1.2, owner: e });
            this.audio.chain();
          }
          if (d < e.r + p.r) { this.hurt(ENEMIES.collector.damage, [Math.cos(a) * 380, Math.sin(a) * 380]); e.vx = -Math.cos(a) * 120; e.vy = -Math.sin(a) * 120; }
          break;
        }
        case 'robocall': {
          e.spawnT -= dt;
          if (e.spawnT <= 0) {
            e.spawnT = 3.2;
            const ang = this.rng.range(0, 6.28);
            const pos = { x: Math.max(40, Math.min(world.W - 40, e.x + Math.cos(ang) * 120)), y: Math.max(40, Math.min(world.H - 40, e.y + Math.sin(ang) * 120)) };
            const c = this.spawnEnemy('call', pos);
            c.life = 6;
          }
          break;
        }
        case 'mimic': {
          if (d < e.r + p.r) {
            if (this.sign(ENEMIES.mimic.debt, e.token ? 'Токен МикроКоин' : '«Мы из банка»')) { e.dead = true; p.stun = 0.5; }
          }
          break;
        }
        case 'drone': {
          e.x += e.vx * dt;
          e.y = e.baseY + Math.sin(e.t * 2.2) * 50;
          e.dropT -= dt;
          if (e.dropT <= 0 && e.x > 40 && e.x < world.W - 40) {
            e.dropT = 1.3;
            this.spawnContractAt(e.x, e.y + 10, 0, 60);
          }
          if (e.x < -60 || e.x > world.W + 60) e.dead = true;
          break;
        }
        default:
          break;
      }
    }
    this.enemies = this.enemies.filter((e) => !e.dead);

    // --- снаряды боссов/коллекторов ---
    for (const pr of this.projectiles) {
      pr.life -= dt;
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      if (dist(pr, p) < pr.r + p.r) {
        if (pr.kind === 'chain') {
          if (p.dashTimer <= 0 && p.invuln <= 0) {
            p.chained = pr.owner;
            p.chainT = 1.3;
            this.fx.text(p.x, p.y - 30, 'Цепь долга!', '#ffd166', 14);
            this.audio.chain();
          }
          pr.life = 0;
        } else if (pr.kind === 'page') {
          if (this.sign(pr.debt, 'Страница истории')) pr.life = 0;
        }
      }
    }
    this.projectiles = this.projectiles.filter((pr) => pr.life > 0);

    // --- зоны и босс ---
    this.updateZones(dt);
    this.updateBoss(dt);
    if (this.phase !== 'play') return;
    if (this.boss && this.boss.dead) {
      this.bossDoneTimer -= dt;
      if (this.bossDoneTimer <= 0) {
        this.boss = null;
        this.endDay();
        return;
      }
    }

    // --- пикапы ---
    for (const k of this.pickups) {
      k.t += dt;
      k.life -= dt;
      const d = dist(k, p);
      const R = k.kind === 'xp' ? this.stats.pickupRadius * 3.5 : this.stats.pickupRadius;
      if (d < R) {
        const a = Math.atan2(p.y - k.y, p.x - k.x);
        const sp = 420 + (R - d) * 4;
        k.x += Math.cos(a) * sp * dt;
        k.y += Math.sin(a) * sp * dt;
      }
      if (d < p.r + 10) {
        k.life = 0;
        if (k.kind === 'xp') { this.gainXp(1); if (Math.random() < 0.25) this.audio.pickup(); }
        else if (k.kind === 'tea') {
          this.heal(this.stats.teaHeal);
          this.fx.text(p.x, p.y - 30, `+${Math.round(this.stats.teaHeal)} нервы`, '#6bd425', 14);
          this.audio.tea();
        } else if (k.kind === 'cert') {
          const cut = Math.min(this.debt, 15000);
          this.debt -= cut;
          this.fx.text(p.x, p.y - 30, `Справка: −${cut.toLocaleString('ru-RU')} ₽`, '#9be1ff', 15, 1.3);
          this.fx.confetti(p.x, p.y, 20);
          this.audio.mission();
        }
      }
    }
    this.pickups = this.pickups.filter((k) => k.life > 0);

    // --- комбо, миссии, день ---
    comboTick(this.combo, dt);
    const done = checkMissions(this.missions, this.runStats);
    for (const m of done) {
      this.addScore('missionBonus');
      this.fx.text(p.x, p.y - 70, `Миссия: ${m.text}`, '#ffe74c', 16, 2);
      this.audio.mission();
      if (this.hooks.onMissionDone) this.hooks.onMissionDone(m);
    }
    if (this.phase === 'play' && this.pendingLevelUps > 0) {
      this.pendingLevelUps--;
      this.queueLevelUp();
      return;
    }
    if (!bossAlive && !(this.boss && this.boss.dead)) {
      this.dayTime += dt;
      if (this.dayTime >= dayLength(this.day)) this.endDay();
    }
  }

  gameOver(reason) {
    if (this.phase === 'over') return;
    this.phase = 'over';
    this.reason = reason;
    this.audio.gameOver();
    this.fx.shake(16);
    this.fx.flash(reason === 'debt' ? '#d7263d' : '#ff8c42', 0.6);
    if (this.hooks.onGameOver) this.hooks.onGameOver(this.result());
  }

  continueEndless() {
    if (this.phase !== 'victory') return;
    this.endless = true;
    this.phase = 'play';
    this.bossDoneTimer = 1.5;
  }

  result() {
    return {
      score: this.score,
      day: this.day,
      debt: this.debt,
      torn: this.runStats.torn,
      stats: this.runStats,
      missions: this.missions,
      difficulty: this.difficultyId,
      diffName: this.diff.name,
      daily: this.daily,
      seed: this.seed,
      level: this.level,
      taken: this.taken,
      reason: this.reason,
      won: this.won,
      time: this.time,
      combo: this.combo.best,
    };
  }

  hud() {
    return {
      nerves: this.player.nerves,
      maxNerves: this.stats.maxNerves,
      debt: this.debt,
      debtLimit: this.debtLimit,
      interest: INTEREST_RATE_BASE * this.diff.interest * (this.modifier.interest || 1) * this.stats.interestMult,
      xp: this.xp,
      xpNeed: xpForLevel(this.level),
      level: this.level,
      day: this.day,
      dayTime: this.dayTime,
      dayLen: dayLength(this.day),
      bossAlive: !!(this.boss && !this.boss.dead),
      boss: this.boss,
      combo: this.combo.count,
      comboMult: comboMultiplier(this.combo),
      score: this.score,
      ult: this.ult / ULT_CHARGE_NEEDED,
      ultReady: this.ult >= ULT_CHARGE_NEEDED,
      dashCharges: this.player.dashCharges,
      dashMax: this.stats.dashCharges,
      refuseCd: this.player.refuseCd,
      refuseMax: this.stats.refuseCooldown,
      missions: this.missions,
      runStats: this.runStats,
      modifier: this.modifier,
      scene: this.scene,
      difficultyFactor: difficultyFor(this.day),
      tension: this.tension(),
    };
  }
}
