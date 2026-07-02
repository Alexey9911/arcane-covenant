// Sincronización de partida host-autoritativa.
// HOST: aplica inputs remotos a los héroes de otros jugadores y emite snapshots.
// PEER: aplica snapshots (lerp) y envía su input; el combate real vive en el host.
import * as THREE from 'three';
import type { Game } from '../game/game';
import { Hero } from '../entities/units';
import { net, PInput } from './net';

export interface NetEvent {
  t: 'tg' | 'vfx' | 'dlg' | 'banner' | 'proj';
  [k: string]: unknown;
}

interface HeroSnap { x: number; z: number; f: number; hp: number; mp: number; al: boolean; s: number; }
export interface Snap {
  heroes: HeroSnap[];
  boss: { x: number; z: number; f: number; hp: number; ph: number; en: boolean; al: boolean } | null;
  ev: NetEvent[];
}

const tmpV = new THREE.Vector2();

// ------------------------------------------------------------------- HOST
const remoteInputs = new Map<number, PInput>();
let sendAcc = 0;

export function hostReset(): void {
  remoteInputs.clear();
  sendAcc = 0;
}

export function hostStoreInput(slot: number, input: PInput): void {
  remoteInputs.set(slot, input);
}

/** Aplica el input remoto al héroe de ese jugador (movimiento + casts + revive). */
export function hostApplyRemotes(game: Game, dt: number): void {
  if (!game.slotHero) return;
  for (const [slot, heroIdx] of game.slotHero) {
    const hero = game.heroes[heroIdx];
    if (hero.isPlayer || !hero.alive) continue;
    const inp = remoteInputs.get(slot);
    if (!inp) continue;
    // movimiento
    tmpV.set(inp.mx, inp.my);
    if (tmpV.lengthSq() > 1) tmpV.normalize();
    const moving = tmpV.lengthSq() > 0.001;
    if (moving && !hero.castingSpell && !hero.reviveTargetId) {
      const sp = hero.effSpeed(game.now);
      hero.pos.x += tmpV.x * sp * dt;
      hero.pos.z += tmpV.y * sp * dt;
      hero.facing = Math.atan2(tmpV.y, tmpV.x);
      hero.clampToArena(game.playRadius);
    }
    // revive remoto
    if (inp.rev && !hero.reviveTargetId) {
      const corpse = game.heroes.find((h) => !h.alive
        && Math.hypot(h.pos.x - hero.pos.x, h.pos.z - hero.pos.z) < 2.6);
      if (corpse) game.startRevive(hero, corpse);
    } else if (!inp.rev && hero.reviveTargetId) {
      if (moving) game.stopRevive(hero);
    }
    // casts pedidos
    if (inp.casts?.length) {
      const aim = new THREE.Vector3(inp.ax, 0, inp.az);
      for (const slotIdx of inp.casts) {
        game.remoteCast(hero, slotIdx, aim);
      }
      inp.casts = [];
    }
    hero.syncVisual(dt, game.time, moving && !hero.castingSpell && !hero.reviveTargetId ? 1 : 0);
  }
}

export function hostBroadcast(game: Game, dt: number): void {
  sendAcc += dt;
  if (sendAcc < 1 / 12) return;
  sendAcc = 0;
  const snap: Snap = {
    heroes: game.heroes.map((h) => ({
      x: Math.round(h.pos.x * 100) / 100,
      z: Math.round(h.pos.z * 100) / 100,
      f: Math.round(h.facing * 100) / 100,
      hp: Math.round(h.hp), mp: Math.round(h.mana),
      al: h.alive, s: h.lastSpeed01,
    })),
    boss: game.boss ? {
      x: Math.round(game.boss.pos.x * 100) / 100,
      z: Math.round(game.boss.pos.z * 100) / 100,
      f: Math.round(game.boss.facing * 100) / 100,
      hp: Math.round(game.boss.hp),
      ph: game.boss.phase, en: game.boss.enraged, al: game.boss.alive,
    } : null,
    ev: game.drainNetEvents(),
  };
  net.sendSnap(snap);
}

// ------------------------------------------------------------------- PEER
let inputAcc = 0;
let lastSnap: Snap | null = null;

export function peerReset(): void {
  inputAcc = 0;
  lastSnap = null;
}

export function peerStoreSnap(s: Snap): void { lastSnap = s; }

export function peerUpdate(game: Game, dt: number): void {
  // enviar mi input ~15Hz
  inputAcc += dt;
  if (inputAcc >= 1 / 15) {
    inputAcc = 0;
    const mv = game.input.moveVec(tmpV);
    net.sendInput({
      mx: mv.x, my: mv.y,
      ax: game.input.aimPoint.x, az: game.input.aimPoint.z,
      casts: game.input.consumeSlots(),
      rev: game.input.reviveHeld,
    });
  }
  if (!lastSnap) return;
  const k = 1 - Math.exp(-dt * 12);
  lastSnap.heroes.forEach((hs, i) => {
    const h = game.heroes[i];
    if (!h) return;
    h.pos.x += (hs.x - h.pos.x) * k;
    h.pos.z += (hs.z - h.pos.z) * k;
    h.facing = hs.f;
    h.hp = hs.hp; h.mana = hs.mp;
    if (h.alive && !hs.al) { h.die(); game.vfx.deathBurst(h.pos, h.def.color); }
    if (!h.alive && hs.al) h.revive(1);
    h.hp = hs.hp;
    h.syncVisual(dt, game.time, hs.s);
  });
  const b = game.boss;
  if (b && lastSnap.boss) {
    const bs = lastSnap.boss;
    b.pos.x += (bs.x - b.pos.x) * k;
    b.pos.z += (bs.z - b.pos.z) * k;
    b.facing = bs.f;
    b.hp = bs.hp;
    b.phase = bs.ph;
    b.enraged = bs.en;
    if (b.alive && !bs.al) b.alive = false;
    b.syncVisual(dt, game.time, 0.5);
  }
  // replay de eventos visuales
  for (const ev of lastSnap.ev) game.replayNetEvent(ev);
  lastSnap.ev = [];
}
