// Клавиатура + тач-джойстик + кнопки. Выдаёт вектор движения и однократные действия.
// Тач-кнопки шлют действие по имени, поэтому имя действия обязано быть в списке его клавиш.
export const ACTION_KEYS = {
  dash: ['Shift', 'ShiftLeft', 'ShiftRight', 'dash'],
  refuse: [' ', 'refuse'],
  ult: ['e', 'ult'],
  pause: ['Escape', 'p', 'pause'],
  mute: ['m', 'mute'],
};

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set(); // одноразовые нажатия за кадр
    this.joy = { active: false, id: null, cx: 0, cy: 0, dx: 0, dy: 0 };
    this.touchButtons = {};
    this.canvas = canvas;
    this.enabled = true;

    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      const k = this.norm(e);
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(this.norm(e)));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') {
        this.pressed.add('refuse');
        return;
      }
      if (!this.joy.active) {
        this.joy = { active: true, id: e.pointerId, cx: e.clientX, cy: e.clientY, dx: 0, dy: 0 };
      }
    });
    window.addEventListener('pointermove', (e) => {
      if (this.joy.active && e.pointerId === this.joy.id) {
        const dx = e.clientX - this.joy.cx;
        const dy = e.clientY - this.joy.cy;
        const len = Math.hypot(dx, dy);
        const max = 48;
        const k = len > max ? max / len : 1;
        this.joy.dx = (dx * k) / max;
        this.joy.dy = (dy * k) / max;
      }
    });
    const end = (e) => {
      if (this.joy.active && e.pointerId === this.joy.id) this.joy = { active: false, id: null, cx: 0, cy: 0, dx: 0, dy: 0 };
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }

  norm(e) {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    // Русская раскладка: ц=w, ф=a, ы=s, в=d, у=e
    const map = { 'ц': 'w', 'ф': 'a', 'ы': 's', 'в': 'd', 'у': 'e', 'р': 'h', 'з': 'p', 'ь': 'm' };
    return map[k] || k;
  }

  bindButton(el, action) {
    const down = (e) => { e.preventDefault(); this.pressed.add(action); };
    el.addEventListener('pointerdown', down);
  }

  move() {
    let x = 0;
    let y = 0;
    if (this.keys.has('a') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('d') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('w') || this.keys.has('ArrowUp')) y -= 1;
    if (this.keys.has('s') || this.keys.has('ArrowDown')) y += 1;
    if (this.joy.active) {
      x += this.joy.dx;
      y += this.joy.dy;
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return [x, y];
  }

  consume(action) {
    const keys = ACTION_KEYS[action] || [action];
    for (const k of keys) {
      if (this.pressed.has(k)) {
        this.pressed.delete(k);
        return true;
      }
    }
    return false;
  }

  endFrame() {
    this.pressed.clear();
  }
}
