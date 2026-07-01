import * as THREE from 'three';
import {
  EffectComposer, RenderPass, EffectPass,
  BloomEffect, SMAAEffect, VignetteEffect, ChromaticAberrationEffect,
  ToneMappingEffect, ToneMappingMode,
} from 'postprocessing';
import { PAL } from '../game/palette';

export const IS_MOBILE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  || (navigator.maxTouchPoints > 1 && window.innerWidth < 1100);

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly composer: EffectComposer;
  private readonly chroma: ChromaticAberrationEffect;
  private chromaImpulse = 0;
  time = 0;
  private fpsAcc = 0;
  private fpsFrames = 0;
  fps = 60;
  private diagTimer = 0;
  diagExtra: () => Record<string, unknown> = () => ({});
  private updateFn: ((dt: number, t: number) => void) | null = null;
  private last = performance.now();

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: false, stencil: false, depth: true, powerPreference: 'high-performance',
    });
    const dpr = Math.min(window.devicePixelRatio || 1, IS_MOBILE ? 1.5 : 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping; // el tone mapping vive en el composer
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.info.autoReset = false; // acumulamos stats de todos los passes por frame
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.id = 'game-canvas';

    this.camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.5, 260);
    this.scene.background = new THREE.Color(PAL.env.abyss);
    this.scene.fog = new THREE.FogExp2(PAL.env.fog, 0.016);

    this.composer = new EffectComposer(this.renderer, { frameBufferType: THREE.HalfFloatType });
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    const bloom = new BloomEffect({
      intensity: 1.15,
      luminanceThreshold: 0.72,
      luminanceSmoothing: 0.18,
      mipmapBlur: true,
      radius: 0.72,
    });
    this.chroma = new ChromaticAberrationEffect({
      offset: new THREE.Vector2(0, 0),
      radialModulation: true,
      modulationOffset: 0.28,
    });
    const vignette = new VignetteEffect({ darkness: 0.52, offset: 0.28 });
    const smaa = new SMAAEffect();
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });

    this.composer.addPass(new EffectPass(this.camera, smaa, bloom));
    this.composer.addPass(new EffectPass(this.camera, this.chroma, vignette, tone));

    window.addEventListener('resize', this.onResize);
  }

  private onResize = (): void => {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  };

  /** Sacudida cromática breve para impactos gordos. */
  pulseChroma(strength: number): void {
    this.chromaImpulse = Math.min(1, this.chromaImpulse + strength);
  }

  start(update: (dt: number, t: number) => void): void {
    this.updateFn = update;
    this.last = performance.now();
    this.renderer.setAnimationLoop(this.loop);
  }

  private loop = (now: number): void => {
    const realDt = (now - this.last) / 1000;
    const dt = Math.min(realDt, 1 / 20);
    this.last = now;
    this.time += dt;
    this.fpsAcc += realDt;
    this.fpsFrames++;

    this.renderer.info.reset();
    this.updateFn?.(dt, this.time);

    // aberración cromática por impulso, decae rápido
    this.chromaImpulse = Math.max(0, this.chromaImpulse - dt * 3.2);
    const off = this.chromaImpulse * this.chromaImpulse * 0.006;
    this.chroma.offset.set(off, off * 0.6);

    this.composer.render(dt);

    // diagnostics
    this.diagTimer += realDt;
    if (this.diagTimer > 0.5) {
      this.fps = Math.round(this.fpsFrames / Math.max(0.001, this.fpsAcc));
      this.fpsAcc = 0; this.fpsFrames = 0; this.diagTimer = 0;
      const info = this.renderer.info;
      (window as unknown as Record<string, unknown>).__THREE_GAME_DIAGNOSTICS__ = {
        fps: this.fps,
        drawCalls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        ...this.diagExtra(),
      };
    }
  };
}
