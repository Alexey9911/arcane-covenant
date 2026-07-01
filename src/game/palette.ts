// Fuente única de color del juego: tokens de referencia -> roles semánticos.
// Mundo profundo y desaturado; señales de gameplay vívidas y emisivas.

export const PAL = {
  env: {
    abyss: 0x12101c,
    stone: 0x3a3644,
    stoneLight: 0x6f6685,
    fog: 0x1c1830,
    runeArcane: 0xa06bff,
    crystal: 0x4ee8e0,
  },
  cls: {
    mage: 0xff6b2b,
    cleric: 0xffd977,
    warrior: 0x7fb2ff,
    ranger: 0x58e05a,
  },
  boss: {
    threat: 0xff2e4d,
    add: 0xc44dff,
  },
  ui: {
    health: 0xff4757,
    mana: 0x5c8bff,
    gold: 0xffc94d,
    shield: 0x67e8f9,
    revive: 0xffe9a3,
    xp: 0xb57dff,
  },
} as const;

export function hex(c: number): string {
  return `#${c.toString(16).padStart(6, '0')}`;
}
