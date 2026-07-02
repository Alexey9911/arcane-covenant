// Verifica: al morir el jugador, no aparece el banner grande (solo la guía HAS CAÍDO).
import { chromium } from 'playwright';

const b = await chromium.launch({ headless: false, args: ['--window-position=40,40', '--mute-audio'] });
const p = await (await b.newContext({ viewport: { width: 1400, height: 800 } })).newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
await p.goto('http://localhost:5190', { waitUntil: 'load' });
await p.waitForSelector('.game-logo');
await p.click('.btn.primary', { noWaitAfter: true });
await p.waitForSelector('.nick-input', { timeout: 120000 });
await p.fill('.nick-input', 'Alexey');
await p.click('.nick-row .btn', { noWaitAfter: true });
await p.waitForSelector('.av-card');
await p.click('.setup-actions .btn.primary', { noWaitAfter: true });
await p.waitForSelector('.ready-list');
await p.click('.setup-actions .btn.primary', { noWaitAfter: true });
await p.waitForFunction(() => window.__game?.state === 'combat', null, { timeout: 120000, polling: 400 });
await p.waitForTimeout(3400); // deja pasar el banner de intro del boss
await p.evaluate(() => { const g = window.__game; g.damageHero(g.player, 999999); });
await p.waitForTimeout(700);
const check = await p.evaluate(() => ({
  bannerOn: document.querySelector('.banner').classList.contains('on'),
  bannerText: document.querySelector('.banner .bn-title').textContent,
  deathMsgOn: document.querySelector('.death-msg').classList.contains('on'),
}));
console.log('check:', JSON.stringify(check));
console.log('errores:', errs.length ? errs.join('|') : '(ninguno)');
await b.close();
