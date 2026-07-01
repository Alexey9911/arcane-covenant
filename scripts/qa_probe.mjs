// Sonda: llega a combate y vuelca errores no capturados + diagnostics.
import { chromium } from 'playwright';

const URL = process.argv[2] ?? 'http://localhost:5190/?proc=1';
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newContext({ viewport: { width: 1280, height: 720 } }).then((c) => c.newPage());
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e).slice(0, 500)));
await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
await page.waitForSelector('.game-logo', { timeout: 30000 });
await page.click('.btn.primary', { noWaitAfter: true });
await page.waitForSelector('.lobby-panel', { timeout: 15000 });
await page.click('.lobby-row .btn', { noWaitAfter: true });
console.log('joined, esperando 30s...');
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(5000);
  const info = await page.evaluate(() => JSON.stringify({
    errs: (window.__errs || []).slice(0, 4),
    diag: window.__THREE_GAME_DIAGNOSTICS__ ?? null,
  }));
  console.log(`t+${(i + 1) * 5}s:`, info);
}
await browser.close();
