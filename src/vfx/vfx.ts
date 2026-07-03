import * as THREE from 'three';
import { Materials } from '../assets/materials';

// ============================================================ partículas GPU
const MAX_PARTICLES = 2400;

const PARTICLE_VERT = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
attribute float aAlpha;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (320.0 / max(1.0, -mv.z));
  gl_Position = projectionMatrix * mv;
}
`;

const PARTICLE_FRAG = /* glsl */ `
uniform sampler2D uMap;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 tex = texture2D(uMap, gl_PointCoord);
  gl_FragColor = vec4(vColor * tex.rgb, tex.a * vAlpha);
  if (gl_FragColor.a < 0.003) discard;
}
`;

export interface SpawnOpts {
  count: number;
  pos: THREE.Vector3;
  spread?: number;          // radio de aparición
  dir?: THREE.Vector3;      // dirección media (normalizada)
  cone?: number;            // apertura alrededor de dir (0..1)
  speed?: [number, number];
  life?: [number, number];
  size?: [number, number];
  colorA: THREE.Color;      // color inicial
  colorB?: THREE.Color;     // color final (lerp con la vida)
  gravity?: number;
  drag?: number;
  upBias?: number;
}

class ParticlePool {
  readonly points: THREE.Points;
  private readonly pos: Float32Array = new Float32Array(MAX_PARTICLES * 3);
  private readonly col: Float32Array = new Float32Array(MAX_PARTICLES * 3);
  private readonly size: Float32Array = new Float32Array(MAX_PARTICLES);
  private readonly alpha: Float32Array = new Float32Array(MAX_PARTICLES);
  private readonly vel: Float32Array = new Float32Array(MAX_PARTICLES * 3);
  private readonly life: Float32Array = new Float32Array(MAX_PARTICLES);
  private readonly maxLife: Float32Array = new Float32Array(MAX_PARTICLES);
  private readonly s0: Float32Array = new Float32Array(MAX_PARTICLES);
  private readonly s1: Float32Array = new Float32Array(MAX_PARTICLES);
  private readonly cA: Float32Array = new Float32Array(MAX_PARTICLES * 3);
  private readonly cB: Float32Array = new Float32Array(MAX_PARTICLES * 3);
  private readonly grav: Float32Array = new Float32Array(MAX_PARTICLES);
  private readonly drag: Float32Array = new Float32Array(MAX_PARTICLES);
  private cursor = 0;

  constructor(mats: Materials) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    const mat = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      uniforms: { uMap: { value: mats.glowTex } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }

  spawn(o: SpawnOpts): void {
    const speed = o.speed ?? [1, 3];
    const life = o.life ?? [0.4, 0.9];
    const size = o.size ?? [0.5, 1.1];
    const spread = o.spread ?? 0.1;
    const cone = o.cone ?? 1;
    const cB = o.colorB ?? o.colorA;
    for (let n = 0; n < o.count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX_PARTICLES;
      // posición
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      const rr = Math.cbrt(Math.random()) * spread;
      this.pos[i * 3] = o.pos.x + Math.sin(ph) * Math.cos(th) * rr;
      this.pos[i * 3 + 1] = o.pos.y + Math.cos(ph) * rr;
      this.pos[i * 3 + 2] = o.pos.z + Math.sin(ph) * Math.sin(th) * rr;
      // velocidad
      const sp = speed[0] + Math.random() * (speed[1] - speed[0]);
      let vx: number, vy: number, vz: number;
      if (o.dir) {
        vx = o.dir.x + (Math.random() - 0.5) * 2 * cone;
        vy = o.dir.y + (Math.random() - 0.5) * 2 * cone;
        vz = o.dir.z + (Math.random() - 0.5) * 2 * cone;
      } else {
        vx = Math.sin(ph) * Math.cos(th);
        vy = Math.cos(ph);
        vz = Math.sin(ph) * Math.sin(th);
      }
      const vl = Math.hypot(vx, vy, vz) || 1;
      this.vel[i * 3] = (vx / vl) * sp;
      this.vel[i * 3 + 1] = (vy / vl) * sp + (o.upBias ?? 0);
      this.vel[i * 3 + 2] = (vz / vl) * sp;
      // vida y aspecto
      const lf = life[0] + Math.random() * (life[1] - life[0]);
      this.life[i] = lf;
      this.maxLife[i] = lf;
      this.s0[i] = size[0] + Math.random() * (size[1] - size[0]);
      this.s1[i] = this.s0[i] * 0.25;
      this.cA[i * 3] = o.colorA.r; this.cA[i * 3 + 1] = o.colorA.g; this.cA[i * 3 + 2] = o.colorA.b;
      this.cB[i * 3] = cB.r; this.cB[i * 3 + 1] = cB.g; this.cB[i * 3 + 2] = cB.b;
      this.grav[i] = o.gravity ?? 0;
      this.drag[i] = o.drag ?? 0.9;
    }
  }

  update(dt: number): void {
    const dragBase = Math.pow(0.5, dt); // referencia
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]); // 1 -> 0
      const dragK = Math.pow(this.drag[i], dt * 60);
      this.vel[i * 3] *= dragK;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * dragK - this.grav[i] * dt;
      this.vel[i * 3 + 2] *= dragK;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.03) this.pos[i * 3 + 1] = 0.03;
      const inv = 1 - k;
      this.size[i] = this.s0[i] * k + this.s1[i] * inv;
      this.alpha[i] = k < 0.75 ? k / 0.75 : (1 - k) / 0.25;
      this.col[i * 3] = this.cA[i * 3] * k + this.cB[i * 3] * inv;
      this.col[i * 3 + 1] = this.cA[i * 3 + 1] * k + this.cB[i * 3 + 1] * inv;
      this.col[i * 3 + 2] = this.cA[i * 3 + 2] * k + this.cB[i * 3 + 2] * inv;
    }
    void dragBase;
    const g = this.points.geometry;
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
  }
}

// ============================================================== telegraphs
const TG_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv * 2.0 - 1.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const TG_FRAG = /* glsl */ `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uProgress;  // 0..1 countdown; en modo zona: -1
uniform float uInner;     // fracción interior (ring)
uniform float uAngle;     // semiángulo (cone)
uniform int uShape;       // 0 circle, 1 ring, 2 cone
uniform float uTime;
uniform float uOpacity;

float band(float x, float center, float w) {
  return smoothstep(center - w, center, x) * (1.0 - smoothstep(center, center + w, x));
}

void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  float ang = atan(vUv.y, vUv.x);

  float inShape = 1.0;
  float edge = 0.0;
  if (uShape == 0) {
    inShape = 1.0;
    edge = band(r, 0.985, 0.03);
  } else if (uShape == 1) {
    inShape = step(uInner, r);
    edge = band(r, 0.985, 0.03) + band(r, uInner + 0.012, 0.03);
  } else {
    float half_ = uAngle;
    float am = abs(ang);
    inShape = step(am, half_);
    edge = band(r, 0.985, 0.03) * inShape + band(am, half_, 0.05) * step(r, 1.0) * 0.9;
  }
  if (inShape < 0.5 && edge < 0.01) discard;

  vec3 col = uColor;
  float fill;
  float runes = 0.0;
  if (uProgress < 0.0) {
    // zona persistente: remolino animado
    float swirl = sin(r * 14.0 - uTime * 3.0) * 0.5 + 0.5;
    float swirl2 = sin(ang * 6.0 + uTime * 1.6) * 0.5 + 0.5;
    fill = 0.16 + swirl * swirl2 * 0.14;
  } else {
    // countdown: relleno radial desde el centro (o desde inner en anillos)
    float p0 = (uShape == 1) ? mix(uInner, 1.0, uProgress) : uProgress;
    fill = step(r, p0) * 0.26;
    // pulso final
    float flash = smoothstep(0.82, 1.0, uProgress);
    fill += flash * 0.28 * (0.5 + 0.5 * sin(uTime * 26.0));
    // marcador del frente de avance
    fill += band(r, p0, 0.02) * 0.9;

    // --- runas que se completan una a una alrededor del borde ---
    float aNorm;
    if (uShape == 2) {
      aNorm = clamp((ang + uAngle) / (2.0 * uAngle), 0.0, 1.0); // dentro del cono
    } else {
      aNorm = fract((ang + 3.14159) / 6.28318 + uTime * 0.02);  // giro lentísimo
    }
    float slots = (uShape == 2) ? 6.0 : 10.0;
    float slotIdx = floor(aNorm * slots);
    float slotFrac = fract(aNorm * slots);
    // glifo: rombo con muesca (procedural) en la banda exterior
    float dCenter = abs(slotFrac - 0.5);
    float glyph = band(r, 0.895, 0.032) * (1.0 - smoothstep(0.10, 0.24, dCenter));
    glyph += band(r, 0.895, 0.012) * (1.0 - smoothstep(0.02, 0.06, dCenter)) * 1.5; // núcleo
    float litCount = uProgress * slots;
    float lit = step(slotIdx + 0.5, litCount);
    // pop al encenderse (decae mientras avanza el countdown)
    float pop = lit * exp(-max(0.0, litCount - (slotIdx + 0.5)) * 2.2);
    runes = glyph * (0.10 + lit * 1.1 + pop * 2.2) * inShape;

    // anillo interior punteado giratorio (lectura arcana)
    float dash = band(r, 0.62, 0.010) * step(0.55, fract(aNorm * 18.0 - uTime * 0.35));
    runes += dash * (0.25 + uProgress * 0.7) * inShape;
  }

  float a = (fill * inShape + edge * 1.4 + runes * 0.9) * uOpacity;
  vec3 rgb = col * (fill * inShape * 1.2 + edge * 2.6 + runes * 3.0);
  gl_FragColor = vec4(rgb, a);
}
`;

export interface TelegraphHandle {
  mesh: THREE.Mesh;
  setProgress(p: number): void;
  dispose(): void;
  readonly disposed: boolean;
}

// ================================================================== beams
const BEAM_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const BEAM_FRAG = /* glsl */ `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uTime;
uniform float uIntensity;
void main() {
  float across = abs(vUv.x - 0.5) * 2.0; // 0 centro, 1 borde
  float core = smoothstep(1.0, 0.0, across);
  core = pow(core, 2.2);
  float streaks = 0.75 + 0.25 * sin(vUv.y * 34.0 - uTime * 42.0);
  float noiseW = 0.85 + 0.15 * sin(vUv.y * 9.0 - uTime * 20.0 + sin(uTime * 3.1));
  vec3 col = uColor * core * streaks * noiseW * 3.2 + vec3(1.0) * pow(core, 6.0) * 2.2;
  float a = core * uIntensity;
  gl_FragColor = vec4(col * uIntensity, a);
}
`;

export interface BeamHandle {
  set(from: THREE.Vector3, to: THREE.Vector3): void;
  setIntensity(x: number): void;
  end(): void;
  readonly ended: boolean;
}

// ================================================================ reticle
const RETICLE_FRAG = /* glsl */ `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uTime;
uniform float uOpacity;

float band(float x, float center, float w) {
  return smoothstep(center - w, center, x) * (1.0 - smoothstep(center, center + w, x));
}

void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  float ang = atan(vUv.y, vUv.x);
  float aNorm = (ang + 3.14159) / 6.28318;

  // círculo fino interior + punto central
  float circle = band(r, 0.42, 0.025);
  float dot_ = smoothstep(0.09, 0.02, r) * (0.6 + 0.4 * sin(uTime * 6.0));

  // 3 arcos giratorios exteriores
  float arcMask = step(0.62, fract(aNorm * 3.0 + uTime * 0.22));
  float arcs = band(r, 0.78, 0.045) * arcMask;

  // 4 muescas cardinales que respiran
  float notch = band(r, 0.55, 0.05) * (1.0 - smoothstep(0.03, 0.09, abs(fract(aNorm * 4.0) - 0.5) * 0.5));

  float v = circle + dot_ + arcs * 1.4 + notch * 0.7;
  gl_FragColor = vec4(uColor * v * 2.2, v * uOpacity);
}
`;

export interface ReticleHandle {
  setPos(pos: THREE.Vector3): void;
  setColor(color: number): void;
  setVisible(v: boolean): void;
}

// ============================================================ slash (melee)
// Arco de barrido: una hoja de energía recorre el sector angular con estela.
const SLASH_FRAG = /* glsl */ `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uProgress; // 0..1
uniform float uHalf;     // semiángulo del arco

void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  float ang = atan(vUv.y, vUv.x);
  if (abs(ang) > uHalf + 0.15) discard;

  // frente de la hoja: barre de -uHalf a +uHalf
  float sweep = mix(-uHalf, uHalf, uProgress);
  float d = ang - sweep;

  // hoja brillante + estela detrás (d < 0 = ya barrido)
  float blade = exp(-abs(d) * 16.0);
  float trailMask = (d < 0.0) ? exp(d * 3.2) : 0.0;

  // banda radial (media luna, no disco completo)
  float radial = smoothstep(0.30, 0.55, r) * (1.0 - smoothstep(0.88, 1.0, r));
  float fade = 1.0 - uProgress * uProgress;

  float v = (blade * 2.6 + trailMask * 0.85) * radial * fade;
  vec3 col = uColor * v * 2.4 + vec3(1.0) * blade * radial * fade * 1.4;
  gl_FragColor = vec4(col, v);
}
`;

// ============================================================ crack (decal)
// Grietas radiales incandescentes que se enfrían: blanco → color → brasa.
const CRACK_FRAG = /* glsl */ `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uAge;   // 0 recién creada .. 1 apagada
uniform float uSeed;
uniform float uTime;

void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  float ang = atan(vUv.y, vUv.x);

  // 7 ramas radiales con zigzag dependiente del radio (grietas quebradas)
  float jag = sin(r * 11.0 + uSeed * 7.0) * 0.055 + sin(r * 23.0 + uSeed * 3.0) * 0.03;
  float branch = abs(fract((ang / 6.28318 + jag) * 7.0 + uSeed) - 0.5);
  float widthK = 0.035 + r * 0.03; // se abren hacia fuera
  float crack = 1.0 - smoothstep(0.0, widthK, branch);

  // anillos finos de fractura cruzados
  float ringCrack = (1.0 - smoothstep(0.0, 0.02, abs(fract(r * 3.0 + uSeed) - 0.5) * 0.5)) * 0.5;
  crack = max(crack, ringCrack * step(0.25, r));

  crack *= 1.0 - smoothstep(0.72, 1.0, r); // desvanecer al borde
  if (crack < 0.02) discard;

  float hot = 1.0 - uAge;
  float ember = 0.72 + 0.28 * sin(uTime * 6.0 + uSeed * 20.0 + r * 9.0);
  vec3 col = mix(vec3(1.0, 0.97, 0.88), uColor, clamp(uAge * 1.7 + r * 0.3, 0.0, 1.0));
  float a = crack * (0.12 + hot * 0.88) * ember;
  gl_FragColor = vec4(col * crack * (0.5 + hot * 3.4) * ember, a);
}
`;

// =============================================================== vfx system
interface Shockwave { mesh: THREE.Mesh; t: number; dur: number; maxR: number; }
interface Scorch { mesh: THREE.Mesh; t: number; dur: number; }
interface PooledLight { light: THREE.PointLight; t: number; dur: number; i0: number; }
interface Slash { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; t: number; dur: number; }
interface Crack { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; t: number; dur: number; }

export class VfxSystem {
  readonly root = new THREE.Group();
  private readonly mats: Materials;
  private readonly particles: ParticlePool;
  private readonly telegraphs = new Set<{ mesh: THREE.Mesh; mat: THREE.ShaderMaterial }>();
  private readonly beams = new Set<{ mesh: THREE.Mesh; mat: THREE.ShaderMaterial; ended: boolean; fade: number }>();
  private shockwaves: Shockwave[] = [];
  private scorches: Scorch[] = [];
  private slashes: Slash[] = [];
  private cracks: Crack[] = [];
  private readonly lights: PooledLight[] = [];
  private time = 0;
  private readonly scorchMat: THREE.MeshBasicMaterial;
  private readonly tgGeo = new THREE.PlaneGeometry(2, 2);
  private readonly ringGeo = new THREE.RingGeometry(0.92, 1, 64);
  private readonly beamGeo: THREE.PlaneGeometry;

  constructor(mats: Materials) {
    this.mats = mats;
    this.particles = new ParticlePool(mats);
    this.root.add(this.particles.points);
    this.scorchMat = new THREE.MeshBasicMaterial({
      map: mats.glowTex, color: 0x000000, transparent: true, opacity: 0.55,
      depthWrite: false, blending: THREE.NormalBlending,
    });
    this.beamGeo = new THREE.PlaneGeometry(1, 1, 1, 24);
    // pool de luces de impacto
    for (let i = 0; i < 5; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 22, 2);
      l.position.y = 1.5;
      this.lights.push({ light: l, t: 0, dur: 1, i0: 0 });
      this.root.add(l);
    }
  }

  // ------------------------------------------------------------- partículas
  burst(o: SpawnOpts): void {
    this.particles.spawn(o);
  }

  // --------------------------------------------------------------- lights
  flashLight(pos: THREE.Vector3, color: number, intensity = 60, dur = 0.4): void {
    let slot = this.lights.find((l) => l.t <= 0);
    if (!slot) slot = this.lights[0];
    slot.light.color.setHex(color);
    slot.light.position.set(pos.x, Math.max(1.2, pos.y + 0.8), pos.z);
    slot.t = dur;
    slot.dur = dur;
    slot.i0 = intensity;
  }

  // -------------------------------------------------------------- reticle
  /** Indicador de puntería bajo el cursor (dónde caerá el hechizo). */
  reticle(color: number): ReticleHandle {
    const mat = new THREE.ShaderMaterial({
      vertexShader: TG_VERT,
      fragmentShader: RETICLE_FRAG,
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uTime: { value: 0 },
        uOpacity: { value: 0.85 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const mesh = new THREE.Mesh(this.tgGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.scale.setScalar(0.9);
    mesh.position.y = 0.055;
    mesh.renderOrder = 4;
    mesh.visible = false;
    this.root.add(mesh);
    this.reticles.add(mat);
    return {
      setPos: (p: THREE.Vector3) => { mesh.position.set(p.x, 0.055, p.z); },
      setColor: (c: number) => { (mat.uniforms.uColor.value as THREE.Color).setHex(c); },
      setVisible: (v: boolean) => { mesh.visible = v; },
    };
  }

  private reticles = new Set<THREE.ShaderMaterial>();

  // ------------------------------------------------------------ telegraphs
  telegraph(
    shape: 'circle' | 'ring' | 'cone',
    pos: THREE.Vector3,
    radius: number,
    opts: { inner?: number; angle?: number; dir?: number; color?: number; benefic?: boolean } = {},
  ): TelegraphHandle {
    const color = opts.color ?? (opts.benefic ? 0xffe9a3 : 0xff2e4d);
    const mat = new THREE.ShaderMaterial({
      vertexShader: TG_VERT,
      fragmentShader: TG_FRAG,
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uProgress: { value: 0 },
        uInner: { value: (opts.inner ?? 0) / radius },
        uAngle: { value: (opts.angle ?? Math.PI / 3) / 2 },
        uShape: { value: shape === 'circle' ? 0 : shape === 'ring' ? 1 : 2 },
        uTime: { value: 0 },
        uOpacity: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const mesh = new THREE.Mesh(this.tgGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    if (shape === 'cone') mesh.rotation.z = -(opts.dir ?? 0);
    mesh.position.set(pos.x, 0.06, pos.z);
    mesh.scale.setScalar(radius);
    mesh.renderOrder = 3;
    this.root.add(mesh);
    const entry = { mesh, mat };
    this.telegraphs.add(entry);
    let disposed = false;
    return {
      mesh,
      setProgress: (p: number) => { mat.uniforms.uProgress.value = p; },
      dispose: () => {
        if (disposed) return;
        disposed = true;
        this.telegraphs.delete(entry);
        this.root.remove(mesh);
        mat.dispose();
      },
      get disposed() { return disposed; },
    };
  }

  /** Zona persistente (escarcha, anillo de revive…). */
  zone(pos: THREE.Vector3, radius: number, color: number): TelegraphHandle {
    const h = this.telegraph('circle', pos, radius, { color });
    h.setProgress(-1);
    return h;
  }

  // ------------------------------------------------------------ shockwaves
  shockwave(pos: THREE.Vector3, color: number, maxR: number, dur = 0.55, y = 0.1): void {
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.9, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });
    const mesh = new THREE.Mesh(this.ringGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(pos.x, y, pos.z);
    mesh.scale.setScalar(0.1);
    mesh.renderOrder = 4;
    this.root.add(mesh);
    this.shockwaves.push({ mesh, t: 0, dur, maxR });
  }

  // ---------------------------------------------------------------- slash
  /** Arco de barrido melee (media luna de energía que barre el sector). */
  meleeArc(pos: THREE.Vector3, colorHex: number, dir: number, radius: number, half = 1.05): void {
    const mat = new THREE.ShaderMaterial({
      vertexShader: TG_VERT,
      fragmentShader: SLASH_FRAG,
      uniforms: {
        uColor: { value: new THREE.Color(colorHex) },
        uProgress: { value: 0 },
        uHalf: { value: half },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const mesh = new THREE.Mesh(this.tgGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = -dir;
    mesh.position.set(pos.x, 0.35, pos.z);
    mesh.scale.setScalar(radius);
    mesh.renderOrder = 6;
    this.root.add(mesh);
    this.slashes.push({ mesh, mat, t: 0, dur: 0.3 });
  }

  // ---------------------------------------------------------------- crack
  /** Decal persistente de grietas incandescentes que se van enfriando. */
  crack(pos: THREE.Vector3, colorHex: number, radius: number, dur = 9): void {
    const mat = new THREE.ShaderMaterial({
      vertexShader: TG_VERT,
      fragmentShader: CRACK_FRAG,
      uniforms: {
        uColor: { value: new THREE.Color(colorHex) },
        uAge: { value: 0 },
        uSeed: { value: Math.random() * 10 },
        uTime: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const mesh = new THREE.Mesh(this.tgGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = Math.random() * Math.PI * 2;
    mesh.position.set(pos.x, 0.05, pos.z);
    mesh.scale.setScalar(radius);
    mesh.renderOrder = 2;
    this.root.add(mesh);
    this.cracks.push({ mesh, mat, t: 0, dur });
    this.scorch(pos, radius * 1.15, dur * 0.9);
  }

  /** Escombros + polvo de un impacto contra el suelo (slam melee, embestida). */
  slamDebris(pos: THREE.Vector3, colorHex: number, dir?: number): void {
    const c = new THREE.Color(colorHex);
    const d = dir !== undefined
      ? new THREE.Vector3(Math.cos(dir), 0.55, Math.sin(dir))
      : new THREE.Vector3(0, 1, 0);
    // brasas que salen disparadas
    this.burst({
      count: 42, pos: new THREE.Vector3(pos.x, 0.25, pos.z), spread: 0.6,
      dir: d, cone: dir !== undefined ? 0.55 : 0.9,
      speed: [7, 17], life: [0.3, 0.8], size: [0.5, 1.5],
      colorA: this.cWhite.clone().lerp(c, 0.3), colorB: c, gravity: 14, drag: 0.9,
    });
    // polvo pesado que se queda
    this.burst({
      count: 18, pos: new THREE.Vector3(pos.x, 0.15, pos.z), spread: 0.9,
      dir: d, cone: 0.8,
      speed: [1.5, 4], life: [0.7, 1.4], size: [2.2, 4.2],
      colorA: c.clone().multiplyScalar(0.5), colorB: new THREE.Color(0x201826), gravity: -0.8, drag: 0.94,
    });
  }

  // --------------------------------------------------------------- scorch
  scorch(pos: THREE.Vector3, radius: number, dur = 7): void {
    const mesh = new THREE.Mesh(this.tgGeo, this.scorchMat.clone());
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(pos.x, 0.045, pos.z);
    mesh.scale.setScalar(radius * 0.85);
    mesh.renderOrder = 2;
    this.root.add(mesh);
    this.scorches.push({ mesh, t: 0, dur });
  }

  // ---------------------------------------------------------------- beams
  beam(color: number, width: number): BeamHandle {
    const mat = new THREE.ShaderMaterial({
      vertexShader: BEAM_VERT,
      fragmentShader: BEAM_FRAG,
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uTime: { value: 0 },
        uIntensity: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    });
    const mesh = new THREE.Mesh(this.beamGeo, mat);
    mesh.renderOrder = 8;
    this.root.add(mesh);
    const entry = { mesh, mat, ended: false, fade: 1 };
    this.beams.add(entry);
    const self = this;
    const from = new THREE.Vector3(), to = new THREE.Vector3();
    return {
      set(f: THREE.Vector3, t: THREE.Vector3) {
        from.copy(f); to.copy(t);
        const mid = from.clone().add(to).multiplyScalar(0.5);
        const len = from.distanceTo(to);
        mesh.position.copy(mid);
        mesh.scale.set(width, len, 1);
        mesh.lookAt(self.cameraPos); // billboard hacia cámara alrededor del eje
        const dir = to.clone().sub(from).normalize();
        const up = new THREE.Vector3(0, 1, 0);
        const axis = dir;
        // orientar: la Y del plano a lo largo del beam, mirando a cámara
        const camDir = self.cameraPos.clone().sub(mid).normalize();
        const right = axis.clone().cross(camDir).normalize();
        const forward = right.clone().cross(axis).normalize();
        const m = new THREE.Matrix4().makeBasis(right, axis, forward);
        mesh.setRotationFromMatrix(m);
        void up;
      },
      setIntensity(x: number) { mat.uniforms.uIntensity.value = x; },
      end() { entry.ended = true; },
      get ended() { return entry.ended; },
    };
  }

  cameraPos = new THREE.Vector3();

  // ================================================================ update
  update(dt: number, t: number, cameraPos: THREE.Vector3): void {
    this.time = t;
    this.cameraPos.copy(cameraPos);
    this.particles.update(dt);

    for (const tg of this.telegraphs) tg.mat.uniforms.uTime.value = t;
    for (const rm of this.reticles) rm.uniforms.uTime.value = t;

    for (const b of [...this.beams]) {
      b.mat.uniforms.uTime.value = t;
      if (b.ended) {
        b.fade -= dt * 7;
        b.mat.uniforms.uIntensity.value = Math.max(0, b.fade);
        if (b.fade <= 0) {
          this.beams.delete(b);
          this.root.remove(b.mesh);
          b.mat.dispose();
        }
      }
    }

    this.shockwaves = this.shockwaves.filter((s) => {
      s.t += dt;
      const k = s.t / s.dur;
      if (k >= 1) {
        this.root.remove(s.mesh);
        (s.mesh.material as THREE.Material).dispose();
        return false;
      }
      const e = 1 - Math.pow(1 - k, 3);
      s.mesh.scale.setScalar(Math.max(0.1, e * s.maxR));
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
      return true;
    });

    this.scorches = this.scorches.filter((s) => {
      s.t += dt;
      const k = s.t / s.dur;
      if (k >= 1) {
        this.root.remove(s.mesh);
        (s.mesh.material as THREE.Material).dispose();
        return false;
      }
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - k * k);
      return true;
    });

    this.slashes = this.slashes.filter((s) => {
      s.t += dt;
      const k = s.t / s.dur;
      if (k >= 1) {
        this.root.remove(s.mesh);
        s.mat.dispose();
        return false;
      }
      s.mat.uniforms.uProgress.value = k;
      return true;
    });

    this.cracks = this.cracks.filter((c) => {
      c.t += dt;
      const k = c.t / c.dur;
      if (k >= 1) {
        this.root.remove(c.mesh);
        c.mat.dispose();
        return false;
      }
      // enfriado rápido al principio, brasa larga después
      c.mat.uniforms.uAge.value = Math.min(1, Math.pow(k, 0.55));
      c.mat.uniforms.uTime.value = t;
      return true;
    });

    for (const l of this.lights) {
      if (l.t > 0) {
        l.t -= dt;
        const k = Math.max(0, l.t / l.dur);
        l.light.intensity = l.i0 * k * k;
      } else {
        l.light.intensity = 0;
      }
    }
  }

  // ========================================================== presets de VFX
  private readonly cWhite = new THREE.Color(0xffffff);

  impact(pos: THREE.Vector3, colorHex: number, scale = 1): void {
    const c = new THREE.Color(colorHex);
    this.burst({
      count: Math.round(26 * scale), pos, spread: 0.3 * scale,
      speed: [3 * scale, 9 * scale], life: [0.25, 0.6], size: [0.5 * scale, 1.3 * scale],
      colorA: this.cWhite.clone().lerp(c, 0.35), colorB: c, gravity: 6, drag: 0.88,
    });
    this.burst({
      count: Math.round(10 * scale), pos, spread: 0.2,
      speed: [0.5, 2], life: [0.5, 1.0], size: [1.2 * scale, 2.4 * scale],
      colorA: c, colorB: c.clone().multiplyScalar(0.25), gravity: -1.2, drag: 0.94,
    });
    this.shockwave(pos, colorHex, 2.6 * scale, 0.45);
    this.flashLight(pos, colorHex, 70 * scale, 0.35);
  }

  bigImpact(pos: THREE.Vector3, colorHex: number, radius: number): void {
    const c = new THREE.Color(colorHex);
    this.burst({
      count: 90, pos, spread: radius * 0.35,
      speed: [6, 16], life: [0.35, 0.9], size: [0.8, 2.2],
      colorA: this.cWhite.clone().lerp(c, 0.25), colorB: c, gravity: 9, drag: 0.86, upBias: 5,
    });
    this.burst({
      count: 30, pos, spread: radius * 0.5,
      speed: [1, 3], life: [0.8, 1.6], size: [2.5, 4.5],
      colorA: c, colorB: new THREE.Color(0x1a1420), gravity: -1.5, drag: 0.95,
    });
    this.shockwave(pos, colorHex, radius * 1.5, 0.7);
    this.shockwave(pos, 0xffffff, radius * 0.9, 0.4, 0.3);
    this.scorch(pos, radius);
    this.flashLight(pos, colorHex, 160, 0.5);
  }

  nova(pos: THREE.Vector3, colorHex: number, radius: number): void {
    const c = new THREE.Color(colorHex);
    const n = 46;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.burst({
        count: 1, pos: new THREE.Vector3(pos.x, 0.4, pos.z),
        dir: new THREE.Vector3(Math.cos(a), 0.12, Math.sin(a)), cone: 0.08,
        speed: [radius * 1.9, radius * 2.3], life: [0.4, 0.6], size: [0.7, 1.2],
        colorA: this.cWhite.clone().lerp(c, 0.4), colorB: c, drag: 0.92,
      });
    }
    this.shockwave(pos, colorHex, radius, 0.5);
    this.flashLight(pos, colorHex, 90, 0.4);
  }

  healBurst(pos: THREE.Vector3, colorHex = 0xffd977): void {
    const c = new THREE.Color(colorHex);
    this.burst({
      count: 22, pos: new THREE.Vector3(pos.x, 0.2, pos.z), spread: 0.7,
      speed: [1.2, 2.6], dir: new THREE.Vector3(0, 1, 0), cone: 0.35,
      life: [0.7, 1.3], size: [0.5, 1.0],
      colorA: c, colorB: this.cWhite.clone().lerp(c, 0.5), gravity: -2.5, drag: 0.95,
    });
    this.flashLight(pos, colorHex, 40, 0.5);
  }

  deathBurst(pos: THREE.Vector3, colorHex: number): void {
    const c = new THREE.Color(colorHex);
    this.burst({
      count: 40, pos: new THREE.Vector3(pos.x, 0.8, pos.z), spread: 0.5,
      speed: [1, 4], life: [0.6, 1.4], size: [0.6, 1.4],
      colorA: c, colorB: new THREE.Color(0x333344), gravity: 2, drag: 0.93,
    });
    this.shockwave(pos, colorHex, 2.2, 0.6);
  }

  reviveBurst(pos: THREE.Vector3): void {
    const gold = new THREE.Color(0xffe9a3);
    this.burst({
      count: 60, pos: new THREE.Vector3(pos.x, 0.1, pos.z), spread: 0.9,
      dir: new THREE.Vector3(0, 1, 0), cone: 0.3,
      speed: [3, 7], life: [0.6, 1.2], size: [0.5, 1.2],
      colorA: this.cWhite.clone(), colorB: gold, gravity: -3, drag: 0.94,
    });
    this.shockwave(pos, 0xffe9a3, 3.2, 0.6);
    this.flashLight(pos, 0xffe9a3, 110, 0.6);
  }

  /** Emisor por-frame: canal de revive (motas doradas ascendiendo). */
  reviveChannel(pos: THREE.Vector3, dt: number): void {
    if (Math.random() < dt * 26) {
      this.burst({
        count: 1, pos: new THREE.Vector3(pos.x, 0.1, pos.z), spread: 0.8,
        dir: new THREE.Vector3(0, 1, 0), cone: 0.15,
        speed: [1.4, 2.4], life: [0.8, 1.2], size: [0.35, 0.7],
        colorA: new THREE.Color(0xffe9a3), colorB: new THREE.Color(0xfff8e0), gravity: -1, drag: 0.97,
      });
    }
  }

  /** Emisor por-frame: aura de enrage del boss. */
  enrageAura(pos: THREE.Vector3, dt: number, colorHex: number): void {
    if (Math.random() < dt * 30) {
      const a = Math.random() * Math.PI * 2;
      const r = 1.2 + Math.random() * 1.2;
      this.burst({
        count: 1,
        pos: new THREE.Vector3(pos.x + Math.cos(a) * r, 0.15, pos.z + Math.sin(a) * r),
        dir: new THREE.Vector3(0, 1, 0), cone: 0.2,
        speed: [2, 4.5], life: [0.5, 0.9], size: [0.5, 1.1],
        colorA: new THREE.Color(colorHex), colorB: new THREE.Color(0x30060e), gravity: -2, drag: 0.96,
      });
    }
  }

  castSparks(pos: THREE.Vector3, colorHex: number): void {
    const c = new THREE.Color(colorHex);
    this.burst({
      count: 14, pos, spread: 0.25,
      speed: [1.5, 4], life: [0.2, 0.45], size: [0.35, 0.8],
      colorA: this.cWhite.clone().lerp(c, 0.3), colorB: c, drag: 0.9,
    });
  }

  /** Trail por-frame para proyectiles. */
  trail(pos: THREE.Vector3, colorHex: number, dt: number, rate = 90, size = 0.9): void {
    const c = new THREE.Color(colorHex);
    if (Math.random() < dt * rate) {
      this.burst({
        count: 1, pos, spread: 0.12,
        speed: [0.1, 0.5], life: [0.25, 0.45], size: [size * 0.6, size],
        colorA: c, colorB: c.clone().multiplyScalar(0.3), drag: 0.92,
      });
    }
  }
}
