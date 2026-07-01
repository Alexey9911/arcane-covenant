# ⚔️ Arcane Covenant

MMO RPG boss-rush de navegador construido con **Three.js + TypeScript + Vite**. Party de 4 (tú como maga de fuego + 3 compañeros IA: tanque, sanadora, cazadora) contra 3 bosses con fases, telegraphs y enrage, en una arena arcana flotante.

> Diseño completo en [PLAN.md](PLAN.md).

## Jugar

```bash
npm install
npm run dev   # http://localhost:5190
```

| Control | Acción |
|---|---|
| **WASD / flechas** | Moverse |
| **Ratón** | Apuntar hechizos |
| **1** | Bola de Fuego (proyectil) |
| **2** | Nova de Escarcha (AoE + slow) |
| **3** | Rayo Arcano (canalizado) |
| **4** | Meteoro (ultimate) |
| **E (mantener)** | Revivir aliado caído (4s, quieto) |
| **Rueda** | Zoom de cámara |

En móvil: joystick táctil (mitad izquierda) + botones de la hotbar.

## Loop

Lobby → unirse a partida → derrotar al boss → oro → **Mercado Arcano** (mejoras: daño, cooldowns, vitalidad, velocidad de revive) → siguiente boss (3 en total). Si toda la party muere → derrota → de vuelta al lobby (mejoras se conservan).

## Reglas de combate

- Todos los ataques del boss están **telegrafiados** (círculos/anillos/conos rojos con barrido de countdown): siempre se pueden esquivar.
- Los compañeros IA esquivan solos, el tanque mantiene el aggro, la sanadora cura y revive.
- Revivir deja al canalizador **inmóvil e interrumpible**: el daño cancela el canal.
- Bosses: fases por umbral de vida, invocaciones (liche), beam giratorio y arena que arde (demonio), enrage al final.

## Assets generados con IA

| Asset | Herramienta |
|---|---|
| Modelos 3D héroes/bosses (GLB PBR + rig + walk/run) | Meshy AI |
| Iconos, retratos, key art | Higgsfield (nano banana 2) |
| 27 SFX + ambience | ElevenLabs |
| Arena, VFX, shaders (telegraphs, beams, cielo, partículas) | Procedural (GLSL propio) |

Scripts del pipeline en [scripts/](scripts/) (requieren `MESHY_API_KEY` / `ELEVENLABS_API_KEY` como variables de entorno).

## Flags de depuración

- `?proc=1` — fuerza personajes procedurales (sin cargar GLB).
- `window.__THREE_GAME_DIAGNOSTICS__` — fps, draw calls, triángulos, estado.

## QA

```bash
npm run build                                     # typecheck + build
node scripts/qa_flow.mjs --url http://localhost:5190   # flujo completo headless + screenshots en qa/
node scripts/qa_flow.mjs --url http://localhost:5190 --mobile
```
