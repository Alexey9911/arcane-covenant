import * as THREE from 'three';
import { Engine } from '../core/engine';
import { Input } from '../core/input';
import { CameraRig } from '../core/camera';
import { Environment } from '../world/environment';
import { VfxSystem, TelegraphHandle, BeamHandle } from '../vfx/vfx';
import { AudioSystem } from '../systems/audio';
import { Materials } from '../assets/materials';
import { Hero, Boss, Add, ProjectilePool, Unit } from '../entities/units';
import { updateCompanion, updateBossAI, updateAdds, steerTo } from './ai';
import type { Hud } from '../ui/hud';
import type { Screens } from '../ui/screens';
import { bumpStats } from '../ui/screens';
import {
  CLASSES, BOSSES, SpellDef, BossAttackDef, BossDef,
  PLAY_RADIUS, REVIVE_TIME, REVIVE_RANGE, REVIVE_HP_FRACTION,
  GOLD_PER_BOSS, GOLD_DEFEAT_CONSOLATION, UPGRADES, upgradeCost, ClassId,
  BOSS_DIALOGUE, BOSS_HEAL_ON_KILL, DialogueKey,
} from './balance';
import { PAL } from './palette';
import type { ReticleHandle } from '../vfx/vfx';

export type GameFlowState =
  | 'title' | 'setup' | 'lobby' | 'loading' | 'intro' | 'combat' | 'victory' | 'market' | 'defeat' | 'runComplete';

export type SetupStep = 'nick' | 'avatar' | 'ready';

const CLASS_ORDER: ClassId[] = ['mage', 'warrior', 'cleric', 'ranger'];

interface PendingStrike {
  handle: TelegraphHandle;
  t: number;
  dur: number;
  shape: 'circle' | 'ring' | 'cone';
  pos: THREE.Vector3;
  radius: number;
  inner: number;
  angle: number;
  dir: number;
  damage: number;
  resolveSound?: string;
  persistDps?: number;
  persistTime?: number;
  slow?: { factor: number; duration: number };
  color: number;
}

interface DamageZone {
  handle: TelegraphHandle;
  pos: THREE.Vector3;
  radius: number;
  dps: number;
  until: number;
  slow?: { factor: number; duration: number };
  tickAcc: number;
}

interface SweepState {
  beam: BeamHandle;
  angle: number;
  until: number;
  dps: number;
  length: number;
  width: number;
  rotSpeed: number;
}

export class Game {
  state: GameFlowState = 'title';
  now = 0;
  time = 0;
  playRadius = PLAY_RADIUS;

  heroes: Hero[] = [];
  boss: Boss | null = null;
  adds: Add[] = [];
  projectiles: ProjectilePool;

  private strikes: PendingStrike[] = [];
  private zones: DamageZone[] = [];
  private sweep: SweepState | null = null;
  private shrinkZoneHandle: TelegraphHandle | null = null;
  private shrinkActive = false;

  // run / economía
  bossIndex = 0;
  gold = 0;
  upgrades: Record<string, number> = { damage: 0, cdr: 0, vitality: 0, revive: 0 };

  private introT = 0;
  private ambience: { stop(): void } | null = null;
  private playerBeam: BeamHandle | null = null;
  // selección de personaje / onboarding
  playerIndex = 0;
  nickname = localStorage.getItem('ac_nick') ?? '';
  setupStep: SetupStep = 'nick';
  private selectRing: THREE.Mesh | null = null;
  private reticle: ReticleHandle | null = null;
  private deathPulseT = 0;
  private beamTickAcc = 0;
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private corpseRings = new Map<number, TelegraphHandle>();
  private zoneTickText = 0;

  constructor(
    readonly engine: Engine,
    readonly env: Environment,
    readonly vfx: VfxSystem,
    readonly audio: AudioSystem,
    readonly input: Input,
    readonly camera: CameraRig,
    readonly hud: Hud,
    readonly screens: Screens,
    readonly mats: Materials,
  ) {
    this.projectiles = new ProjectilePool(this.vfx.root, mats.glowTex);
    this.createHeroes();
  }

  get player(): Hero { return this.heroes[this.playerIndex]; }
  get partyDamageMult(): number { return 1 + this.upgrades.damage * 0.12; }
  get cooldownMult(): number { return Math.max(0.55, 1 - this.upgrades.cdr * 0.08); }
  get vitalityMult(): number { return 1 + this.upgrades.vitality * 0.15; }
  get reviveTime(): number { return REVIVE_TIME * Math.pow(0.8, this.upgrades.revive); }

  private createHeroes(): void {
    const order: ClassId[] = ['mage', 'warrior', 'cleric', 'ranger'];
    for (const id of order) {
      const hero = new Hero(CLASSES[id], id === 'mage');
      this.engine.scene.add(hero.group);
      hero.group.visible = false;
      void hero.loadVisual({ key: `hero_${id}`, height: id === 'mage' ? 1.95 : id === 'warrior' ? 1.9 : 1.78, accent: CLASSES[id].color, rigged: true });
      this.heroes.push(hero);
    }
  }

  // ============================================================ flujo/estados
  enterLobby(): void {
    this.state = 'lobby';
    this.hud.setVisible(false);
    this.screens.show('lobby');
  }

  // ----------------------------------------------------- onboarding / setup
  /** Escenifica la arena para el onboarding: héroes en fila + boss al fondo. */
  async enterSetup(step: SetupStep): Promise<void> {
    this.clearBattlefield();
    this.engine.setDeathFx(0);
    this.hud.setVisible(false);
    this.state = 'setup';
    this.setupStep = step;

    // héroes en fila mirando a cámara (sur)
    this.heroes.forEach((h, i) => {
      h.revive(1);
      h.pos.set((i - 1.5) * 3.4, 0, 10.5);
      h.facing = Math.PI / 2; // hacia +z (cámara)
      h.group.visible = true;
      h.cancelCast();
      h.syncVisual(0.016, this.time, 0);
    });

    // boss de la ronda actual al fondo, de atrezzo
    const def = BOSSES[this.bossIndex];
    const boss = new Boss(def);
    boss.pos.set(0, 0, -9);
    boss.facing = Math.PI / 2;
    this.engine.scene.add(boss.group);
    this.boss = boss;
    void boss.loadVisual({
      key: def.modelKey, height: def.scale * 1.9, accent: def.accentColor,
      rigged: def.modelKey !== 'boss_lich',
    }).then(() => boss.syncVisual(0.016, this.time, 0));

    // anillo de selección (runas giratorias)
    if (!this.selectRing) {
      const mat = new THREE.MeshBasicMaterial({
        map: this.mats.runeTex, color: 0xffffff, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      });
      this.selectRing = new THREE.Mesh(new THREE.CircleGeometry(1.45, 48), mat);
      this.selectRing.rotation.x = -Math.PI / 2;
      this.selectRing.position.y = 0.06;
      this.selectRing.renderOrder = 3;
      this.engine.scene.add(this.selectRing);
    }
    this.selectRing.visible = false;
    if (!this.ambience) this.ambience = this.audio.loop('ambience_arena', { group: 'amb', volume: 0.8, fadeIn: 1.5 });
  }

  setSetupStep(step: SetupStep): void {
    this.setupStep = step;
    if (this.selectRing) this.selectRing.visible = step === 'avatar';
  }

  cycleClass(dir: number): ClassId {
    this.playerIndex = (this.playerIndex + dir + 4) % 4;
    this.heroes.forEach((h, i) => { h.isPlayer = i === this.playerIndex; });
    this.audio.play('ui_hover', { group: 'ui' });
    return this.heroes[this.playerIndex].def.id;
  }

  setNickname(nick: string): void {
    this.nickname = nick.slice(0, 16);
    localStorage.setItem('ac_nick', this.nickname);
    this.heroes.forEach((h) => { h.nickname = h.isPlayer ? this.nickname : ''; });
  }

  /** Todos listos: a la arena. */
  async beginBattle(): Promise<void> {
    this.audio.play('ui_join', { group: 'ui' });
    this.camera.clearCinematic();
    this.state = 'loading';
    this.screens.show('loading');
    await this.startMatch(this.bossIndex);
  }

  private updateSetup(dt: number): void {
    const t = this.time;
    for (const h of this.heroes) h.syncVisual(dt, t, 0);
    if (this.boss) this.boss.syncVisual(dt, t, 0);

    const sel = this.heroes[this.playerIndex];
    if (this.setupStep === 'nick') {
      // órbita lenta mostrando el campo de batalla completo
      const a = t * 0.07;
      this.camera.setCinematic(
        new THREE.Vector3(Math.sin(a) * 30, 14, Math.cos(a) * 30),
        new THREE.Vector3(0, 1.2, 0), 1.6,
      );
    } else if (this.setupStep === 'avatar') {
      // plano cercano frente al héroe seleccionado
      this.camera.setCinematic(
        new THREE.Vector3(sel.pos.x * 0.85, 2.6, sel.pos.z + 6.8),
        new THREE.Vector3(sel.pos.x, 1.15, sel.pos.z), 3.2,
      );
      if (this.selectRing) {
        this.selectRing.visible = true;
        this.selectRing.position.x += (sel.pos.x - this.selectRing.position.x) * (1 - Math.exp(-dt * 9));
        this.selectRing.position.z = sel.pos.z;
        this.selectRing.rotation.z = t * 0.5;
        const mat = this.selectRing.material as THREE.MeshBasicMaterial;
        mat.color.setHex(sel.def.color);
        mat.opacity = 0.65 + Math.sin(t * 3.5) * 0.25;
        // motas ascendiendo alrededor del elegido
        this.vfx.reviveChannel(sel.pos, dt * 0.7);
      }
    } else {
      // ready: plano general del equipo con el boss al fondo
      this.camera.setCinematic(
        new THREE.Vector3(0, 7.5, 21.5),
        new THREE.Vector3(0, 1.6, -2), 2.0,
      );
      if (this.selectRing) this.selectRing.visible = false;
    }
    this.camera.updateCinematic(dt);
  }

  async joinMatch(): Promise<void> {
    this.audio.play('ui_join', { group: 'ui' });
    this.state = 'loading';
    this.screens.show('loading');
    await this.startMatch(this.bossIndex);
  }

  private async startMatch(bossIndex: number): Promise<void> {
    this.clearBattlefield();
    // reset héroes
    const spread = [
      new THREE.Vector3(0, 0, 9),
      new THREE.Vector3(-2.6, 0, 6.5),
      new THREE.Vector3(2.6, 0, 6.8),
      new THREE.Vector3(0, 0, 4.6),
    ];
    this.heroes.forEach((h, i) => {
      h.revive(1);
      h.applyVitality(this.vitalityMult);
      h.hp = h.maxHp;
      h.mana = h.maxMana;
      h.pos.copy(spread[i]);
      h.facing = -Math.PI / 2;
      h.cooldowns.clear();
      h.aiCooldowns.clear();
      h.reviveTargetId = 0;
      h.reviveProgress = 0;
      h.cancelCast();
      h.group.visible = true;
      h.syncVisual(0.016, this.time, 0);
    });

    // crear boss
    const def = BOSSES[bossIndex];
    const boss = new Boss(def);
    boss.pos.set(0, 0, -8);
    boss.facing = Math.PI / 2;
    this.engine.scene.add(boss.group);
    await boss.loadVisual({ key: def.modelKey, height: def.scale * 1.9, accent: def.accentColor, rigged: def.modelKey !== 'boss_lich' });
    boss.syncVisual(0.016, this.time, 0);
    this.boss = boss;

    // nickname + reticle de puntería del color de la clase elegida
    this.heroes.forEach((h) => { h.nickname = h.isPlayer ? this.nickname : ''; });
    if (!this.reticle) this.reticle = this.vfx.reticle(this.player.def.color);
    this.reticle.setColor(this.player.def.color);
    this.reticle.setVisible(true);
    if (this.selectRing) this.selectRing.visible = false;

    this.camera.clearCinematic();
    this.camera.snapTo(this.player.pos);
    this.screens.show(null);
    this.hud.setVisible(true);
    this.hud.setupMatch(this.heroes, def, bossIndex, this.gold);
    this.state = 'intro';
    this.introT = 0;
    if (!this.ambience) this.ambience = this.audio.loop('ambience_arena', { group: 'amb', volume: 0.8, fadeIn: 1.5 });
    this.hud.banner(`${def.name}`, def.title);
  }

  // ------------------------------------------------------------- diálogos
  bossSpeak(key: DialogueKey): void {
    const boss = this.boss;
    if (!boss) return;
    const text = BOSS_DIALOGUE[boss.def.id]?.[key];
    if (!text) return;
    const dur = this.audio.play(`voice/${boss.def.id}_${key}` as never, { volume: 1, throttleMs: 500 }) || 2.8;
    this.audio.muteBossUntil = performance.now() + (dur + 0.4) * 1000;
    this.hud.bossDialogue(boss.def.name, text, dur + 1.0, boss.def.portrait);
  }

  private clearBattlefield(): void {
    for (const s of this.strikes) s.handle.dispose();
    this.strikes = [];
    for (const z of this.zones) z.handle.dispose();
    this.zones = [];
    this.sweep?.beam.end();
    this.sweep = null;
    this.playerBeam?.end();
    this.playerBeam = null;
    this.shrinkZoneHandle?.dispose();
    this.shrinkZoneHandle = null;
    this.shrinkActive = false;
    for (const p of this.projectiles.items) if (p.active) this.projectiles.kill(p);
    for (const a of this.adds) this.engine.scene.remove(a.group);
    this.adds = [];
    for (const [, ring] of this.corpseRings) ring.dispose();
    this.corpseRings.clear();
    if (this.boss) {
      this.engine.scene.remove(this.boss.group);
      this.boss = null;
    }
    this.env.setThreat(0);
    this.engine.setDeathFx(0);
    this.reticle?.setVisible(false);
    this.hud.updateDeathUI(null, null, null);
    this.hud.prompt(null);
  }

  private victory(): void {
    const reward = Math.round(GOLD_PER_BOSS[this.bossIndex] * (1 + this.bossIndex * 0.1));
    this.gold += reward;
    this.state = 'victory';
    this.audio.play('victory_stinger', { volume: 0.9 });
    this.clearBattlefieldSoft();
    const isRunComplete = this.bossIndex >= BOSSES.length - 1;
    bumpStats({ bossKills: 1, goldEarned: reward, victories: isRunComplete ? 1 : 0 });
    this.hud.chatSystem(`⚔ ${BOSSES[this.bossIndex].name} derrotado (+${reward} oro)`);
    setTimeout(() => {
      if (isRunComplete) {
        this.screens.show('runComplete', { gold: this.gold });
      } else {
        this.screens.show('victory', { reward, boss: BOSSES[this.bossIndex] });
      }
    }, 1600);
  }

  /** Limpia amenazas pero deja la escena (para saborear la victoria). */
  private clearBattlefieldSoft(): void {
    for (const s of this.strikes) s.handle.dispose();
    this.strikes = [];
    for (const z of this.zones) z.handle.dispose();
    this.zones = [];
    this.sweep?.beam.end();
    this.sweep = null;
    this.playerBeam?.end();
    this.playerBeam = null;
    this.shrinkZoneHandle?.dispose();
    this.shrinkZoneHandle = null;
    this.shrinkActive = false;
    for (const a of this.adds) { if (a.alive) { a.die(); this.vfx.deathBurst(a.pos, PAL.boss.add); } }
    this.env.setThreat(0);
    this.hud.prompt(null);
  }

  private defeat(): void {
    this.state = 'defeat';
    this.gold += GOLD_DEFEAT_CONSOLATION;
    this.audio.play('defeat_stinger', { volume: 0.9 });
    this.engine.setDeathFx(0.6);
    bumpStats({ defeats: 1, goldEarned: GOLD_DEFEAT_CONSOLATION });
    setTimeout(() => {
      this.screens.show('defeat', { consolation: GOLD_DEFEAT_CONSOLATION });
    }, 1800);
  }

  /** Desde la pantalla de victoria. */
  toMarket(): void {
    this.state = 'market';
    this.screens.show('market', { game: this });
  }

  /** Compra en el mercado. Devuelve true si se aplicó. */
  buyUpgrade(id: string): boolean {
    const def = UPGRADES.find((u) => u.id === id);
    if (!def) return false;
    const lvl = this.upgrades[id] ?? 0;
    if (lvl >= def.maxLevel) return false;
    const cost = upgradeCost(def, lvl);
    if (this.gold < cost) return false;
    this.gold -= cost;
    this.upgrades[id] = lvl + 1;
    this.audio.play('ui_buy', { group: 'ui' });
    if (id === 'vitality') this.heroes.forEach((h) => h.applyVitality(this.vitalityMult));
    return true;
  }

  /** Desde el mercado: siguiente boss. */
  async nextBoss(): Promise<void> {
    this.bossIndex = Math.min(this.bossIndex + 1, BOSSES.length - 1);
    this.state = 'loading';
    this.screens.show('loading');
    await this.startMatch(this.bossIndex);
  }

  /** Tras derrota o run completa: al setup (elegir avatar), la run se reinicia. */
  backToLobby(fullReset = false): void {
    this.clearBattlefield();
    this.bossIndex = 0;
    if (fullReset) {
      this.gold = 0;
      this.upgrades = { damage: 0, cdr: 0, vitality: 0, revive: 0 };
    }
    void this.enterSetup('avatar');
    this.screens.show('setup', { game: this, step: 'avatar' });
  }

  // ================================================================= update
  update(dt: number, t: number): void {
    this.time = t;
    this.now = t;

    switch (this.state) {
      case 'setup': this.updateSetup(dt); break;
      case 'intro': this.updateIntro(dt); break;
      case 'combat': this.updateCombat(dt); break;
      case 'victory':
      case 'defeat':
        this.updateAmbientOnly(dt);
        break;
      default: break;
    }

    this.env.update(dt, t);
    this.vfx.update(dt, t, this.engine.camera.position);
    this.hud.tick(dt);
  }

  private updateIntro(dt: number): void {
    this.introT += dt;
    const boss = this.boss;
    if (boss) {
      boss.syncVisual(dt, this.time, 0);
      if (this.introT > 0.6 && !boss.roarPlayed) {
        boss.roarPlayed = true;
        this.audio.play('boss_roar', { volume: 1 });
        this.camera.addTrauma(0.55);
        this.vfx.shockwave(boss.pos, boss.def.accentColor, 8, 0.9);
        setTimeout(() => this.bossSpeak('intro'), 900);
      }
      this.camera.update(dt, boss.pos, null, this.time);
    }
    for (const h of this.heroes) h.syncVisual(dt, this.time, 0);
    if (this.introT > 2.6) {
      this.state = 'combat';
      this.camera.snapTo(this.player.pos);
    }
  }

  private updateAmbientOnly(dt: number): void {
    for (const h of this.heroes) if (h.alive) h.syncVisual(dt, this.time, h.lastSpeed01 * 0);
    if (this.boss?.alive) this.boss.syncVisual(dt, this.time, 0);
    const focus = this.player.alive ? this.player.pos : (this.boss?.pos ?? this.player.pos);
    this.camera.update(dt, focus, null, this.time);
  }

  private updateCombat(dt: number): void {
    const now = this.now;

    this.updateAim();
    this.updatePlayer(dt);
    for (const h of this.heroes) if (!h.isPlayer) updateCompanion(h, this, dt);
    if (this.boss) updateBossAI(this.boss, this, dt);
    updateAdds(this, dt);
    this.updateProjectiles(dt);
    this.updateStrikes(dt);
    this.updateZones(dt);
    this.updateSweep(dt);
    this.updateShrink(dt);
    this.updateRevives(dt);
    this.updateDots(dt);
    this.separateUnits();

    for (const h of this.heroes) h.regen(dt);

    // cámara
    const focus = this.player.alive ? this.player.pos : this.deadPlayerFocus();
    this.camera.zoomBy(this.input.consumeZoom());
    this.camera.update(dt, focus, this.player.alive ? this.input.aimPoint : null, this.time);

    // luz de amenaza sigue al boss en enrage
    if (this.boss?.enraged) this.env.setThreat(0.7 + Math.sin(this.time * 6) * 0.2, this.boss.pos);

    // --- UX de muerte del jugador: mundo en B/N + pulso dorado + guía ---
    const playerDead = !this.player.alive;
    this.engine.setDeathFx(playerDead ? 1 : 0);
    if (playerDead) {
      this.deathPulseT -= dt;
      if (this.deathPulseT <= 0) {
        this.deathPulseT = 1.15;
        this.vfx.shockwave(this.player.pos, 0xffe9a3, 3.8, 1.0);
        this.vfx.flashLight(this.player.pos, 0xffe9a3, 34, 0.6);
      }
      const reviver = this.heroes.find((h) => h.alive && h.reviveTargetId === this.player.id);
      const remaining = reviver ? Math.max(0, (1 - reviver.reviveProgress) * this.reviveTime) : null;
      this.hud.updateDeathUI(this.player.pos, reviver ? reviver.displayName : null, remaining);
    } else {
      this.hud.updateDeathUI(null, null, null);
    }

    // HUD
    this.hud.updateCombat(this, dt);

    // condiciones de fin
    if (this.boss && !this.boss.alive && this.state === 'combat') {
      this.victory();
      return;
    }
    if (this.heroes.every((h) => !h.alive) && this.state === 'combat') {
      this.defeat();
    }
  }

  private deadPlayerFocus(): THREE.Vector3 {
    const alive = this.heroes.find((h) => h.alive);
    return alive ? alive.pos : this.player.pos;
  }

  // ============================================================ jugador
  private updateAim(): void {
    this.raycaster.setFromCamera(this.input.mouseNdc, this.engine.camera);
    const hit = this.raycaster.ray.intersectPlane(this.groundPlane, this.tmp);
    if (hit) this.input.aimPoint.copy(hit);
    // reticle: dónde caerá el hechizo
    if (this.reticle) {
      this.reticle.setVisible(this.state === 'combat' && this.player.alive);
      this.reticle.setPos(this.input.aimPoint);
    }
  }

  private updatePlayer(dt: number): void {
    const p = this.player;
    const now = this.now;
    if (!p.alive) return;

    const move = this.input.moveVec(new THREE.Vector2());
    const moving = move.lengthSq() > 0.001;

    // canal de revive del jugador
    if (p.reviveTargetId) {
      if (!this.input.reviveHeld || moving) this.stopRevive(p);
    }

    // casteo con barra: moverse lo cancela
    if (p.castingSpell && p.castTotal > 0 && moving) {
      this.hud.combatText(p.pos, 'Interrumpido', '#8a8798', false);
      this.cancelPlayerCast();
    }

    // movimiento
    if (moving && !p.castingSpell && !p.reviveTargetId) {
      const sp = p.effSpeed(now);
      p.pos.x += move.x * sp * dt;
      p.pos.z += move.y * sp * dt;
      p.facing = Math.atan2(move.y, move.x);
      p.clampToArena(this.playRadius);
    }

    // procesar casts pedidos
    for (const slot of this.input.consumeSlots()) {
      const spell = p.spells[slot];
      if (!spell) continue;
      this.tryPlayerCast(spell);
    }

    // progreso de cast
    if (p.castingSpell) {
      p.castT += dt;
      p.facing = Math.atan2(this.input.aimPoint.z - p.pos.z, this.input.aimPoint.x - p.pos.x);
      if (p.castingSpell.kind === 'beam') {
        this.updatePlayerBeam(dt);
      }
      if (p.castT >= p.castTotal) {
        const spell = p.castingSpell;
        this.finishPlayerCast(spell);
      }
    }

    // intento de revive con E
    if (this.input.reviveHeld && !p.reviveTargetId && !p.castingSpell) {
      const corpse = this.nearestCorpse(p);
      if (corpse) this.startRevive(p, corpse);
    }

    const speed01 = moving && !p.castingSpell && !p.reviveTargetId ? 1 : 0;
    p.syncVisual(dt, this.time, speed01);
  }

  private nearestCorpse(hero: Hero): Hero | null {
    let best: Hero | null = null;
    let bd = REVIVE_RANGE;
    for (const h of this.heroes) {
      if (h.alive) continue;
      const d = Math.hypot(h.pos.x - hero.pos.x, h.pos.z - hero.pos.z);
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }

  private tryPlayerCast(spell: SpellDef): void {
    const p = this.player;
    const now = this.now;
    if (p.castingSpell || p.reviveTargetId) return;
    if (!p.spellReady(spell, now)) {
      this.audio.play('ui_hover', { group: 'ui', volume: 0.5 });
      return;
    }
    p.mana -= spell.manaCost;
    p.cooldowns.set(spell.id, now + spell.cooldown * this.cooldownMult);
    p.castAim.copy(this.input.aimPoint);
    p.facing = Math.atan2(p.castAim.z - p.pos.z, p.castAim.x - p.pos.x);

    if (spell.castTime > 0) {
      p.castingSpell = spell;
      p.castT = 0;
      p.castTotal = spell.castTime;
      p.visual?.setCast(true);
      if (spell.kind === 'beam') {
        this.audio.play(spell.castSound as never, { volume: 0.85 });
        this.playerBeam = this.vfx.beam(spell.color, 0.55);
        this.beamTickAcc = 0;
      } else if (spell.kind === 'groundAoe') {
        this.audio.play((spell.castSound ?? 'meteor_incoming') as never, { volume: 0.9 });
        // telegraph propio del AoE (color del hechizo, no rojo enemigo)
        const h = this.vfx.telegraph('circle', p.castAim, spell.radius ?? 5, { color: spell.color });
        this.strikes.push({
          handle: h, t: -spell.castTime, dur: 0.9, shape: 'circle',
          pos: p.castAim.clone(), radius: spell.radius ?? 5, inner: 0, angle: 0, dir: 0,
          damage: 0, color: spell.color, resolveSound: undefined,
        });
      }
    } else {
      this.resolvePlayerSpell(spell);
    }
  }

  private cancelPlayerCast(): void {
    const p = this.player;
    if (!p.castingSpell) return;
    // devuelve parte del maná y resetea el cd si se interrumpe
    p.mana = Math.min(p.maxMana, p.mana + p.castingSpell.manaCost * 0.6);
    p.cooldowns.set(p.castingSpell.id, this.now + 1.2);
    if (p.castingSpell.kind === 'beam') {
      this.playerBeam?.end();
      this.playerBeam = null;
    }
    p.cancelCast();
  }

  private finishPlayerCast(spell: SpellDef): void {
    const p = this.player;
    p.castingSpell = null;
    p.visual?.setCast(false);
    if (spell.kind === 'beam') {
      this.playerBeam?.end();
      this.playerBeam = null;
      return; // el daño ya se aplicó en ticks
    }
    this.resolvePlayerSpell(spell);
  }

  private resolvePlayerSpell(spell: SpellDef): void {
    const p = this.player;
    const dmg = spell.power * this.partyDamageMult;
    switch (spell.kind) {
      case 'projectile': {
        this.audio.play(spell.castSound as never, { volume: 0.9 });
        this.vfx.castSparks(this.tmp.set(p.pos.x, p.castHeight, p.pos.z), spell.color);
        const n = spell.count ?? 1;
        for (let i = 0; i < n; i++) {
          this.tmp2.copy(p.castAim).sub(p.pos);
          this.tmp2.y = 0;
          this.tmp2.normalize();
          if (n > 1) {
            const a = (i - (n - 1) / 2) * 0.14;
            const cos = Math.cos(a), sin = Math.sin(a);
            const x = this.tmp2.x * cos - this.tmp2.z * sin;
            const z = this.tmp2.x * sin + this.tmp2.z * cos;
            this.tmp2.set(x, 0, z);
          }
          this.projectiles.fire({
            from: this.tmp.set(p.pos.x, p.castHeight, p.pos.z),
            dir: this.tmp2.clone(), speed: spell.speed ?? 24, radius: spell.radius ?? 1.2,
            damage: dmg, fromHero: true, color: spell.color, spell, scale: n > 1 ? 0.9 : 1.25,
          });
        }
        break;
      }
      case 'nova': {
        this.audio.play(spell.castSound as never, { volume: 0.95 });
        this.vfx.nova(p.pos, spell.color, spell.radius ?? 6);
        this.camera.addTrauma(0.28);
        this.damageEnemiesInCircle(p.pos, spell.radius ?? 6, dmg, spell);
        break;
      }
      case 'groundAoe': {
        const target = p.castAim.clone();
        this.vfx.bigImpact(target, spell.color, spell.radius ?? 5);
        this.audio.play((spell.impactSound ?? 'meteor_impact') as never, { volume: 1 });
        this.camera.addTrauma(0.75);
        this.engine.pulseChroma(0.8);
        this.damageEnemiesInCircle(target, spell.radius ?? 5, dmg, spell);
        break;
      }
      case 'melee': {
        this.audio.play((spell.castSound ?? 'shield_slam') as never, { volume: 0.9 });
        this.vfx.shockwave(p.pos, spell.color, spell.range, 0.35);
        const targets: Unit[] = [];
        if (this.boss?.alive) targets.push(this.boss);
        for (const a of this.adds) if (a.alive) targets.push(a);
        for (const u of targets) {
          const d = Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z);
          if (d > spell.range + u.radius) continue;
          let diff = Math.atan2(u.pos.z - p.pos.z, u.pos.x - p.pos.x) - p.facing;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          if (Math.abs(diff) < Math.PI / 2) {
            this.vfx.impact(this.tmp.set(u.pos.x, u.castHeight * 0.6, u.pos.z), spell.color, 1);
            this.damageEnemy(u, dmg, spell.color);
          }
        }
        this.camera.addTrauma(0.18);
        break;
      }
      case 'taunt': {
        this.applyTaunt(p);
        p.mitigation = Math.max(p.mitigation, 0.3);
        p.mitigationUntil = this.now + 3;
        break;
      }
      case 'buff': {
        p.mitigation = spell.power;
        p.mitigationUntil = this.now + 5;
        this.audio.play((spell.castSound ?? 'shield_slam') as never, { volume: 0.8 });
        this.vfx.nova(p.pos, spell.color, 2.4);
        break;
      }
      case 'heal': {
        // smart-cast: el aliado vivo con menos vida (incluyéndote) dentro de rango
        const target = this.heroes
          .filter((h) => h.alive && Math.hypot(h.pos.x - p.pos.x, h.pos.z - p.pos.z) <= spell.range)
          .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0] ?? p;
        const healed = target.heal(spell.power);
        this.audio.play((spell.castSound ?? 'heal_cast') as never, { volume: 0.85 });
        this.vfx.healBurst(target.pos);
        if (healed > 0) {
          this.hud.combatText(this.tmp.set(target.pos.x, target.headHeight, target.pos.z), `+${Math.round(healed)}`, '#7dff8a', false);
        }
        break;
      }
      case 'groupHeal': {
        this.audio.play((spell.castSound ?? 'holy_nova') as never, { volume: 0.9 });
        this.vfx.nova(p.pos, spell.color, spell.radius ?? 10);
        for (const h of this.heroes) {
          if (!h.alive) continue;
          const d = Math.hypot(h.pos.x - p.pos.x, h.pos.z - p.pos.z);
          if (d <= (spell.radius ?? 10)) {
            const healed = h.heal(spell.power);
            if (healed > 0) this.hud.combatText(this.tmp.set(h.pos.x, h.headHeight, h.pos.z), `+${Math.round(healed)}`, '#7dff8a', false);
          }
        }
        break;
      }
      default: break;
    }
  }

  private updatePlayerBeam(dt: number): void {
    const p = this.player;
    const spell = p.castingSpell!;
    if (!this.playerBeam) return;
    // origen: pecho; destino: aim a rango fijo
    this.tmp.set(p.pos.x, p.castHeight, p.pos.z);
    this.tmp2.copy(this.input.aimPoint).sub(p.pos);
    this.tmp2.y = 0;
    if (this.tmp2.lengthSq() < 0.01) this.tmp2.set(1, 0, 0);
    this.tmp2.normalize();
    const range = spell.range;
    // primer objetivo en la línea
    let hitUnit: Unit | null = null;
    let hitDist = range;
    const candidates: Unit[] = [];
    if (this.boss?.alive) candidates.push(this.boss);
    for (const a of this.adds) if (a.alive) candidates.push(a);
    for (const u of candidates) {
      const toU = new THREE.Vector3(u.pos.x - p.pos.x, 0, u.pos.z - p.pos.z);
      const along = toU.dot(this.tmp2);
      if (along < 0 || along > range) continue;
      const perp = Math.hypot(toU.x - this.tmp2.x * along, toU.z - this.tmp2.z * along);
      if (perp < u.radius + (spell.radius ?? 0.8)) {
        if (along < hitDist) { hitDist = along; hitUnit = u; }
      }
    }
    const end = new THREE.Vector3(
      p.pos.x + this.tmp2.x * hitDist,
      hitUnit ? hitUnit.castHeight : p.castHeight * 0.8,
      p.pos.z + this.tmp2.z * hitDist,
    );
    this.playerBeam.set(this.tmp, end);
    this.playerBeam.setIntensity(0.85 + Math.sin(this.time * 30) * 0.15);

    // daño por ticks
    this.beamTickAcc += dt;
    const tickInterval = 0.12;
    while (this.beamTickAcc >= tickInterval) {
      this.beamTickAcc -= tickInterval;
      if (hitUnit) {
        const dmg = (spell.power * this.partyDamageMult) * (tickInterval / spell.castTime);
        this.damageEnemy(hitUnit, dmg, spell.color, false);
        this.vfx.trail(end, spell.color, 1, 60, 1.2);
      }
    }
  }

  // ====================================================== daño a enemigos
  damageEnemy(unit: Unit, amount: number, color: number, showText = true): void {
    const dealt = unit.takeDamage(amount, this.now);
    if (dealt <= 0) return;
    if (showText) this.hud.combatText(this.tmp.set(unit.pos.x, unit.headHeight, unit.pos.z), String(Math.round(dealt)), '#ffd977', dealt > 200);
    if (!unit.alive) {
      if (unit === this.boss) {
        this.onBossKilled();
      } else {
        this.vfx.deathBurst(unit.pos, PAL.boss.add);
      }
    }
  }

  private damageEnemiesInCircle(center: THREE.Vector3, radius: number, damage: number, spell: SpellDef): void {
    const targets: Unit[] = [];
    if (this.boss?.alive) targets.push(this.boss);
    for (const a of this.adds) if (a.alive) targets.push(a);
    for (const u of targets) {
      const d = Math.hypot(u.pos.x - center.x, u.pos.z - center.z);
      if (d <= radius + u.radius) {
        this.damageEnemy(u, damage, spell.color);
        if (spell.slow) u.applySlow(spell.slow.factor, spell.slow.duration, this.now);
        if (spell.dot) u.applyDot(spell.dot.dps * this.partyDamageMult, spell.dot.duration, spell.color, this.now);
      }
    }
  }

  private onBossKilled(): void {
    const boss = this.boss!;
    this.vfx.bigImpact(boss.pos, boss.def.accentColor, 6);
    this.vfx.deathBurst(boss.pos, boss.def.accentColor);
    this.camera.addTrauma(0.9);
    this.engine.pulseChroma(1);
    this.hud.banner('¡VICTORIA!', `${boss.def.name} ha caído`);
    this.bossSpeak('death');
  }

  // ===================================================== daño a héroes
  damageHero(hero: Hero, amount: number, showText = true): void {
    if (!hero.alive) return;
    const dealt = hero.takeDamage(amount, this.now);
    if (dealt <= 0) return;
    if (hero.isPlayer) {
      this.camera.addTrauma(Math.min(0.5, 0.12 + dealt / hero.maxHp));
      this.audio.play('player_hit', { volume: 0.8 });
      this.hud.damageFlash();
    }
    if (showText) this.hud.combatText(this.tmp.set(hero.pos.x, hero.headHeight, hero.pos.z), String(Math.round(dealt)), '#ff4757', false);
    // el daño interrumpe canales
    if (hero.reviveTargetId) this.stopRevive(hero);
    if (hero.castingSpell && hero.isPlayer && hero.castTotal > 0 && Math.random() < 0.5) {
      this.hud.combatText(hero.pos, 'Interrumpido', '#8a8798', false);
      this.cancelPlayerCast();
    } else if (hero.castingSpell && !hero.isPlayer) {
      hero.cancelCast();
    }
    if (!hero.alive) this.onHeroDied(hero);
  }

  private onHeroDied(hero: Hero): void {
    this.audio.play('hero_death', { volume: 0.85 });
    this.vfx.deathBurst(hero.pos, hero.def.color);
    hero.deadSince = this.now;
    // anillo dorado de cuerpo revivible
    const ring = this.vfx.zone(hero.pos, 1.3, 0xffe9a3);
    this.corpseRings.set(hero.id, ring);
    // si el muerto eres tú, la guía de muerte (HAS CAÍDO) ya lo comunica
    if (!hero.isPlayer) this.hud.banner(`${hero.displayName} ha caído`, 'Mantén E junto al cuerpo para revivir');
    this.hud.chatSystem(`☠ ${hero.displayName} ha caído`);
    if (this.boss?.aggroTargetId === hero.id) this.boss.aggroTargetId = 0;
    // el boss devora el alma: recupera vida (desafío extra) y se burla
    if (this.boss?.alive) {
      const healed = this.boss.heal(this.boss.maxHp * BOSS_HEAL_ON_KILL);
      if (healed > 0) {
        this.hud.combatText(
          this.tmp.set(this.boss.pos.x, this.boss.headHeight, this.boss.pos.z),
          `+${Math.round(healed)}`, '#ff8a3d', true,
        );
        this.vfx.healBurst(this.boss.pos, this.boss.def.accentColor);
      }
      this.bossSpeak('kill');
    }
  }

  // ============================================================== revive
  startRevive(hero: Hero, corpse: Hero): void {
    if (hero.reviveTargetId === corpse.id) return;
    hero.reviveTargetId = corpse.id;
    hero.reviveProgress = 0;
    hero.cancelCast();
    this.audio.play('revive_channel', { volume: 0.7 });
  }

  stopRevive(hero: Hero): void {
    hero.reviveTargetId = 0;
    hero.reviveProgress = 0;
  }

  private updateRevives(dt: number): void {
    for (const hero of this.heroes) {
      if (!hero.alive || !hero.reviveTargetId) continue;
      const corpse = this.heroes.find((h) => h.id === hero.reviveTargetId);
      if (!corpse || corpse.alive) { this.stopRevive(hero); continue; }
      const d = Math.hypot(corpse.pos.x - hero.pos.x, corpse.pos.z - hero.pos.z);
      if (d > REVIVE_RANGE + 0.4) { this.stopRevive(hero); continue; }
      hero.reviveProgress += dt / this.reviveTime;
      this.vfx.reviveChannel(corpse.pos, dt);
      hero.facing = Math.atan2(corpse.pos.z - hero.pos.z, corpse.pos.x - hero.pos.x);
      if (hero.reviveProgress >= 1) {
        corpse.revive(REVIVE_HP_FRACTION);
        this.stopRevive(hero);
        this.corpseRings.get(corpse.id)?.dispose();
        this.corpseRings.delete(corpse.id);
        this.vfx.reviveBurst(corpse.pos);
        this.audio.play('revive_complete', { volume: 0.95 });
        this.hud.banner(`${corpse.def.name} vuelve al combate`, '');
      }
    }
  }

  // ============================================================ IA helpers
  escapeDir(pos: THREE.Vector3, radius: number): THREE.Vector3 | null {
    const out = new THREE.Vector3();
    let danger = false;
    const margin = radius + 0.5;

    for (const s of this.strikes) {
      if (s.damage <= 0) continue;
      if (this.insideShape(pos, s, margin)) {
        danger = true;
        if (s.shape === 'ring') {
          // el centro es seguro
          const dx = pos.x - s.pos.x, dz = pos.z - s.pos.z;
          const d = Math.hypot(dx, dz) || 1;
          const toCenter = s.inner > 1.6 && d < (s.inner + s.radius) / 2;
          out.x += (toCenter ? -dx : dx) / d;
          out.z += (toCenter ? -dz : dz) / d;
        } else if (s.shape === 'cone') {
          // salir lateralmente
          const rel = Math.atan2(pos.z - s.pos.z, pos.x - s.pos.x);
          let diff = rel - s.dir;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          const side = diff >= 0 ? 1 : -1;
          const escapeAng = s.dir + side * (s.angle / 2 + 0.5);
          out.x += Math.cos(escapeAng);
          out.z += Math.sin(escapeAng);
        } else {
          const dx = pos.x - s.pos.x, dz = pos.z - s.pos.z;
          const d = Math.hypot(dx, dz) || 1;
          out.x += dx / d;
          out.z += dz / d;
        }
      }
    }
    for (const z of this.zones) {
      const d = Math.hypot(pos.x - z.pos.x, pos.z - z.pos.z);
      if (d < z.radius + margin) {
        danger = true;
        const inv = 1 / (d || 1);
        out.x += (pos.x - z.pos.x) * inv;
        out.z += (pos.z - z.pos.z) * inv;
      }
    }
    if (this.sweep && this.boss) {
      // esquivar el beam: alejarse perpendicular
      const bx = this.boss.pos.x, bz = this.boss.pos.z;
      const dirx = Math.cos(this.sweep.angle), dirz = Math.sin(this.sweep.angle);
      const relx = pos.x - bx, relz = pos.z - bz;
      const along = relx * dirx + relz * dirz;
      if (along > 0 && along < this.sweep.length) {
        const perp = relx * -dirz + relz * dirx;
        if (Math.abs(perp) < this.sweep.width + margin + 1.2) {
          danger = true;
          const side = perp >= 0 ? 1 : -1;
          out.x += -dirz * side;
          out.z += dirx * side;
        }
      }
    }
    if (this.shrinkActive) {
      const r = Math.hypot(pos.x, pos.z);
      const safe = BOSSES[this.bossIndex].shrinkArena?.radius ?? PLAY_RADIUS;
      if (r > safe - margin) {
        danger = true;
        out.x += -pos.x / (r || 1);
        out.z += -pos.z / (r || 1);
      }
    }
    if (!danger) return null;
    out.y = 0;
    if (out.lengthSq() < 0.001) out.set(1, 0, 0);
    return out.normalize();
  }

  private insideShape(pos: THREE.Vector3, s: PendingStrike, margin: number): boolean {
    const dx = pos.x - s.pos.x, dz = pos.z - s.pos.z;
    const d = Math.hypot(dx, dz);
    if (s.shape === 'circle') return d < s.radius + margin;
    if (s.shape === 'ring') return d > s.inner - margin && d < s.radius + margin;
    // cone
    if (d > s.radius + margin) return false;
    let diff = Math.atan2(dz, dx) - s.dir;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return Math.abs(diff) < s.angle / 2 + margin / Math.max(1, d);
  }

  applyTaunt(hero: Hero): void {
    if (!this.boss) return;
    this.boss.aggroTargetId = hero.id;
    this.boss.tauntUntil = this.now + 7;
    this.audio.play('warrior_taunt', { volume: 0.8 });
    this.vfx.shockwave(hero.pos, hero.def.color, 3, 0.5);
    this.hud.combatText(this.tmp.set(hero.pos.x, hero.headHeight, hero.pos.z), '¡Provocación!', '#7fb2ff', false);
  }

  meleeHit(attacker: Unit, target: Unit, damage: number, color: number, sound?: string): void {
    if (sound) this.audio.play(sound as never, { volume: 0.75 });
    this.vfx.impact(this.tmp.set(target.pos.x, target.castHeight * 0.6, target.pos.z), color, 0.7);
    this.damageEnemy(target, damage, color);
  }

  aiBeginCast(hero: Hero, spell: SpellDef, target: Hero | null): void {
    if (!hero.spellReady(spell, this.now)) return;
    hero.mana -= spell.manaCost;
    hero.cooldowns.set(spell.id, this.now + spell.cooldown);
    hero.castingSpell = spell;
    hero.castT = 0;
    hero.castTotal = spell.castTime;
    hero.visual?.setCast(true);
    // resolución diferida gestionada en updateDots (tick común)
    const check = (): void => {
      if (hero.castingSpell !== spell) return; // interrumpido
      hero.castT += 0.1;
      if (hero.castT >= spell.castTime) {
        hero.castingSpell = null;
        hero.visual?.setCast(false);
        if (!hero.alive) return;
        if (spell.kind === 'heal' && target) {
          const healed = target.alive ? target.heal(spell.power) : 0;
          if (healed > 0) {
            this.audio.play('heal_cast', { volume: 0.8 });
            this.vfx.healBurst(target.pos);
            this.hud.combatText(this.tmp.set(target.pos.x, target.headHeight, target.pos.z), `+${Math.round(healed)}`, '#7dff8a', false);
          }
        } else if (spell.kind === 'groupHeal') {
          this.audio.play('holy_nova', { volume: 0.9 });
          this.vfx.nova(hero.pos, spell.color, spell.radius ?? 9);
          for (const h of this.heroes) {
            if (!h.alive) continue;
            const d = Math.hypot(h.pos.x - hero.pos.x, h.pos.z - hero.pos.z);
            if (d <= (spell.radius ?? 9)) {
              const healed = h.heal(spell.power);
              if (healed > 0) this.hud.combatText(this.tmp.set(h.pos.x, h.headHeight, h.pos.z), `+${Math.round(healed)}`, '#7dff8a', false);
            }
          }
        }
      } else {
        setTimeout(check, 100);
      }
    };
    setTimeout(check, 100);
  }

  aiFireProjectile(hero: Hero, spell: SpellDef, target: Unit, count = 1): void {
    hero.mana -= spell.manaCost;
    hero.cooldowns.set(spell.id, this.now + spell.cooldown);
    this.audio.play((spell.castSound ?? 'arrow_shot') as never, { volume: 0.6, throttleMs: 120 });
    for (let i = 0; i < count; i++) {
      this.tmp2.set(target.pos.x - hero.pos.x, 0, target.pos.z - hero.pos.z).normalize();
      if (count > 1) {
        const spreadAng = (i - (count - 1) / 2) * 0.16;
        const cos = Math.cos(spreadAng), sin = Math.sin(spreadAng);
        const x = this.tmp2.x * cos - this.tmp2.z * sin;
        const z = this.tmp2.x * sin + this.tmp2.z * cos;
        this.tmp2.set(x, 0, z);
      }
      this.projectiles.fire({
        from: this.tmp.set(hero.pos.x, hero.castHeight, hero.pos.z),
        dir: this.tmp2.clone(), speed: spell.speed ?? 28, radius: spell.radius ?? 0.8,
        damage: spell.power * this.partyDamageMult, fromHero: true, color: spell.color, spell, scale: 0.7,
      });
    }
    hero.facing = Math.atan2(target.pos.z - hero.pos.z, target.pos.x - hero.pos.x);
  }

  // ========================================================== ataques boss
  executeBossAttack(atk: BossAttackDef, target: Hero): void {
    const boss = this.boss!;
    if (atk.sound) this.audio.play(atk.sound as never, { volume: 0.85 });
    const count = atk.count ?? 1;
    const interval = atk.interval ?? 0;
    const dmgMult = boss.enraged ? 1.25 : 1;
    let maxDur = 0;

    for (let i = 0; i < count; i++) {
      const dur = atk.telegraphTime + i * interval;
      maxDur = Math.max(maxDur, dur);
      let pos: THREE.Vector3;
      let dir = 0;
      if (atk.target === 'self') {
        pos = boss.pos.clone();
      } else if (atk.target === 'tank') {
        pos = boss.pos.clone();
        dir = Math.atan2(target.pos.z - boss.pos.z, target.pos.x - boss.pos.x);
      } else {
        // random / players: sobre héroes vivos
        const alive = this.heroes.filter((h) => h.alive);
        const pick = alive[Math.floor(Math.random() * alive.length)] ?? target;
        pos = pick.pos.clone();
        if (atk.target === 'players' || count > 1) {
          pos.x += (Math.random() - 0.5) * 3;
          pos.z += (Math.random() - 0.5) * 3;
        }
      }
      const handle = this.vfx.telegraph(atk.shape, pos, atk.radius, {
        inner: atk.inner, angle: atk.angle, dir, color: PAL.boss.threat,
      });
      this.strikes.push({
        handle, t: 0, dur, shape: atk.shape, pos, radius: atk.radius,
        inner: atk.inner ?? 0, angle: atk.angle ?? 0, dir,
        damage: atk.damage * dmgMult, resolveSound: atk.resolveSound,
        persistDps: atk.persistDps, persistTime: atk.persistTime, slow: atk.slow,
        color: PAL.boss.threat,
      });
    }
    boss.busyUntil = this.now + Math.min(maxDur, atk.telegraphTime + 0.6);
    if (boss.def.id !== 'golem') boss.facing = Math.atan2(target.pos.z - boss.pos.z, target.pos.x - boss.pos.x);
  }

  private updateStrikes(dt: number): void {
    this.strikes = this.strikes.filter((s) => {
      s.t += dt;
      s.handle.setProgress(Math.max(0, Math.min(1, s.t / s.dur)));
      if (s.t < s.dur) return true;
      // resolver
      s.handle.dispose();
      if (s.damage > 0) {
        if (s.resolveSound) this.audio.play(s.resolveSound as never, { volume: 0.85 });
        if (s.shape === 'ring') {
          this.vfx.nova(s.pos, s.color, s.radius);
        } else if (s.shape === 'cone') {
          this.vfx.shockwave(s.pos, s.color, s.radius, 0.5);
          this.vfx.burst({
            count: 30, pos: s.pos.clone().setY(0.3),
            dir: new THREE.Vector3(Math.cos(s.dir), 0.3, Math.sin(s.dir)), cone: 0.5,
            speed: [6, 14], life: [0.3, 0.7], size: [0.6, 1.6],
            colorA: new THREE.Color(0xffffff), colorB: new THREE.Color(s.color), gravity: 8, drag: 0.9,
          });
        } else {
          this.vfx.bigImpact(s.pos, s.color, s.radius);
        }
        this.camera.addTrauma(0.3);
        for (const h of this.heroes) {
          if (!h.alive) continue;
          if (this.insideShape(h.pos, s, h.radius * 0.5)) {
            this.damageHero(h, s.damage);
            if (s.slow) h.applySlow(s.slow.factor, s.slow.duration, this.now);
          }
        }
        if (s.persistDps && s.persistTime) {
          const zh = this.vfx.zone(s.pos, s.radius, 0x67c8f9);
          this.zones.push({
            handle: zh, pos: s.pos, radius: s.radius, dps: s.persistDps,
            until: this.now + s.persistTime, slow: s.slow, tickAcc: 0,
          });
        }
      }
      return false;
    });
  }

  private updateZones(dt: number): void {
    this.zoneTickText += dt;
    const showTick = this.zoneTickText > 0.6;
    if (showTick) this.zoneTickText = 0;
    this.zones = this.zones.filter((z) => {
      if (this.now > z.until) {
        z.handle.dispose();
        return false;
      }
      for (const h of this.heroes) {
        if (!h.alive) continue;
        const d = Math.hypot(h.pos.x - z.pos.x, h.pos.z - z.pos.z);
        if (d < z.radius + h.radius * 0.5) {
          this.damageHero(h, z.dps * dt, false);
          if (showTick) this.hud.combatText(this.tmp.set(h.pos.x, h.headHeight, h.pos.z), String(Math.round(z.dps * 0.6)), '#67c8f9', false);
          if (z.slow) h.applySlow(z.slow.factor, z.slow.duration, this.now);
        }
      }
      return true;
    });
  }

  startSweepBeam(sw: NonNullable<BossDef['sweepBeam']>): void {
    const boss = this.boss!;
    boss.busyUntil = this.now + sw.duration;
    this.audio.play('boss_cast_dark', { volume: 0.9 });
    this.hud.banner('¡Rayo Abrasador!', 'Rodéalo');
    const beam = this.vfx.beam(boss.def.accentColor, sw.width);
    const startAngle = Math.atan2(
      (this.player.alive ? this.player.pos.z : 0) - boss.pos.z,
      (this.player.alive ? this.player.pos.x : 1) - boss.pos.x,
    );
    this.sweep = {
      beam, angle: startAngle, until: this.now + sw.duration,
      dps: sw.dps, length: sw.length, width: sw.width, rotSpeed: sw.rotSpeed,
    };
  }

  private updateSweep(dt: number): void {
    if (!this.sweep || !this.boss) return;
    const sw = this.sweep;
    if (this.now > sw.until || !this.boss.alive) {
      sw.beam.end();
      this.sweep = null;
      return;
    }
    sw.angle += sw.rotSpeed * dt;
    const b = this.boss.pos;
    const dirx = Math.cos(sw.angle), dirz = Math.sin(sw.angle);
    this.tmp.set(b.x + dirx * 1.5, this.boss.castHeight, b.z + dirz * 1.5);
    this.tmp2.set(b.x + dirx * sw.length, 0.6, b.z + dirz * sw.length);
    sw.beam.set(this.tmp, this.tmp2);
    this.boss.facing = sw.angle;
    // chispas en el suelo al final del beam
    this.vfx.trail(this.tmp2, this.boss.def.accentColor, dt, 40, 1.6);
    // daño
    for (const h of this.heroes) {
      if (!h.alive) continue;
      const relx = h.pos.x - b.x, relz = h.pos.z - b.z;
      const along = relx * dirx + relz * dirz;
      if (along < 0 || along > sw.length) continue;
      const perp = Math.abs(relx * -dirz + relz * dirx);
      if (perp < sw.width / 2 + h.radius) {
        this.damageHero(h, sw.dps * dt, false);
      }
    }
  }

  private updateShrink(_dt: number): void {
    const def = BOSSES[this.bossIndex].shrinkArena;
    if (!def || !this.boss) return;
    if (!this.shrinkActive && this.boss.phase >= def.atPhase && this.boss.alive) {
      this.shrinkActive = true;
      this.playRadius = def.radius;
      this.hud.banner('¡El borde arde!', 'Acércate al centro');
      this.audio.play('boss_enrage', { volume: 0.9 });
      // anillo de fuego persistente en el borde
      const h = this.vfx.telegraph('ring', new THREE.Vector3(0, 0, 0), PLAY_RADIUS + 1.5, {
        inner: def.radius, color: 0xff5a1f,
      });
      h.setProgress(-1);
      this.shrinkZoneHandle = h;
    }
    if (this.shrinkActive) {
      for (const h of this.heroes) {
        if (!h.alive) continue;
        const r = Math.hypot(h.pos.x, h.pos.z);
        if (r > def.radius) this.damageHero(h, def.edgeDps * _dt, false);
      }
    }
    if (this.state !== 'combat') this.playRadius = PLAY_RADIUS;
  }

  bossMelee(target: Hero, dmg: number): void {
    this.audio.play('boss_slam', { volume: 0.6, rate: 1.2, throttleMs: 300 });
    this.vfx.impact(this.tmp.set(target.pos.x, 0.8, target.pos.z), PAL.boss.threat, 1.1);
    this.damageHero(target, dmg);
  }

  addMelee(add: Add, target: Hero): void {
    this.vfx.impact(this.tmp.set(target.pos.x, 0.7, target.pos.z), PAL.boss.add, 0.5);
    this.damageHero(target, add.damage);
  }

  spawnAdds(count: number, hp: number, damage: number, speed: number): void {
    const boss = this.boss!;
    this.audio.play('boss_cast_dark', { volume: 0.9 });
    this.hud.banner('¡Invocaciones!', 'Elimina a los espectros');
    for (let i = 0; i < count; i++) {
      const add = new Add(hp, damage, speed);
      const ang = Math.random() * Math.PI * 2;
      add.pos.set(boss.pos.x + Math.cos(ang) * 3.2, 0, boss.pos.z + Math.sin(ang) * 3.2);
      this.engine.scene.add(add.group);
      void add.loadVisual({ key: 'add_void', height: 1.15, accent: PAL.boss.add, rigged: false });
      this.adds.push(add);
      this.vfx.impact(add.pos, PAL.boss.add, 1);
    }
  }

  onBossPhase(phase: number): void {
    const boss = this.boss!;
    this.audio.play('boss_roar', { volume: 0.95 });
    this.camera.addTrauma(0.5);
    this.engine.pulseChroma(0.5);
    this.vfx.nova(boss.pos, boss.def.accentColor, 7);
    this.hud.banner(`Fase ${phase + 1}`, boss.def.name);
    this.bossSpeak('phase');
  }

  onBossEnrage(): void {
    const boss = this.boss!;
    this.audio.play('boss_enrage', { volume: 1 });
    this.camera.addTrauma(0.6);
    this.hud.banner('¡ENFURECIDO!', 'Acaba con él, rápido');
    this.vfx.shockwave(boss.pos, boss.def.accentColor, 9, 1);
    this.bossSpeak('enrage');
  }

  // ========================================================== proyectiles
  private updateProjectiles(dt: number): void {
    for (const p of this.projectiles.items) {
      if (!p.active) continue;
      // homing suave
      if (p.homingTarget && p.homingTarget.alive && p.homingStrength > 0) {
        this.tmp2.set(p.homingTarget.pos.x - p.pos.x, p.homingTarget.castHeight - p.pos.y, p.homingTarget.pos.z - p.pos.z).normalize();
        const sp = p.vel.length();
        p.vel.lerp(this.tmp2.multiplyScalar(sp), Math.min(1, p.homingStrength * dt));
        p.vel.setLength(sp);
      }
      const step = p.vel.length() * dt;
      p.pos.addScaledVector(p.vel, dt);
      p.traveled += step;
      p.mesh.position.copy(p.pos);
      this.vfx.trail(p.pos, p.color, dt, 140, p.fromHero ? 0.9 : 1.1);

      let hit = false;
      if (p.fromHero) {
        const targets: Unit[] = [];
        if (this.boss?.alive) targets.push(this.boss);
        for (const a of this.adds) if (a.alive) targets.push(a);
        for (const u of targets) {
          const d = Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z);
          if (d < u.radius + p.radius * 0.5) {
            hit = true;
            this.vfx.impact(p.pos, p.color, 0.9);
            if (p.spell?.impactSound) this.audio.play(p.spell.impactSound as never, { volume: 0.8, throttleMs: 100 });
            this.damageEnemy(u, p.damage, p.color);
            if (p.spell?.dot) u.applyDot(p.spell.dot.dps * this.partyDamageMult, p.spell.dot.duration, p.color, this.now);
            if (p.spell?.slow) u.applySlow(p.spell.slow.factor, p.spell.slow.duration, this.now);
            break;
          }
        }
      } else {
        for (const h of this.heroes) {
          if (!h.alive) continue;
          const d = Math.hypot(h.pos.x - p.pos.x, h.pos.z - p.pos.z);
          if (d < h.radius + p.radius * 0.5) {
            hit = true;
            this.vfx.impact(p.pos, p.color, 1);
            this.damageHero(h, p.damage);
            break;
          }
        }
      }
      if (hit || p.traveled > p.maxDist || Math.hypot(p.pos.x, p.pos.z) > PLAY_RADIUS + 6) {
        this.projectiles.kill(p);
      }
    }
  }

  // =============================================================== varios
  private updateDots(dt: number): void {
    const units: Unit[] = [...this.heroes];
    if (this.boss) units.push(this.boss);
    units.push(...this.adds);
    for (const u of units) {
      const dmg = u.tickDots(dt, this.now);
      if (dmg > 0 && Math.random() < dt * 2) {
        this.hud.combatText(this.tmp.set(u.pos.x, u.headHeight, u.pos.z), String(Math.round(dmg / dt / 2)), '#58e05a', false);
      }
    }
  }

  private separateUnits(): void {
    // los héroes no atraviesan al boss
    if (this.boss?.alive) {
      for (const h of this.heroes) {
        if (!h.alive) continue;
        const dx = h.pos.x - this.boss.pos.x, dz = h.pos.z - this.boss.pos.z;
        const d = Math.hypot(dx, dz);
        const min = this.boss.radius + h.radius * 0.6;
        if (d < min && d > 0.001) {
          h.pos.x = this.boss.pos.x + (dx / d) * min;
          h.pos.z = this.boss.pos.z + (dz / d) * min;
        }
      }
    }
  }
}
