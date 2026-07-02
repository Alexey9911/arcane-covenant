// Persistencia: Postgres (Neon) si hay DATABASE_URL, si no JSON local (dev).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const DATA_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data.json');
let pool = null;
let local = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS ac_players (
  wallet TEXT PRIMARY KEY,
  nick TEXT NOT NULL,
  boss_kills INTEGER DEFAULT 0,
  victories INTEGER DEFAULT 0,
  gold_earned BIGINT DEFAULT 0,
  sol_earned DOUBLE PRECISION DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ac_chat (
  id BIGSERIAL PRIMARY KEY,
  nick TEXT NOT NULL,
  wallet TEXT,
  msg TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ac_chat_created ON ac_chat (created_at DESC);
ALTER TABLE ac_players ADD COLUMN IF NOT EXISTS perm_upgrades INTEGER DEFAULT 0;
CREATE TABLE IF NOT EXISTS ac_bets (
  id BIGSERIAL PRIMARY KEY,
  lobby_code TEXT NOT NULL,
  wallet TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  tx_sig TEXT,
  status TEXT DEFAULT 'pending',
  payout DOUBLE PRECISION DEFAULT 0,
  payout_sig TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
`;

function loadLocal() {
  if (local) return local;
  try {
    local = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    local = { players: {}, chat: [], bets: [] };
  }
  return local;
}

function saveLocal() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(local));
  } catch { /* dev only */ }
}

export async function initDb() {
  if (process.env.DATABASE_URL) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      // Fly Postgres interno (flycast) va sin TLS; Neon/externos con TLS laxo
      ssl: process.env.DATABASE_URL.includes('sslmode=disable') ? false : { rejectUnauthorized: false },
      max: 5,
    });
    await pool.query(SCHEMA);
    console.log('[db] Postgres (Neon) listo');
    return 'postgres';
  }
  loadLocal();
  console.log('[db] modo local (data.json) — sin DATABASE_URL');
  return 'local';
}

/** wallet puede ser null (jugadores sin wallet usan nick como id). */
function pid(wallet, nick) {
  return wallet || `nick:${(nick || 'anon').toLowerCase()}`;
}

export async function addStats({ wallet, nick, bossKills = 0, victories = 0, goldEarned = 0, solEarned = 0 }) {
  const id = pid(wallet, nick);
  if (pool) {
    await pool.query(
      `INSERT INTO ac_players (wallet, nick, boss_kills, victories, gold_earned, sol_earned)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (wallet) DO UPDATE SET
         nick = $2,
         boss_kills = ac_players.boss_kills + $3,
         victories = ac_players.victories + $4,
         gold_earned = ac_players.gold_earned + $5,
         sol_earned = ac_players.sol_earned + $6,
         updated_at = now()`,
      [id, nick, bossKills, victories, goldEarned, solEarned],
    );
  } else {
    const db = loadLocal();
    const p = db.players[id] ?? { nick, boss_kills: 0, victories: 0, gold_earned: 0, sol_earned: 0 };
    p.nick = nick;
    p.boss_kills += bossKills;
    p.victories += victories;
    p.gold_earned += goldEarned;
    p.sol_earned += solEarned;
    db.players[id] = p;
    saveLocal();
  }
}

export async function topPlayers(limit = 10) {
  if (pool) {
    const r = await pool.query(
      `SELECT nick, boss_kills, victories, sol_earned FROM ac_players
       ORDER BY boss_kills DESC, sol_earned DESC LIMIT $1`, [limit],
    );
    return r.rows.map((x) => ({ nick: x.nick, bossKills: x.boss_kills, victories: x.victories, solEarned: Number(x.sol_earned) }));
  }
  const db = loadLocal();
  return Object.values(db.players)
    .sort((a, b) => b.boss_kills - a.boss_kills || b.sol_earned - a.sol_earned)
    .slice(0, limit)
    .map((x) => ({ nick: x.nick, bossKills: x.boss_kills, victories: x.victories, solEarned: x.sol_earned }));
}

export async function saveChat({ nick, wallet, msg }) {
  if (pool) {
    await pool.query('INSERT INTO ac_chat (nick, wallet, msg) VALUES ($1, $2, $3)', [nick, wallet, msg.slice(0, 120)]);
  } else {
    const db = loadLocal();
    db.chat.push({ nick, msg: msg.slice(0, 120), ts: Date.now() });
    if (db.chat.length > 200) db.chat = db.chat.slice(-200);
    saveLocal();
  }
}

export async function chatHistory(limit = 30) {
  if (pool) {
    const r = await pool.query('SELECT nick, msg FROM ac_chat ORDER BY created_at DESC LIMIT $1', [limit]);
    return r.rows.reverse();
  }
  return loadLocal().chat.slice(-limit);
}

/** Nivel de mejora permanente (solo lobbies Solana): boss más alto vencido. */
export async function getPerm(wallet) {
  if (!wallet) return 0;
  if (pool) {
    const r = await pool.query('SELECT perm_upgrades FROM ac_players WHERE wallet = $1', [wallet]);
    return r.rows[0]?.perm_upgrades ?? 0;
  }
  return loadLocal().players[wallet]?.perm_upgrades ?? 0;
}

export async function setPerm(wallet, level) {
  if (!wallet) return;
  if (pool) {
    await pool.query(
      `INSERT INTO ac_players (wallet, nick, perm_upgrades) VALUES ($1, $1, $2)
       ON CONFLICT (wallet) DO UPDATE SET perm_upgrades = GREATEST(ac_players.perm_upgrades, $2)`,
      [wallet, level],
    );
  } else {
    const db = loadLocal();
    const p = db.players[wallet] ?? { nick: wallet, boss_kills: 0, victories: 0, gold_earned: 0, sol_earned: 0 };
    p.perm_upgrades = Math.max(p.perm_upgrades ?? 0, level);
    db.players[wallet] = p;
    saveLocal();
  }
}

export async function recordBet({ lobbyCode, wallet, amount, txSig, status }) {
  if (pool) {
    const r = await pool.query(
      'INSERT INTO ac_bets (lobby_code, wallet, amount, tx_sig, status) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [lobbyCode, wallet, amount, txSig, status],
    );
    return r.rows[0].id;
  }
  const db = loadLocal();
  const id = db.bets.length + 1;
  db.bets.push({ id, lobbyCode, wallet, amount, txSig, status, payout: 0 });
  saveLocal();
  return id;
}

export async function settleBet(id, payout, payoutSig) {
  if (pool) {
    await pool.query('UPDATE ac_bets SET status = $2, payout = $3, payout_sig = $4 WHERE id = $1',
      [id, payout > 0 ? 'paid' : 'lost', payout, payoutSig]);
  } else {
    const db = loadLocal();
    const b = db.bets.find((x) => x.id === id);
    if (b) { b.status = payout > 0 ? 'paid' : 'lost'; b.payout = payout; }
    saveLocal();
  }
}
