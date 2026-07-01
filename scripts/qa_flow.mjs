// QA headless: recorre título -> lobby -> combate, captura screenshots,
// consola, errores de página y diagnostics del renderer.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'qa');
fs.mkdirSync(OUT, { recursive: true });

const URL = process.argv.includes('--url')
  ? process.argv[process.argv.indexOf('--url') + 1]
  : 'http://127.0.0.1:5190';
const MOBILE = process.argv.includes('--mobile');

const consoleMsgs = [];
const pageErrors = [];

// headed: usa la GPU real (SwiftShader headless no puede con la escena)
const browser = await chromium.launch({
  headless: false,
  args: ['--window-position=40,40', '--mute-audio'],
});
const ctx = await browser.newContext(
  MOBILE
    ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' }
    : { viewport: { width: 1600, height: 900 } },
);
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleMsgs.push(`[${m.type()}] ${m.text().slice(0, 300)}`); });
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 400)));

const tag = MOBILE ? 'mobile_' : '';
const shot = (name) => page.screenshot({ path: path.join(OUT, `${tag}${name}.png`), timeout: 90000 });
const diag = () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__ ?? null);

console.log(`QA ${MOBILE ? 'MOBILE' : 'DESKTOP'} -> ${URL}`);
await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
await page.waitForSelector('.game-logo', { timeout: 30000 });
await page.waitForTimeout(2500);
await shot('01_title');
console.log('title ok, diag:', JSON.stringify(await diag()));

// entrar al lobby
await page.click('.btn.primary', { noWaitAfter: true });
await page.waitForSelector('.lobby-panel', { timeout: 15000 });
await page.waitForTimeout(800);
await shot('02_lobby');

// unirse a la primera partida
await page.click('.lobby-row .btn', { noWaitAfter: true });
console.log('joining, waiting for combat state (model load)...');
await page.waitForFunction(
  () => window.__THREE_GAME_DIAGNOSTICS__ && ['intro', 'combat'].includes(window.__THREE_GAME_DIAGNOSTICS__.state),
  null, { timeout: 180000, polling: 500 },
);
await page.waitForTimeout(1200);
await shot('03_intro');
await page.waitForFunction(
  () => window.__THREE_GAME_DIAGNOSTICS__?.state === 'combat',
  null, { timeout: 30000, polling: 300 },
);
console.log('combat, diag:', JSON.stringify(await diag()));
await shot('04_combat_start');

if (!MOBILE) {
  // jugar: moverse y lanzar hechizos
  await page.mouse.move(800, 300);
  await page.keyboard.down('w');
  await page.waitForTimeout(900);
  await page.keyboard.up('w');
  await page.keyboard.press('1'); // bola de fuego
  await page.waitForTimeout(700);
  await shot('05_fireball');
  await page.keyboard.press('2'); // nova
  await page.waitForTimeout(500);
  await shot('06_nova');
  await page.keyboard.press('3'); // beam
  await page.waitForTimeout(1200);
  await shot('07_beam');
  await page.keyboard.press('4'); // meteoro
  await page.waitForTimeout(1300);
  await shot('08_meteor');
  await page.waitForTimeout(4000);
  await shot('09_combat_later');
  console.log('after play, diag:', JSON.stringify(await diag()));
} else {
  await page.waitForTimeout(5000);
  await shot('05_combat_later');
  console.log('mobile combat diag:', JSON.stringify(await diag()));
}

// chequeo de canvas no-negro: muestrear el screenshot
const buf = await page.screenshot();
console.log(`last screenshot bytes: ${buf.length} (blank suele ser < 30k)`);

console.log('\n--- PAGE ERRORS ---');
console.log(pageErrors.length ? pageErrors.join('\n') : '(ninguno)');
console.log('--- CONSOLE (err/warn, únicos) ---');
console.log([...new Set(consoleMsgs)].slice(0, 20).join('\n') || '(ninguno)');

await browser.close();
console.log('QA DONE');
