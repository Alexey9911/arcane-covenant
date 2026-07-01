import * as THREE from 'three';
import { Materials } from '../assets/materials';
import { PAL } from '../game/palette';
import { ARENA_RADIUS } from '../game/balance';

// --------------------------------------------------------------- skybox
const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
}
`;

const SKY_FRAG = /* glsl */ `
varying vec3 vDir;
uniform float uTime;

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1, 0)), f.x),
    mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.1; a *= 0.5; }
  return v;
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y * 0.5 + 0.5;

  // gradiente vertical: abismo -> horizonte violeta tenue
  vec3 base = mix(vec3(0.055, 0.045, 0.10), vec3(0.020, 0.016, 0.035), smoothstep(0.15, 0.75, h));
  base = mix(vec3(0.10, 0.07, 0.16), base, smoothstep(0.0, 0.22, abs(d.y)));

  // nebulosa
  vec2 uv = d.xz / max(0.2, abs(d.y) + 0.35) * 0.8;
  float neb = fbm(uv * 1.5 + vec2(uTime * 0.004, 0.0));
  float neb2 = fbm(uv * 3.0 - vec2(uTime * 0.006, 1.7));
  vec3 nebCol = vec3(0.30, 0.16, 0.55) * pow(neb, 2.4) * 0.9
              + vec3(0.10, 0.45, 0.50) * pow(neb2, 3.2) * 0.55;
  nebCol *= smoothstep(-0.05, 0.45, d.y) + smoothstep(-0.05, -0.6, d.y) * 0.5;

  // estrellas en 2 capas
  vec2 sp = d.xz / (abs(d.y) + 0.55);
  float stars = step(0.9975, hash21(floor(sp * 220.0))) * (0.5 + 0.5 * sin(uTime * 2.0 + hash21(floor(sp * 220.0) + 7.0) * 40.0));
  float stars2 = step(0.999, hash21(floor(sp * 90.0) + 3.0));
  vec3 col = base + nebCol + (stars * 0.8 + stars2 * 1.4) * vec3(0.9, 0.95, 1.0) * smoothstep(0.02, 0.3, d.y);

  gl_FragColor = vec4(col, 1.0);
}
`;

// ------------------------------------------------------------ environment
export class Environment {
  readonly root = new THREE.Group();
  private readonly mats: Materials;
  private sky!: THREE.Mesh;
  private skyMat!: THREE.ShaderMaterial;
  private crystalGroups: THREE.Group[] = [];
  private rocks!: THREE.InstancedMesh;
  private rockData: { r: number; a: number; y: number; s: number; spin: number; orbit: number }[] = [];
  private fogPlanes: THREE.Mesh[] = [];
  private motes!: THREE.Points;
  private motePos!: Float32Array;
  private moteVel!: Float32Array;
  readonly keyLight: THREE.DirectionalLight;
  readonly threatLight: THREE.PointLight;
  private readonly dummy = new THREE.Object3D();

  constructor(mats: Materials) {
    this.mats = mats;

    // --- luces
    const hemi = new THREE.HemisphereLight(0x50427e, 0x0d0b14, 0.55);
    this.root.add(hemi);

    this.keyLight = new THREE.DirectionalLight(0xbfc8ff, 1.5);
    this.keyLight.position.set(14, 26, 10);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    const sc = this.keyLight.shadow.camera;
    sc.left = -28; sc.right = 28; sc.top = 28; sc.bottom = -28; sc.near = 4; sc.far = 70;
    this.keyLight.shadow.bias = -0.0004;
    this.keyLight.shadow.normalBias = 0.02;
    this.root.add(this.keyLight, this.keyLight.target);

    const rim = new THREE.DirectionalLight(0x8a5cff, 0.55);
    rim.position.set(-16, 12, -14);
    this.root.add(rim);

    // luz de amenaza (enrage / boss): la maneja el juego vía setThreat
    this.threatLight = new THREE.PointLight(0xff2e4d, 0, 40, 1.8);
    this.threatLight.position.set(0, 6, -6);
    this.root.add(this.threatLight);

    this.buildSky();
    this.buildArena();
    this.buildCrystals();
    this.buildRocks();
    this.buildAtmosphere();
  }

  private buildSky(): void {
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: { uTime: { value: 0 } },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(190, 40, 24), this.skyMat);
    this.root.add(this.sky);
  }

  private buildArena(): void {
    const m = this.mats;
    // plataforma principal con runas emisivas
    const ground = new THREE.Mesh(new THREE.CircleGeometry(ARENA_RADIUS + 1.5, 96), m.runeGround);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.root.add(ground);

    // falda de roca bajo la plataforma (silueta de isla flotante)
    const skirt = new THREE.Mesh(
      new THREE.CylinderGeometry(ARENA_RADIUS + 1.5, ARENA_RADIUS * 0.45, 10, 48, 3),
      m.stoneDark,
    );
    skirt.position.y = -5.02;
    this.root.add(skirt);
    const skirtTip = new THREE.Mesh(new THREE.ConeGeometry(ARENA_RADIUS * 0.45, 9, 32), m.stoneDark);
    skirtTip.rotation.x = Math.PI;
    skirtTip.position.y = -14.4;
    this.root.add(skirtTip);

    // borde: bloques de piedra irregulares alrededor del perímetro
    const edgeGeo = new THREE.BoxGeometry(2.4, 1.4, 1.6);
    const edgeCount = 42;
    const edges = new THREE.InstancedMesh(edgeGeo, m.stone, edgeCount);
    edges.castShadow = true;
    edges.receiveShadow = true;
    for (let i = 0; i < edgeCount; i++) {
      const a = (i / edgeCount) * Math.PI * 2;
      const r = ARENA_RADIUS + 0.6;
      const broken = Math.sin(i * 12.9898) * 0.5 + 0.5;
      this.dummy.position.set(Math.cos(a) * r, 0.45 - broken * 0.35, Math.sin(a) * r);
      this.dummy.rotation.set(0, -a + (broken - 0.5) * 0.3, (broken - 0.5) * 0.14);
      const s = 0.75 + broken * 0.5;
      this.dummy.scale.set(s, 0.6 + broken * 0.8, s);
      this.dummy.updateMatrix();
      edges.setMatrixAt(i, this.dummy.matrix);
    }
    this.root.add(edges);

    // anillo de trim emisivo en el borde jugable
    const trim = new THREE.Mesh(new THREE.TorusGeometry(ARENA_RADIUS - 0.6, 0.07, 8, 128), m.trimEmissive);
    trim.rotation.x = -Math.PI / 2;
    trim.position.y = 0.03;
    this.root.add(trim);

    // pilares: base + fuste + capitel instanciados (algunos rotos)
    const nP = 12;
    const baseGeo = new THREE.BoxGeometry(2.0, 0.9, 2.0);
    const shaftGeo = new THREE.CylinderGeometry(0.55, 0.7, 1, 10);
    const capGeo = new THREE.BoxGeometry(1.7, 0.55, 1.7);
    const runeStripGeo = new THREE.BoxGeometry(0.14, 1, 0.05);
    const bases = new THREE.InstancedMesh(baseGeo, this.mats.stone, nP);
    const shafts = new THREE.InstancedMesh(shaftGeo, this.mats.stoneDark, nP);
    const caps = new THREE.InstancedMesh(capGeo, this.mats.stone, nP);
    const strips = new THREE.InstancedMesh(runeStripGeo, this.mats.trimEmissive, nP);
    bases.castShadow = shafts.castShadow = caps.castShadow = true;
    bases.receiveShadow = true;
    for (let i = 0; i < nP; i++) {
      const a = (i / nP) * Math.PI * 2 + Math.PI / nP;
      const r = ARENA_RADIUS - 1.6;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const rnd = Math.abs(Math.sin(i * 78.233));
      const broken = rnd < 0.35;
      const h = broken ? 1.8 + rnd * 2 : 5.2 + rnd * 1.6;

      this.dummy.position.set(x, 0.45, z);
      this.dummy.rotation.set(0, a, 0);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      bases.setMatrixAt(i, this.dummy.matrix);

      this.dummy.position.set(x, 0.9 + h / 2, z);
      this.dummy.scale.set(1, h, 1);
      this.dummy.rotation.set(broken ? (rnd - 0.5) * 0.16 : 0, a, 0);
      this.dummy.updateMatrix();
      shafts.setMatrixAt(i, this.dummy.matrix);

      this.dummy.position.set(x, broken ? -50 : 0.9 + h + 0.28, z);
      this.dummy.scale.setScalar(broken ? 0.001 : 1);
      this.dummy.rotation.set(0, a, 0);
      this.dummy.updateMatrix();
      caps.setMatrixAt(i, this.dummy.matrix);

      // tira rúnica en la cara interior del pilar
      const inward = Math.atan2(-z, -x);
      this.dummy.position.set(x + Math.cos(inward) * 0.62, 0.9 + Math.min(h, 3.4) / 2 + 0.2, z + Math.sin(inward) * 0.62);
      this.dummy.rotation.set(0, -inward + Math.PI / 2, 0);
      this.dummy.scale.set(1, Math.min(h, 3.4) * 0.7, 1);
      this.dummy.updateMatrix();
      strips.setMatrixAt(i, this.dummy.matrix);
    }
    this.root.add(bases, shafts, caps, strips);

    // escombros pequeños
    const rubbleGeo = new THREE.DodecahedronGeometry(0.35, 0);
    const nR = 40;
    const rubble = new THREE.InstancedMesh(rubbleGeo, this.mats.stoneDark, nR);
    rubble.castShadow = true;
    for (let i = 0; i < nR; i++) {
      const rnd1 = Math.abs(Math.sin(i * 12.71 + 1)), rnd2 = Math.abs(Math.sin(i * 45.13 + 2));
      const a = rnd1 * Math.PI * 2;
      const r = ARENA_RADIUS - 1 - rnd2 * 3.5;
      this.dummy.position.set(Math.cos(a) * r, 0.12, Math.sin(a) * r);
      this.dummy.rotation.set(rnd1 * 3, rnd2 * 3, rnd1 * 2);
      this.dummy.scale.setScalar(0.4 + rnd2 * 1.1);
      this.dummy.updateMatrix();
      rubble.setMatrixAt(i, this.dummy.matrix);
    }
    this.root.add(rubble);
  }

  private buildCrystals(): void {
    const geo = new THREE.OctahedronGeometry(0.55, 0);
    const clusters = 6;
    for (let g = 0; g < 2; g++) {
      const group = new THREE.Group();
      const count = (clusters / 2) * 4;
      const inst = new THREE.InstancedMesh(geo, this.mats.crystal, count);
      let idx = 0;
      for (let c = 0; c < clusters / 2; c++) {
        const a = ((c * 2 + g) / clusters) * Math.PI * 2 + 0.4;
        const r = ARENA_RADIUS - 2.6;
        const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
        for (let k = 0; k < 4; k++) {
          const rnd = Math.abs(Math.sin((c * 7 + k) * 37.7));
          this.dummy.position.set(cx + (rnd - 0.5) * 1.6, 0.5 + rnd * 0.9, cz + (Math.abs(Math.sin(k * 91.3)) - 0.5) * 1.6);
          this.dummy.rotation.set(rnd * 0.7 - 0.35, rnd * 6, rnd * 0.6 - 0.3);
          this.dummy.scale.set(0.5 + rnd * 0.8, 1.1 + rnd * 1.8, 0.5 + rnd * 0.8);
          this.dummy.updateMatrix();
          inst.setMatrixAt(idx++, this.dummy.matrix);
        }
      }
      group.add(inst);
      this.crystalGroups.push(group);
      this.root.add(group);
    }
    // luces puntuales estáticas junto a dos clusters
    const l1 = new THREE.PointLight(PAL.env.crystal, 14, 16, 2);
    l1.position.set(Math.cos(0.4) * (ARENA_RADIUS - 3), 1.6, Math.sin(0.4) * (ARENA_RADIUS - 3));
    const l2 = new THREE.PointLight(PAL.env.runeArcane, 12, 18, 2);
    l2.position.set(Math.cos(0.4 + Math.PI) * (ARENA_RADIUS - 3), 1.8, Math.sin(0.4 + Math.PI) * (ARENA_RADIUS - 3));
    this.root.add(l1, l2);
  }

  private buildRocks(): void {
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const n = 16;
    this.rocks = new THREE.InstancedMesh(geo, this.mats.stoneDark, n);
    for (let i = 0; i < n; i++) {
      const rnd = Math.abs(Math.sin(i * 91.7));
      this.rockData.push({
        r: 34 + rnd * 42,
        a: (i / n) * Math.PI * 2,
        y: -8 + Math.abs(Math.sin(i * 17.3)) * 22,
        s: 1.2 + rnd * 4.2,
        spin: 0.05 + rnd * 0.2,
        orbit: 0.008 + rnd * 0.02,
      });
    }
    this.root.add(this.rocks);
  }

  private buildAtmosphere(): void {
    // planos de niebla que derivan lentamente
    const fogMat = new THREE.MeshBasicMaterial({
      map: this.mats.fogTex, transparent: true, opacity: 0.16,
      depthWrite: false, color: 0x9a8cc8, blending: THREE.NormalBlending, fog: false,
    });
    for (let i = 0; i < 5; i++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(46, 46), fogMat);
      p.rotation.x = -Math.PI / 2;
      p.position.set((Math.sin(i * 5.1) * 10), 0.6 + i * 0.85, Math.cos(i * 3.7) * 10);
      p.renderOrder = 5;
      this.fogPlanes.push(p);
      this.root.add(p);
    }

    // motas y ascuas ambientales
    const n = 320;
    this.motePos = new Float32Array(n * 3);
    this.moteVel = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const cArc = new THREE.Color(PAL.env.runeArcane);
    const cCya = new THREE.Color(PAL.env.crystal);
    const cEmb = new THREE.Color(0xff8a3d);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * (ARENA_RADIUS + 4);
      this.motePos[i * 3] = Math.cos(a) * r;
      this.motePos[i * 3 + 1] = Math.random() * 7;
      this.motePos[i * 3 + 2] = Math.sin(a) * r;
      this.moteVel[i * 3] = (Math.random() - 0.5) * 0.22;
      this.moteVel[i * 3 + 1] = 0.12 + Math.random() * 0.3;
      this.moteVel[i * 3 + 2] = (Math.random() - 0.5) * 0.22;
      const pick = Math.random();
      const c = pick < 0.5 ? cArc : pick < 0.8 ? cCya : cEmb;
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.motePos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      map: this.mats.glowTex, size: 0.32, transparent: true, opacity: 0.75,
      vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false,
      sizeAttenuation: true,
    });
    this.motes = new THREE.Points(geo, mat);
    this.motes.renderOrder = 6;
    this.root.add(this.motes);
  }

  /** 0..1: intensidad de amenaza global (enrage del boss). */
  setThreat(x: number, bossPos?: THREE.Vector3): void {
    this.threatLight.intensity = x * 26;
    if (bossPos) this.threatLight.position.set(bossPos.x, 5, bossPos.z);
  }

  update(dt: number, t: number): void {
    this.skyMat.uniforms.uTime.value = t;
    this.mats.updatePulse(t);

    // cristales flotan
    this.crystalGroups[0].position.y = Math.sin(t * 0.9) * 0.1;
    this.crystalGroups[1].position.y = Math.sin(t * 1.2 + 2) * 0.12;

    // rocas orbitan lentamente
    for (let i = 0; i < this.rockData.length; i++) {
      const d = this.rockData[i];
      d.a += d.orbit * dt;
      this.dummy.position.set(Math.cos(d.a) * d.r, d.y + Math.sin(t * 0.3 + i) * 0.8, Math.sin(d.a) * d.r);
      this.dummy.rotation.set(t * d.spin, t * d.spin * 1.3, 0);
      this.dummy.scale.setScalar(d.s);
      this.dummy.updateMatrix();
      this.rocks.setMatrixAt(i, this.dummy.matrix);
    }
    this.rocks.instanceMatrix.needsUpdate = true;

    // niebla deriva
    for (let i = 0; i < this.fogPlanes.length; i++) {
      const p = this.fogPlanes[i];
      p.position.x += Math.sin(t * 0.05 + i * 2.2) * dt * 0.4;
      p.position.z += Math.cos(t * 0.04 + i * 1.7) * dt * 0.35;
      p.rotation.z += dt * 0.01 * (i % 2 === 0 ? 1 : -1);
    }

    // motas suben y se reciclan
    const n = this.motePos.length / 3;
    for (let i = 0; i < n; i++) {
      this.motePos[i * 3] += this.moteVel[i * 3] * dt;
      this.motePos[i * 3 + 1] += this.moteVel[i * 3 + 1] * dt;
      this.motePos[i * 3 + 2] += this.moteVel[i * 3 + 2] * dt;
      if (this.motePos[i * 3 + 1] > 8) {
        this.motePos[i * 3 + 1] = 0;
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * (ARENA_RADIUS + 4);
        this.motePos[i * 3] = Math.cos(a) * r;
        this.motePos[i * 3 + 2] = Math.sin(a) * r;
      }
    }
    (this.motes.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}
