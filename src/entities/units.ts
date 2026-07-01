import * as THREE from 'three';
import { CharacterVisual, createVisual, ModelSpec } from './models';
import { ClassDef, SpellDef, PLAYER_SPELLS, HERO_SPEED, HERO_RADIUS, PLAY_RADIUS, BossDef } from '../game/balance';

export interface DotEffect { dps: number; until: number; color: number; }

let nextUnitId = 1;

export class Unit {
  readonly id = nextUnitId++;
  readonly pos = new THREE.Vector3();
  facing = 0;
  hp = 100;
  maxHp = 100;
  alive = true;
  radius = HERO_RADIUS;
  moveSpeed = HERO_SPEED;
  visual: CharacterVisual | null = null;
  readonly group = new THREE.Group();
  slowFactor = 1;
  slowUntil = 0;
  dots: DotEffect[] = [];
  mitigation = 0; // 0..1 reducción de daño
  mitigationUntil = 0;
  lastSpeed01 = 0;

  constructor(readonly accent: number) {}

  async loadVisual(spec: ModelSpec): Promise<void> {
    this.visual = await createVisual(spec);
    this.group.add(this.visual.root);
  }

  get castHeight(): number { return (this.visual?.height ?? 1.7) * 0.62; }
  get headHeight(): number { return (this.visual?.height ?? 1.7) * 1.05; }

  effSpeed(now: number): number {
    return this.moveSpeed * (now < this.slowUntil ? this.slowFactor : 1);
  }

  applySlow(factor: number, duration: number, now: number): void {
    this.slowFactor = factor;
    this.slowUntil = now + duration;
  }

  applyDot(dps: number, duration: number, color: number, now: number): void {
    this.dots.push({ dps, until: now + duration, color });
  }

  /** Devuelve el daño realmente aplicado. */
  takeDamage(amount: number, now: number): number {
    if (!this.alive) return 0;
    const mit = now < this.mitigationUntil ? this.mitigation : 0;
    const dmg = amount * (1 - mit);
    this.hp = Math.max(0, this.hp - dmg);
    this.visual?.hitFlash();
    if (this.hp <= 0) this.die();
    return dmg;
  }

  heal(amount: number): number {
    if (!this.alive) return 0;
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    return this.hp - before;
  }

  die(): void {
    this.alive = false;
    this.hp = 0;
    this.dots = [];
    this.visual?.setDead(true);
  }

  revive(fraction: number): void {
    this.alive = true;
    this.hp = Math.max(1, this.maxHp * fraction);
    this.visual?.setDead(false);
  }

  /** Tick de DoTs: devuelve daño aplicado este frame. */
  tickDots(dt: number, now: number): number {
    if (!this.alive || this.dots.length === 0) return 0;
    let total = 0;
    this.dots = this.dots.filter((d) => {
      if (now > d.until) return false;
      total += d.dps * dt;
      return true;
    });
    if (total > 0) this.hp = Math.max(0.5, this.hp - total); // los DoTs no matan solos
    return total;
  }

  clampToArena(limit = PLAY_RADIUS): void {
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r > limit) {
      this.pos.x *= limit / r;
      this.pos.z *= limit / r;
    }
  }

  syncVisual(dt: number, t: number, speed01: number): void {
    this.lastSpeed01 = speed01;
    this.group.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.group.rotation.y = -this.facing + Math.PI / 2;
    if (this.visual) {
      this.visual.setMoving(speed01);
      this.visual.update(dt, t);
    }
  }
}

// ------------------------------------------------------------------ héroes
export interface CooldownState { readyAt: number; }

export class Hero extends Unit {
  mana: number;
  maxMana: number;
  spells: SpellDef[];
  cooldowns = new Map<string, number>(); // spellId -> readyAt
  castingSpell: SpellDef | null = null;
  castT = 0;
  castTotal = 0;
  castAim = new THREE.Vector3();
  channelBeam = false;
  reviveTargetId = 0;
  reviveProgress = 0;
  deadSince = 0;
  aiCooldowns = new Map<string, number>();

  constructor(readonly def: ClassDef, readonly isPlayer: boolean) {
    super(def.color);
    this.maxHp = def.maxHp;
    this.hp = def.maxHp;
    this.maxMana = def.maxMana;
    this.mana = def.maxMana;
    this.spells = this.def.id === 'mage' ? PLAYER_SPELLS : [];
    this.radius = HERO_RADIUS;
  }

  applyVitality(mult: number): void {
    const hpFrac = this.hp / this.maxHp;
    const manaFrac = this.mana / this.maxMana;
    this.maxHp = Math.round(this.def.maxHp * mult);
    this.maxMana = Math.round(this.def.maxMana * mult);
    this.hp = this.maxHp * hpFrac;
    this.mana = this.maxMana * manaFrac;
  }

  spellReady(spell: SpellDef, now: number): boolean {
    return this.alive && this.mana >= spell.manaCost && now >= (this.cooldowns.get(spell.id) ?? 0);
  }

  cooldownLeft(spell: SpellDef, now: number): number {
    return Math.max(0, (this.cooldowns.get(spell.id) ?? 0) - now);
  }

  regen(dt: number): void {
    if (!this.alive) return;
    this.mana = Math.min(this.maxMana, this.mana + this.def.manaRegen * dt);
  }

  cancelCast(): void {
    this.castingSpell = null;
    this.channelBeam = false;
    this.visual?.setCast(false);
  }

  override die(): void {
    super.die();
    this.cancelCast();
    this.reviveProgress = 0;
  }
}

// -------------------------------------------------------------------- boss
export class Boss extends Unit {
  phase = 0;
  enraged = false;
  attackCooldowns = new Map<string, number>();
  globalAttackReady = 0;
  meleeReady = 0;
  busyUntil = 0;
  aggroTargetId = 0;
  tauntUntil = 0;
  summonReady = 0;
  sweepReady = 0;
  roarPlayed = false;

  constructor(readonly def: BossDef) {
    super(def.accentColor);
    this.maxHp = def.maxHp;
    this.hp = def.maxHp;
    this.radius = def.radius;
    this.moveSpeed = def.moveSpeed;
  }

  hpFrac(): number { return this.hp / this.maxHp; }

  /** Actualiza fase según HP. Devuelve true si cambió. */
  updatePhase(): boolean {
    let p = 0;
    for (const th of this.def.phases) if (this.hpFrac() <= th) p++;
    if (p !== this.phase) {
      this.phase = p;
      return true;
    }
    return false;
  }
}

// -------------------------------------------------------------------- adds
export class Add extends Unit {
  attackReady = 0;
  constructor(hp: number, readonly damage: number, speed: number) {
    super(0xc44dff);
    this.maxHp = hp;
    this.hp = hp;
    this.moveSpeed = speed;
    this.radius = 0.5;
  }
}

// ------------------------------------------------------------- proyectiles
export interface Projectile {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  radius: number;
  damage: number;
  fromHero: boolean;
  color: number;
  maxDist: number;
  traveled: number;
  homingTarget: Unit | null;
  homingStrength: number;
  spell: SpellDef | null;
  mesh: THREE.Mesh;
  glow: THREE.Sprite;
}

export class ProjectilePool {
  readonly items: Projectile[] = [];
  private readonly root: THREE.Group;

  constructor(root: THREE.Group, glowTex: THREE.Texture, size = 28) {
    this.root = root;
    const coreGeo = new THREE.SphereGeometry(0.16, 10, 8);
    for (let i = 0; i < size; i++) {
      const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, fog: false });
      const mesh = new THREE.Mesh(coreGeo, coreMat);
      const glowMat = new THREE.SpriteMaterial({
        map: glowTex, color: 0xffffff, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      });
      const glow = new THREE.Sprite(glowMat);
      glow.scale.setScalar(1.5);
      mesh.add(glow);
      mesh.visible = false;
      root.add(mesh);
      this.items.push({
        active: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(),
        radius: 0.5, damage: 0, fromHero: true, color: 0xffffff,
        maxDist: 30, traveled: 0, homingTarget: null, homingStrength: 0,
        spell: null, mesh, glow,
      });
    }
  }

  fire(opts: {
    from: THREE.Vector3; dir: THREE.Vector3; speed: number; radius: number; damage: number;
    fromHero: boolean; color: number; maxDist?: number; homing?: Unit; homingStrength?: number;
    spell?: SpellDef; scale?: number;
  }): void {
    const p = this.items.find((x) => !x.active);
    if (!p) return;
    p.active = true;
    p.pos.copy(opts.from);
    p.vel.copy(opts.dir).normalize().multiplyScalar(opts.speed);
    p.radius = opts.radius;
    p.damage = opts.damage;
    p.fromHero = opts.fromHero;
    p.color = opts.color;
    p.maxDist = opts.maxDist ?? 34;
    p.traveled = 0;
    p.homingTarget = opts.homing ?? null;
    p.homingStrength = opts.homingStrength ?? 0;
    p.spell = opts.spell ?? null;
    p.mesh.visible = true;
    p.mesh.position.copy(p.pos);
    (p.glow.material as THREE.SpriteMaterial).color.setHex(opts.color);
    p.glow.scale.setScalar((opts.scale ?? 1) * 1.6);
    p.mesh.scale.setScalar(opts.scale ?? 1);
  }

  kill(p: Projectile): void {
    p.active = false;
    p.mesh.visible = false;
  }
}
