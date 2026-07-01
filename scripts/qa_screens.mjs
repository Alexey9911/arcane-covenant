// QA de pantallas y mecánicas: revive, victoria, mercado, boss 2, derrota.
// Usa window.__game como hook de depuración.
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
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 400)));

const shot = (n) => page.screenshot({ path: path.join(OUT, `${n}.png`), timeout: 60000 });
const state = () => page.evaluate(() => window.__game?.state);

await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
await page.waitForSelector('.game-logo');
await page.click('.btn.primary', { noWaitAfter: true });
await page.waitForSelector('.lobby-panel');
await page.click('.lobby-row .btn', { noWaitAfter: true });
await page.waitForFunction(() => window.__game?.state === 'combat', null, { timeout: 180000, polling: 400 });
await page.waitForTimeout(1000);

// ---- revive flow: matar a la clériga, teleportar al lado, mantener E
console.log('probando revive...');
await page.evaluate(() => {
  const g = window.__game;
  const cleric = g.heroes[2];
  g.damageHero(cleric, 999999);
  g.player.pos.set(cleric.pos.x + 1.2, 0, cleric.pos.z);
});
await page.waitForTimeout(400);
await shot('10_corpse_prompt');
await page.keyboard.down('e');
await page.waitForTimeout(2000);
await shot('11_reviving');
const reviving = await page.evaluate(() => window.__game.player.reviveProgress);
console.log('revive progress a mitad:', reviving);
await page.waitForTimeout(2600);
await page.keyboard.up('e');
const clericAlive = await page.evaluate(() => window.__game.heroes[2].alive);
console.log('cleric revivida:', clericAlive);
await shot('12_revived');

// ---- forzar victoria
console.log('forzando victoria...');
await page.evaluate(() => {
  const g = window.__game;
  g.damageEnemy(g.boss, 9999999, 0xffffff);
});
await page.waitForTimeout(2200);
await shot('13_victory');
await page.click('.btn.primary', { noWaitAfter: true }); // ir al mercado
await page.waitForTimeout(700);
await shot('14_market');
// comprar la mejora más barata (Pacto Vital, 70)
const bought = await page.evaluate(() => window.__game.buyUpgrade('vitality'));
console.log('compra vitality:', bought, 'oro restante:', await page.evaluate(() => window.__game.gold));
await page.waitForTimeout(400);
await shot('15_market_bought');
// siguiente boss (liche)
await page.click('.market-actions .btn', { noWaitAfter: true });
await page.waitForFunction(() => window.__game?.state === 'combat' && window.__game?.bossIndex === 1, null, { timeout: 180000, polling: 400 });
await page.waitForTimeout(2500);
await shot('16_boss2_lich');
console.log('boss 2 diag:', JSON.stringify(await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__)));

// ---- forzar derrota
console.log('forzando derrota...');
await page.evaluate(() => {
  const g = window.__game;
  for (const h of g.heroes) g.damageHero(h, 999999);
});
await page.waitForTimeout(2400);
await shot('17_defeat');
await page.click('.btn.primary', { noWaitAfter: true }); // volver al lobby
await page.waitForTimeout(800);
await shot('18_lobby_back');
console.log('estado final:', await state());

console.log('--- PAGE ERRORS ---');
console.log(pageErrors.length ? pageErrors.join('\n') : '(ninguno)');
await browser.close();
console.log('QA SCREENS DONE');
