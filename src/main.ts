import './ui/styles.css';
import { Buffer } from 'buffer';
(window as unknown as Record<string, unknown>).Buffer ??= Buffer; // polyfill para @solana/web3.js
import * as THREE from 'three';
import { net } from './net/net';
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

// ------------------------------- red -----------------------------------
const SOCKET_URL = (import.meta.env.VITE_SOCKET_URL as string | undefined)
  ?? (import.meta.env.PROD ? 'https://arcane-covenant-server.fly.dev' : 'http://localhost:8124');

hud.onChatSend = (msg) => {
  if (!net.connected) return false;
  net.chat(msg);
  return true;
};
net.onChat = (m) => hud.chatMessage(m.nick, m.msg, m.nick === game.nickname ? '#ffc94d' : '#e8e2f2');
net.onChatBlocked = (d) => hud.chatSystem(`🛡 ${d.reason}`);
net.onChatHistory = (h) => h.forEach((m) => hud.chatMessage(m.nick, m.msg, '#8a8798'));
net.onError = (d) => hud.chatSystem(`⚠ ${d.msg}`);
net.onMeta = () => screens.refresh(game);
net.onLobby = (l) => {
  if (l && (screens.active === 'lobbies' || screens.active === 'lobbyRoom')) {
    screens.show('lobbyRoom', { game });
  } else {
    screens.refresh(game);
  }
};
net.onCountdown = () => hud.banner('¡La incursión comienza!', 'Preparaos');
net.onMatchStart = (d) => { void game.startNetMatch(d); };
net.onSnap = (s) => game.onNetSnap(s);
net.onPInput = (d) => game.onNetInput(d.slot, d.input as never);
net.onSettled = (d) => game.netSettled(d);
net.onAborted = (d) => {
  hud.chatSystem(`⚠ ${d.reason}`);
  void game.enterSetup('ready');
  screens.show('lobbyRoom', { game });
};

screens.cb = {
  onTitleEnter: () => {
    audio.unlock();
    net.connect(SOCKET_URL, game.nickname || 'Errante');
    hud.setChatDetached(true);
    // precarga modelos del primer combate mientras eliges nombre y héroe
    preloading ??= preloadModels([
      { key: 'hero_mage', rigged: true },
      { key: 'hero_warrior', rigged: true },
      { key: 'hero_cleric', rigged: true },
      { key: 'hero_ranger', rigged: true },
      { key: BOSSES[0].modelKey, rigged: true },
    ]);
    void preloading.then(() => {
      void game.enterSetup('nick');
      screens.show('setup', { game, step: 'nick' });
    });
    screens.show('loading');
  },
  onJoin: () => { void preloading?.then(() => game.joinMatch()); },
  onBattleStart: () => { void preloading?.then(() => game.beginBattle()); },
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
