import * as THREE from 'three';
import type { Game } from './game';
import { Hero, Boss, Unit } from '../entities/units';
import { AI_SPELLS, REVIVE_RANGE } from './balance';

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();

/** Mueve una unidad hacia un punto. Devuelve speed01 para el visual. */
export function steerTo(unit: Unit, target: THREE.Vector3, dt: number, now: number, arrive = 0.4): number {
  tmpV.set(target.x - unit.pos.x, 0, target.z - unit.pos.z);
  const dist = tmpV.length();
  if (dist < arrive) return 0;
  tmpV.normalize();
  const sp = unit.effSpeed(now);
  unit.pos.x += tmpV.x * sp * dt;
  unit.pos.z += tmpV.z * sp * dt;
  unit.facing = Math.atan2(tmpV.z, tmpV.x);
  unit.clampToArena();
  return 1;
}

function faceTarget(unit: Unit, target: THREE.Vector3): void {
  unit.facing = Math.atan2(target.z - unit.pos.z, target.x - unit.pos.x);
}

// ------------------------------------------------------------- compañeros
export function updateCompanion(hero: Hero, game: Game, dt: number): void {
  const now = game.now;
  if (!hero.alive) return;

  // si está canalizando revive, el juego gestiona el canal; solo comprobar interrupciones tácticas
  if (hero.reviveTargetId) {
    const danger = game.escapeDir(hero.pos, hero.radius);
    if (danger) game.stopRevive(hero); // peligro inminente: aborta y esquiva
    else {
      hero.syncVisual(dt, game.time, 0);
      return;
    }
  }

  // si está casteando (heal), quieto
  if (hero.castingSpell) {
    hero.syncVisual(dt, game.time, 0);
    return;
  }

  // 1) esquivar telegraphs
  const escape = game.escapeDir(hero.pos, hero.radius);
  if (escape) {
    const sp = hero.effSpeed(now) * 1.05;
    hero.pos.x += escape.x * sp * dt;
    hero.pos.z += escape.z * sp * dt;
    hero.facing = Math.atan2(escape.z, escape.x);
    hero.clampToArena(game.playRadius);
    hero.syncVisual(dt, game.time, 1);
    return;
  }

  switch (hero.def.id) {
    case 'warrior': return warriorBrain(hero, game, dt);
    case 'cleric': return clericBrain(hero, game, dt);
    case 'ranger': return rangerBrain(hero, game, dt);
    case 'mage': return mageBrain(hero, game, dt);
  }
}

function mageBrain(hero: Hero, game: Game, dt: number): void {
  const now = game.now;
  const boss = game.boss;
  let speed01 = 0;
  const target: Unit | null = game.adds.find((a) => a.alive) ?? (boss && boss.alive ? boss : null);
  if (target) {
    tmpV2.set(hero.pos.x - target.pos.x, 0, hero.pos.z - target.pos.z);
    const d = tmpV2.length();
    const ideal = 12;
    if (d < ideal - 3) {
      tmpV2.normalize();
      tmpV.set(target.pos.x + tmpV2.x * ideal, 0, target.pos.z + tmpV2.z * ideal);
      speed01 = steerTo(hero, tmpV, dt, now, 0.5);
    } else if (d > ideal + 4) {
      speed01 = steerTo(hero, target.pos, dt, now, ideal);
    } else {
      faceTarget(hero, target.pos);
    }
    if (now >= (hero.aiCooldowns.get('aifireball') ?? 0) && hero.mana >= AI_SPELLS.aifireball.manaCost) {
      hero.aiCooldowns.set('aifireball', now + AI_SPELLS.aifireball.cooldown);
      game.aiFireProjectile(hero, AI_SPELLS.aifireball, target);
    }
  }
  hero.syncVisual(dt, game.time, speed01);
}

function warriorBrain(hero: Hero, game: Game, dt: number): void {
  const now = game.now;
  const boss = game.boss;
  if (!boss || !boss.alive) { hero.syncVisual(dt, game.time, 0); return; }

  // taunt si el boss no le mira
  if (boss.aggroTargetId !== hero.id && now >= (hero.aiCooldowns.get('taunt') ?? 0)) {
    hero.aiCooldowns.set('taunt', now + AI_SPELLS.taunt.cooldown);
    game.applyTaunt(hero);
  }
  // muro de acero si está bajo
  if (hero.hp / hero.maxHp < 0.42 && now >= (hero.aiCooldowns.get('wall') ?? 0)) {
    hero.aiCooldowns.set('wall', now + AI_SPELLS.wall.cooldown);
    hero.mitigation = 0.55;
    hero.mitigationUntil = now + 5;
    game.vfx.nova(hero.pos, 0x67e8f9, 2.2);
    game.audio.play('shield_slam', { volume: 0.7 });
  }

  // posicionarse pegado al boss
  tmpV2.set(hero.pos.x - boss.pos.x, 0, hero.pos.z - boss.pos.z);
  const d = tmpV2.length();
  const want = boss.radius + 1.5;
  let speed01 = 0;
  if (d > want + 0.4) {
    tmpV2.copy(boss.pos);
    speed01 = steerTo(hero, tmpV2, dt, now, want);
  } else {
    faceTarget(hero, boss.pos);
    // golpe de escudo
    if (now >= (hero.aiCooldowns.get('shieldslam') ?? 0)) {
      hero.aiCooldowns.set('shieldslam', now + AI_SPELLS.shieldslam.cooldown);
      game.meleeHit(hero, boss, AI_SPELLS.shieldslam.power * game.partyDamageMult, hero.def.color, 'shield_slam');
    } else if (now >= (hero.aiCooldowns.get('swing') ?? 0)) {
      hero.aiCooldowns.set('swing', now + 1.7);
      game.meleeHit(hero, boss, 24 * game.partyDamageMult, hero.def.color);
    }
  }
  hero.syncVisual(dt, game.time, speed01);
}

function clericBrain(hero: Hero, game: Game, dt: number): void {
  const now = game.now;
  const boss = game.boss;

  // 1) revive: aliado muerto y nadie más lo está reviviendo
  const corpse = game.heroes.find((h) => !h.alive
    && !game.heroes.some((o) => o.alive && o !== hero && o.reviveTargetId === h.id));
  if (corpse && (!boss || boss.aggroTargetId !== hero.id)) {
    const d = Math.hypot(corpse.pos.x - hero.pos.x, corpse.pos.z - hero.pos.z);
    if (d > REVIVE_RANGE * 0.8) {
      const s = steerTo(hero, corpse.pos, dt, now, REVIVE_RANGE * 0.7);
      hero.syncVisual(dt, game.time, s);
      return;
    }
    game.startRevive(hero, corpse);
    hero.syncVisual(dt, game.time, 0);
    return;
  }

  // 2) curar al más herido
  const wounded = game.heroes.filter((h) => h.alive).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
  const hurtCount = game.heroes.filter((h) => h.alive && h.hp / h.maxHp < 0.62).length;
  if (hurtCount >= 3 && hero.spellReady(AI_SPELLS.groupheal, now)) {
    game.aiBeginCast(hero, AI_SPELLS.groupheal, null);
    hero.syncVisual(dt, game.time, 0);
    return;
  }
  if (wounded && wounded.hp / wounded.maxHp < 0.78 && hero.spellReady(AI_SPELLS.heal, now)) {
    const d = Math.hypot(wounded.pos.x - hero.pos.x, wounded.pos.z - hero.pos.z);
    if (d <= AI_SPELLS.heal.range) {
      game.aiBeginCast(hero, AI_SPELLS.heal, wounded);
      faceTarget(hero, wounded.pos);
      hero.syncVisual(dt, game.time, 0);
      return;
    }
    const s = steerTo(hero, wounded.pos, dt, now, AI_SPELLS.heal.range * 0.8);
    hero.syncVisual(dt, game.time, s);
    return;
  }

  // 3) posición segura a media distancia + castigo
  let speed01 = 0;
  if (boss && boss.alive) {
    tmpV2.set(hero.pos.x - boss.pos.x, 0, hero.pos.z - boss.pos.z);
    const d = tmpV2.length();
    if (d < 8) {
      tmpV2.normalize();
      tmpV.set(boss.pos.x + tmpV2.x * 10, 0, boss.pos.z + tmpV2.z * 10);
      speed01 = steerTo(hero, tmpV, dt, now, 0.6);
    } else if (d > 14) {
      speed01 = steerTo(hero, boss.pos, dt, now, 11);
    } else if (hero.spellReady(AI_SPELLS.smite, now)) {
      faceTarget(hero, boss.pos);
      game.aiFireProjectile(hero, AI_SPELLS.smite, boss);
    }
  }
  hero.syncVisual(dt, game.time, speed01);
}

function rangerBrain(hero: Hero, game: Game, dt: number): void {
  const now = game.now;
  const boss = game.boss;
  let speed01 = 0;
  // prioriza adds si existen
  const target: Unit | null = game.adds.find((a) => a.alive) ?? (boss && boss.alive ? boss : null);
  if (target) {
    tmpV2.set(hero.pos.x - target.pos.x, 0, hero.pos.z - target.pos.z);
    const d = tmpV2.length();
    const ideal = 11;
    if (d < ideal - 2.5) {
      tmpV2.normalize();
      tmpV.set(target.pos.x + tmpV2.x * ideal, 0, target.pos.z + tmpV2.z * ideal);
      speed01 = steerTo(hero, tmpV, dt, now, 0.5);
    } else if (d > ideal + 3.5) {
      speed01 = steerTo(hero, target.pos, dt, now, ideal);
    } else {
      // strafe lento alrededor
      const ang = Math.atan2(tmpV2.z, tmpV2.x) + dt * 0.35;
      tmpV.set(target.pos.x + Math.cos(ang) * d, 0, target.pos.z + Math.sin(ang) * d);
      speed01 = steerTo(hero, tmpV, dt, now, 0.1) * 0.5;
      faceTarget(hero, target.pos);
    }
    // disparos
    if (now >= (hero.aiCooldowns.get('poison') ?? 0) && hero.mana >= AI_SPELLS.poison.manaCost) {
      hero.aiCooldowns.set('poison', now + AI_SPELLS.poison.cooldown);
      game.aiFireProjectile(hero, AI_SPELLS.poison, target);
    } else if (now >= (hero.aiCooldowns.get('multishot') ?? 0) && hero.mana >= AI_SPELLS.multishot.manaCost) {
      hero.aiCooldowns.set('multishot', now + AI_SPELLS.multishot.cooldown);
      game.aiFireProjectile(hero, AI_SPELLS.multishot, target, 3);
    } else if (now >= (hero.aiCooldowns.get('arrow') ?? 0) && hero.mana >= AI_SPELLS.arrow.manaCost) {
      hero.aiCooldowns.set('arrow', now + AI_SPELLS.arrow.cooldown);
      game.aiFireProjectile(hero, AI_SPELLS.arrow, target);
    }
  }
  hero.syncVisual(dt, game.time, speed01);
}

// ------------------------------------------------------------------- boss
export function updateBossAI(boss: Boss, game: Game, dt: number): void {
  const now = game.now;
  if (!boss.alive) return;

  // cambio de fase
  if (boss.updatePhase()) {
    game.onBossPhase(boss.phase);
  }
  // enrage
  if (!boss.enraged && boss.hpFrac() <= boss.def.enrageAt) {
    boss.enraged = true;
    game.onBossEnrage();
  }

  const speedMult = boss.enraged ? 1.25 : 1;

  // aura de enrage
  if (boss.enraged) game.vfx.enrageAura(boss.pos, dt, boss.def.accentColor);

  // embestida en curso: dash rápido con estela; al llegar, SLAM con daño AoE
  if (now < boss.lungeUntil) {
    const sp = boss.moveSpeed * 4.4 * speedMult;
    boss.pos.x += boss.lungeDir.x * sp * dt;
    boss.pos.z += boss.lungeDir.z * sp * dt;
    boss.facing = Math.atan2(boss.lungeDir.z, boss.lungeDir.x);
    boss.clampToArena(game.playRadius);
    game.vfx.trail(boss.pos, boss.def.accentColor, dt, 220, 2.2);
    boss.syncVisual(dt, game.time, 1);
    if (now + dt >= boss.lungeUntil) {
      game.bossLungeSlam();
      boss.meleeReady = now; // encadena un swing inmediato al aterrizar
    }
    return;
  }

  // swing melee: resolver el golpe cuando termina el windup
  if (boss.swingLandAt > 0 && now >= boss.swingLandAt) {
    boss.swingLandAt = 0;
    game.bossMeleeStrike(boss.swingDir);
  }
  // durante el windup: quieto, mirando al objetivo del golpe
  if (boss.swingLandAt > 0) {
    boss.facing = boss.swingDir;
    boss.syncVisual(dt, game.time, 0);
    return;
  }

  // ocupado casteando un ataque especial
  if (now < boss.busyUntil) {
    boss.visual?.setCast(true);
    boss.syncVisual(dt, game.time, 0);
    return;
  }
  boss.visual?.setCast(false);

  // objetivo por aggro
  let target = game.heroes.find((h) => h.id === boss.aggroTargetId && h.alive);
  if (!target || (now > boss.tauntUntil && Math.random() < dt * 0.12)) {
    const alive = game.heroes.filter((h) => h.alive);
    if (alive.length === 0) return;
    const warrior = alive.find((h) => h.def.id === 'warrior');
    target = warrior && Math.random() < 0.75 ? warrior : alive[Math.floor(Math.random() * alive.length)];
    boss.aggroTargetId = target.id;
  }

  // invocaciones (liche)
  const s = boss.def.summons;
  if (s && boss.phase >= s.atPhase && now >= boss.summonReady) {
    boss.summonReady = now + s.cooldown;
    game.spawnAdds(s.count, s.hp, s.damage, s.speed);
    boss.busyUntil = now + 1.4;
    boss.syncVisual(dt, game.time, 0);
    return;
  }

  // beam giratorio (demonio)
  const sw = boss.def.sweepBeam;
  if (sw && boss.phase >= sw.minPhase && now >= boss.sweepReady) {
    boss.sweepReady = now + sw.cooldown;
    game.startSweepBeam(sw);
    boss.syncVisual(dt, game.time, 0);
    return;
  }

  // pisotón: si ≥2 héroes le rodean, castigo AoE con telegraph corto
  if (boss.stompReady === 0) boss.stompReady = now + 7; // primer stomp nunca de salida
  if (now >= boss.stompReady) {
    let near = 0;
    for (const h of game.heroes) {
      if (h.alive && Math.hypot(h.pos.x - boss.pos.x, h.pos.z - boss.pos.z) < boss.radius + 3.0) near++;
    }
    if (near >= 2) {
      boss.stompReady = now + 9 / speedMult;
      game.bossStomp();
      boss.syncVisual(dt, game.time, 0);
      return;
    }
  }

  // ataque especial
  if (now >= boss.globalAttackReady) {
    const avail = boss.def.attacks.filter((a) =>
      (a.minPhase ?? 0) <= boss.phase && now >= (boss.attackCooldowns.get(a.id) ?? 0));
    if (avail.length > 0) {
      let totalW = 0;
      for (const a of avail) totalW += a.weight;
      let pick = Math.random() * totalW;
      let chosen = avail[0];
      for (const a of avail) { pick -= a.weight; if (pick <= 0) { chosen = a; break; } }
      boss.attackCooldowns.set(chosen.id, now + chosen.cooldown / speedMult);
      boss.globalAttackReady = now + (2.4 + Math.random() * 1.2) / speedMult;
      game.executeBossAttack(chosen, target);
      boss.syncVisual(dt, game.time, 0);
      return;
    }
  }

  // perseguir y pegar melee
  tmpV2.set(target.pos.x - boss.pos.x, 0, target.pos.z - boss.pos.z);
  const d = tmpV2.length();
  let speed01 = 0;
  // embestida: si el objetivo está lejos, cargar hacia él (más presencia y amenaza)
  if (d > 7 && now >= boss.lungeReady) {
    boss.lungeReady = now + 5.5 / speedMult;
    boss.lungeUntil = now + Math.min(0.65, (d - boss.def.meleeRange) / (boss.moveSpeed * 4.4));
    boss.lungeDir.set(tmpV2.x / d, 0, tmpV2.z / d);
    game.audio.play('boss_cast_dark', { volume: 0.6, rate: 1.4 });
    boss.syncVisual(dt, game.time, 1);
    return;
  }
  if (d > boss.def.meleeRange) {
    speed01 = steerTo(boss, target.pos, dt, now, boss.def.meleeRange * 0.9);
    speed01 *= speedMult;
  } else {
    faceTarget(boss, target.pos);
    // swing con windup animado: el golpe cae 0.5s después en un arco frontal
    if (now >= boss.meleeReady) {
      game.bossSwingStart(target);
      boss.syncVisual(dt, game.time, 0);
      return;
    }
  }
  boss.syncVisual(dt, game.time, speed01);
}

// ------------------------------------------------------------------- adds
export function updateAdds(game: Game, dt: number): void {
  const now = game.now;
  for (const add of game.adds) {
    if (!add.alive) continue;
    let nearest: Hero | null = null;
    let best = 1e9;
    for (const h of game.heroes) {
      if (!h.alive) continue;
      const d = Math.hypot(h.pos.x - add.pos.x, h.pos.z - add.pos.z);
      if (d < best) { best = d; nearest = h; }
    }
    if (!nearest) continue;
    let speed01 = 0;
    if (best > 1.1) {
      speed01 = steerTo(add, nearest.pos, dt, now, 1.0);
    } else if (now >= add.attackReady) {
      add.attackReady = now + 1.5;
      game.addMelee(add, nearest);
    }
    add.syncVisual(dt, game.time, speed01);
  }
}
