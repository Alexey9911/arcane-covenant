import './ui/styles.css';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Engine } from './core/engine';
import { Input } from './core/input';
import { CameraRig } from './core/camera';
import { Materials } from './assets/materials';
import { Environment } from './world/environment';
import { VfxSystem } from './vfx/vfx';
import { AudioSystem } from './systems/audio';
import { Hud } from './ui/hud';
import { Screens } from './ui/screens';
import { Game } from './game/game';
import { preloadModels } from './entities/models';
import { BOSSES } from './game/balance';

const app = document.getElementById('app')!;

const engine = new Engine(app);

// IBL suave para que los PBR de Meshy respondan bien
{
  const pmrem = new THREE.PMREMGenerator(engine.renderer);
  engine.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.035).texture;
  engine.scene.environmentIntensity = 0.42;
  pmrem.dispose();
}

const mats = new Materials();
const env = new Environment(mats);
engine.scene.add(env.root);

const vfx = new VfxSystem(mats);
engine.scene.add(vfx.root);

const input = new Input();
input.attach(engine.renderer.domElement);

const cameraRig = new CameraRig(engine.camera);
const audio = new AudioSystem();
const hud = new Hud(app, input);
const screens = new Screens(app);

const game = new Game(engine, env, vfx, audio, input, cameraRig, hud, screens, mats);

// proyector mundo -> pantalla para el combat text
const projV = new THREE.Vector3();
hud.setProjector((world) => {
  projV.copy(world).project(engine.camera);
  return {
    x: (projV.x * 0.5 + 0.5) * window.innerWidth,
    y: (-projV.y * 0.5 + 0.5) * window.innerHeight,
    visible: projV.z < 1,
  };
});

let preloading: Promise<unknown> | null = null;

screens.cb = {
  onTitleEnter: () => {
    audio.unlock();
    // precarga modelos del primer combate mientras el jugador está en el lobby
    preloading ??= preloadModels([
      { key: 'hero_mage', rigged: true },
      { key: 'hero_warrior', rigged: true },
      { key: 'hero_cleric', rigged: true },
      { key: 'hero_ranger', rigged: true },
      { key: BOSSES[0].modelKey, rigged: true },
    ]);
    game.enterLobby();
  },
  onJoin: () => { void preloading?.then(() => game.joinMatch()); },
  onVictoryContinue: () => game.toMarket(),
  onMarketBuy: (id) => game.buyUpgrade(id),
  onMarketContinue: () => { void game.nextBoss(); },
  onDefeatContinue: () => game.backToLobby(),
  onRunCompleteContinue: () => game.backToLobby(),
  playUi: (s) => audio.play(s, { group: 'ui' }),
};

screens.show('title');

(window as unknown as Record<string, unknown>).__game = game;

engine.diagExtra = () => ({
  state: game.state,
  bossHp: game.boss ? Math.round(game.boss.hp) : null,
  heroesAlive: game.heroes.filter((h) => h.alive).length,
  playerPos: game.heroes[0] ? game.heroes[0].pos.toArray().map((n) => Math.round(n * 10) / 10) : null,
});

engine.start((dt, t) => game.update(dt, t));
