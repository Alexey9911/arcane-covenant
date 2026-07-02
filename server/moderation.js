// Moderación de chat con Cerebras (LLM ultrarrápido) + fallback por regex.
// Bloquea: flames/insultos, FUD del proyecto, palabras de estafa y
// suplantación de devs/admins/moderadores. Fail-open: si la IA no responde,
// decide la lista de patrones y el mensaje pasa salvo match evidente.

const CEREBRAS_URL = 'https://api.cerebras.ai/v1/chat/completions';
const KEYS = [process.env.CEREBRAS_API_KEY, process.env.CEREBRAS_API_KEY_2].filter(Boolean);
const MODEL = process.env.CEREBRAS_MODEL || 'gemma-4-31b';

const SYSTEM = `Eres el moderador del chat del juego Arcane Covenant (MMO de bosses con apuestas en Solana).
Bloquea SOLO mensajes que sean claramente:
1. Insultos fuertes, acoso o flame a otros jugadores.
2. FUD del proyecto: llamar al juego scam/rug/estafa o incitar a vender/huir.
3. Estafas: pedir SOL/seed phrases, "airdrop gratis", "conecta tu wallet aquí", enlaces sospechosos.
4. Suplantación: hacerse pasar por dev, admin, moderador o soporte del juego.
El lenguaje gamer normal (gg, noob amistoso, quejas del boss, hype) es OK.
Responde SOLO una palabra: OK o BLOCK.`;

// patrones de emergencia (si la IA no está disponible)
const HARD_BLOCK = [
  /seed\s*phrase/i, /frase\s*semilla/i,
  /manda(me)?\s+\d*\s*sol\b/i, /send\s+\d*\s*sol\b/i,
  /airdrop\s+(gratis|free)/i, /free\s+airdrop/i,
  /soy\s+(el\s+)?(dev|admin|mod(erador)?|soporte)/i, /i\s*am\s+(a\s+)?(dev|admin|mod)/i,
  /rug\s*pull/i, /\bscam\b/i, /\bestafa\b/i,
  /conecta\s+tu\s+wallet/i, /connect\s+your\s+wallet/i,
];

const cache = new Map(); // msg normalizado -> boolean ok (moderar duplicados gratis)

export async function moderate(msg) {
  const norm = msg.trim().toLowerCase().slice(0, 200);
  if (!norm) return { ok: false, reason: 'empty' };
  if (cache.has(norm)) return { ok: cache.get(norm), reason: 'cache' };

  const hardHit = HARD_BLOCK.some((re) => re.test(msg));
  if (hardHit) {
    cache.set(norm, false);
    return { ok: false, reason: 'pattern' };
  }

  for (const key of KEYS) {
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 3500);
      const res = await fetch(CEREBRAS_URL, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 6,
          temperature: 0,
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: `mensaje: "${msg.slice(0, 300)}"` },
          ],
        }),
      });
      clearTimeout(to);
      if (!res.ok) continue;
      const data = await res.json();
      const verdict = (data.choices?.[0]?.message?.content ?? '').toUpperCase();
      const ok = !verdict.includes('BLOCK');
      if (cache.size > 2000) cache.clear();
      cache.set(norm, ok);
      return { ok, reason: 'ai' };
    } catch {
      // siguiente key / fallback
    }
  }
  // fail-open: la IA no está — ya pasó los patrones duros
  return { ok: true, reason: 'fail-open' };
}
