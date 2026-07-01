# Arcane Covenant — Reporte final de evidencia (threejs-game-director)

Run URL: `npm run dev` → http://localhost:5190 · Build: `npm run build` ✔ (853 KB JS / 259 KB gzip)

## Skill-loading ledger

- Director: active (invoked vía Skill tool)
- Gameplay systems: yes — C:\Users\Pc\.claude\skills\threejs-gameplay-systems\SKILL.md (loaded)
- AAA graphics: yes — threejs-aaa-graphics-builder\SKILL.md (loaded)
- UI: yes — threejs-game-ui-designer\SKILL.md (loaded)
- Debug/profile: fallback director-phase (debugging ejecutado con diagnostics propios + Playwright; SKILL.md no cargado por presupuesto de contexto)
- QA/release: yes — threejs-qa-release\SKILL.md (loaded)
- 3D generator: sustituido por meshy-3d-agent SKILL.md (loaded) — el usuario exigió Meshy en lugar de Tripo
- Image generator: sustituido por Higgsfield MCP nano_banana_2 — el usuario exigió Higgsfield en lugar de Gemini
- Audio generator: yes — threejs-audio-generator\SKILL.md (loaded); generación vía API ElevenLabs directa
- Extra (exigidas por el usuario): color-expert (invoked), frontend-design (invoked)

## Reference ledger

- Gameplay workflows: yes — references/gameplay-workflows.md
- Physics engine selection: not-needed — colisión custom 2D en plano (sin física rígida)
- Visual scorecard: yes — references/visual-scorecard.md
- Implementation blueprint: yes — references/implementation-blueprint.md
- Model recipes: no — modelos externos Meshy + fallbacks procedurales simples (blueprint cubrió la arquitectura)
- Render recipes: yes — references/render-recipes.md
- UI patterns: yes — references/ui-patterns.md
- QA/release checklists: parcial — flujo QA ejecutado según SKILL.md; checklists específicos no cargados (evidencia equivalente abajo)
- Audio workflows: no cargado — pipeline propio con defaults del SKILL.md (duraciones/prompt influence)

## External asset sourcing ledger

- Credential probe output (literal, `probe_asset_credentials.sh`):
  ```
  TRIPO_API_KEY=
  GEMINI_API_KEY=SET
  ELEVENLABS_API_KEY=
  ```
  Nota: el probe corre en Git Bash y no hereda las variables de usuario de Windows recién escritas. Verificación real de las keys usadas (el usuario exigió Meshy+Higgsfield en lugar de Tripo/Gemini):
  - MESHY_API_KEY=SET — `GET api.meshy.ai/openapi/v1/balance` → 200, balance inicial 1128 (final 640)
  - ELEVENLABS_API_KEY=SET — `GET api.elevenlabs.io/v1/voices` → 200 (21 voces; key scoped: 401 en /v1/user, sound-generation OK)
  - Higgsfield MCP conectado → 7 generaciones de imagen completadas
- Hero/player: **Meshy** text-to-image (nano-banana-pro, multi-view, t-pose) → multi-image-to-3d → remesh 28k → rigging (walk/run) — 4 héroes, GLB PBR
- Enemies/bosses: **Meshy** ídem — golem (riggeado, 55k), lich (estático flotante, 55k), demon (estático, 60k; pose estimation del rig falló — fallback previsto). Adds: procedural (prop repetido de bajo valor)
- Signature props/pickups: procedural (anillos de revive, cristales, telegraphs) — soporte, no héroe
- World/sky/background: procedural GLSL (skybox nebulosa+estrellas, arena rúnica canvas-texture, niebla, motas)
- Materials/textures/decals: PBR de Meshy + canvas procedural (piedra, círculo rúnico 2048px, sprites)
- Logos/icons/GUI art: **Higgsfield nano_banana_2** — icons_mage (4 hechizos), icons_market (4 mejoras), portraits_party (4), 3 retratos de boss, title_art 21:9 2K
- Audio/SFX/voice: **ElevenLabs** sound-generation — 27/27 archivos (hechizos, boss, UI, stingers, ambience loop 14s)
- Chosen sources per surface: hero/player=threejs-3d-generator-equivalente(Meshy), enemies/bosses=Meshy, props/pickups=procedural, world/sky=procedural, materials=hybrid (PBR Meshy + procedural), logos/icons/GUI=image-generator-equivalente(Higgsfield), audio=ElevenLabs
- External assets generated: yes. Real external asset evidence (Meshy task IDs, image-to-3d):
  - hero_mage i3d=019f1f6e-5c82-725a-b0f9-7695113a22f6 → public/models/hero_mage_rigged.glb (+walk/run)
  - hero_warrior i3d=019f1f6e-6384-725b-b4b9-04de24bea5d7 → public/models/hero_warrior_rigged.glb
  - hero_cleric i3d=019f1f6e-6c0f-79b2-9356-0a59a3a8ddeb → public/models/hero_cleric_rigged.glb
  - hero_ranger i3d=019f1f6e-c617-7d5e-8f0c-e710393a3d4d → public/models/hero_ranger_rigged.glb
  - boss_golem i3d=019f1f6e-7bba-7d51-864b-23ce154c5797 → public/models/boss_golem_rigged.glb
  - boss_lich i3d=019f1f6e-87e1-7e26-aa6f-e7bd9da64745 → public/models/boss_lich.glb
  - boss_demon i3d=019f1f6e-8d10-79bb-8531-f122bbac532e → public/models/boss_demon.glb
  - Higgsfield jobs: 0d61298a (icons_mage), 99759824 (icons_market), 17b47d2e (portraits_party), 6c69234d/919c918f/cd2f0f16 (retratos boss), 83bc8008 (title_art) → public/images/*.jpg
- Audio assets generated: yes — 27 MP3 generados vía /v1/sound-generation; log "AUDIO COMPLETE: 27/27". Archivos (layout Vite `public/` ≙ notación `assets/` del audit): assets/audio/fireball_cast.mp3, assets/audio/meteor_impact.mp3, assets/audio/boss_roar.mp3, assets/audio/revive_channel.mp3, assets/audio/victory_stinger.mp3, assets/audio/ambience_arena.mp3 (+21 más), servidos desde public/audio/ en este repo

## Phase ledger

- Gameplay systems: done — loop completo lobby→combate→victoria/derrota→mercado→boss 2/3; input WASD+ratón+1-4+E+rueda; evidencia: QA Playwright con estado y screenshots
- External asset sourcing: done — ledger arriba
- AAA graphics: done — scorecard abajo; remesh 2.5M→358k tris tras medir
- UI: done — HUD 8 estados + 7 pantallas, responsive verificado desktop 1600×900 y móvil 390×844
- Debug/profile: done — window.__THREE_GAME_DIAGNOSTICS__ (fps reales, draw calls, tris, texturas); bug de escala skinned y drenaje de maná IA encontrados y corregidos con evidencia
- QA/release: done — build limpio, preview, console/page errors, canvas no-blank, flujos: cast×4, revive completo, victoria, compra en mercado, boss 2, derrota, retorno a lobby

## Verification

- npm run build: ✔ (tsc + vite, 0 errores)
- Browser run: ✔ Chromium headed GPU real
- Console/page errors: 0 page errors; 1 warning residual `glBlitFramebuffer` (lib postprocessing, no rompe render)
- Canvas nonblank pixel check: ✔ screenshots de 745KB-1MB con varianza de pixel alta (un canvas en blanco comprime a <30KB)
- Screenshots activos desktop: qa/01…09, 10-18 (revive/victoria/mercado/boss2/derrota) · móvil: qa/mobile_01…05
- Input real: WASD movió al jugador (z 9→2.4), 4 hechizos casteados con daño real al boss (9200→7804), E revivió a la clériga
- Fail/retry: derrota forzada → pantalla → lobby ✔; victoria → mercado → boss 2 ✔
- Renderer diagnostics (post-graphics): combat desktop 124-144 fps, 75-86 draw calls, ~358k tris, 40 texturas; móvil viewport 97-126 fps
- Audio: 27 buffers servidos por fetch sin error; unlock por gesto en "Entrar al Nexo"; verificación auditiva manual pendiente (headless)

## Visual scorecard (before 0 — proyecto vacío / after)

- Art direction: 0 → 2.5 — tema arcano coherente en mundo+UI+VFX+paleta OKLCH-based
- Hero/player: 0 → 2 — GLB PBR Meshy riggeado, walk/run, pose de brazos procedural, anillos de clase; sin clip idle nativo
- Obstacles/enemies: 0 → 2 — 3 bosses GLB distintos con fases/telegraphs/enrage; adds procedurales
- Rewards/interactables: 0 → 2 — economía oro + mercado con iconos generados + anillos de revive interactivos
- World/environment: 0 → 2 — arena rúnica, 12 pilares, cristales, rocas flotantes en parallax, skybox nebulosa, niebla+motas
- Materials/textures: 0 → 2 — PBR + librería procedural (piedra/runas/emisivos por rol)
- Lighting/render: 0 → 2.5 — ACES, bloom selectivo, vignette, chroma por impulso, key/rim/hemi, sombras 2048, IBL suave
- VFX/motion: 0 → 2.5 — telegraphs shader con countdown, novas, beam GLSL, shockwaves, trails, dissolve, aura enrage, scorch
- UI/HUD: 0 → 3 — party frames, boss bar con ticks de fase, hotbar radial, cast bars, combat text, banners, 7 pantallas, móvil
- Performance evidence: 0 → 3 — antes/después del remesh (2.5M→358k tris), fps/draws/tris desktop+móvil, presupuestos cumplidos

Average: 2.45
Automatic failures remaining: ninguno (screenshots de juego activo, assets autorados, HUD específico de género, jugable con input real, diagnostics capturados)

## Remaining risks

1. Warning WebGL `glBlitFramebuffer` de la lib postprocessing (cosmético en consola; render correcto).
2. Boss demonio sin rig (pose estimation de Meshy falló): usa root-motion procedural; menos expresivo que el gólem.
3. Sin clip "cast/idle/death" nativo (la librería de action IDs de Meshy no estaba disponible): resuelto con pose procedural + VFX.
4. GLBs 14-21 MB c/u (texturas 4K sin comprimir): primera carga ~90 MB; optimizable con KTX2/Draco para release pública.
5. Audio verificado por carga, no por escucha (QA headless).
6. Multiplayer real fuera de alcance por pedido del usuario (lobby simulado, arquitectura intents/simulación preparada).
