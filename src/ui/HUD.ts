import type { GameState } from '../core/GameState';
import type { Input } from '../systems/Input';

// Builds the on-screen HUD (resource bar, health, day badge) and the mobile
// touch controls (virtual joystick + action buttons), wiring them into Input.
export class HUD {
  private root: HTMLDivElement;
  private resEls: Record<string, HTMLElement> = {};
  private healthFill!: HTMLElement;
  private dayEl!: HTMLElement;
  private phaseEl!: HTMLElement;
  private banner!: HTMLElement;
  private toast!: HTMLElement;
  private toastTimer = 0;

  constructor(private state: GameState, private input: Input) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    document.body.appendChild(this.root);
    this.build();
    this.buildJoystick();
    this.buildButtons();
    this.state.onChange = () => this.refresh();
    this.refresh();
  }

  private build() {
    const topbar = document.createElement('div');
    topbar.className = 'topbar';
    for (const kind of ['wood', 'stone', 'gold', 'gems'] as const) {
      const el = document.createElement('div');
      el.className = 'res';
      el.innerHTML = `<span class="dot ${kind}"></span><span class="val">0</span>`;
      topbar.appendChild(el);
      this.resEls[kind] = el.querySelector('.val') as HTMLElement;
    }
    this.root.appendChild(topbar);

    const day = document.createElement('div');
    day.className = 'daybadge';
    day.innerHTML = `<div class="num">Day 1</div><div class="phase">DAY</div>`;
    this.dayEl = day.querySelector('.num') as HTMLElement;
    this.phaseEl = day.querySelector('.phase') as HTMLElement;
    this.root.appendChild(day);

    const health = document.createElement('div');
    health.className = 'health';
    health.innerHTML = `<div class="label">HEALTH</div><div class="bar"><div class="fill"></div></div>`;
    this.healthFill = health.querySelector('.fill') as HTMLElement;
    this.root.appendChild(health);

    this.banner = document.createElement('div');
    this.banner.className = 'banner';
    this.root.appendChild(this.banner);

    this.toast = document.createElement('div');
    this.toast.className = 'toast';
    this.root.appendChild(this.toast);

    const cls = document.createElement('div');
    cls.className = 'classbadge';
    cls.innerHTML = `Class: <span>WARRIOR</span>`;
    this.root.appendChild(cls);

    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent =
      'WASD move · drag to look · J attack · E gather · B build · Space jump · Shift run';
    this.root.appendChild(hint);
  }

  private buildJoystick() {
    const stick = document.createElement('div');
    stick.className = 'joystick';
    const knob = document.createElement('div');
    knob.className = 'knob';
    stick.appendChild(knob);
    this.root.appendChild(stick);

    let active = false;
    let cx = 0;
    let cy = 0;
    const maxR = 46;

    const start = (e: PointerEvent) => {
      active = true;
      const rect = stick.getBoundingClientRect();
      cx = rect.left + rect.width / 2;
      cy = rect.top + rect.height / 2;
      move(e);
      stick.setPointerCapture(e.pointerId);
      e.preventDefault();
    };
    const move = (e: PointerEvent) => {
      if (!active) return;
      let dx = e.clientX - cx;
      let dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > maxR) {
        dx = (dx / dist) * maxR;
        dy = (dy / dist) * maxR;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      // Screen up (negative dy) => forward (positive moveY).
      this.input.setJoystick(dx / maxR, -dy / maxR);
      e.preventDefault();
    };
    const end = (e: PointerEvent) => {
      active = false;
      knob.style.transform = 'translate(0px, 0px)';
      this.input.releaseJoystick();
      e.preventDefault();
    };
    stick.addEventListener('pointerdown', start);
    stick.addEventListener('pointermove', move);
    stick.addEventListener('pointerup', end);
    stick.addEventListener('pointercancel', end);
  }

  private buildButtons() {
    const actions = document.createElement('div');
    actions.className = 'actions';
    const defs: [string, string, () => void][] = [
      ['build', 'BUILD', () => this.input.queueAction('build')],
      ['jump', 'JUMP', () => this.input.queueAction('jump')],
      ['gather', 'GATHER', () => this.input.queueAction('gather')],
      ['attack', 'ATTACK', () => this.input.queueAction('attack')],
    ];
    for (const [cls, label, fn] of defs) {
      const b = document.createElement('div');
      b.className = `btn ${cls}`;
      b.textContent = label;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        fn();
      });
      actions.appendChild(b);
    }
    this.root.appendChild(actions);
  }

  showToast(msg: string) {
    this.toast.textContent = msg;
    this.toast.classList.add('show');
    this.toastTimer = 1.4;
  }

  showBanner(msg: string, night: boolean) {
    this.banner.textContent = msg;
    this.banner.className = `banner show ${night ? 'night' : 'day'}`;
    setTimeout(() => this.banner.classList.remove('show'), 2600);
  }

  update(dt: number) {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toast.classList.remove('show');
    }
  }

  private refresh() {
    this.resEls.wood.textContent = String(this.state.inventory.wood);
    this.resEls.stone.textContent = String(this.state.inventory.stone);
    this.resEls.gold.textContent = String(this.state.inventory.gold);
    this.resEls.gems.textContent = String(this.state.inventory.gems);
    this.healthFill.style.width = `${(this.state.health / this.state.maxHealth) * 100}%`;
    this.dayEl.textContent = `Day ${this.state.day}`;
    this.phaseEl.textContent = this.state.isNight ? 'NIGHT' : 'DAY';
  }
}
