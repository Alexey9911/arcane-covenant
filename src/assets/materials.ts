import * as THREE from 'three';
import { PAL } from '../game/palette';

// ------------------------------------------------------- texturas canvas
function canvas2d(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!];
}

function rand(seedRef: { s: number }): number {
  // mulberry32 — determinista para que el suelo no cambie entre sesiones
  seedRef.s |= 0; seedRef.s = (seedRef.s + 0x6d2b79f5) | 0;
  let t = Math.imul(seedRef.s ^ (seedRef.s >>> 15), 1 | seedRef.s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Piedra oscura con losas, juntas y motas. */
export function makeStoneTexture(size = 1024): THREE.CanvasTexture {
  const [c, ctx] = canvas2d(size);
  const seed = { s: 1337 };
  ctx.fillStyle = '#4a4556';
  ctx.fillRect(0, 0, size, size);
  const tiles = 8;
  const ts = size / tiles;
  for (let y = 0; y < tiles; y++) {
    for (let x = 0; x < tiles; x++) {
      const v = 0.82 + rand(seed) * 0.35;
      const r = Math.round(58 * v), g = Math.round(54 * v), b = Math.round(68 * v);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      const inset = 2 + rand(seed) * 3;
      ctx.fillRect(x * ts + inset, y * ts + inset, ts - inset * 2, ts - inset * 2);
      // biselado sutil
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(x * ts + inset, y * ts + inset, ts - inset * 2, 3);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(x * ts + inset, y * ts + ts - inset - 3, ts - inset * 2, 3);
    }
  }
  // motas de desgaste
  for (let i = 0; i < 2600; i++) {
    const a = 0.03 + rand(seed) * 0.08;
    ctx.fillStyle = rand(seed) > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a * 1.4})`;
    const s = 1 + rand(seed) * 2.5;
    ctx.fillRect(rand(seed) * size, rand(seed) * size, s, s);
  }
  // grietas
  ctx.strokeStyle = 'rgba(10,8,14,0.55)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 14; i++) {
    let x = rand(seed) * size, y = rand(seed) * size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const steps = 6 + Math.floor(rand(seed) * 8);
    for (let j = 0; j < steps; j++) {
      x += (rand(seed) - 0.5) * 90;
      y += (rand(seed) - 0.5) * 90;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/** Círculo de invocación: anillos concéntricos + glifos rúnicos (emissiveMap). */
export function makeRuneTexture(size = 2048): THREE.CanvasTexture {
  const [c, ctx] = canvas2d(size);
  const seed = { s: 777 };
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  const cx = size / 2, cy = size / 2;
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#fff';
  ctx.lineCap = 'round';

  const ring = (r: number, w: number) => {
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  };
  // anillos principales
  ring(size * 0.455, 5);
  ring(size * 0.43, 2.5);
  ring(size * 0.30, 4);
  ring(size * 0.155, 3);
  ring(size * 0.145, 1.5);

  // glifos entre anillos
  const glyphBand = (radius: number, count: number, gs: number) => {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rand(seed) * 0.05;
      const gx = cx + Math.cos(a) * radius;
      const gy = cy + Math.sin(a) * radius;
      ctx.save();
      ctx.translate(gx, gy);
      ctx.rotate(a + Math.PI / 2);
      ctx.lineWidth = 3;
      // glifo: 3-5 trazos angulares aleatorios dentro de una caja gs
      const strokes = 3 + Math.floor(rand(seed) * 3);
      ctx.beginPath();
      let px = (rand(seed) - 0.5) * gs, py = (rand(seed) - 0.5) * gs;
      ctx.moveTo(px, py);
      for (let sN = 0; sN < strokes; sN++) {
        px = (rand(seed) - 0.5) * gs;
        py = (rand(seed) - 0.5) * gs;
        ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.restore();
    }
  };
  glyphBand(size * 0.37, 26, size * 0.036);
  glyphBand(size * 0.225, 16, size * 0.03);

  // sigilo central: triángulos entrelazados + círculo
  const tri = (r: number, rot: number) => {
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let i = 0; i <= 3; i++) {
      const a = rot + (i / 3) * Math.PI * 2;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  };
  tri(size * 0.12, -Math.PI / 2);
  tri(size * 0.12, Math.PI / 2);
  ring(size * 0.05, 3);

  // marcas radiales exteriores
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const r0 = size * 0.44, r1 = size * 0.455;
    ctx.lineWidth = i % 4 === 0 ? 4 : 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Sprite radial suave (partículas, glows). */
export function makeGlowSprite(size = 128, hardness = 0.18): THREE.CanvasTexture {
  const [c, ctx] = canvas2d(size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(hardness, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.22)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Mancha blanda irregular para planos de niebla. */
export function makeFogSprite(size = 256): THREE.CanvasTexture {
  const [c, ctx] = canvas2d(size);
  const seed = { s: 4242 };
  for (let i = 0; i < 26; i++) {
    const x = size * (0.2 + rand(seed) * 0.6);
    const y = size * (0.2 + rand(seed) * 0.6);
    const r = size * (0.12 + rand(seed) * 0.22);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,255,255,${0.05 + rand(seed) * 0.07})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ------------------------------------------------------ librería compartida
export class Materials {
  readonly stoneTex = makeStoneTexture();
  readonly runeTex = makeRuneTexture();
  readonly glowTex = makeGlowSprite();
  readonly fogTex = makeFogSprite();

  readonly stone = new THREE.MeshStandardMaterial({
    map: this.stoneTex, color: 0xbfb8cf, roughness: 0.95, metalness: 0.04,
  });
  readonly stoneDark = new THREE.MeshStandardMaterial({
    map: this.stoneTex, color: 0x7d7690, roughness: 0.97, metalness: 0.02,
  });
  readonly runeGround: THREE.MeshStandardMaterial;
  readonly crystal = new THREE.MeshStandardMaterial({
    color: 0x0b2a2e, roughness: 0.15, metalness: 0.1, flatShading: true,
    emissive: PAL.env.crystal, emissiveIntensity: 2.2,
  });
  readonly trimEmissive = new THREE.MeshStandardMaterial({
    color: 0x120e1c, roughness: 0.4, metalness: 0.3,
    emissive: PAL.env.runeArcane, emissiveIntensity: 2.0,
  });

  constructor() {
    this.stoneTex.repeat.set(6, 6);
    this.runeGround = new THREE.MeshStandardMaterial({
      map: this.stoneTex, color: 0xb9b2ca, roughness: 0.92, metalness: 0.05,
      emissiveMap: this.runeTex, emissive: new THREE.Color(PAL.env.runeArcane),
      emissiveIntensity: 1.6,
    });
  }

  /** Pulso de las runas del suelo (llamado por el entorno cada frame). */
  updatePulse(t: number): void {
    this.runeGround.emissiveIntensity = 1.35 + Math.sin(t * 0.8) * 0.35 + Math.sin(t * 2.13) * 0.12;
    this.crystal.emissiveIntensity = 2.0 + Math.sin(t * 1.7) * 0.5;
  }
}
