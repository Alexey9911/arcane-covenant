// Verifica en PRODUCCIÓN: cliente Vercel conecta al server Fly y ve lobbies online.
import { chromium } from 'playwright';

// espera al deploy nuevo de Vercel (hasta 3 min)
const t0 = Date.now();
let fresh = false;
while (Date.now() - t0 < 180000) {
  const r = await fetch('https://arcane-covenant.vercel.app', { cache: 'no-store' });
  const html = await r.text();
  if (!html.includes('index-CowEdhnl')) { fresh = true; break; } // hash del build anterior
  await new Promise((res) => setTimeout(res, 8000));
}
console.log('deploy nuevo detectado:', fresh);

const b = await chromium.launch({ headless: false, args: ['--window-position=40,40', '--mute-audio'] });
const p = await (await b.newContext({ viewport: { width: 1200, height: 720 } })).newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
await p.goto('https://arcane-covenant.vercel.app', { waitUntil: 'load', timeout: 60000 });
await p.waitForSelector('.game-logo');
await p.click('.btn.primary', { noWaitAfter: true });
await p.waitForSelector('.nick-input', { timeout: 180000 });
await p.fill('.nick-input', 'ProdCheck');
await p.click('.nick-row .btn', { noWaitAfter: true });
await p.waitForSelector('.av-card');
await p.click('.setup-actions .btn.primary', { noWaitAfter: true });
await p.waitForSelector('.lobby-create', { timeout: 30000 });
await p.waitForTimeout(2000);
const status = await p.evaluate(() => document.querySelector('.setup-step')?.textContent ?? '');
console.log('estado nexo:', status.trim());
const online = /CONECTADOS/.test(status);
// chat global de prueba
await p.evaluate(() => { const i = document.querySelector('.chat-input'); i?.focus(); });
await p.keyboard.type('gg desde produccion');
await p.keyboard.press('Enter');
await p.waitForTimeout(2500);
const chatEcho = await p.evaluate(() => document.querySelector('.chat-log')?.textContent?.includes('gg desde produccion'));
console.log('chat prod (via Fly + moderación):', chatEcho);
console.log('errores:', errs.length ? errs.join('|') : '(0)');
console.log(online && chatEcho ? 'PROD ONLINE PASS' : 'PROD ONLINE FAIL');
await b.close();
process.exit(online && chatEcho ? 0 : 1);
