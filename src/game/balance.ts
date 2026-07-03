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
  count?: number; // proyectiles en abanico
  dot?: { dps: number; duration: number };
  slow?: { factor: number; duration: number };
  color: number;
  castSound?: string;
  impactSound?: string;
  iconIndex?: number; // cuadrante en icons_{clase}.jpg
}

// Kits jugables por clase (slot 1-4; iconos en icons_{clase}.jpg por cuadrante).
// Nota de balance: los slows NUNCA congelan — factor mínimo MIN_SLOW_FACTOR.
// El hielo es la herramienta táctica principal para kitear al boss y ganar
// ventanas de revive; el resto del kit apenas ralentiza.
export const PLAYER_KITS: Record<ClassId, SpellDef[]> = {
  mage: [
    {
      id: 'fireball', name: 'Fireball', kind: 'projectile', cooldown: 1.6, manaCost: 18,
      castTime: 0, range: 26, radius: 1.6, speed: 26, power: 62, color: PAL.cls.mage,
      castSound: 'fireball_cast', impactSound: 'fireball_impact', iconIndex: 0,
    },
    {
      id: 'frostnova', name: 'Frost Nova', kind: 'nova', cooldown: 9, manaCost: 40,
      castTime: 0, range: 0, radius: 6.5, power: 48, slow: { factor: 0.65, duration: 3.2 },
      color: 0x67e8f9, castSound: 'frost_nova', iconIndex: 1,
    },
    {
      id: 'arcanebeam', name: 'Arcane Beam', kind: 'beam', cooldown: 7, manaCost: 55,
      castTime: 2.2, range: 18, radius: 0.8, power: 260, color: PAL.env.runeArcane,
      castSound: 'arcane_beam', iconIndex: 2,
    },
    {
      id: 'meteor', name: 'Meteor', kind: 'groundAoe', cooldown: 38, manaCost: 90,
      castTime: 1.0, range: 24, radius: 5.2, power: 340, color: 0xff9a3d,
      castSound: 'meteor_incoming', impactSound: 'meteor_impact', iconIndex: 3,
    },
  ],
  warrior: [
    {
      id: 'shieldbash', name: 'Shield Bash', kind: 'melee', cooldown: 4, manaCost: 12,
      castTime: 0, range: 3.4, radius: 2.2, power: 78, color: PAL.cls.warrior,
      castSound: 'shield_slam', iconIndex: 0,
    },
    {
      id: 'taunt', name: 'Taunt', kind: 'taunt', cooldown: 12, manaCost: 20,
      castTime: 0, range: 20, power: 0, color: PAL.cls.warrior,
      castSound: 'warrior_taunt', iconIndex: 1,
    },
    {
      id: 'steelwall', name: 'Steel Wall', kind: 'buff', cooldown: 18, manaCost: 30,
      castTime: 0, range: 0, power: 0.55, color: PAL.ui.shield,
      castSound: 'shield_slam', iconIndex: 2,
    },
    {
      id: 'earthquake', name: 'Earthquake', kind: 'nova', cooldown: 34, manaCost: 80,
      castTime: 0, range: 0, radius: 7.5, power: 250, slow: { factor: 0.7, duration: 2.4 },
      color: PAL.cls.warrior, castSound: 'boss_slam', iconIndex: 3,
    },
  ],
  cleric: [
    {
      id: 'smitep', name: 'Smite', kind: 'projectile', cooldown: 1.8, manaCost: 12,
      castTime: 0, range: 22, radius: 1.0, speed: 25, power: 46, color: PAL.cls.cleric,
      castSound: 'heal_cast', impactSound: 'holy_nova', iconIndex: 0,
    },
    {
      id: 'healflash', name: 'Healing Flash', kind: 'heal', cooldown: 4, manaCost: 30,
      castTime: 1.0, range: 16, power: 165, color: PAL.cls.cleric,
      castSound: 'heal_cast', iconIndex: 1,
    },
    {
      id: 'holynova', name: 'Holy Nova', kind: 'groupHeal', cooldown: 15, manaCost: 70,
      castTime: 1.2, range: 0, radius: 10, power: 135, color: PAL.cls.cleric,
      castSound: 'holy_nova', iconIndex: 2,
    },
    {
      id: 'judgement', name: 'Judgement', kind: 'beam', cooldown: 30, manaCost: 85,
      castTime: 2.2, range: 17, radius: 0.9, power: 380, color: 0xffe9a3,
      castSound: 'arcane_beam', iconIndex: 3,
    },
  ],
  ranger: [
    {
      id: 'swiftarrow', name: 'Swift Arrow', kind: 'projectile', cooldown: 0.9, manaCost: 6,
      castTime: 0, range: 26, radius: 0.8, speed: 34, power: 38, color: PAL.cls.ranger,
      castSound: 'arrow_shot', iconIndex: 0,
    },
    {
      id: 'poisonarrow', name: 'Poison Arrow', kind: 'projectile', cooldown: 7, manaCost: 24,
      castTime: 0, range: 26, radius: 0.9, speed: 30, power: 34, dot: { dps: 22, duration: 6 },
      color: PAL.cls.ranger, castSound: 'arrow_shot', impactSound: 'poison_hit', iconIndex: 1,
    },
    {
      id: 'multishotp', name: 'Multishot', kind: 'projectile', cooldown: 9, manaCost: 32,
      castTime: 0, range: 22, radius: 0.8, speed: 30, power: 30, count: 5,
      color: PAL.cls.ranger, castSound: 'arrow_shot', iconIndex: 2,
    },
    {
      id: 'arrowrain', name: 'Arrow Rain', kind: 'groundAoe', cooldown: 30, manaCost: 75,
      castTime: 0.9, range: 24, radius: 4.8, power: 240, dot: { dps: 20, duration: 3 },
      color: PAL.cls.ranger, castSound: 'arrow_shot', impactSound: 'poison_hit', iconIndex: 3,
    },
  ],
};

// compat: kit por defecto (maga)
export const PLAYER_SPELLS: SpellDef[] = PLAYER_KITS.mage;

// Kits de la IA (usados por los cerebros de compañeros)
export const AI_SPELLS: Record<string, SpellDef> = {
  taunt: { id: 'taunt', name: 'Taunt', kind: 'taunt', cooldown: 12, manaCost: 20, castTime: 0, range: 20, power: 0, color: PAL.cls.warrior, castSound: 'warrior_taunt' },
  shieldslam: { id: 'shieldslam', name: 'Shield Bash', kind: 'melee', cooldown: 6, manaCost: 15, castTime: 0, range: 2.8, power: 55, color: PAL.cls.warrior, castSound: 'shield_slam' },
  wall: { id: 'wall', name: 'Steel Wall', kind: 'buff', cooldown: 22, manaCost: 30, castTime: 0, range: 0, power: 0.5, color: PAL.ui.shield },
  heal: { id: 'heal', name: 'Healing Flash', kind: 'heal', cooldown: 3.2, manaCost: 30, castTime: 1.2, range: 16, power: 150, color: PAL.cls.cleric, castSound: 'heal_cast' },
  groupheal: { id: 'groupheal', name: 'Holy Nova', kind: 'groupHeal', cooldown: 16, manaCost: 70, castTime: 1.6, range: 0, radius: 10, power: 120, color: PAL.cls.cleric, castSound: 'holy_nova' },
  smite: { id: 'smite', name: 'Smite', kind: 'projectile', cooldown: 2.4, manaCost: 10, castTime: 0, range: 14, radius: 0.9, speed: 22, power: 26, color: PAL.cls.cleric, castSound: 'heal_cast' },
  arrow: { id: 'arrow', name: 'Swift Arrow', kind: 'projectile', cooldown: 1.1, manaCost: 6, castTime: 0, range: 24, radius: 0.7, speed: 34, power: 34, color: PAL.cls.ranger, castSound: 'arrow_shot' },
  aifireball: { id: 'aifireball', name: 'Fireball', kind: 'projectile', cooldown: 2.0, manaCost: 14, castTime: 0, range: 24, radius: 1.3, speed: 26, power: 48, color: PAL.cls.mage, castSound: 'fireball_cast', impactSound: 'fireball_impact' },
  poison: { id: 'poison', name: 'Poison Arrow', kind: 'projectile', cooldown: 8, manaCost: 25, castTime: 0, range: 24, radius: 0.8, speed: 30, power: 30, dot: { dps: 18, duration: 6 }, color: PAL.cls.ranger, castSound: 'arrow_shot', impactSound: 'poison_hit' },
  multishot: { id: 'multishot', name: 'Multishot', kind: 'projectile', cooldown: 10, manaCost: 35, castTime: 0, range: 20, radius: 0.7, speed: 30, power: 26, color: PAL.cls.ranger, castSound: 'arrow_shot' },
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
    id: 'golem', name: 'Vulkran', title: 'The Magma Golem', modelKey: 'boss_golem',
    portrait: 'portrait_golem', color: 0x2a1f1c, accentColor: 0xff5a1f,
    maxHp: 10800, meleeDamage: 150, meleeInterval: 1.7, meleeRange: 3.4, moveSpeed: 3.0,
    scale: 2.6, radius: 1.9, phases: [0.66, 0.33], enrageAt: 0.2,
    attacks: [
      { id: 'slam', name: 'Golpe Sísmico', shape: 'cone', radius: 9, angle: Math.PI / 2.6, telegraphTime: 1.6, damage: 210, target: 'tank', cooldown: 7, weight: 3, sound: 'boss_cast_dark', resolveSound: 'boss_slam' },
      { id: 'firerings', name: 'Anillos de Fuego', shape: 'ring', radius: 7, inner: 4, telegraphTime: 1.8, damage: 165, target: 'self', count: 3, interval: 0.85, cooldown: 12, weight: 2, minPhase: 1, sound: 'boss_cast_dark', resolveSound: 'fireball_impact' },
      { id: 'meteorrain', name: 'Lluvia de Meteoros', shape: 'circle', radius: 3.4, telegraphTime: 2.2, damage: 185, target: 'players', count: 5, interval: 0.28, cooldown: 15, weight: 2, minPhase: 2, sound: 'meteor_incoming', resolveSound: 'meteor_impact' },
    ],
  },
  {
    id: 'lich', name: 'Mal\'ganeth', title: 'The Void Lich', modelKey: 'boss_lich',
    portrait: 'portrait_lich', color: 0x241f33, accentColor: 0x4ee8e0,
    maxHp: 13500, meleeDamage: 115, meleeInterval: 1.6, meleeRange: 3.0, moveSpeed: 3.3,
    scale: 2.2, radius: 1.5, phases: [0.6, 0.3], enrageAt: 0.15,
    attacks: [
      { id: 'frostzone', name: 'Suelo Gélido', shape: 'circle', radius: 4.2, telegraphTime: 1.5, damage: 80, target: 'random', count: 2, interval: 0.4, cooldown: 10, weight: 3, persistDps: 60, persistTime: 7, slow: { factor: 0.8, duration: 1.0 }, sound: 'boss_cast_dark', resolveSound: 'frost_nova' },
      { id: 'voidbarrage', name: 'Andanada del Vacío', shape: 'circle', radius: 2.6, telegraphTime: 1.3, damage: 140, target: 'players', count: 4, interval: 0.22, cooldown: 11, weight: 2, minPhase: 1, sound: 'boss_cast_dark', resolveSound: 'fireball_impact' },
      { id: 'voidring', name: 'Colapso del Vacío', shape: 'ring', radius: 9.5, inner: 3.2, telegraphTime: 2.1, damage: 205, target: 'self', cooldown: 14, weight: 2, minPhase: 2, sound: 'boss_cast_dark', resolveSound: 'boss_slam' },
    ],
    summons: { count: 2, hp: 700, damage: 42, speed: 4.4, atPhase: 1, cooldown: 24 },
  },
  {
    id: 'demon', name: 'Azkarath', title: 'The Demon Lord', modelKey: 'boss_demon',
    portrait: 'portrait_demon', color: 0x2b1216, accentColor: 0xff2e4d,
    maxHp: 16800, meleeDamage: 185, meleeInterval: 1.5, meleeRange: 3.6, moveSpeed: 3.6,
    scale: 2.9, radius: 2.0, phases: [0.5], enrageAt: 0.15,
    attacks: [
      { id: 'hellslam', name: 'Tajo Infernal', shape: 'cone', radius: 10, angle: Math.PI / 2.4, telegraphTime: 1.4, damage: 240, target: 'tank', cooldown: 7, weight: 3, sound: 'boss_cast_dark', resolveSound: 'boss_slam' },
      { id: 'brimstone', name: 'Azufre', shape: 'circle', radius: 3.2, telegraphTime: 1.9, damage: 200, target: 'players', count: 6, interval: 0.24, cooldown: 13, weight: 2, sound: 'meteor_incoming', resolveSound: 'meteor_impact' },
      { id: 'hellring', name: 'Corona de Fuego', shape: 'ring', radius: 8.5, inner: 3.5, telegraphTime: 1.7, damage: 215, target: 'self', count: 2, interval: 1.0, cooldown: 12, weight: 2, minPhase: 1, sound: 'boss_cast_dark', resolveSound: 'fireball_impact' },
    ],
    sweepBeam: { dps: 260, duration: 6, length: 19, width: 2.2, rotSpeed: 0.55, cooldown: 22, minPhase: 1 },
    shrinkArena: { atPhase: 1, radius: 14.5, edgeDps: 90 },
  },
];

// Adds invocados
export const ADD_RADIUS = 0.5;

// El boss se cura al matar a un héroe (desafío extra, notorio pero no letal)
export const BOSS_HEAL_ON_KILL = 0.08; // 8% de su vida máxima

// Slow mínimo sobre CUALQUIER unidad: nunca congelar. El hielo es la ventaja
// táctica clave del grupo (kitear al boss para revivir), así que ralentiza
// fuerte — pero el boss SIEMPRE sigue moviéndose (65% de velocidad mínimo).
export const MIN_SLOW_FACTOR = 0.65;

// ------------------------------------------------------------ diálogos boss
// El texto debe coincidir con los audios generados en public/audio/voice/
export type DialogueKey = 'intro' | 'phase' | 'enrage' | 'kill' | 'death';
export const BOSS_DIALOGUE: Record<string, Record<DialogueKey, string>> = {
  golem: {
    intro: 'Who dares enter my arena? I will turn you all to ash!',
    phase: 'The mountain awakens! Feel its fury!',
    enrage: 'Burn! All of you, burn!',
    kill: 'Ashes. Only ashes remain.',
    death: 'Impossible... the stone... breaks...',
  },
  lich: {
    intro: 'Your souls already belong to me, mortals.',
    phase: 'The void devours you... slowly.',
    enrage: 'Eternity claims you all!',
    kill: 'So fragile. So useless.',
    death: 'The void... calls... for me...',
  },
  demon: {
    intro: 'Welcome to your own personal hell!',
    phase: 'This realm burns with my rage!',
    enrage: 'Blood! Fire! Death!',
    kill: 'Pathetic! Who is next?',
    death: 'No... I am... eternal...',
  },
};

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
  { id: 'damage', name: 'Fire Fury', desc: '+12% spell damage per level', maxLevel: 5, baseCost: 80, costGrowth: 1.5, iconIndex: 0 },
  { id: 'cdr', name: 'Time Flow', desc: '-8% cooldowns per level', maxLevel: 4, baseCost: 90, costGrowth: 1.5, iconIndex: 1 },
  { id: 'vitality', name: 'Vital Pact', desc: '+15% party HP and mana per level', maxLevel: 5, baseCost: 70, costGrowth: 1.45, iconIndex: 2 },
  { id: 'revive', name: 'Lumen Wings', desc: '-20% revive time per level', maxLevel: 3, baseCost: 100, costGrowth: 1.6, iconIndex: 3 },
];

export function upgradeCost(def: UpgradeDef, level: number): number {
  return Math.round(def.baseCost * Math.pow(def.costGrowth, level));
}

// ---------------------------------------------------------------- lobby fake
export const LOBBY_NAMES = [
  'Kaelith', 'Dravok', 'Lyra_88', 'ShadowFang', 'Miriel', 'ThorneX', 'Vex',
  'Aurelia', 'Grimjaw', 'Nyx_Hunter', 'Solaris', 'Wraith77', 'Elowen', 'Karnak',
];
