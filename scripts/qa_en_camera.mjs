// QA: UI en inglés + cámara recta al entrar al combate (sin barrido por rocas).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'qa');
fs.mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({ headless: false, args: ['--window-position=40,40', '--mute-audio'] });
const p = await (await b.newContext({ viewport: { width: 1500, height: 850 } })).newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
await p.goto('http://localhost:5190', { waitUntil: 'load' });
await p.waitForSelector('.game-logo');
await p.screenshot({ path: path.join(OUT, '50_en_title.png') });
await p.click('.btn.primary', { noWaitAfter: true });
await p.waitForSelector('.nick-input', { timeout: 120000 });
await p.fill('.nick-input', 'Alexey');
await p.screenshot({ path: path.join(OUT, '51_en_nick.png') });
await p.click('.nick-row .btn', { noWaitAfter: true });
await p.waitForSelector('.av-card');
await p.waitForTimeout(1400);
await p.screenshot({ path: path.join(OUT, '52_en_avatar.png') });
await p.click('.setup-actions .btn.primary', { noWaitAfter: true });
// online: pantalla de lobbies
await p.waitForSelector('.lobby-create', { timeout: 30000 });
await p.waitForTimeout(1200);
await p.screenshot({ path: path.join(OUT, '53_en_lobbies.png') });
// jugar solo para probar la cámara de entrada
const btns = await p.$$('.setup-actions .btn');
for (const btn of btns) {
  if ((await btn.textContent())?.includes('solo')) { await btn.click(); break; }
}
await p.waitForSelector('.ready-list', { timeout: 15000 });
await p.click('.setup-actions .btn.primary', { noWaitAfter: true });
await p.waitForFunction(() => window.__game?.state === 'intro' || window.__game?.state === 'combat', null, { timeout: 120000, polling: 300 });
// captura INMEDIATA al empezar la intro: debe verse la arena recta, no piedras
await p.waitForTimeout(250);
await p.screenshot({ path: path.join(OUT, '54_intro_first_frames.png') });
const rot = await p.evaluate(() => {
  const c = window.__game.engine.camera;
  return { z: Math.round(c.rotation.z * 1000) / 1000, y: Math.round(c.position.y * 10) / 10 };
});
console.log('camera al inicio de intro:', JSON.stringify(rot));
await p.waitForFunction(() => window.__game?.state === 'combat', null, { timeout: 30000, polling: 300 });
await p.waitForTimeout(2500);
await p.screenshot({ path: path.join(OUT, '55_en_combat.png') });
console.log('errores:', errs.length ? errs.join('|') : '(0)');
await b.close();
console.log('QA EN+CAMERA DONE');
