// Arcane Covenant — server multiplayer (patrón GoalPlay/football-game).
// Lobbies de hasta 4, ready+countdown, relay host-autoritativo (snap/pinput),
// chat global moderado por IA (Cerebras), leaderboard en Neon, apuestas Solana
// con reparto proporcional al daño hecho al boss.
import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import cors from 'cors';
import { Server } from 'socket.io';
import { moderate } from './moderation.js';
import { initDb, addStats, topPlayers, saveChat, chatHistory, recordBet, settleBet, getPerm, setPerm } from './db.js';
import { initSolana, houseAddress, verifyDeposit, payout } from './solana.js';

const PORT = process.env.PORT || 8080;
const HOUSE_FEE = 0.05;
const CLASSES = ['mage', 'warrior', 'cleric', 'ranger'];

const app = express();
app.use(cors());
app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/api/leaderboard', async (_req, res) => res.json(await topPlayers(20)));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const sol = initSolana();
let leaderboard = [];

/** @type {Map<string, any>} */
const lobbies = new Map();

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (lobbies.has(code));
  return code;
}

function publicLobby(l) {
  return {
    code: l.code, title: l.title, mode: l.mode, bet: l.bet, bossIndex: l.bossIndex,
    status: l.status, hostId: l.hostId,
    players: l.players.map((p) => ({
      id: p.id, nick: p.nick, classId: p.classId, ready: p.ready,
      escrowed: p.escrowed, wallet: p.wallet ? `${p.wallet.slice(0, 4)}…${p.wallet.slice(-4)}` : null,
    })),
  };
}

function openLobbies() {
  return [...lobbies.values()].filter((l) => l.status === 'waiting' && l.players.length < 4).map(publicLobby);
}

function broadcastMeta() {
  io.emit('meta', {
    online: io.engine.clientsCount,
    lobbies: openLobbies(),
    leaderboard,
    solana: { enabled: sol.enabled, cluster: sol.cluster, house: houseAddress() },
  });
}

function lobbyOf(socket) {
  const code = socket.data.lobby;
  return code ? lobbies.get(code) : null;
}

function leaveLobby(socket, notify = true) {
  const l = lobbyOf(socket);
  if (!l) return;
  socket.data.lobby = null;
  socket.leave(l.code);
  l.players = l.players.filter((p) => p.id !== socket.id);
  if (l.countdownTimer && l.players.length === 0) clearTimeout(l.countdownTimer);
  if (l.players.length === 0) {
    lobbies.delete(l.code);
  } else {
    if (l.hostId === socket.id) {
      l.hostId = l.players[0].id;
      if (l.status === 'playing') {
        // el host se fue en plena partida: abortar y volver a waiting
        l.status = 'waiting';
        l.players.forEach((p) => { p.ready = false; p.escrowed = false; });
        io.to(l.code).emit('matchAborted', { reason: 'Host disconnected' });
      }
    }
    if (notify) io.to(l.code).emit('lobbyUpdate', publicLobby(l));
  }
  broadcastMeta();
}

function tryStartCountdown(l) {
  if (l.status !== 'waiting' || l.players.length < 1) return;
  const allReady = l.players.every((p) => p.ready);
  const allPaid = l.mode !== 'solana' || !sol.enabled || l.bet <= 0
    || l.players.every((p) => p.escrowed);
  if (!allReady || !allPaid) return;
  if (l.countdownTimer) return;
  io.to(l.code).emit('countdown', { seconds: 3 });
  l.countdownTimer = setTimeout(() => {
    l.countdownTimer = null;
    if (l.status !== 'waiting') return;
    l.status = 'playing';
    l.damage = {};
    // slots: orden de llegada; el host simula
    const slots = l.players.map((p, i) => ({ slot: i, id: p.id, nick: p.nick, classId: p.classId }));
    io.to(l.code).emit('matchStart', { lobby: publicLobby(l), slots, bossIndex: l.bossIndex, hostId: l.hostId });
    broadcastMeta();
  }, 3000);
}

async function settleMatch(l, result) {
  // result: { type: 'victory'|'defeat', damageBySlot: {slot: dmg} }
  const isVictory = result.type === 'victory';
  const payouts = [];

  if (isVictory) {
    for (const p of l.players) {
      await addStats({ wallet: p.wallet, nick: p.nick, bossKills: 1, victories: l.bossIndex >= 2 ? 1 : 0 });
    }
  }

  if (l.mode === 'solana' && sol.enabled && l.bet > 0) {
    const paid = l.players.filter((p) => p.escrowed);
    const pot = l.bet * paid.length * (1 - HOUSE_FEE);
    if (isVictory && paid.length > 0) {
      const totalDmg = paid.reduce((s, p) => {
        const slot = l.players.indexOf(p);
        return s + Math.max(1, result.damageBySlot?.[slot] ?? 1);
      }, 0);
      for (const p of paid) {
        const slot = l.players.indexOf(p);
        const share = Math.max(1, result.damageBySlot?.[slot] ?? 1) / totalDmg;
        const amount = Math.floor(pot * share * 1e6) / 1e6;
        let sig = null;
        if (p.wallet && amount > 0) sig = await payout(p.wallet, amount);
        if (p.betId) await settleBet(p.betId, amount, sig);
        await addStats({ wallet: p.wallet, nick: p.nick, solEarned: amount });
        payouts.push({ nick: p.nick, amount, share: Math.round(share * 100), sig });
      }
      // mejora permanente solo-Solana: 1 por boss vencido (nivel = boss más alto)
      for (const p of paid) {
        if (p.wallet) {
          const cur = await getPerm(p.wallet);
          if (l.bossIndex + 1 > cur) await setPerm(p.wallet, l.bossIndex + 1);
        }
      }
    } else {
      for (const p of paid) {
        if (p.betId) await settleBet(p.betId, 0, null);
        payouts.push({ nick: p.nick, amount: 0, share: 0, sig: null });
      }
    }
  }

  // el lobby sobrevive: mismo equipo puede continuar (victoria avanza el boss)
  l.status = 'waiting';
  if (isVictory) l.bossIndex = Math.min(l.bossIndex + 1, 2);
  l.players.forEach((p) => { p.ready = false; p.escrowed = false; p.betId = null; });
  io.to(l.code).emit('betSettled', { type: result.type, payouts, nextBossIndex: l.bossIndex });
  io.to(l.code).emit('lobbyUpdate', publicLobby(l));
  leaderboard = await topPlayers(10);
  broadcastMeta();
}

io.on('connection', (socket) => {
  socket.data.nick = 'Errante';
  socket.data.wallet = null;

  socket.on('hello', async ({ nick, wallet } = {}) => {
    socket.data.nick = String(nick || 'Errante').slice(0, 16);
    socket.data.wallet = typeof wallet === 'string' && wallet.length >= 32 ? wallet : null;
    const perm = socket.data.wallet ? await getPerm(socket.data.wallet) : 0;
    socket.emit('helloOk', { id: socket.id, permUpgrades: perm });
    socket.emit('chatHistory', await chatHistory(30));
    broadcastMeta();
  });

  socket.on('chat', async ({ msg } = {}) => {
    const text = String(msg ?? '').trim().slice(0, 120);
    if (!text) return;
    const verdict = await moderate(text);
    if (!verdict.ok) {
      socket.emit('chatBlocked', { reason: 'Message blocked by the arcane moderator' });
      return;
    }
    const m = { nick: socket.data.nick, msg: text, ts: Date.now() };
    await saveChat({ nick: m.nick, wallet: socket.data.wallet, msg: text });
    io.emit('chat', m);
  });

  socket.on('createLobby', ({ title, mode, bet, classId } = {}) => {
    leaveLobby(socket, false);
    const code = genCode();
    const l = {
      code,
      title: String(title || `${socket.data.nick}'s Raid`).slice(0, 24),
      mode: mode === 'solana' && sol.enabled ? 'solana' : 'normal',
      bet: mode === 'solana' ? Math.max(0.01, Math.min(5, Number(bet) || 0.05)) : 0,
      bossIndex: 0,
      status: 'waiting',
      hostId: socket.id,
      players: [],
      countdownTimer: null,
      damage: {},
    };
    lobbies.set(code, l);
    joinLobbyInternal(socket, l, classId);
  });

  socket.on('joinLobby', ({ code, classId } = {}) => {
    const l = lobbies.get(String(code ?? '').toUpperCase());
    if (!l) return socket.emit('errorMsg', { msg: 'Group not found' });
    if (l.status !== 'waiting') return socket.emit('errorMsg', { msg: 'Group already in combat' });
    if (l.players.length >= 4) return socket.emit('errorMsg', { msg: 'Group is full (4/4)' });
    leaveLobby(socket, false);
    joinLobbyInternal(socket, l, classId);
  });

  function joinLobbyInternal(sock, l, classId) {
    const taken = new Set(l.players.map((p) => p.classId));
    let cls = CLASSES.includes(classId) && !taken.has(classId)
      ? classId
      : CLASSES.find((c) => !taken.has(c)) ?? 'mage';
    l.players.push({
      id: sock.id, nick: sock.data.nick, wallet: sock.data.wallet,
      classId: cls, ready: false, escrowed: false, betId: null,
    });
    sock.data.lobby = l.code;
    sock.join(l.code);
    io.to(l.code).emit('lobbyUpdate', publicLobby(l));
    broadcastMeta();
  }

  socket.on('updateClass', ({ classId } = {}) => {
    const l = lobbyOf(socket);
    if (!l || l.status !== 'waiting' || !CLASSES.includes(classId)) return;
    const me = l.players.find((p) => p.id === socket.id);
    if (!me) return;
    if (l.players.some((p) => p.id !== socket.id && p.classId === classId)) {
      return socket.emit('errorMsg', { msg: 'Class already taken' });
    }
    me.classId = classId;
    io.to(l.code).emit('lobbyUpdate', publicLobby(l));
  });

  socket.on('setReady', (ready) => {
    const l = lobbyOf(socket);
    if (!l || l.status !== 'waiting') return;
    const me = l.players.find((p) => p.id === socket.id);
    if (!me) return;
    if (ready && l.mode === 'solana' && sol.enabled && l.bet > 0 && !me.escrowed) {
      return socket.emit('errorMsg', { msg: `Deposit ${l.bet} SOL first` });
    }
    me.ready = !!ready;
    io.to(l.code).emit('lobbyUpdate', publicLobby(l));
    tryStartCountdown(l);
  });

  socket.on('escrowDeposit', async ({ sig } = {}) => {
    const l = lobbyOf(socket);
    if (!l || l.mode !== 'solana' || !sol.enabled) return;
    const me = l.players.find((p) => p.id === socket.id);
    if (!me || !me.wallet) return socket.emit('errorMsg', { msg: 'Connect your wallet first' });
    const v = await verifyDeposit(String(sig), me.wallet, l.bet);
    if (!v.ok) return socket.emit('errorMsg', { msg: `Depósito no verificado: ${v.error}` });
    me.escrowed = true;
    me.betId = await recordBet({ lobbyCode: l.code, wallet: me.wallet, amount: l.bet, txSig: sig, status: 'escrowed' });
    io.to(l.code).emit('lobbyUpdate', publicLobby(l));
    tryStartCountdown(l);
  });

  // ---- relay de partida (host-autoritativo) ----
  socket.on('snap', (state) => {
    const l = lobbyOf(socket);
    if (!l || l.status !== 'playing' || l.hostId !== socket.id) return;
    socket.volatile.to(l.code).emit('snap', state);
  });

  socket.on('pinput', (input) => {
    const l = lobbyOf(socket);
    if (!l || l.status !== 'playing') return;
    const slot = l.players.findIndex((p) => p.id === socket.id);
    if (slot < 0) return;
    io.to(l.hostId).volatile.emit('pinput', { slot, input });
  });

  socket.on('matchEvent', async (ev) => {
    const l = lobbyOf(socket);
    if (!l || l.status !== 'playing' || l.hostId !== socket.id) return;
    if (ev?.type === 'victory' || ev?.type === 'defeat') {
      await settleMatch(l, ev);
    }
  });

  socket.on('leaveLobby', () => leaveLobby(socket));
  socket.on('disconnect', () => leaveLobby(socket));
});

setInterval(broadcastMeta, 5000);

const mode = await initDb();
leaderboard = await topPlayers(10);
server.listen(PORT, () => {
  console.log(`[server] Arcane Covenant en :${PORT} (db=${mode}, solana=${sol.enabled ? sol.cluster : 'off'})`);
});
