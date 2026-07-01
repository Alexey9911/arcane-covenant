import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';

/** Interfaz común para el visual de una unidad (GLB de Meshy o procedural). */
export interface CharacterVisual {
  root: THREE.Group;
  height: number;
  setMoving(speed01: number): void;
  setCast(active: boolean): void;
  setDead(dead: boolean): void;
  hitFlash(): void;
  update(dt: number, t: number): void;
}

const loader = new GLTFLoader();
const gltfCache = new Map<string, Promise<GLTF | null>>();

function loadGltf(url: string): Promise<GLTF | null> {
  if (!gltfCache.has(url)) {
    gltfCache.set(url, new Promise((resolve) => {
      loader.load(url, (g) => resolve(g), undefined, () => resolve(null));
    }));
  }
  return gltfCache.get(url)!;
}

export interface ModelSpec {
  key: string;
  height: number;      // altura objetivo en metros
  accent: number;      // color de acento (anillo/flash)
  rigged: boolean;     // intentar variantes _rigged/_walk/_run
  yawOffset?: number;  // corrección de orientación del asset
}

interface LoadedModel {
  scene: THREE.Group;
  clips: { walk?: THREE.AnimationClip; run?: THREE.AnimationClip };
}

async function loadModel(spec: ModelSpec): Promise<LoadedModel | null> {
  const base = `${import.meta.env.BASE_URL}models/`;
  if (spec.rigged) {
    const [rigged, walk, run] = await Promise.all([
      loadGltf(`${base}${spec.key}_rigged.glb`),
      loadGltf(`${base}${spec.key}_walk.glb`),
      loadGltf(`${base}${spec.key}_run.glb`),
    ]);
    const src = rigged ?? walk;
    if (src) {
      return {
        scene: src.scene as THREE.Group,
        clips: {
          walk: walk?.animations?.[0],
          run: run?.animations?.[0],
        },
      };
    }
  }
  const plain = await loadGltf(`${base}${spec.key}.glb`);
  if (plain) return { scene: plain.scene as THREE.Group, clips: {} };
  return null;
}

/** Bounds reales incluyendo skinning (la geometría de un SkinnedMesh vive en
 * bind-space; el esqueleto puede escalarla al renderizar). */
function skinnedAwareBounds(root: THREE.Object3D): THREE.Box3 {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  root.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh;
    if ((mesh as THREE.Mesh).isMesh) {
      if (mesh.isSkinnedMesh) {
        mesh.computeBoundingBox(); // usa la pose actual de los huesos
        tmp.copy(mesh.boundingBox!).applyMatrix4(mesh.matrixWorld);
      } else {
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        tmp.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld);
      }
      box.union(tmp);
    }
  });
  return box;
}

/** Normaliza un modelo: pies en y=0, centrado XZ, altura = spec.height. */
function normalize(root: THREE.Object3D, targetHeight: number): number {
  const box = skinnedAwareBounds(root);
  const size = new THREE.Vector3();
  box.getSize(size);
  const scale = targetHeight / Math.max(0.0001, size.y);
  root.scale.setScalar(scale);
  const box2 = skinnedAwareBounds(root);
  const center = new THREE.Vector3();
  box2.getCenter(center);
  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y -= box2.min.y;
  return scale;
}

/** Sombra de contacto + anillo de clase bajo la unidad. */
function makeGroundRig(accent: number, radius: number): THREE.Group {
  const g = new THREE.Group();
  const blobMat = new THREE.MeshBasicMaterial({
    color: 0x000000, transparent: true, opacity: 0.42, depthWrite: false,
  });
  const blob = new THREE.Mesh(new THREE.CircleGeometry(radius * 1.15, 24), blobMat);
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.02;
  const ringMat = new THREE.MeshBasicMaterial({
    color: accent, transparent: true, opacity: 0.85, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 1.05, radius * 1.22, 40), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  ring.name = 'classRing';
  g.add(blob, ring);
  return g;
}

// ------------------------------------------------------------- GLB visual
interface ArmFix { bone: THREE.Bone; side: 1 | -1; }

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();

class GlbVisual implements CharacterVisual {
  root = new THREE.Group();
  height: number;
  private inner: THREE.Group;
  private wrapper: THREE.Group;
  private mixer: THREE.AnimationMixer | null = null;
  private walkAction: THREE.AnimationAction | null = null;
  private runAction: THREE.AnimationAction | null = null;
  private speed01 = 0;
  private casting = false;
  private dead = false;
  private deadK = 0;
  private flashT = 0;
  private mats: THREE.MeshStandardMaterial[] = [];
  private origEmissive: THREE.Color[] = [];
  private origIntensity: number[] = [];
  private baseY = 0;
  private arms: ArmFix[] = [];

  constructor(model: LoadedModel, spec: ModelSpec) {
    this.height = spec.height;
    this.inner = skeletonClone(model.scene) as THREE.Group;
    const wrapper = new THREE.Group();
    this.wrapper = wrapper;
    wrapper.add(this.inner);
    normalize(this.inner, spec.height);
    wrapper.rotation.y = spec.yawOffset ?? 0;
    this.root.add(wrapper);
    this.root.add(makeGroundRig(spec.accent, spec.height * 0.28));
    this.findArms();

    this.inner.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.frustumCulled = false; // skinned + arena pequeña: evita pops
        const m = mesh.material;
        const mat = (Array.isArray(m) ? m[0] : m) as THREE.MeshStandardMaterial;
        if (mat && (mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
          const cloned = mat.clone();
          mesh.material = cloned;
          this.mats.push(cloned);
          this.origEmissive.push(cloned.emissive.clone());
          this.origIntensity.push(cloned.emissiveIntensity);
        }
      }
    });

    if (model.clips.walk || model.clips.run) {
      this.mixer = new THREE.AnimationMixer(this.inner);
      if (model.clips.walk) {
        this.walkAction = this.mixer.clipAction(model.clips.walk);
        this.walkAction.play();
        this.walkAction.setEffectiveWeight(0);
      }
      if (model.clips.run) {
        this.runAction = this.mixer.clipAction(model.clips.run);
        this.runAction.play();
        this.runAction.setEffectiveWeight(0);
      }
    }
  }

  /** Detecta los huesos de brazo superior en bind pose (T-pose): segmentos
   * largos casi horizontales; por lado, el que nace más cerca del torso. */
  private findArms(): void {
    this.inner.updateMatrixWorld(true);
    const candidates: { bone: THREE.Bone; side: 1 | -1; len: number; originX: number }[] = [];
    this.inner.traverse((o) => {
      const bone = o as THREE.Bone;
      if (!bone.isBone) return;
      const childBone = bone.children.find((c) => (c as THREE.Bone).isBone) as THREE.Bone | undefined;
      if (!childBone) return;
      bone.getWorldPosition(_v1);
      childBone.getWorldPosition(_v2);
      _v3.subVectors(_v2, _v1);
      const len = _v3.length();
      if (len < this.height * 0.08) return;
      _v3.normalize();
      if (Math.abs(_v3.x) > 0.75 && Math.abs(_v3.y) < 0.5) {
        candidates.push({ bone, side: _v3.x > 0 ? 1 : -1, len, originX: Math.abs(_v1.x) });
      }
    });
    for (const side of [1, -1] as const) {
      const sideC = candidates.filter((c) => c.side === side).sort((a, b) => a.originX - b.originX);
      if (sideC.length > 0) this.arms.push({ bone: sideC[0].bone, side });
    }
  }

  /** Corrige la pose de brazos post-mixer: en idle los baja, al castear levanta uno. */
  private applyArmPose(strength: number): void {
    if (this.arms.length === 0 || strength <= 0.01) return;
    this.wrapper.getWorldQuaternion(_q2);
    for (const arm of this.arms) {
      const childBone = arm.bone.children.find((c) => (c as THREE.Bone).isBone) as THREE.Bone | undefined;
      if (!childBone) continue;
      arm.bone.updateWorldMatrix(true, false);
      childBone.updateWorldMatrix(false, false);
      arm.bone.getWorldPosition(_v1);
      childBone.getWorldPosition(_v2);
      const cur = _v3.subVectors(_v2, _v1).normalize();
      // objetivo en espacio del modelo -> mundo
      const raise = this.casting && arm.side === 1;
      _v2.set(raise ? 0.2 : arm.side * 0.3, raise ? 0.35 : -0.92, raise ? 0.9 : 0.12).normalize();
      _v2.applyQuaternion(_q2);
      _q1.setFromUnitVectors(cur, _v2);
      if (strength < 1) _q1.slerp(new THREE.Quaternion(), 1 - strength);
      // delta mundial -> local del hueso
      arm.bone.parent!.getWorldQuaternion(_q2);
      const inv = _q2.clone().invert();
      arm.bone.quaternion.premultiply(inv.multiply(_q1).multiply(_q2));
      this.wrapper.getWorldQuaternion(_q2); // restaurar para el siguiente brazo
    }
  }

  setMoving(speed01: number): void { this.speed01 = speed01; }
  setCast(active: boolean): void { this.casting = active; }

  setDead(dead: boolean): void {
    if (this.dead === dead) return;
    this.dead = dead;
    if (!dead) {
      this.deadK = 0;
      for (const m of this.mats) { m.transparent = false; m.opacity = 1; }
    }
  }

  hitFlash(): void { this.flashT = 0.16; }

  update(dt: number, t: number): void {
    if (this.mixer) this.mixer.update(dt);

    // blend locomoción
    const s = this.dead ? 0 : this.speed01;

    // en idle/cast bajamos los brazos (el rig solo trae walk/run); al moverse mandan los clips
    const armStrength = this.dead ? 0 : THREE.MathUtils.clamp(1 - s * 1.7, 0, 1);
    this.applyArmPose(armStrength);
    const walkW = THREE.MathUtils.clamp(s < 0.65 ? s / 0.5 : (1 - s) / 0.35, 0, 1);
    const runW = THREE.MathUtils.clamp((s - 0.55) / 0.4, 0, 1);
    this.walkAction?.setEffectiveWeight(walkW * (1 - runW));
    this.runAction?.setEffectiveWeight(runW);
    if (this.walkAction) this.walkAction.timeScale = 0.7 + s * 0.8;
    if (this.runAction) this.runAction.timeScale = 0.8 + s * 0.5;

    // idle: respiración sutil si está quieto
    const idle = (1 - s) * (this.dead ? 0 : 1);
    this.baseY = Math.sin(t * 2.1) * 0.02 * idle;

    // cast: leve inclinación + brazo simulated por lean
    const castLean = this.casting ? 0.09 : 0;

    // muerte: caer y desvanecer parcialmente
    if (this.dead && this.deadK < 1) {
      this.deadK = Math.min(1, this.deadK + dt * 2.2);
      if (this.deadK > 0.4) {
        for (const m of this.mats) { m.transparent = true; m.opacity = 1 - (this.deadK - 0.4) * 0.75; }
      }
    }
    const fall = this.dead ? this.deadK : 0;
    this.root.rotation.x = -fall * Math.PI * 0.46 + castLean;
    this.root.position.y = this.baseY - fall * 0.12;

    // hit flash
    if (this.flashT > 0) {
      this.flashT -= dt;
      const k = Math.max(0, this.flashT / 0.16);
      for (let i = 0; i < this.mats.length; i++) {
        this.mats[i].emissive.setRGB(1, 0.9, 0.85);
        this.mats[i].emissiveIntensity = 1.6 * k;
      }
    } else if (this.mats.length && this.mats[0].emissiveIntensity !== this.origIntensity[0]) {
      for (let i = 0; i < this.mats.length; i++) {
        this.mats[i].emissive.copy(this.origEmissive[i]);
        this.mats[i].emissiveIntensity = this.origIntensity[i];
      }
    }
  }
}

// ------------------------------------------------------ procedural fallback
class ProceduralVisual implements CharacterVisual {
  root = new THREE.Group();
  height: number;
  private body = new THREE.Group();
  private armL: THREE.Group | null = null;
  private armR: THREE.Group | null = null;
  private legL: THREE.Mesh | null = null;
  private legR: THREE.Mesh | null = null;
  private speed01 = 0;
  private casting = false;
  private dead = false;
  private deadK = 0;
  private flashT = 0;
  private phase = Math.random() * 10;
  private mats: THREE.MeshStandardMaterial[] = [];

  constructor(spec: ModelSpec, kind: 'caster' | 'knight' | 'archer' | 'brute') {
    this.height = spec.height;
    const accent = spec.accent;
    const h = spec.height;
    const std = (color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) => {
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.15, ...opts });
      this.mats.push(m);
      return m;
    };
    const dark = std(0x232030, { roughness: 0.85 });
    const accentMat = std(0x151220, { emissive: accent, emissiveIntensity: 2.2 });
    const cloth = std(0x2e2a3e);

    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      this.body.add(mesh);
      return mesh;
    };

    if (kind === 'brute') {
      // torso masivo + cabeza pequeña + puños
      mk(new THREE.IcosahedronGeometry(h * 0.26, 0), dark, 0, h * 0.52);
      mk(new THREE.IcosahedronGeometry(h * 0.14, 0), dark, 0, h * 0.78);
      mk(new THREE.OctahedronGeometry(h * 0.09, 0), accentMat, 0, h * 0.55, h * 0.18);
      const fistL = new THREE.Group();
      fistL.position.set(-h * 0.3, h * 0.42, 0);
      fistL.add(new THREE.Mesh(new THREE.IcosahedronGeometry(h * 0.13, 0), dark));
      const fistR = new THREE.Group();
      fistR.position.set(h * 0.3, h * 0.42, 0);
      fistR.add(new THREE.Mesh(new THREE.IcosahedronGeometry(h * 0.13, 0), dark));
      fistL.children[0].castShadow = fistR.children[0].castShadow = true;
      this.body.add(fistL, fistR);
      this.armL = fistL;
      this.armR = fistR;
      mk(new THREE.CylinderGeometry(h * 0.10, h * 0.14, h * 0.3, 6), dark, -h * 0.12, h * 0.16);
      mk(new THREE.CylinderGeometry(h * 0.10, h * 0.14, h * 0.3, 6), dark, h * 0.12, h * 0.16);
    } else {
      // torso
      const torsoGeo = kind === 'knight'
        ? new THREE.BoxGeometry(h * 0.3, h * 0.3, h * 0.18)
        : new THREE.CylinderGeometry(h * 0.09, h * 0.16, h * 0.32, 8);
      mk(torsoGeo, kind === 'knight' ? dark : cloth, 0, h * 0.5);
      // falda/túnica para casters
      if (kind === 'caster') {
        mk(new THREE.CylinderGeometry(h * 0.16, h * 0.24, h * 0.34, 8), cloth, 0, h * 0.2);
      } else {
        this.legL = mk(new THREE.BoxGeometry(h * 0.09, h * 0.34, h * 0.1), dark, -h * 0.09, h * 0.17);
        this.legR = mk(new THREE.BoxGeometry(h * 0.09, h * 0.34, h * 0.1), dark, h * 0.09, h * 0.17);
      }
      // cabeza + capucha o casco
      mk(new THREE.SphereGeometry(h * 0.085, 10, 8), std(0xc9a582, { roughness: 0.6 }), 0, h * 0.73);
      if (kind === 'knight') {
        mk(new THREE.CylinderGeometry(h * 0.1, h * 0.11, h * 0.12, 8), dark, 0, h * 0.75);
        mk(new THREE.BoxGeometry(h * 0.34, h * 0.06, h * 0.2), dark, 0, h * 0.66); // hombreras
      } else {
        mk(new THREE.ConeGeometry(h * 0.12, h * 0.2, 8), cloth, 0, h * 0.79);
      }
      // ojos emisivos
      mk(new THREE.PlaneGeometry(h * 0.07, h * 0.02), accentMat, 0, h * 0.73, h * 0.085);
      // brazos
      const armGeoL = new THREE.Group();
      armGeoL.position.set(-h * 0.19, h * 0.58, 0);
      const aL = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.035, h * 0.045, h * 0.3, 6), kind === 'knight' ? dark : cloth);
      aL.position.y = -h * 0.14;
      aL.castShadow = true;
      armGeoL.add(aL);
      const armGeoR = armGeoL.clone();
      armGeoR.position.x = h * 0.19;
      this.body.add(armGeoL, armGeoR);
      this.armL = armGeoL;
      this.armR = armGeoR;
      // arma
      if (kind === 'caster') {
        const staff = new THREE.Group();
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.015, h * 0.02, h * 0.7, 6), dark);
        const gem = new THREE.Mesh(new THREE.OctahedronGeometry(h * 0.05, 0), accentMat);
        gem.position.y = h * 0.38;
        staff.add(shaft, gem);
        staff.position.set(0, -h * 0.2, 0);
        armGeoR.add(staff);
      } else if (kind === 'knight') {
        const shield = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.16, h * 0.16, h * 0.04, 6), dark);
        shield.rotation.z = Math.PI / 2;
        shield.position.set(0, -h * 0.2, h * 0.03);
        armGeoL.add(shield);
        const mace = new THREE.Mesh(new THREE.BoxGeometry(h * 0.05, h * 0.4, h * 0.05), dark);
        mace.position.y = -h * 0.25;
        armGeoR.add(mace);
      } else {
        const bow = new THREE.Mesh(new THREE.TorusGeometry(h * 0.18, h * 0.012, 6, 16, Math.PI), dark);
        bow.rotation.y = Math.PI / 2;
        bow.position.y = -h * 0.2;
        armGeoL.add(bow);
      }
    }

    this.body.traverse((o) => { (o as THREE.Mesh).castShadow = true; });
    this.root.add(this.body);
    this.root.add(makeGroundRig(accent, h * 0.28));
  }

  setMoving(speed01: number): void { this.speed01 = speed01; }
  setCast(active: boolean): void { this.casting = active; }
  setDead(dead: boolean): void {
    if (this.dead === dead) return;
    this.dead = dead;
    if (!dead) this.deadK = 0;
  }
  hitFlash(): void { this.flashT = 0.16; }

  update(dt: number, t: number): void {
    const s = this.dead ? 0 : this.speed01;
    this.phase += dt * (4 + s * 9);
    const swing = Math.sin(this.phase) * s * 0.65;
    if (this.armL && !this.casting) this.armL.rotation.x = swing;
    if (this.armR) this.armR.rotation.x = this.casting ? -1.9 : -swing;
    if (this.legL) this.legL.rotation.x = -swing;
    if (this.legR) this.legR.rotation.x = swing;
    this.body.position.y = Math.abs(Math.sin(this.phase)) * s * 0.07 + Math.sin(t * 2.2) * 0.015 * (1 - s);
    this.body.rotation.x = s * 0.08 + (this.casting ? 0.1 : 0);

    if (this.dead && this.deadK < 1) this.deadK = Math.min(1, this.deadK + dt * 2.2);
    if (!this.dead && this.deadK > 0) this.deadK = 0;
    this.root.rotation.x = -this.deadK * Math.PI * 0.47;
    this.root.position.y = -this.deadK * 0.1;

    if (this.flashT > 0) {
      this.flashT -= dt;
      const k = Math.max(0, this.flashT / 0.16);
      for (const m of this.mats) { m.emissive.setRGB(k, k * 0.9, k * 0.85); }
    }
  }
}

// -------------------------------------------------------------- factoría
const PROC_KIND: Record<string, 'caster' | 'knight' | 'archer' | 'brute'> = {
  hero_mage: 'caster', hero_cleric: 'caster', hero_warrior: 'knight', hero_ranger: 'archer',
  boss_golem: 'brute', boss_lich: 'caster', boss_demon: 'brute', add_void: 'brute',
};

/** Flag de QA/depuración: ?proc=1 fuerza visuales procedurales (sin GLB). */
const FORCE_PROCEDURAL = new URLSearchParams(location.search).has('proc');

export async function createVisual(spec: ModelSpec): Promise<CharacterVisual> {
  if (spec.key === 'add_void' || FORCE_PROCEDURAL) {
    return new ProceduralVisual(spec, PROC_KIND[spec.key] ?? 'caster');
  }
  try {
    const model = await loadModel(spec);
    if (model) return new GlbVisual(model, spec);
  } catch {
    // fallback procedural
  }
  return new ProceduralVisual(spec, PROC_KIND[spec.key] ?? 'caster');
}

/** Pre-carga (para la pantalla de loading). */
export function preloadModels(keys: { key: string; rigged: boolean }[]): Promise<unknown> {
  if (FORCE_PROCEDURAL) return Promise.resolve();
  const base = `${import.meta.env.BASE_URL}models/`;
  return Promise.all(keys.flatMap(({ key, rigged }) => {
    const urls = rigged
      ? [`${base}${key}_rigged.glb`, `${base}${key}_walk.glb`, `${base}${key}_run.glb`]
      : [`${base}${key}.glb`];
    return urls.map((u) => loadGltf(u));
  }));
}
