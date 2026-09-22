// Весь звук синтезируется через Web Audio: никаких файлов.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.muted = false;
    this.musicTimer = null;
    this.tempo = 132;
    this.step = 0;
    this.nextNoteTime = 0;
    this.noiseBuf = null;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.22;
    this.musicGain.connect(this.master);
    const len = this.ctx.sampleRate * 1;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.02);
  }

  // --- примитивы ---
  tone({ freq = 440, type = 'square', dur = 0.15, vol = 0.3, attack = 0.005, decay = null, slide = null, dest = null, delay = 0 }) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (decay ?? dur));
    o.connect(g);
    g.connect(dest || this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  noise({ dur = 0.2, vol = 0.3, filter = 1200, q = 0.7, type = 'bandpass', slide = null, delay = 0 }) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(filter, t0);
    if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(40, slide), t0 + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  // --- события игры ---
  tear() {
    this.noise({ dur: 0.14, vol: 0.35, filter: 2400, q: 0.5, slide: 600 });
    this.noise({ dur: 0.08, vol: 0.2, filter: 5000, q: 1, delay: 0.03 });
  }
  stamp() {
    this.tone({ freq: 110, type: 'sine', dur: 0.25, vol: 0.5, slide: 40 });
    this.noise({ dur: 0.1, vol: 0.3, filter: 300, type: 'lowpass' });
  }
  sign() {
    this.tone({ freq: 880, type: 'sawtooth', dur: 0.35, vol: 0.25, slide: 220 });
    this.tone({ freq: 660, type: 'square', dur: 0.4, vol: 0.15, slide: 150, delay: 0.05 });
  }
  ring() {
    for (let i = 0; i < 2; i++) {
      this.tone({ freq: 1320, type: 'sine', dur: 0.09, vol: 0.18, delay: i * 0.12 });
      this.tone({ freq: 1760, type: 'sine', dur: 0.09, vol: 0.14, delay: i * 0.12 + 0.05 });
    }
  }
  hurt() {
    this.tone({ freq: 200, type: 'sawtooth', dur: 0.2, vol: 0.35, slide: 80 });
    this.noise({ dur: 0.15, vol: 0.25, filter: 800, type: 'lowpass' });
  }
  dash() {
    this.noise({ dur: 0.18, vol: 0.22, filter: 600, slide: 3500, q: 1.2 });
  }
  refuse() {
    this.tone({ freq: 300, type: 'square', dur: 0.22, vol: 0.3, slide: 900 });
    this.noise({ dur: 0.25, vol: 0.2, filter: 1500, slide: 200 });
  }
  pickup() {
    this.tone({ freq: 880, type: 'triangle', dur: 0.08, vol: 0.2 });
    this.tone({ freq: 1320, type: 'triangle', dur: 0.1, vol: 0.2, delay: 0.06 });
  }
  tea() {
    this.tone({ freq: 523, type: 'sine', dur: 0.12, vol: 0.25 });
    this.tone({ freq: 784, type: 'sine', dur: 0.16, vol: 0.25, delay: 0.1 });
    this.tone({ freq: 1046, type: 'sine', dur: 0.2, vol: 0.2, delay: 0.2 });
  }
  levelUp() {
    const notes = [523, 659, 784, 1046, 1318];
    notes.forEach((f, i) => this.tone({ freq: f, type: 'square', dur: 0.18, vol: 0.22, delay: i * 0.07 }));
  }
  popupClose() {
    this.tone({ freq: 1200, type: 'square', dur: 0.06, vol: 0.25 });
    this.tone({ freq: 600, type: 'square', dur: 0.1, vol: 0.2, delay: 0.05 });
  }
  bossHit() {
    this.tone({ freq: 160, type: 'square', dur: 0.08, vol: 0.2, slide: 120 });
  }
  bossAppear() {
    this.tone({ freq: 80, type: 'sawtooth', dur: 1.2, vol: 0.4, slide: 40 });
    this.tone({ freq: 120, type: 'square', dur: 0.4, vol: 0.25, delay: 0.3 });
    this.tone({ freq: 90, type: 'square', dur: 0.5, vol: 0.25, delay: 0.7 });
  }
  bossDie() {
    for (let i = 0; i < 6; i++) this.noise({ dur: 0.4, vol: 0.35, filter: 400 + i * 200, type: 'lowpass', delay: i * 0.12 });
    [392, 523, 659, 784, 1046].forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 0.35, vol: 0.25, delay: 0.5 + i * 0.1 }));
  }
  siren() {
    for (let i = 0; i < 4; i++) {
      this.tone({ freq: 660, type: 'square', dur: 0.3, vol: 0.25, slide: 880, delay: i * 0.6 });
      this.tone({ freq: 880, type: 'square', dur: 0.3, vol: 0.25, slide: 660, delay: i * 0.6 + 0.3 });
    }
  }
  mission() {
    [659, 784, 988, 1318].forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 0.2, vol: 0.25, delay: i * 0.09 }));
  }
  gameOver() {
    [440, 415, 392, 349, 262].forEach((f, i) => this.tone({ freq: f, type: 'sawtooth', dur: 0.45, vol: 0.25, delay: i * 0.3 }));
  }
  victory() {
    [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => this.tone({ freq: f, type: 'square', dur: 0.25, vol: 0.25, delay: i * 0.14 }));
  }
  click() {
    this.tone({ freq: 700, type: 'square', dur: 0.05, vol: 0.12 });
  }
  chain() {
    this.noise({ dur: 0.3, vol: 0.3, filter: 3000, q: 4, slide: 1500 });
    this.tone({ freq: 220, type: 'sawtooth', dur: 0.2, vol: 0.2, slide: 110 });
  }
  teleport() {
    this.tone({ freq: 200, type: 'sine', dur: 0.3, vol: 0.25, slide: 1600 });
  }
  invert() {
    this.tone({ freq: 1600, type: 'sine', dur: 0.5, vol: 0.25, slide: 100 });
  }

  promote() {
    [196, 233, 277, 330, 392, 466].forEach((f, i) => this.tone({ freq: f, type: 'sawtooth', dur: 0.3, vol: 0.2, delay: i * 0.08 }));
    this.tone({ freq: 60, type: 'sine', dur: 1.2, vol: 0.5, slide: 30, delay: 0.5 });
  }

  // --- сгущение атмосферы: гул и сердцебиение растут с напряжением ---
  setTension(k) {
    if (!this.ctx) return;
    this.tension = k;
    if (!this.drone) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 55;
      const o2 = this.ctx.createOscillator();
      o2.type = 'sine';
      o2.frequency.value = 0.3;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 6;
      o2.connect(lfoGain);
      lfoGain.connect(o.frequency);
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 180;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      o.connect(f);
      f.connect(g);
      g.connect(this.master);
      o.start();
      o2.start();
      this.drone = { o, g, f };
    }
    const target = k < 0.25 ? 0 : (k - 0.25) / 0.75 * 0.28;
    this.drone.g.gain.setTargetAtTime(target, this.ctx.currentTime, 0.5);
    this.drone.f.frequency.setTargetAtTime(120 + k * 400, this.ctx.currentTime, 0.5);
    if (this.musicGain) this.musicGain.gain.setTargetAtTime(0.22 - k * 0.1, this.ctx.currentTime, 0.5);
  }
  stopTension() {
    if (this.drone) this.drone.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
  }
  heartbeat() {
    this.tone({ freq: 70, type: 'sine', dur: 0.18, vol: 0.55, slide: 35 });
    this.tone({ freq: 60, type: 'sine', dur: 0.2, vol: 0.4, slide: 30, delay: 0.22 });
  }

  // --- музыка: чиптюн-секвенсор ---
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    this.step = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.musicTimer = setInterval(() => this.schedule(), 60);
  }
  stopMusic() {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
  }
  setTempo(bpm) {
    this.tempo = bpm;
  }
  schedule() {
    const lookahead = 0.25;
    // Вкладка была в фоне: не проигрываем пропущенное, перескакиваем к текущему времени.
    if (this.nextNoteTime < this.ctx.currentTime - 0.5) this.nextNoteTime = this.ctx.currentTime;
    while (this.nextNoteTime < this.ctx.currentTime + lookahead) {
      this.playStep(this.step, this.nextNoteTime);
      const secPerStep = 60 / this.tempo / 4;
      this.nextNoteTime += secPerStep;
      this.step = (this.step + 1) % 64;
    }
  }
  playStep(step, t) {
    // Ля минор, бас + арпеджио + шейкер.
    const bassPat = [55, 55, 0, 55, 65.4, 0, 55, 0, 49, 49, 0, 49, 73.4, 0, 65.4, 0];
    const bar = Math.floor(step / 16) % 4;
    const chordRoots = [220, 174.6, 261.6, 196];
    const root = chordRoots[bar];
    const b = bassPat[step % 16];
    const delay = t - this.ctx.currentTime;
    const k = this.tension || 0;
    const dark = k > 0.5 ? 0.5 : 1; // при высоком напряжении мелодия падает на октаву
    const detune = k > 0.7 ? 1 + (Math.random() - 0.5) * 0.04 * ((k - 0.7) / 0.3) : 1;
    if (b) this.tone({ freq: b * (bar === 1 ? 1.19 : bar === 2 ? 1.5 : bar === 3 ? 1.12 : 1), type: 'triangle', dur: 0.12, vol: 0.5, dest: this.musicGain, delay });
    const arp = k > 0.5 ? [1, 1.19, 1.5, 1.68, 1.5, 1.19] : [1, 1.2, 1.5, 2, 1.5, 1.2];
    if (step % 2 === 0) {
      const f = root * arp[(step / 2) % arp.length] * dark * detune;
      this.tone({ freq: f, type: k > 0.5 ? 'sawtooth' : 'square', dur: 0.09, vol: 0.18, dest: this.musicGain, delay });
    }
    if (step % 4 === 2) {
      this.tone({ freq: 3000, type: 'square', dur: 0.02, vol: 0.05, dest: this.musicGain, delay });
    }
    if (step % 8 === 0) {
      this.tone({ freq: 90, type: 'sine', dur: 0.1, vol: 0.5, slide: 40, dest: this.musicGain, delay });
    }
  }
}
