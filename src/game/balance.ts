// Todas las constantes de tuning y datos de diseño en un solo lugar.
import { PAL } from './palette';

export const ARENA_RADIUS = 22;
export const PLAY_RADIUS = 20; // radio jugable (los muros empujan antes del borde)

// ---------------------------------------------------------------- movimiento
export const HERO_SPEED = 7.2;
export const HERO_ACCEL = 40;
export const HERO_RADIUS = 0.55;

// ------------------------------------------------------------------- revive
export const REVIVE_TIME = 4.0;
export const REVIVE_RANGE = 2.6;
export const REVIVE_HP_FRACTION = 0.4;

// ------------------------------------------------------------------ clases
export type ClassId = 'mage' | 'warrior' | 'cleric' | 'ranger';

export interface ClassDef {
  id: ClassId;
  name: string;
  role: 'dps' | 'tank' | 'healer';
  color: number;
  maxHp: number;
  maxMana: number;
  manaRegen: number;
  attackRange: number;
  portraitIndex: number; // cuadrante en portraits_party.jpg
}

export const CLASSES: Record<ClassId, ClassDef> = {
  mage: { id: 'mage', name: 'Pyra', role: 'dps', color: PAL.cls.mage, maxHp: 520, maxMana: 300, manaRegen: 14, attackRange: 14, portraitIndex: 0 },
  warrior: { id: 'warrior', name: 'Vanguard', role: 'tank', color: PAL.cls.warrior, maxHp: 980, maxMana: 160, manaRegen: 8, attackRange: 2.6, portraitIndex: 1 },
  cleric: { id: 'cleric', name: 'Lumen', role: 'healer', color: PAL.cls.cleric, maxHp: 600, maxMana: 340, manaRegen: 16, attackRange: 12, portraitIndex: 2 },
  ranger: { id: 'ranger', name: 'Sombra', role: 'dps', color: PAL.cls.ranger, maxHp: 560, maxMana: 220, manaRegen: 11, attackRange: 13, portraitIndex: 3 },
};

// ----------------------------------------------------------------- hechizos
export type SpellKind = 'projectile' | 'nova' | 'beam' | 'groundAoe' | 'heal' | 'groupHeal' | 'melee' | 'taunt' | 'buff';

export interface SpellDef {
  id: string;
  name: string;
  kind: SpellKind;
  cooldown: number;
  manaCost: number;
  castTime: number; // 0 = instantáneo
  range: number;
  radius?: number;
  speed?: number;
  power: number; // daño o curación
  dot?: { dps: number; duration: number };
  slow?: { factor: number; duration: number };
  color: number;
  castSound?: string;
  impactSound?: string;
  iconIndex?: number; // cuadrante en icons_mage.jpg (solo jugador)
}

// Kit del jugador (Pyra, maga de fuego)
export const PLAYER_SPELLS: SpellDef[] = [
  {
    id: 'fireball', name: 'Bola de Fuego', kind: 'projectile', cooldown: 1.6, manaCost: 18,
    castTime: 0, range: 26, radius: 1.6, speed: 26, power: 62, color: PAL.cls.mage,
    castSound: 'fireball_cast', impactSound: 'fireball_impact', iconIndex: 0,
  },
  {
    id: 'frostnova', name: 'Nova de Escarcha', kind: 'nova', cooldown: 9, manaCost: 40,
    castTime: 0, range: 0, radius: 6.5, power: 48, slow: { factor: 0.45, duration: 3.5 },
    color: 0x67e8f9, castSound: 'frost_nova', iconIndex: 1,
  },
  {
    id: 'arcanebeam', name: 'Rayo Arcano', kind: 'beam', cooldown: 7, manaCost: 55,
    castTime: 2.2, range: 18, radius: 0.8, power: 260, color: PAL.env.runeArcane,
    castSound: 'arcane_beam', iconIndex: 2,
  },
  {
    id: 'meteor', name: 'Meteoro', kind: 'groundAoe', cooldown: 38, manaCost: 90,
    castTime: 1.0, range: 24, radius: 5.2, power: 340, color: 0xff9a3d,
    castSound: 'meteor_incoming', impactSound: 'meteor_impact', iconIndex: 3,
  },
];

// Kits de la IA (usados por los cerebros de compañeros)
export const AI_SPELLS: Record<string, SpellDef> = {
  taunt: { id: 'taunt', name: 'Provocación', kind: 'taunt', cooldown: 12, manaCost: 20, castTime: 0, range: 20, power: 0, color: PAL.cls.warrior, castSound: 'warrior_taunt' },
  shieldslam: { id: 'shieldslam', name: 'Golpe de Escudo', kind: 'melee', cooldown: 6, manaCost: 15, castTime: 0, range: 2.8, power: 55, color: PAL.cls.warrior, castSound: 'shield_slam' },
  wall: { id: 'wall', name: 'Muro de Acero', kind: 'buff', cooldown: 22, manaCost: 30, castTime: 0, range: 0, power: 0.5, color: PAL.ui.shield },
  heal: { id: 'heal', name: 'Destello Curativo', kind: 'heal', cooldown: 3.2, manaCost: 30, castTime: 1.2, range: 16, power: 150, color: PAL.cls.cleric, castSound: 'heal_cast' },
  groupheal: { id: 'groupheal', name: 'Nova Sagrada', kind: 'groupHeal', cooldown: 16, manaCost: 70, castTime: 1.6, range: 0, radius: 10, power: 120, color: PAL.cls.cleric, castSound: 'holy_nova' },
  smite: { id: 'smite', name: 'Castigo', kind: 'projectile', cooldown: 2.4, manaCost: 10, castTime: 0, range: 14, radius: 0.9, speed: 22, power: 26, color: PAL.cls.cleric, castSound: 'heal_cast' },
  arrow: { id: 'arrow', name: 'Flecha Rápida', kind: 'projectile', cooldown: 1.1, manaCost: 6, castTime: 0, range: 24, radius: 0.7, speed: 34, power: 34, color: PAL.cls.ranger, castSound: 'arrow_shot' },
  poison: { id: 'poison', name: 'Flecha Venenosa', kind: 'projectile', cooldown: 8, manaCost: 25, castTime: 0, range: 24, radius: 0.8, speed: 30, power: 30, dot: { dps: 18, duration: 6 }, color: PAL.cls.ranger, castSound: 'arrow_shot', impactSound: 'poison_hit' },
  multishot: { id: 'multishot', name: 'Descarga Múltiple', kind: 'projectile', cooldown: 10, manaCost: 35, castTime: 0, range: 20, radius: 0.7, speed: 30, power: 26, color: PAL.cls.ranger, castSound: 'arrow_shot' },
};

// ------------------------------------------------------------------- bosses
export type TelegraphShape = 'circle' | 'ring' | 'cone';
export type BossTargetMode = 'tank' | 'random' | 'self' | 'players';

export interface BossAttackDef {
  id: string;
  name: string;
  shape: TelegraphShape;
  radius: number;
  inner?: number; // para ring
  angle?: number; // para cone (radianes)
  telegraphTime: number;
  damage: number;
  target: BossTargetMode;
  count?: number; // nº de zonas (meteoros / anillos secuenciales)
  interval?: number; // separación entre zonas secuenciales
  cooldown: number;
  weight: number;
  minPhase?: number;
  persistDps?: number; // zona persistente (escarcha)
  persistTime?: number;
  slow?: { factor: number; duration: number };
  sound?: string;
  resolveSound?: string;
}

export interface BossDef {
  id: string;
  name: string;
  title: string;
  modelKey: string;
  portrait: string;
  color: number;
  accentColor: number;
  maxHp: number;
  meleeDamage: number;
  meleeInterval: number;
  meleeRange: number;
  moveSpeed: number;
  scale: number;
  radius: number;
  phases: number[]; // umbrales de HP (fracción) que inician fase 2, 3…
  enrageAt: number;
  attacks: BossAttackDef[];
  summons?: { count: number; hp: number; damage: number; speed: number; atPhase: number; cooldown: number };
  sweepBeam?: { dps: number; duration: number; length: number; width: number; rotSpeed: number; cooldown: number; minPhase: number };
  shrinkArena?: { atPhase: number; radius: number; edgeDps: number };
}

export const BOSSES: BossDef[] = [
  {
    id: 'golem', name: 'Vulkran', title: 'el Gólem Ígneo', modelKey: 'boss_golem',
    portrait: 'portrait_golem', color: 0x2a1f1c, accentColor: 0xff5a1f,
    maxHp: 9200, meleeDamage: 95, meleeInterval: 2.6, meleeRange: 3.4, moveSpeed: 2.6,
    scale: 2.6, radius: 1.9, phases: [0.66, 0.33], enrageAt: 0.2,
    attacks: [
      { id: 'slam', name: 'Golpe Sísmico', shape: 'cone', radius: 9, angle: Math.PI / 2.6, telegraphTime: 1.6, damage: 170, target: 'tank', cooldown: 9, weight: 3, sound: 'boss_cast_dark', resolveSound: 'boss_slam' },
      { id: 'firerings', name: 'Anillos de Fuego', shape: 'ring', radius: 7, inner: 4, telegraphTime: 1.8, damage: 130, target: 'self', count: 3, interval: 0.85, cooldown: 14, weight: 2, minPhase: 1, sound: 'boss_cast_dark', resolveSound: 'fireball_impact' },
      { id: 'meteorrain', name: 'Lluvia de Meteoros', shape: 'circle', radius: 3.4, telegraphTime: 2.2, damage: 150, target: 'players', count: 5, interval: 0.28, cooldown: 18, weight: 2, minPhase: 2, sound: 'meteor_incoming', resolveSound: 'meteor_impact' },
    ],
  },
  {
    id: 'lich', name: 'Mal\'ganeth', title: 'el Liche del Vacío', modelKey: 'boss_lich',
    portrait: 'portrait_lich', color: 0x241f33, accentColor: 0x4ee8e0,
    maxHp: 11800, meleeDamage: 70, meleeInterval: 2.2, meleeRange: 3.0, moveSpeed: 3.0,
    scale: 2.2, radius: 1.5, phases: [0.6, 0.3], enrageAt: 0.15,
    attacks: [
      { id: 'frostzone', name: 'Suelo Gélido', shape: 'circle', radius: 4.2, telegraphTime: 1.5, damage: 60, target: 'random', count: 2, interval: 0.4, cooldown: 11, weight: 3, persistDps: 45, persistTime: 7, slow: { factor: 0.5, duration: 1.2 }, sound: 'boss_cast_dark', resolveSound: 'frost_nova' },
      { id: 'voidbarrage', name: 'Andanada del Vacío', shape: 'circle', radius: 2.6, telegraphTime: 1.3, damage: 110, target: 'players', count: 4, interval: 0.22, cooldown: 13, weight: 2, minPhase: 1, sound: 'boss_cast_dark', resolveSound: 'fireball_impact' },
      { id: 'voidring', name: 'Colapso del Vacío', shape: 'ring', radius: 9.5, inner: 3.2, telegraphTime: 2.1, damage: 165, target: 'self', cooldown: 16, weight: 2, minPhase: 2, sound: 'boss_cast_dark', resolveSound: 'boss_slam' },
    ],
    summons: { count: 2, hp: 700, damage: 34, speed: 4.4, atPhase: 1, cooldown: 26 },
  },
  {
    id: 'demon', name: 'Azkarath', title: 'el Señor Demonio', modelKey: 'boss_demon',
    portrait: 'portrait_demon', color: 0x2b1216, accentColor: 0xff2e4d,
    maxHp: 14500, meleeDamage: 120, meleeInterval: 2.4, meleeRange: 3.6, moveSpeed: 3.2,
    scale: 2.9, radius: 2.0, phases: [0.5], enrageAt: 0.15,
    attacks: [
      { id: 'hellslam', name: 'Tajo Infernal', shape: 'cone', radius: 10, angle: Math.PI / 2.4, telegraphTime: 1.4, damage: 190, target: 'tank', cooldown: 8, weight: 3, sound: 'boss_cast_dark', resolveSound: 'boss_slam' },
      { id: 'brimstone', name: 'Azufre', shape: 'circle', radius: 3.2, telegraphTime: 1.9, damage: 160, target: 'players', count: 6, interval: 0.24, cooldown: 15, weight: 2, sound: 'meteor_incoming', resolveSound: 'meteor_impact' },
      { id: 'hellring', name: 'Corona de Fuego', shape: 'ring', radius: 8.5, inner: 3.5, telegraphTime: 1.7, damage: 175, target: 'self', count: 2, interval: 1.0, cooldown: 14, weight: 2, minPhase: 1, sound: 'boss_cast_dark', resolveSound: 'fireball_impact' },
    ],
    sweepBeam: { dps: 210, duration: 6, length: 19, width: 2.2, rotSpeed: 0.55, cooldown: 24, minPhase: 1 },
    shrinkArena: { atPhase: 1, radius: 14.5, edgeDps: 70 },
  },
];

// Adds invocados
export const ADD_RADIUS = 0.5;

// ----------------------------------------------------------------- economía
export const GOLD_PER_BOSS = [140, 200, 300];
export const GOLD_DEFEAT_CONSOLATION = 40;

export interface UpgradeDef {
  id: string;
  name: string;
  desc: string;
  maxLevel: number;
  baseCost: number;
  costGrowth: number;
  iconIndex: number; // cuadrante en icons_market.jpg
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'damage', name: 'Furia Ígnea', desc: '+12% daño de hechizos por nivel', maxLevel: 5, baseCost: 80, costGrowth: 1.5, iconIndex: 0 },
  { id: 'cdr', name: 'Fluir Temporal', desc: '-8% cooldowns por nivel', maxLevel: 4, baseCost: 90, costGrowth: 1.5, iconIndex: 1 },
  { id: 'vitality', name: 'Pacto Vital', desc: '+15% vida y maná de la party por nivel', maxLevel: 5, baseCost: 70, costGrowth: 1.45, iconIndex: 2 },
  { id: 'revive', name: 'Alas de Lumen', desc: '-20% tiempo de revivir por nivel', maxLevel: 3, baseCost: 100, costGrowth: 1.6, iconIndex: 3 },
];

export function upgradeCost(def: UpgradeDef, level: number): number {
  return Math.round(def.baseCost * Math.pow(def.costGrowth, level));
}

// ---------------------------------------------------------------- lobby fake
export const LOBBY_NAMES = [
  'Kaelith', 'Dravok', 'Lyra_88', 'ShadowFang', 'Miriel', 'ThorneX', 'Vex',
  'Aurelia', 'Grimjaw', 'Nyx_Hunter', 'Solaris', 'Wraith77', 'Elowen', 'Karnak',
];
