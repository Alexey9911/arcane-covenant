import * as THREE from 'three';

const PITCH = 0.94; // rad desde la horizontal (~54°): lectura MMO top-down

/** Cámara MMO top-down: follow suave, look-ahead hacia el cursor, zoom y shake. */
export class CameraRig {
  private readonly camera: THREE.PerspectiveCamera;
  private readonly target = new THREE.Vector3();
  private readonly lookTarget = new THREE.Vector3();
  private dist = 26;
  private distGoal = 26;
  private trauma = 0;
  private readonly tmp = new THREE.Vector3();
  // modo cinemático (onboarding): posición/mirada explícitas con damping
  private cinematic = false;
  private readonly cinePos = new THREE.Vector3();
  private readonly cineLook = new THREE.Vector3();
  private readonly curPos = new THREE.Vector3();
  private readonly curLook = new THREE.Vector3();
  private cineSpeed = 2.2;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    camera.position.set(0, 20, 16);
  }

  zoomBy(delta: number): void {
    this.distGoal = THREE.MathUtils.clamp(this.distGoal + delta, 15, 36);
  }

  addTrauma(amount: number): void {
    this.trauma = Math.min(1.2, this.trauma + amount);
  }

  /** Coloca la cámara YA sobre el objetivo (sin barrido ni lerp desde donde estuviera). */
  snapTo(pos: THREE.Vector3): void {
    this.cinematic = false;
    this.trauma = 0;
    this.target.copy(pos);
    this.lookTarget.copy(pos);
    const y = Math.sin(PITCH) * this.dist;
    const z = Math.cos(PITCH) * this.dist;
    this.camera.position.set(pos.x, y + pos.y, pos.z + z);
    this.camera.rotation.set(0, 0, 0);
    this.camera.lookAt(pos.x, pos.y, pos.z);
  }

  /** Activa modo cinemático: la cámara fluye hacia pos mirando a look. */
  setCinematic(pos: THREE.Vector3, look: THREE.Vector3, speed = 2.2): void {
    if (!this.cinematic) {
      this.curPos.copy(this.camera.position);
      this.curLook.copy(this.lookTarget);
    }
    this.cinematic = true;
    this.cinePos.copy(pos);
    this.cineLook.copy(look);
    this.cineSpeed = speed;
  }

  clearCinematic(): void {
    this.cinematic = false;
  }

  /** Update del modo cinemático (llamar en vez de update() durante onboarding). */
  updateCinematic(dt: number): void {
    if (!this.cinematic) return;
    const k = 1 - Math.exp(-dt * this.cineSpeed);
    this.curPos.lerp(this.cinePos, k);
    this.curLook.lerp(this.cineLook, k);
    this.camera.position.copy(this.curPos);
    this.camera.lookAt(this.curLook);
    this.camera.rotation.z = 0;
  }

  update(dt: number, focus: THREE.Vector3, aim: THREE.Vector3 | null, t: number): void {
    // follow con lag suave
    const followK = 1 - Math.exp(-dt * 6);
    this.target.lerp(focus, followK);

    // look-ahead: 18% del vector hacia el cursor, clamp 3.2m
    this.tmp.copy(this.target);
    if (aim) {
      const dx = aim.x - focus.x, dz = aim.z - focus.z;
      const len = Math.hypot(dx, dz);
      const ahead = Math.min(len * 0.18, 3.2);
      if (len > 0.01) {
        this.tmp.x += (dx / len) * ahead;
        this.tmp.z += (dz / len) * ahead;
      }
    }
    this.lookTarget.lerp(this.tmp, 1 - Math.exp(-dt * 4));

    this.dist += (this.distGoal - this.dist) * (1 - Math.exp(-dt * 8));

    // shake: trauma^2, ruido pseudo-perlin barato
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const sh = this.trauma * this.trauma;
    const n1 = Math.sin(t * 47.3) * 0.6 + Math.sin(t * 31.7 + 2.1) * 0.4;
    const n2 = Math.sin(t * 39.1 + 4.7) * 0.6 + Math.sin(t * 27.3 + 1.3) * 0.4;
    const shakeX = n1 * sh * 0.55;
    const shakeZ = n2 * sh * 0.45;

    const y = Math.sin(PITCH) * this.dist;
    const z = Math.cos(PITCH) * this.dist;
    this.camera.position.set(
      this.lookTarget.x + shakeX,
      y + this.lookTarget.y,
      this.lookTarget.z + z + shakeZ,
    );
    // sin roll: el shake es solo posicional (la cámara siempre queda recta)
    this.camera.lookAt(this.lookTarget.x + shakeX * 0.5, this.lookTarget.y, this.lookTarget.z + shakeZ * 0.5);
  }
}
