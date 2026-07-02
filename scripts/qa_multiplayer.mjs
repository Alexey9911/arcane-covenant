// QA multijugador: 2 navegadores -> mismo lobby -> combate co-op sincronizado.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'qa');
fs.mkdirSync(OUT, { recursive: true });
const URL = process.argv[2] ?? 'http://localhost:5190';

const browser = await chromium.launch({ headless: false, args: ['--window-position=20,20', '--mute-audio'] });
const errsA = [], errsB = [];

async function boot(name, pos, errs) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await p.goto(`${URL}?qa=${name}`, { waitUntil: 'load', timeout: 60000 });
  await p.waitForSelector('.game-logo');
  await p.click('.btn.primary', { noWaitAfter: true });
  await p.waitForSelector('.nick-input', { timeout: 120000 });
  await p.evaluate(() => { localStorage.removeItem('ac_nick'); });
  await p.fill('.nick-input', name);
  await p.click('.nick-row .btn', { noWaitAfter: true });
  await p.waitForSelector('.av-card');
  return p;
}

const A = await boot('HostA', 0, errsA);
const B = await boot('PeerB', 1, errsB);

// A: mago -> lobbies -> crear grupo
await A.click('.setup-actions .btn.primary', { noWaitAfter: true }); // confirmar héroe
await A.waitForSelector('.lobby-create', { timeout: 20000 });
await A.fill('.c-title', 'QA Nexo');
await A.click('.setup-actions .btn.primary', { noWaitAfter: true }); // crear grupo
await A.waitForSelector('.setup-ready .ready-row', { timeout: 15000 });
console.log('A en lobbyRoom');

// B: guerrero -> lobbies -> unirse
await B.click('.av-arrow[data-dir="1"]', { noWaitAfter: true }); // warrior
await B.waitForTimeout(400);
await B.click('.setup-actions .btn.primary', { noWaitAfter: true }); // confirmar
await B.waitForSelector('.lobbies-list', { timeout: 20000 });
await B.waitForTimeout(1200); // meta refresh
const joinBtns = await B.$$('.lobbies-list .btn');
if (joinBtns.length === 0) throw new Error('B no ve lobbies');
await joinBtns[0].click();
await B.waitForFunction(() => window.__game && document.querySelectorAll('.setup-ready .ready-row').length >= 2, null, { timeout: 15000 });
console.log('B unido al lobby');
await A.screenshot({ path: path.join(OUT, '40_mp_lobby_host.png') });

// ambos ready
const clickReady = async (p) => {
  const btns = await p.$$('.setup-actions .btn');
  for (const b of btns) {
    const t = await b.textContent();
    if (t?.includes('Listo')) { await b.click(); return; }
  }
};
await clickReady(A);
await B.waitForTimeout(600);
await clickReady(B);

// matchStart en ambos
await A.waitForFunction(() => window.__game?.state === 'combat', null, { timeout: 120000, polling: 400 });
await B.waitForFunction(() => window.__game?.state === 'combat', null, { timeout: 120000, polling: 400 });
const roleA = await A.evaluate(() => window.__game.netRole);
const roleB = await B.evaluate(() => window.__game.netRole);
console.log('roles:', roleA, roleB);

// A (host) ataca; B se mueve
await A.mouse.move(550, 250);
await A.keyboard.press('1');
await B.keyboard.down('a');
await A.waitForTimeout(2500);
await B.keyboard.up('a');
await A.keyboard.press('1');
await A.waitForTimeout(2000);

const hpA = await A.evaluate(() => Math.round(window.__game.boss?.hp ?? -1));
const hpB = await B.evaluate(() => Math.round(window.__game.boss?.hp ?? -1));
const posB_onA = await A.evaluate(() => { const g = window.__game; const w = g.heroes[1]; return [Math.round(w.pos.x * 10) / 10, Math.round(w.pos.z * 10) / 10]; });
const posB_onB = await B.evaluate(() => { const g = window.__game; const w = g.heroes[1]; return [Math.round(w.pos.x * 10) / 10, Math.round(w.pos.z * 10) / 10]; });
console.log('boss hp A/B:', hpA, hpB, '(sync:', Math.abs(hpA - hpB) < 200, ')');
console.log('warrior pos en A:', posB_onA, 'en B:', posB_onB);

await A.screenshot({ path: path.join(OUT, '41_mp_combat_host.png') });
await B.screenshot({ path: path.join(OUT, '42_mp_combat_peer.png') });

// chat en partida desde B
await B.keyboard.press('Enter');
await B.keyboard.type('vamos equipo!');
await B.keyboard.press('Enter');
await A.waitForTimeout(1500);
const chatOnA = await A.evaluate(() => document.querySelector('.chat-log')?.textContent?.includes('vamos equipo'));
console.log('chat B->A:', chatOnA);

console.log('ERRS A:', errsA.length ? [...new Set(errsA)].join(' | ') : '(0)');
console.log('ERRS B:', errsB.length ? [...new Set(errsB)].join(' | ') : '(0)');
const pass = roleA === 'host' && roleB === 'peer' && hpA < 9200 && Math.abs(hpA - hpB) < 250 && chatOnA;
console.log(pass ? 'MP QA PASS' : 'MP QA FAIL');
await browser.close();
process.exit(pass ? 0 : 1);
