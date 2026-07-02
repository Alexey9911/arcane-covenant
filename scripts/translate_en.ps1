# Traducción UI a inglés conciso (reemplazos literales exactos).
$ErrorActionPreference = "Stop"
$root = "D:\Alexey\threeJS journey\DEV-CRYPTO\FightVsBossMultiplayer"

function Apply($file, $pairs) {
  $p = Join-Path $root $file
  $c = Get-Content $p -Raw -Encoding UTF8
  foreach ($k in $pairs.Keys) {
    $c = $c.Replace($k, $pairs[$k])
  }
  Set-Content $p $c -NoNewline -Encoding UTF8
  Write-Output "OK $file"
}

Apply "src\game\balance.ts" ([ordered]@{
  "name: 'Bola de Fuego'" = "name: 'Fireball'"
  "name: 'Nova de Escarcha'" = "name: 'Frost Nova'"
  "name: 'Rayo Arcano'" = "name: 'Arcane Beam'"
  "name: 'Meteoro'" = "name: 'Meteor'"
  "name: 'Golpe de Escudo'" = "name: 'Shield Bash'"
  "name: 'Provocación'" = "name: 'Taunt'"
  "name: 'Muro de Acero'" = "name: 'Steel Wall'"
  "name: 'Terremoto'" = "name: 'Earthquake'"
  "name: 'Castigo'" = "name: 'Smite'"
  "name: 'Destello Curativo'" = "name: 'Healing Flash'"
  "name: 'Nova Sagrada'" = "name: 'Holy Nova'"
  "name: 'Juicio'" = "name: 'Judgement'"
  "name: 'Flecha Rápida'" = "name: 'Swift Arrow'"
  "name: 'Flecha Venenosa'" = "name: 'Poison Arrow'"
  "name: 'Descarga Múltiple'" = "name: 'Multishot'"
  "name: 'Lluvia de Flechas'" = "name: 'Arrow Rain'"
  "title: 'el Gólem Ígneo'" = "title: 'The Magma Golem'"
  "title: 'el Liche del Vacío'" = "title: 'The Void Lich'"
  "title: 'el Señor Demonio'" = "title: 'The Demon Lord'"
  "name: 'Furia Ígnea', desc: '+12% daño de hechizos por nivel'" = "name: 'Fire Fury', desc: '+12% spell damage per level'"
  "name: 'Fluir Temporal', desc: '-8% cooldowns por nivel'" = "name: 'Time Flow', desc: '-8% cooldowns per level'"
  "name: 'Pacto Vital', desc: '+15% vida y maná de la party por nivel'" = "name: 'Vital Pact', desc: '+15% party HP and mana per level'"
  "name: 'Alas de Lumen', desc: '-20% tiempo de revivir por nivel'" = "name: 'Lumen Wings', desc: '-20% revive time per level'"
  "intro: '¿Quién osa profanar mi arena? ¡Os convertiré en ceniza!'" = "intro: 'Who dares enter my arena? I will turn you all to ash!'"
  "phase: '¡La montaña despierta! ¡Sentid su furia!'" = "phase: 'The mountain awakens! Feel its fury!'"
  "enrage: '¡Arderéis! ¡Todos arderéis!'" = "enrage: 'Burn! All of you, burn!'"
  "kill: 'Cenizas. Solo quedan cenizas.'" = "kill: 'Ashes. Only ashes remain.'"
  "death: 'Imposible... la piedra... se quiebra...'" = "death: 'Impossible... the stone... breaks...'"
  "intro: 'Vuestras almas ya me pertenecen, mortales.'" = "intro: 'Your souls already belong to me, mortals.'"
  "phase: 'El vacío os devora... lentamente.'" = "phase: 'The void devours you... slowly.'"
  "enrage: '¡La eternidad os reclama!'" = "enrage: 'Eternity claims you all!'"
  "kill: 'Qué frágil. Qué inútil.'" = "kill: 'So fragile. So useless.'"
  "death: 'El vacío... me llama... a mí...'" = "death: 'The void... calls... for me...'"
  "intro: '¡Bienvenidos a vuestro infierno personal!'" = "intro: 'Welcome to your own personal hell!'"
  "phase: '¡Este reino arde con mi ira!'" = "phase: 'This realm burns with my rage!'"
  "enrage: '¡Sangre! ¡Fuego! ¡Muerte!'" = "enrage: 'Blood! Fire! Death!'"
  "kill: '¡Patético! ¿Quién sigue?'" = "kill: 'Pathetic! Who is next?'"
  "death: 'No... yo soy... eterno...'" = "death: 'No... I am... eternal...'"
})

Apply "src\game\game.ts" ([ordered]@{
  "'Interrumpido'" = "'Interrupted'"
  "this.hud.banner('¡VICTORIA!', `${boss.def.name} ha caído`)" = "this.hud.banner('VICTORY!', `${boss.def.name} has fallen`)"
  "this.hud.banner(``${hero.displayName} ha caído``, 'Mantén E junto al cuerpo para revivir')" = "this.hud.banner(``${hero.displayName} is down``, 'Hold E near the body to revive')"
  "this.hud.chatSystem(`☠ ${hero.displayName} ha caído`)" = "this.hud.chatSystem(`☠ ${hero.displayName} is down`)"
  "this.hud.banner(``${corpse.def.name} vuelve al combate``, '')" = "this.hud.banner(``${corpse.def.name} is back!``, '')"
  "this.hud.banner(`Fase ${phase + 1}`, boss.def.name)" = "this.hud.banner(`PHASE ${phase + 1}`, boss.def.name)"
  "this.hud.banner('¡ENFURECIDO!', 'Acaba con él, rápido')" = "this.hud.banner('ENRAGED!', 'Finish it fast')"
  "this.hud.banner('¡El borde arde!', 'Acércate al centro')" = "this.hud.banner('The edge burns!', 'Move to center')"
  "this.hud.banner('¡Invocaciones!', 'Elimina a los espectros')" = "this.hud.banner('Summons!', 'Kill the spawns')"
  "this.hud.banner('¡Rayo Abrasador!', 'Rodéalo')" = "this.hud.banner('Sweeping beam!', 'Circle around')"
  "gana ${p.amount} SOL (${p.share}% del daño)" = "wins ${p.amount} SOL (${p.share}% damage)"
  "derrotado (+${reward} oro)" = "defeated (+${reward} gold)"
})

Apply "src\ui\hud.ts" ([ordered]@{
  "{ dps: 'DPS', tank: 'TANQUE', healer: 'SANADOR' }" = "{ dps: 'DPS', tank: 'TANK', healer: 'HEALER' }"
  "' (TÚ)' : ''}" = "' (YOU)' : ''}"
  "``Reviviendo a ${corpse?.def.name ?? ''}…``" = "``Reviving ${corpse?.def.name ?? ''}…``"
  "<b>E</b> Revivir a ${corpse.def.name}" = "<b>E</b> Revive ${corpse.def.name}"
  "HAS CAÍDO<span>✚ ${reviverName} te está reviviendo — <b>${remaining.toFixed(1)}s</b></span>" = "YOU DIED<span>✚ ${reviverName} reviving you — <b>${remaining.toFixed(1)}s</b></span>"
  "HAS CAÍDO<span>Tu equipo debe revivirte — que mantengan <b>E</b> junto a tu cuerpo</span>" = "YOU DIED<span>Your team must revive you — hold <b>E</b> at your body</span>"
  ": 'REVIVIR';" = ": 'REVIVE';"
  'placeholder="Escribe… (Enter)"' = 'placeholder="Chat… (Enter)"'
})

Apply "src\ui\screens.ts" ([ordered]@{
  "mage: 'Daño mágico a distancia. Fuego, escarcha y el Meteoro definitivo.'" = "mage: 'Ranged magic DPS. Fire, frost and the Meteor ultimate.'"
  "warrior: 'Tanque. Aguanta al boss, provoca y protege a tu equipo.'" = "warrior: 'Tank. Holds the boss and protects the team.'"
  "cleric: 'Sanadora. Cura, revive y castiga con luz sagrada.'" = "cleric: 'Healer. Heals, revives, smites with holy light.'"
  "ranger: 'Daño físico ágil. Flechas rápidas, veneno y lluvia mortal.'" = "ranger: 'Agile DPS. Fast arrows, poison, deadly rain.'"
  "'Los círculos rojos siempre se pueden esquivar. Muévete.'" = "'Red circles are always dodgeable. Move.'"
  "'Revivir te deja indefenso: elige el momento.'" = "'Reviving leaves you defenseless. Pick your moment.'"
  "'La Nova de Escarcha ralentiza al boss. Úsala cuando cargue.'" = "'Frost Nova slows the boss. Use it on big casts.'"
  "'Guarda el Meteoro para las ventanas de castigo.'" = "'Save Meteor for punish windows.'"
  "'Vanguard mantiene la atención del boss. No se la robes.'" = "'Vanguard holds aggro. Let him tank.'"
  "this.btn('Entrar al Nexo', true" = "this.btn('PLAY', true"
  "hint.textContent = 'WASD moverse · 1-4 hechizos · E revivir · rueda zoom';" = "hint.textContent = 'WASD move · 1-4 spells · E revive · wheel zoom';"
  ">PASO 1 / 3<" = ">STEP 1 / 3<"
  ">PASO 2 / 3<" = ">STEP 2 / 3<"
  ">PASO 3 / 3<" = ">STEP 3 / 3<"
  ">Tu nombre de leyenda<" = ">Enter your name<"
  '<div class="screen-sub">Así te verán tus compañeros en el Nexo</div>' = ''
  "inp.placeholder = 'Tu nickname…';" = "inp.placeholder = 'Nickname…';"
  "this.btn('Jugar →', true" = "this.btn('Play →', true"
  ">Elige tu héroe<" = ">Choose your hero<"
  "hero.def.role === 'dps' ? 'DPS' : hero.def.role === 'tank' ? 'TANQUE' : 'SANADORA'" = "hero.def.role === 'dps' ? 'DPS' : hero.def.role === 'tank' ? 'TANK' : 'HEALER'"
  "this.btn('Confirmar héroe', true" = "this.btn('Confirm', true"
  ">Grupo del Nexo<" = ">Raid party<"
  "h.def.role === 'dps' ? 'DPS' : h.def.role === 'tank' ? 'TANQUE' : 'SANADORA'" = "h.def.role === 'dps' ? 'DPS' : h.def.role === 'tank' ? 'TANK' : 'HEALER'"
  "✔ LISTO' : '…'" = "✔ READY' : '…'"
  ">Tu historial<" = ">Your stats<"
  "<span>Bosses<br>matados</span>" = "<span>Boss<br>kills</span>"
  "<span>Nexos<br>purificados</span>" = "<span>Full<br>clears</span>"
  "<span>Oro<br>ganado</span>" = "<span>Gold<br>earned</span>"
  "<span>SOL<br>ganado</span>" = "<span>SOL<br>earned</span>"
  "Ranking global — próximamente con lobbies online" = "Global ranking — play online lobbies"
  "this.btn('¡Listo para luchar!', true" = "this.btn('READY UP', true"
  "this.btn('Cambiar héroe', false" = "this.btn('Change hero', false"
  "NEXO ONLINE ${net.connected ? ``· ${meta?.online ?? 1} CONECTADOS`` : '· SIN CONEXIÓN'}" = "ONLINE ${net.connected ? ``· ${meta?.online ?? 1} PLAYERS`` : '· OFFLINE'}"
  ">Grupos de incursión<" = ">Raid groups<"
  "Conectando con el Nexo…" = "Connecting…"
  "No hay grupos abiertos — crea el tuyo" = "No open groups — create one"
  "'AMISTOSA'" = "'FRIENDLY'"
  "this.btn('Unirse', false" = "this.btn('Join', false"
  'placeholder="Nombre del grupo…"' = 'placeholder="Group name…"'
  '<option value="normal">Amistosa</option>' = '<option value="normal">Friendly</option>'
  "this.btn('Crear grupo', true" = "this.btn('Create group', true"
  "this.btn('Jugar solo (IA)', false" = "this.btn('Play solo (AI)', false"
  "this.btn('← Héroe', false" = "this.btn('← Hero', false"
  ">Leaderboard global<" = ">Leaderboard<"
  "Aún no hay leyendas" = "No legends yet"
  "◎ APUESTA ${l.bet} SOL · REPARTO POR DAÑO" = "◎ ${l.bet} SOL · DAMAGE SPLIT"
  "'INCURSIÓN AMISTOSA'" = "'FRIENDLY RAID'"
  "' · ◎ DEPOSITADO' : ' · sin depósito'" = "' · ◎ PAID' : ' · not paid'"
  "this.btn(`Depositar ${l.bet} ◎`, true" = "this.btn(`Deposit ${l.bet} ◎`, true"
  "this.btn('Cancelar listo', false" = "this.btn('Unready', false"
  "this.btn('Salir del grupo', false" = "this.btn('Leave', false"
  ">Mercado Arcano<" = ">Arcane Market<"
  '<div class="screen-sub">Invierte tu oro antes del siguiente boss</div>' = ''
  "◆ ${game.gold} oro" = "◆ ${game.gold} gold"
  "maxed ? 'Máximo' : ``${cost} oro``" = "maxed ? 'MAX' : ``${cost} gold``"
  "this.btn('Al siguiente boss →', true" = "this.btn('Next boss →', true"
  "t.textContent = 'VICTORIA';" = "t.textContent = 'VICTORY';"
  "``${data.boss.name} ${data.boss.title} ha caído``" = "``${data.boss.name} has fallen``"
  "``+${data.reward} oro``" = "``+${data.reward} gold``"
  "this.btn('Ir al mercado', true" = "this.btn('To market', true"
  "t.textContent = 'DERROTA';" = "t.textContent = 'DEFEAT';"
  "'La party ha caído. El Nexo os reclama.'" = "'Your party has fallen.'"
  "``+${data.consolation} oro de consolación``" = "``+${data.consolation} gold``"
  "this.btn('Volver al lobby', true" = "this.btn('Back to lobby', true"
  "t.textContent = 'NEXO PURIFICADO';" = "t.textContent = 'NEXUS CLEARED';"
  "``Los ${BOSSES.length} señores del Nexo han caído ante tu covenant``" = "``All ${BOSSES.length} bosses defeated``"
  "``Tesoro final: ${data.gold} oro``" = "``Total: ${data.gold} gold``"
  "this.btn('Nueva incursión', true" = "this.btn('Play again', true"
  "Cruzada de ${game.nickname}" = "${game.nickname}'s Raid"
})

Apply "src\main.ts" ([ordered]@{
  "hud.banner('¡La incursión comienza!', 'Preparaos')" = "hud.banner('RAID STARTING!', '')"
})

Apply "server\index.js" ([ordered]@{
  "``Cruzada de ${socket.data.nick}``" = "``${socket.data.nick}'s Raid``"
  "'Mensaje bloqueado por el moderador arcano'" = "'Message blocked by the arcane moderator'"
  "'Ese grupo ya no existe'" = "'Group not found'"
  "'Ese grupo está en combate'" = "'Group already in combat'"
  "'Grupo lleno (4/4)'" = "'Group is full (4/4)'"
  "'Esa clase ya está cogida'" = "'Class already taken'"
  "``Deposita ${l.bet} SOL primero``" = "``Deposit ${l.bet} SOL first``"
  "'Conecta tu wallet primero'" = "'Connect your wallet first'"
  "'El anfitrión se desconectó'" = "'Host disconnected'"
})

Apply "index.html" ([ordered]@{
  '<html lang="es">' = '<html lang="en">'
})

Write-Output "TRANSLATION DONE"
