import * as THREE from 'three';

/** Convierte teclado/ratón/táctil en intents de juego. */
export class Input {
  private keys = new Set<string>();
  readonly mouseNdc = new THREE.Vector2(0, 0);
  /** Punto del suelo bajo el cursor — lo actualiza el juego con raycast. */
  readonly aimPoint = new THREE.Vector3(0, 0, 4);
  private slotQueue: number[] = [];
  reviveHeld = false;
  zoomDelta = 0;
  /** Joystick táctil (móvil): vector -1..1. */
  readonly touchMove = new THREE.Vector2(0, 0);
  touchActive = false;
  enabled = true;

  attach(el: HTMLElement): void {
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      const k = e.key.toLowerCase();
      if (k === ' ') e.preventDefault();
      this.keys.add(k);
      if (k >= '1' && k <= '4') this.slotQueue.push(parseInt(k, 10) - 1);
      if (k === 'e') this.reviveHeld = true;
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      this.keys.delete(k);
      if (k === 'e') this.reviveHeld = false;
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.reviveHeld = false;
      this.touchActive = false;
    });
    el.addEventListener('pointermove', (e) => {
      this.mouseNdc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    });
    el.addEventListener('wheel', (e) => {
      this.zoomDelta += Math.sign(e.deltaY) * 2.2;
      e.preventDefault();
    }, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Cola de casts pedidos (slots 0-3) desde teclado o botones táctiles. */
  queueSlot(slot: number): void {
    if (this.enabled) this.slotQueue.push(slot);
  }

  consumeSlots(): number[] {
    const q = this.slotQueue;
    this.slotQueue = [];
    return q;
  }

  consumeZoom(): number {
    const z = this.zoomDelta;
    this.zoomDelta = 0;
    return z;
  }

  /** Movimiento WASD/flechas en ejes de mundo (cámara mira al norte). */
  moveVec(out: THREE.Vector2): THREE.Vector2 {
    out.set(0, 0);
    if (!this.enabled) return out;
    if (this.keys.has('w') || this.keys.has('arrowup')) out.y -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) out.y += 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) out.x -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) out.x += 1;
    if (this.touchActive && this.touchMove.lengthSq() > 0.04) {
      out.x = this.touchMove.x;
      out.y = this.touchMove.y;
    }
    if (out.lengthSq() > 1) out.normalize();
    return out;
  }
}
