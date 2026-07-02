// QA del onboarding + mejoras: nick -> avatar -> ready -> combate (guerrero),
// diálogo del boss, reticle, muerte en B/N con flecha y countdown.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'qa');
fs.mkdirSync(OUT, { recursive: true });
const URL = process.argv[2] ?? 'http://localhost:5190';

const pageErrors = [];
const browser = await chromium.launch({ headless: false, args: ['--window-position=40,40', '--mute-audio'] });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 300)));
const shot = (n) => page.screenshot({ path: path.join(OUT, `${n}.png`), timeout: 60000 });

await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
await page.waitForSelector('.game-logo', { timeout: 30000 });
await page.click('.btn.primary', { noWaitAfter: true });

// paso 1: nick (espera a que la precarga muestre el panel)
await page.waitForSelector('.nick-input', { timeout: 120000 });
await page.waitForTimeout(2500); // órbita cinemática
await shot('20_setup_nick');
await page.fill('.nick-input', 'AlexeyTheBold');
await page.click('.nick-row .btn', { noWaitAfter: true });

// paso 2: avatar — ciclar al guerrero (1 a la derecha)
await page.waitForSelector('.av-card', { timeout: 15000 });
await page.waitForTimeout(1600); // transición de cámara
await shot('21_setup_avatar_mage');
await page.click('.av-arrow[data-dir="1"]', { noWaitAfter: true });
await page.waitForTimeout(1400);
await shot('22_setup_avatar_warrior');
await page.click('.setup-actions .btn.primary', { noWaitAfter: true });

// paso 3: ready
await page.waitForSelector('.ready-list', { timeout: 15000 });
await page.waitForTimeout(1300);
await shot('23_setup_ready');
await page.click('.setup-actions .btn.primary', { noWaitAfter: true });
await page.waitForTimeout(2200);
await shot('24_ready_all');

// combate
await page.waitForFunction(() => window.__game?.state === 'combat', null, { timeout: 120000, polling: 400 });
console.log('combat como guerrero, clase:', await page.evaluate(() => window.__game.player.def.id));
await page.waitForTimeout(2200); // el boss dice su línea de intro
await shot('25_combat_dialogue');
// mover + habilidades del guerrero
await page.mouse.move(800, 350);
await page.keyboard.down('w');
await page.waitForTimeout(1400);
await page.keyboard.up('w');
await page.keyboard.press('1'); // golpe de escudo
await page.waitForTimeout(400);
await page.keyboard.press('4'); // terremoto
await page.waitForTimeout(900);
await shot('26_warrior_earthquake');

// muerte del jugador: B/N + flecha + countdown de revive
await page.evaluate(() => { const g = window.__game; g.damageHero(g.player, 999999); });
await page.waitForTimeout(1800);
await shot('27_death_bw');
// espera a que la clériga IA canalice el revive (countdown visible)
const revived = await page.waitForFunction(
  () => window.__game.heroes.some((h) => h.alive && h.reviveTargetId === window.__game.player.id) || window.__game.player.alive,
  null, { timeout: 30000, polling: 300 },
).then(() => true).catch(() => false);
await page.waitForTimeout(1200);
await shot('28_death_reviving');
console.log('reviver detectado:', revived);
await page.waitForFunction(() => window.__game.player.alive, null, { timeout: 30000, polling: 400 }).catch(() => {});
console.log('jugador revivido:', await page.evaluate(() => window.__game.player.alive));
await page.waitForTimeout(600);
await shot('29_revived_color');

// chat
await page.keyboard.press('Enter');
await page.keyboard.type('gg team');
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
await shot('30_chat');

console.log('diag:', JSON.stringify(await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__)));
console.log('--- PAGE ERRORS ---');
console.log(pageErrors.length ? [...new Set(pageErrors)].join('\n') : '(ninguno)');
await browser.close();
console.log('QA ONBOARDING DONE');
