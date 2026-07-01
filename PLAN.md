# ⚔️ ARCANE COVENANT — Plan Maestro

> MMO RPG de navegador · Boss Rush cooperativo (party de 4) · Three.js · Foco: **calidad visual AAA** + **game feel**

---

## 1. Concepto del juego

**Una frase:** Controlas a un héroe en una party de 4 (tú + 3 compañeros IA) que debe derrotar bosses cada vez más difíciles en una arena arcana; lanzas hechizos en tiempo real, esquivas telegraphs, revives aliados caídos canalizando (quieto y vulnerable), y entre bosses gastas oro en el mercado para mejorar tus habilidades.

**Loop jugable:**
```
Lobby (lista de partidas) → Arena → Combate vs Boss (fases, telegraphs, adds)
   ├─ Victoria → Oro + Mercado de mejoras → Siguiente boss (más difícil)
   ├─ Aliado muere → Revive canalizado (4s quieto junto al cuerpo, interrumpible)
   └─ Party completa muere → Derrota → Regreso al Lobby
```

**Nota multiplayer:** El diseño simula la experiencia MMO (lobby con lista de partidas, party frames, roles tank/healer/DPS) pero es **single-player por ahora**: los otros 3 miembros son IA con comportamiento de rol. La arquitectura separa *intents* de *simulación* para facilitar el multiplayer real después (Fase futura).

---

## 2. Dirección de arte

**Tema:** Ruinas de un coliseo arcano flotante en un vacío nocturno. Piedra antigua violeta-gris, runas emisivas, cristales de maná, niebla en capas, rocas flotantes en parallax. Cinemático pero legible.

**Principio de legibilidad (color-expert):** el mundo es *profundo y desaturado* (60% neutros violeta-gris oscuros, 30% piedra/niebla azulada media) y todas las señales de gameplay son *vívidas y brillantes* (10% emisivos). La separación de **luminosidad** — no solo de tono — es lo que hace legible cada amenaza sobre el suelo oscuro.

### Paleta (tokens de referencia → semánticos)

| Token | Valor | Uso |
|---|---|---|
| `env.abyss` | `#12101c` | Fondo/vacío, fog lejano |
| `env.stone` | `#3a3644` | Piedra de arena, suelo |
| `env.stoneLight` | `#6f6685` | Trim de pilares, bordes |
| `env.fog` | `#241f33` | Niebla en capas |
| `env.runeArcane` | `#a06bff` | Runas del suelo (emisivo ×2.5) |
| `env.crystal` | `#4ee8e0` | Cristales de maná (emisivo ×3) |
| `class.mage` | `#ff6b2b` | Mago de fuego (jugador) |
| `class.cleric` | `#ffd977` | Clérigo sagrado (healer IA) |
| `class.warrior` | `#7fb2ff` | Guerrero de acero (tank IA) |
| `class.ranger` | `#58e05a` | Cazadora venenosa (DPS IA) |
| `boss.threat` | `#ff2e4d` | Boss, telegraphs enemigos (hue distinto del fuego del mago) |
| `ui.health` | `#ff4757` | Barras de vida |
| `ui.mana` | `#5c8bff` | Barras de maná |
| `ui.gold` | `#ffc94d` | Oro, recompensas, mercado |
| `ui.shield` | `#67e8f9` | Escudos/absorbs |
| `ui.revive` | `#ffe9a3` | Canal de revivir (dorado cálido) |
| `ui.xp` | `#b57dff` | Progresión |

**Telegraphs enemigos:** relleno `rgba(255,46,77,0.22)` + borde emisivo `#ff2e4d` ×2 + barrido radial animado (el progreso del barrido = tiempo restante). Señal por **forma + movimiento + color**, nunca solo color (CVD-safe). Zonas benéficas (curación, revive) en cian/dorado.

**Render:** ACES filmic tone mapping, exposición ~1.1, sRGB output. Emisivos "calientes" con `emissiveIntensity` 2–6 para que el bloom (threshold ~1) solo capture lo autorizado: runas, cristales, hechizos, ojos del boss. Nada de bloom en todo el frame.

---

## 3. Stack técnico

| Capa | Elección | Por qué |
|---|---|---|
| Build | **Vite + TypeScript** | Estándar de las skills three.js, HMR rápido |
| 3D | **Three.js** (vanilla, r17x) | Control total de shaders/VFX sin overhead de React en el hot path |
| Post | **postprocessing** (pmndrs) | Bloom selectivo, vignette, SMAA, ChromaticAberration eficientes en un solo pass |
| Shaders | **GLSL custom** | Telegraphs, runas, beams, dissolve, escudos, portales |
| Partículas | **InstancedMesh + shader** pooled | Miles de partículas GPU sin GC |
| Audio | **Web Audio** (manifest propio) | Grupos de volumen SFX/música/UI, unlock por gesto |
| Colisión | **Custom** (círculos/sectores en plano XZ) | Arena plana: matemática 2D exacta y barata; no necesitamos física rígida |
| UI | **HTML/CSS overlay** | Tipografía nítida, accesible, responsive; estética integrada al mundo |

**Assets externos (pipeline híbrido):**

| Superficie | Fuente | Detalle |
|---|---|---|
| 4 héroes + 3 bosses | **Meshy AI** (text-to-image nano-banana-pro → image-to-3D → rig → animaciones) | GLB riggeado; walk/run gratis con el rig; T-pose para héroes. Saldo: 1128 créditos ✔ |
| Iconos de habilidades (16), retratos, arte de título | **Higgsfield MCP (nano banana 2)** | Pocos tokens, buena calidad de iconografía |
| SFX/ambience/stingers (~22 archivos) | **ElevenLabs** (sound generation) | Key válida (scoped) ✔ |
| Arena, pilares, cristales, VFX, telegraphs | **Procedural Three.js + GLSL** | Control total, instanciado, presupuesto de draw calls |

**Fallback:** si Meshy falla o tarda demasiado en alguna pieza, cada entidad tiene un modelo procedural estilizado (silueta autorizada + materiales de la librería) para que el juego nunca dependa de una descarga.

---

## 4. Arquitectura del código

```
src/
├── main.ts                  # bootstrap DOM, app lifecycle
├── core/
│   ├── Engine.ts            # renderer, composer, loop (delta clamp), resize
│   ├── Input.ts             # teclado+ratón → intents (moveDir, castSlot, target)
│   └── Diagnostics.ts       # window.__THREE_GAME_DIAGNOSTICS__
├── game/
│   ├── GameState.ts         # máquina de estados: LOBBY→ARENA→VICTORY/DEFEAT→MARKET
│   ├── Run.ts               # progresión de la run: boss index, oro, mejoras
│   └── Balance.ts           # todas las constantes de tuning en un solo lugar
├── entities/
│   ├── Hero.ts              # stats, cast, cooldowns, muerte/revive
│   ├── Boss.ts              # fases, script de ataques, enrage
│   ├── Projectile.ts        # pool de proyectiles
│   └── CompanionAI.ts       # cerebros tank/healer/dps
├── systems/
│   ├── CameraRig.ts         # top-down MMO: follow suave, zoom rueda, shake
│   ├── Combat.ts            # daño, aggro, telegraphs, resolución de hits
│   ├── SpellSystem.ts       # definición de hechizos data-driven
│   ├── ReviveSystem.ts      # canal 4s, interrupción, anillo de progreso
│   └── AudioSystem.ts       # manifest, grupos, unlock
├── vfx/
│   ├── VfxSystem.ts         # orquestador event-driven, pooling
│   ├── Particles.ts         # InstancedMesh GPU particles
│   ├── Telegraphs.ts        # decals AoE con shader (círculo, cono, anillo)
│   ├── Beams.ts / Trails.ts # rayos y estelas
│   └── shaders/*.glsl       # rune, dissolve, shield, beam, ground
├── world/
│   ├── Arena.ts             # suelo+runas, pilares, cristales, escombros
│   ├── Skybox.ts            # gradiente + estrellas + nebulosa shader
│   └── Atmosphere.ts        # fog en capas, motas, embers, god rays fake
├── assets/
│   ├── MaterialLibrary.ts   # roles: bodyPrimary, trim, hazard, emissiveSignal…
│   ├── ModelRegistry.ts     # GLTFLoader wrapper: escala, bounds, clips, fallback
│   └── palette.ts           # tokens de color ref→semantic (fuente única)
└── ui/
    ├── Hud.ts               # party frames, hotbar, boss bar, cast bar, combat text
    ├── Screens.ts           # título, lobby list, mercado, victoria, derrota
    └── styles.css           # estética arcana, responsive, safe-areas
```

**Orden de update:** `input → gameplay (combat/AI/boss) → VFX/animación → cámara → UI bridge → render`.

---

## 5. Diseño de gameplay

### 5.1 Las 4 clases (party)

| Clase | Rol | Kit (slot 1/2/3/4) | Color |
|---|---|---|---|
| **Pyromante** (JUGADOR) | DPS mágico | Bola de Fuego (proyectil) · Nova de Escarcha (AoE self, slow) · Rayo Arcano (beam canalizado) · **Meteoro** (ult, AoE grande CD 45s) | `#ff6b2b` |
| **Vanguardia** (IA tank) | Tank | Provocación (aggro fijo) · Golpe de Escudo · Muro de Acero (mitigación) | `#7fb2ff` |
| **Lumen** (IA healer) | Sanador | Destello Curativo (single) · Nova Sagrada (AoE heal) · Palabra de Vida (HoT) | `#ffd977` |
| **Sombravid** (IA DPS) | DPS físico | Flechas Rápidas · Flecha Venenosa (DoT) · Descarga Múltiple | `#58e05a` |

Jugador: **WASD** mueve, **ratón** apunta (los hechizos salen hacia el cursor), **1-4** lanza, **E** revive (mantener cerca de un aliado caído), **rueda** zoom. La IA prioriza por rol: tank mantiene aggro y se posiciona; healer triagea (revive si es seguro); DPS esquiva telegraphs y castiga ventanas.

### 5.2 Bosses (3 rondas, dificultad creciente)

1. **Gólem Ígneo** — lento y demoledor: slam frontal (cono), anillos de fuego expansivos, lluvia de meteoros (círculos), enrage al 20%.
2. **Liche del Vacío** — control de zona: zonas de escarcha persistentes, orbes del vacío que persiguen, invoca 2 adds, teleport + andanada.
3. **Señor Demonio** — examen final: combina cono+anillos+orbes, beam giratorio (hay que rodear), fase 2 con arena reducida (el borde quema).

Cada boss: barra con nombre + fases marcadas, **todos los ataques telegrafiados** (1–2.5s de anticipación), ventanas de castigo tras cada mecánica. La dificultad viene de superponer mecánicas, no de daño injusto.

### 5.3 Muerte y revive

- Héroe a 0 HP → cae (animación + dissolve parcial), queda **cuerpo revivible** con anillo dorado.
- Revivir: mantener **E** a ≤2.5m del cuerpo durante **4s**; el canalizador **no puede moverse ni castear** y el daño interrumpe. Anillo de progreso dorado + partículas ascendentes.
- La IA healer también revive si el peligro es bajo. Revivido vuelve con 40% HP.
- **Party completa muerta → Derrota**: pantalla de derrota → botón "Volver al Lobby".

### 5.4 Lobby y mercado

- **Lobby:** lista estilizada de "partidas" (nombres de jugadores simulados, ping, dificultad) → al unirte se forma la party y entras a la arena. Vende la fantasía MMO y deja el hueco donde irá el matchmaking real.
- **Mercado (entre bosses):** oro ganado → mejoras persistentes de la run: +daño por hechizo (niveles), −cooldowns, +HP/maná party, velocidad de revive, potenciar el Meteoro. Cartas de compra con iconos generados, coste creciente.

---

## 6. Plan de VFX (la estrella del juego)

| Efecto | Técnica |
|---|---|
| Bola de fuego | Core emisivo + trail de partículas + luz puntual pooled + impacto (anillo shader + shards + humo) |
| Nova de escarcha | Onda shader radial + cristales instanciados que crecen y se disuelven + suelo congelado temporal |
| Rayo arcano | Beam shader (scroll UV + noise + core caliente) con luz y partículas en el punto de impacto |
| Meteoro | Telegraph grande → sombra creciente → impacto con shockwave, escombros, screen shake, chromatic aberration puntual |
| Curación | Espiral de motas doradas ascendentes + rim light temporal en el receptor |
| Telegraphs | Decal shader en el suelo: borde nítido + relleno con barrido radial (= countdown) + pulso final |
| Muerte/dissolve | Shader dissolve con borde emisivo (noise threshold animado) |
| Escudo | Esfera fresnel + hex pattern + ripple al absorber |
| Boss enrage | Ojos/grietas emisivas suben de intensidad + aura de partículas + tinte de luz de la arena |
| Ambiente | Motas de polvo, embers flotantes, niebla en capas, cristales pulsantes, runas que respiran |

Todo **event-driven y pooled** (cero allocations en el hot path). El bloom solo toca emisivos autorizados.

---

## 7. Presupuestos de rendimiento

- Draw calls < 150 en combate (instancing para pilares/cristales/partículas).
- DPR cap 2 (desktop) / 1.5 (móvil). Sombras: 1 luz direccional 2048px, solo héroes+boss castean.
- Triángulos: héroes ~15-30k c/u (remesh de Meshy si excede), boss ~40-60k, mundo instanciado.
- Post: 1 composer (SMAA + Bloom + Vignette); ChromaticAberration solo en impactos (parámetro animado, no pass extra).
- Target: 60 fps desktop, 30+ móvil.

---

## 8. Fases de construcción (orden real de ejecución)

1. **Plan** (este documento) ✔
2. **Scaffold** Vite+TS+Three + npm install.
3. **Generación de assets lanzada en background** (lo más lento primero): Meshy héroes/bosses; en paralelo, iconos con Higgsfield y SFX con ElevenLabs.
4. **Core engine**: renderer+post, cámara MMO, input, loop, diagnostics.
5. **Arena y atmósfera** (procedural + shaders) — primera imagen "wow".
6. **Combate**: clases, hechizos data-driven, boss 1 con fases, IA de compañeros, muerte/revive, derrota/victoria.
7. **VFX pass** completo sobre cada mecánica.
8. **UI/HUD + lobby + mercado** (skill frontend-design + color-expert).
9. **Bosses 2 y 3** + curva de dificultad + mejoras del mercado.
10. **Integración de assets** Meshy/Higgsfield/ElevenLabs cuando terminen (con fallbacks ya funcionando).
11. **QA**: build, screenshots activos desktop/móvil, console limpio, canvas no-blank, scorecard visual (todas las categorías ≥2), diagnostics de renderer, riesgos.

---

## 9. Criterios de éxito (gates de calidad)

- **Scorecard visual** (skill AAA): las 10 categorías ≥ 2/3, media ≥ 2.3, cero fallos automáticos (nada de primitivas+glow, HUD genérico, mundo vacío).
- **Jugable de verdad**: input real → hechizos → boss muere / party muere → loop completo lobby↔arena↔mercado.
- **Evidencia**: `npm run build` limpio, screenshots en juego activo, diagnostics (`draw calls`, tris, texturas), sin errores de consola.
- **Feel**: hit feedback en <100ms (flash+sonido+números), telegraphs siempre esquivables, revive tenso pero justo.

## 10. Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Meshy tarda/falla en algún modelo | Fallbacks procedurales con silueta autorizada ya integrados; assets se enchufan al llegar |
| Animaciones Meshy no cubren "cast" | Rig da walk/run; cast/attack se resuelve con animación procedural aditiva (brazos/torso) + VFX que venden la acción |
| ElevenLabs key con scopes limitados | Verificada para sound-generation; si un endpoint falla → Higgsfield `generate_audio` como fallback |
| Rendimiento móvil | DPR cap, instancing, bloom selectivo, partículas escalables por calidad |
| Alcance (3 bosses) | Boss 1 completo primero; 2 y 3 reutilizan el sistema de mecánicas data-driven |
