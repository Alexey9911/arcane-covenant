// Solana: house wallet (escrow), verificación de depósitos y payouts.
// Patrón copiado de football-game/server/solana.js (GoalPlay).
// SOLANA_CLUSTER=devnet por defecto para el prototipo; mainnet-beta al lanzar.
import {
  Connection, Keypair, PublicKey, SystemProgram, Transaction,
  LAMPORTS_PER_SOL, clusterApiUrl,
} from '@solana/web3.js';
import bs58 from 'bs58';

const CLUSTER = process.env.SOLANA_CLUSTER || 'devnet';
const RPC = process.env.SOLANA_RPC
  || (process.env.HELIUS_API_KEY
    ? `https://${CLUSTER === 'mainnet-beta' ? 'mainnet' : 'devnet'}.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
    : clusterApiUrl(CLUSTER));

let conn = null;
let house = null;

export function initSolana() {
  const secret = process.env.HOUSE_WALLET_SECRET;
  if (!secret) {
    console.log('[solana] sin HOUSE_WALLET_SECRET — modo apuestas deshabilitado');
    return { enabled: false, cluster: CLUSTER, houseAddress: null };
  }
  try {
    const bytes = secret.trim().startsWith('[') ? Uint8Array.from(JSON.parse(secret)) : bs58.decode(secret.trim());
    house = Keypair.fromSecretKey(bytes);
    conn = new Connection(RPC, 'confirmed');
    console.log(`[solana] ${CLUSTER} — house: ${house.publicKey.toBase58()}`);
    return { enabled: true, cluster: CLUSTER, houseAddress: house.publicKey.toBase58() };
  } catch (e) {
    console.error('[solana] secret inválido:', e.message);
    return { enabled: false, cluster: CLUSTER, houseAddress: null };
  }
}

export function houseAddress() {
  return house ? house.publicKey.toBase58() : null;
}

/** Verifica que la firma es una transferencia from -> house por >= amountSol. */
export async function verifyDeposit(sig, fromPubkey, amountSol) {
  if (!conn || !house) return { ok: false, error: 'solana off' };
  try {
    const tx = await conn.getParsedTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' });
    if (!tx || tx.meta?.err) return { ok: false, error: 'tx no confirmada' };
    const target = house.publicKey.toBase58();
    const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL * 0.999); // margen redondeo
    for (const ins of tx.transaction.message.instructions) {
      const p = ins.parsed;
      if (p?.type === 'transfer'
        && p.info.destination === target
        && p.info.source === fromPubkey
        && Number(p.info.lamports) >= lamports) {
        return { ok: true };
      }
    }
    return { ok: false, error: 'transferencia no encontrada en la tx' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** Paga desde la house wallet. Devuelve la firma o null. */
export async function payout(toPubkey, amountSol) {
  if (!conn || !house || amountSol <= 0) return null;
  try {
    const tx = new Transaction().add(SystemProgram.transfer({
      fromPubkey: house.publicKey,
      toPubkey: new PublicKey(toPubkey),
      lamports: Math.floor(amountSol * LAMPORTS_PER_SOL),
    }));
    const sig = await conn.sendTransaction(tx, [house]);
    await conn.confirmTransaction(sig, 'confirmed');
    console.log(`[solana] payout ${amountSol} SOL -> ${toPubkey} (${sig})`);
    return sig;
  } catch (e) {
    console.error('[solana] payout error:', e.message);
    return null;
  }
}
