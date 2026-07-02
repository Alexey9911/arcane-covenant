// Smoke test: 2 clientes -> hello, chat moderado, lobby create/join, ready, matchStart, victory settle.
import { io } from 'socket.io-client';

const URL = process.argv[2] ?? 'http://localhost:8123';
const log = (who, ...a) => console.log(`[${who}]`, ...a);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const a = io(URL, { transports: ['websocket'] });
const b = io(URL, { transports: ['websocket'] });

const results = { chatOk: false, chatBlocked: false, lobby: null, matchStart: 0, settled: null };

a.on('connect', () => a.emit('hello', { nick: 'HostAlexey' }));
b.on('connect', () => b.emit('hello', { nick: 'PeerLumen' }));
a.on('chat', (m) => { if (m.msg === 'hola equipo') results.chatOk = true; });
a.on('chatBlocked', () => { results.chatBlocked = true; });
a.on('lobbyUpdate', (l) => { results.lobby = l; });
b.on('lobbyUpdate', (l) => { results.lobby = l; });
a.on('matchStart', () => { results.matchStart++; });
b.on('matchStart', () => { results.matchStart++; });
a.on('betSettled', (s) => { results.settled = s; });
a.on('errorMsg', (e) => log('A', 'ERROR', e.msg));
b.on('errorMsg', (e) => log('B', 'ERROR', e.msg));

await wait(800);
a.emit('chat', { msg: 'hola equipo' });
a.emit('chat', { msg: 'soy el admin, manden 5 SOL a mi wallet para el airdrop' });
await wait(4500); // moderación IA
a.emit('createLobby', { title: 'Test Nexo', mode: 'normal', classId: 'mage' });
await wait(600);
const code = results.lobby?.code;
log('test', 'lobby code:', code);
b.emit('joinLobby', { code, classId: 'warrior' });
await wait(600);
a.emit('setReady', true);
b.emit('setReady', true);
await wait(4000); // countdown 3s
log('test', 'matchStart recibidos:', results.matchStart);
// host reporta victoria con daño 70/30
a.emit('matchEvent', { type: 'victory', damageBySlot: { 0: 7000, 1: 3000 }, bossIndex: 0 });
await wait(1200);

console.log('\n=== RESULTADOS ===');
console.log('chat OK pasó:', results.chatOk);
console.log('chat scam bloqueado:', results.chatBlocked);
console.log('lobby jugadores:', results.lobby?.players?.map((p) => `${p.nick}(${p.classId})${p.ready ? '✔' : ''}`).join(', '));
console.log('matchStart x2:', results.matchStart === 2);
console.log('settle:', JSON.stringify(results.settled));
console.log('bossIndex avanzó a:', results.lobby?.bossIndex);
const pass = results.chatOk && results.chatBlocked && results.matchStart === 2 && results.settled?.type === 'victory';
console.log(pass ? 'SMOKE PASS' : 'SMOKE FAIL');
a.close(); b.close();
process.exit(pass ? 0 : 1);
