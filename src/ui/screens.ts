import { LOBBY_NAMES, UPGRADES, upgradeCost, BOSSES, BossDef, PLAYER_KITS, CLASSES, ClassId } from '../game/balance';
import { hex } from '../game/palette';
import type { Game, SetupStep } from '../game/game';
import { net } from '../net/net';

export type ScreenName = 'title' | 'lobby' | 'loading' | 'market' | 'victory' | 'defeat' | 'runComplete' | 'setup' | 'lobbies' | 'lobbyRoom';

export interface ScreensCallbacks {
  onTitleEnter(): void;
  onJoin(): void;
  onBattleStart(): void;
  onVictoryContinue(): void;
  onMarketBuy(id: string): boolean;
  onMarketContinue(): void;
  onDefeatContinue(): void;
  onRunCompleteContinue(): void;
  playUi(sound: 'ui_click' | 'ui_hover' | 'ui_join'): void;
}

const CLASS_DESC: Record<string, string> = {
  mage: 'Ranged magic DPS. Fire, frost and the Meteor ultimate.',
  warrior: 'Tank. Holds the boss and protects the team.',
  cleric: 'Healer. Heals, revives, smites with holy light.',
  ranger: 'Agile DPS. Fast arrows, poison, deadly rain.',
};

export interface LocalStats {
  bossKills: number;
  victories: number;
  defeats: number;
  goldEarned: number;
  solEarned: number;
}

export function loadStats(): LocalStats {
  try {
    return { bossKills: 0, victories: 0, defeats: 0, goldEarned: 0, solEarned: 0, ...JSON.parse(localStorage.getItem('ac_stats') ?? '{}') };
  } catch {
    return { bossKills: 0, victories: 0, defeats: 0, goldEarned: 0, solEarned: 0 };
  }
}

export function bumpStats(patch: Partial<LocalStats>): void {
  const s = loadStats();
  for (const [k, v] of Object.entries(patch)) {
    (s as unknown as Record<string, number>)[k] += v as number;
  }
  localStorage.setItem('ac_stats', JSON.stringify(s));
}

const QUAD_POS = ['0% 0%', '100% 0%', '0% 100%', '100% 100%'];
const TIPS = [
  'Red circles are always dodgeable. Move.',
  'Reviving leaves you defenseless. Pick your moment.',
  'Frost Nova slows the boss. Use it on big casts.',
  'Save Meteor for punish windows.',
  'Vanguard holds aggro. Let him tank.',
];

export class Screens {
  private root: HTMLDivElement;
  private current: ScreenName | null = null;
  cb!: ScreensCallbacks;

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.style.position = 'absolute';
    this.root.style.inset = '0';
    this.root.style.zIndex = '40';
    this.root.style.pointerEvents = 'none';
    container.appendChild(this.root);
  }

  private img(name: string): string {
    return `${import.meta.env.BASE_URL}images/${name}`;
  }

  show(name: ScreenName | null, data?: Record<string, unknown>): void {
    this.current = name;
    this.root.innerHTML = '';
    this.root.style.pointerEvents = name ? 'auto' : 'none';
    if (!name) return;
    const screen = document.createElement('div');
    screen.className = 'screen';
    this.root.appendChild(screen);
    switch (name) {
      case 'title': this.buildTitle(screen); break;
      case 'lobby': this.buildLobby(screen); break;
      case 'loading': this.buildLoading(screen); break;
      case 'market': this.buildMarket(screen, data!.game as Game); break;
      case 'victory': this.buildVictory(screen, data as { reward: number; boss: BossDef }); break;
      case 'defeat': this.buildDefeat(screen, data as { consolation: number }); break;
      case 'runComplete': this.buildRunComplete(screen, data as { gold: number }); break;
      case 'setup': this.buildSetup(screen, data!.game as Game, (data!.step as SetupStep) ?? 'nick'); break;
      case 'lobbies': this.buildLobbies(screen, data!.game as Game); break;
      case 'lobbyRoom': this.buildLobbyRoom(screen, data!.game as Game); break;
    }
  }

  /** Re-render de la pantalla actual (cuando llega meta/lobbyUpdate). */
  refresh(game: Game): void {
    if (this.current === 'lobbies') this.show('lobbies', { game });
    else if (this.current === 'lobbyRoom') {
      if (net.lobby) this.show('lobbyRoom', { game });
      else this.show('lobbies', { game });
    }
  }

  // ============================ lobbies online ============================
  private buildLobbies(screen: HTMLElement, game: Game): void {
    screen.classList.add('transparent');
    game.setSetupStep('ready');
    const meta = net.meta;
    const wrap = document.createElement('div');
    wrap.className = 'ready-wrap';
    screen.appendChild(wrap);

    const panel = document.createElement('div');
    panel.className = 'setup-panel arc-panel setup-ready';
    panel.innerHTML = `
      <div class="setup-step">ONLINE ${net.connected ? `· ${meta?.online ?? 1} PLAYERS` : '· OFFLINE'}</div>
      <div class="screen-heading">Raid groups</div>
      <div class="ready-list lobbies-list"></div>
      <div class="lobby-create"></div>
      <div class="setup-actions"></div>`;
    wrap.appendChild(panel);

    const list = panel.querySelector('.lobbies-list')!;
    const lobbies = meta?.lobbies ?? [];
    if (!net.connected) {
      list.innerHTML = `<div class="screen-sub">Connecting…</div>`;
    } else if (lobbies.length === 0) {
      list.innerHTML = `<div class="screen-sub">No open groups — create one</div>`;
    } else {
      for (const l of lobbies) {
        const row = document.createElement('div');
        row.className = 'ready-row';
        row.innerHTML = `
          <div class="r-info">
            <div class="r-name">${l.title} <span style="color:var(--muted);font-size:11px">[${l.code}]</span></div>
            <div class="r-class">${l.mode === 'solana' ? `◎ ${l.bet} SOL` : 'FRIENDLY'} · BOSS ${'I'.repeat(l.bossIndex + 1)} · ${l.players.length}/4</div>
          </div>`;
        row.appendChild(this.btn('Join', false, () => {
          net.joinLobby(l.code, game.heroes[game.playerIndex].def.id);
        }));
        list.appendChild(row);
      }
    }

    // crear grupo
    const create = panel.querySelector('.lobby-create')!;
    const solOk = !!meta?.solana?.enabled;
    create.innerHTML = `
      <div class="create-row">
        <input class="nick-input c-title" maxlength="24" placeholder="Group name…" style="font-size:14px;padding:8px 10px" />
        <select class="c-mode nick-input" style="font-size:13px;padding:8px 6px;width:130px">
          <option value="normal">Friendly</option>
          ${solOk ? '<option value="solana">◎ Solana</option>' : ''}
        </select>
        <input class="c-bet nick-input" type="number" min="0.01" max="5" step="0.01" value="0.05" style="width:80px;font-size:13px;padding:8px 6px;display:none" />
      </div>`;
    const modeSel = create.querySelector('.c-mode') as HTMLSelectElement;
    const betInp = create.querySelector('.c-bet') as HTMLInputElement;
    modeSel.addEventListener('change', () => { betInp.style.display = modeSel.value === 'solana' ? 'block' : 'none'; });

    const actions = panel.querySelector('.setup-actions')!;
    actions.appendChild(this.btn('Create group', true, () => {
      if (!net.connected) return;
      net.createLobby({
        title: (create.querySelector('.c-title') as HTMLInputElement).value.trim() || `${game.nickname}'s Raid`,
        mode: modeSel.value as 'normal' | 'solana',
        bet: parseFloat(betInp.value) || 0.05,
        classId: game.heroes[game.playerIndex].def.id,
      });
    }));
    actions.appendChild(this.btn('Play solo (AI)', false, () => this.show('setup', { game, step: 'ready' })));
    actions.appendChild(this.btn('← Hero', false, () => this.show('setup', { game, step: 'avatar' })));

    // leaderboard global
    const lb = document.createElement('div');
    lb.className = 'setup-panel arc-panel lb-panel';
    const rows = (meta?.leaderboard ?? []).slice(0, 8).map((p, i) =>
      `<div class="lb-row"><span>${i + 1}. ${p.nick}</span><b>${p.bossKills} ☠ · ${p.solEarned.toFixed(2)} ◎</b></div>`).join('');
    lb.innerHTML = `
      <div class="screen-heading" style="font-size:17px">Leaderboard</div>
      <div class="lb-list">${rows || '<div class="lb-soon">No legends yet</div>'}</div>`;
    wrap.appendChild(lb);
  }

  private buildLobbyRoom(screen: HTMLElement, game: Game): void {
    screen.classList.add('transparent');
    game.setSetupStep('ready');
    const l = net.lobby;
    if (!l) { this.show('lobbies', { game }); return; }
    const me = l.players.find((p) => p.id === net.myId);
    const wrap = document.createElement('div');
    wrap.className = 'ready-wrap';
    screen.appendChild(wrap);

    const panel = document.createElement('div');
    panel.className = 'setup-panel arc-panel setup-ready';
    panel.innerHTML = `
      <div class="setup-step">${l.mode === 'solana' ? `◎ ${l.bet} SOL · DAMAGE SPLIT` : 'FRIENDLY RAID'} · [${l.code}]</div>
      <div class="screen-heading">${l.title}</div>
      <div class="screen-sub">Boss ${'I'.repeat(l.bossIndex + 1)}: ${BOSSES[l.bossIndex].name} — ${BOSSES[l.bossIndex].title}</div>
      <div class="ready-list"></div>
      <div class="setup-actions"></div>`;
    wrap.appendChild(panel);

    const list = panel.querySelector('.ready-list')!;
    for (const p of l.players) {
      const cls = CLASSES[p.classId as ClassId];
      const row = document.createElement('div');
      row.className = `ready-row ${p.ready ? 'rdy' : ''}`;
      row.innerHTML = `
        <div class="r-portrait" style="background-image:url(${this.img('portraits_party.jpg')});background-position:${QUAD_POS[cls?.portraitIndex ?? 0]};border-color:${hex(cls?.color ?? 0x888888)}"></div>
        <div class="r-info">
          <div class="r-name" style="color:${hex(cls?.color ?? 0xffffff)}">${p.nick}${p.id === net.myId ? ' (TÚ)' : ''}${p.id === l.hostId ? ' 👑' : ''}</div>
          <div class="r-class">${cls?.name ?? p.classId}${l.mode === 'solana' ? (p.escrowed ? ' · ◎ PAID' : ' · not paid') : ''}</div>
        </div>
        <div class="r-check">${p.ready ? '✔ READY' : '…'}</div>`;
      list.appendChild(row);
    }

    const actions = panel.querySelector('.setup-actions')!;
    const needsDeposit = l.mode === 'solana' && l.bet > 0 && me && !me.escrowed;
    if (needsDeposit) {
      actions.appendChild(this.btn(`Deposit ${l.bet} ◎`, true, () => { void this.walletDeposit(game, l.bet); }));
    } else if (me && !me.ready) {
      actions.appendChild(this.btn('READY UP', true, () => net.setReady(true)));
    } else {
      actions.appendChild(this.btn('Unready', false, () => net.setReady(false)));
    }
    actions.appendChild(this.btn('Leave', false, () => {
      net.leaveLobby();
      this.show('lobbies', { game });
    }));
  }

  /** Deposita la apuesta con Phantom hacia la house wallet. */
  private async walletDeposit(game: Game, bet: number): Promise<void> {
    const provider = (window as unknown as { solana?: { isPhantom?: boolean; connect(): Promise<{ publicKey: { toString(): string } }>; signAndSendTransaction(t: unknown): Promise<{ signature: string }> } }).solana;
    const house = net.meta?.solana?.house;
    const cluster = net.meta?.solana?.cluster ?? 'devnet';
    if (!provider) { alert('Instala Phantom para las apuestas en SOL'); return; }
    if (!house) return;
    try {
      const { publicKey } = await provider.connect();
      net.hello(game.nickname, publicKey.toString());
      const web3 = await import('@solana/web3.js');
      const conn = new web3.Connection(web3.clusterApiUrl(cluster as never), 'confirmed');
      const tx = new web3.Transaction().add(web3.SystemProgram.transfer({
        fromPubkey: new web3.PublicKey(publicKey.toString()),
        toPubkey: new web3.PublicKey(house),
        lamports: Math.floor(bet * web3.LAMPORTS_PER_SOL),
      }));
      tx.feePayer = new web3.PublicKey(publicKey.toString());
      tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
      const { signature } = await provider.signAndSendTransaction(tx);
      await conn.confirmTransaction(signature, 'confirmed');
      net.escrowDeposit(signature);
    } catch (e) {
      alert(`Depósito fallido: ${(e as Error).message}`);
    }
  }

  // ================== onboarding (cinemática 3D detrás) ==================
  private setupKeyHandler: ((e: KeyboardEvent) => void) | null = null;

  private buildSetup(screen: HTMLElement, game: Game, step: SetupStep): void {
    screen.classList.add('transparent');
    game.setSetupStep(step);
    if (this.setupKeyHandler) {
      window.removeEventListener('keydown', this.setupKeyHandler);
      this.setupKeyHandler = null;
    }
    if (step === 'nick') this.buildSetupNick(screen, game);
    else if (step === 'avatar') this.buildSetupAvatar(screen, game);
    else this.buildSetupReady(screen, game);
  }

  private buildSetupNick(screen: HTMLElement, game: Game): void {
    const panel = document.createElement('div');
    panel.className = 'setup-panel arc-panel setup-nick';
    panel.innerHTML = `
      <div class="setup-step">STEP 1 / 3</div>
      <div class="screen-heading">Enter your name</div>
      `;
    const row = document.createElement('div');
    row.className = 'nick-row';
    const inp = document.createElement('input');
    inp.className = 'nick-input';
    inp.maxLength = 16;
    inp.placeholder = 'Nickname…';
    inp.value = game.nickname;
    const play = this.btn('Play →', true, () => {
      const v = inp.value.trim();
      if (!v) { inp.focus(); return; }
      game.setNickname(v);
      this.show('setup', { game, step: 'avatar' });
    });
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') play.click();
    });
    row.appendChild(inp);
    row.appendChild(play);
    panel.appendChild(row);
    screen.appendChild(panel);
    setTimeout(() => inp.focus(), 300);
  }

  private buildSetupAvatar(screen: HTMLElement, game: Game): void {
    const panel = document.createElement('div');
    panel.className = 'setup-panel arc-panel setup-avatar';
    screen.appendChild(panel);

    const render = (): void => {
      const hero = game.heroes[game.playerIndex];
      const id = hero.def.id;
      const kit = PLAYER_KITS[id];
      const spellIcons = kit.map((s) =>
        `<div class="av-spell" title="${s.name}" style="background-image:url(${this.img(`icons_${id}.jpg`)});background-position:${QUAD_POS[s.iconIndex ?? 0]}"></div>`).join('');
      panel.innerHTML = `
        <div class="setup-step">STEP 2 / 3</div>
        <div class="screen-heading">Choose your hero</div>
        <div class="avatar-row">
          <button class="av-arrow" data-dir="-1">‹</button>
          <div class="av-card">
            <div class="av-portrait" style="background-image:url(${this.img('portraits_party.jpg')});background-position:${QUAD_POS[hero.def.portraitIndex]};border-color:${hex(hero.def.color)}"></div>
            <div class="av-name" style="color:${hex(hero.def.color)}">${hero.def.name}</div>
            <div class="av-role">${hero.def.role === 'dps' ? 'DPS' : hero.def.role === 'tank' ? 'TANK' : 'HEALER'}</div>
            <div class="av-desc">${CLASS_DESC[id]}</div>
            <div class="av-spells">${spellIcons}</div>
          </div>
          <button class="av-arrow" data-dir="1">›</button>
        </div>
        <div class="av-dots">${game.heroes.map((_, i) => `<span class="${i === game.playerIndex ? 'on' : ''}"></span>`).join('')}</div>
        <div class="setup-actions"></div>`;
      panel.querySelectorAll('.av-arrow').forEach((b) => {
        b.addEventListener('click', () => {
          this.cb.playUi('ui_click');
          game.cycleClass(parseInt((b as HTMLElement).dataset.dir!, 10));
          render();
        });
      });
      const actions = panel.querySelector('.setup-actions')!;
      actions.appendChild(this.btn('Confirm', true, () => {
        if (net.connected) {
          if (net.lobby) net.updateClass(game.heroes[game.playerIndex].def.id);
          this.show(net.lobby ? 'lobbyRoom' : 'lobbies', { game });
        } else {
          this.show('setup', { game, step: 'ready' });
        }
      }));
    };
    render();

    this.setupKeyHandler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') { game.cycleClass(-1); render(); }
      if (e.key === 'ArrowRight') { game.cycleClass(1); render(); }
      if (e.key === 'Enter') this.show('setup', { game, step: 'ready' });
    };
    window.addEventListener('keydown', this.setupKeyHandler);
  }

  private buildSetupReady(screen: HTMLElement, game: Game): void {
    const wrap = document.createElement('div');
    wrap.className = 'ready-wrap';
    screen.appendChild(wrap);

    const panel = document.createElement('div');
    panel.className = 'setup-panel arc-panel setup-ready';
    panel.innerHTML = `
      <div class="setup-step">STEP 3 / 3</div>
      <div class="screen-heading">Raid party</div>
      <div class="ready-list"></div>
      <div class="setup-actions"></div>`;
    wrap.appendChild(panel);

    const ready = [false, false, false, false];
    const list = panel.querySelector('.ready-list')!;
    const renderList = (): void => {
      list.innerHTML = game.heroes.map((h, i) => `
        <div class="ready-row ${ready[i] ? 'rdy' : ''}">
          <div class="r-portrait" style="background-image:url(${this.img('portraits_party.jpg')});background-position:${QUAD_POS[h.def.portraitIndex]};border-color:${hex(h.def.color)}"></div>
          <div class="r-info">
            <div class="r-name" style="color:${hex(h.def.color)}">${h.isPlayer ? (game.nickname || h.def.name) : h.def.name}${h.isPlayer ? ' (TÚ)' : ''}</div>
            <div class="r-class">${h.def.name} · ${h.def.role === 'dps' ? 'DPS' : h.def.role === 'tank' ? 'TANK' : 'HEALER'}</div>
          </div>
          <div class="r-check">${ready[i] ? '✔ READY' : '…'}</div>
        </div>`).join('');
    };
    renderList();

    // leaderboard local
    const stats = loadStats();
    const lb = document.createElement('div');
    lb.className = 'setup-panel arc-panel lb-panel';
    lb.innerHTML = `
      <div class="screen-heading" style="font-size:17px">Your stats</div>
      <div class="lb-grid">
        <div class="lb-stat"><b>${stats.bossKills}</b><span>Boss<br>kills</span></div>
        <div class="lb-stat"><b>${stats.victories}</b><span>Full<br>clears</span></div>
        <div class="lb-stat"><b>${stats.goldEarned}</b><span>Gold<br>earned</span></div>
        <div class="lb-stat"><b>${stats.solEarned.toFixed(2)}</b><span>SOL<br>earned</span></div>
      </div>
      <div class="lb-soon">Global ranking — play online lobbies</div>`;
    wrap.appendChild(lb);

    const actions = panel.querySelector('.setup-actions')!;
    const readyBtn = this.btn('READY UP', true, () => {
      const pIdx = game.playerIndex;
      if (ready[pIdx]) return;
      ready[pIdx] = true;
      (readyBtn as HTMLButtonElement).disabled = true;
      renderList();
      // los compañeros IA confirman en cadena
      const others = [0, 1, 2, 3].filter((i) => i !== pIdx);
      others.forEach((idx, n) => {
        setTimeout(() => {
          ready[idx] = true;
          this.cb.playUi('ui_join');
          renderList();
          if (ready.every(Boolean)) {
            setTimeout(() => this.cb.onBattleStart(), 700);
          }
        }, 700 + n * 750);
      });
    });
    actions.appendChild(readyBtn);
    actions.appendChild(this.btn('Change hero', false, () => this.show('setup', { game, step: 'avatar' })));
  }

  private btn(label: string, primary: boolean, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = `btn${primary ? ' primary' : ''}`;
    b.textContent = label;
    b.addEventListener('mouseenter', () => this.cb.playUi('ui_hover'));
    b.addEventListener('click', () => { this.cb.playUi('ui_click'); onClick(); });
    return b;
  }

  private addArt(screen: HTMLElement): void {
    const art = document.createElement('div');
    art.className = 'bg-art';
    art.style.backgroundImage = `url(${this.img('title_art.jpg')})`;
    const shade = document.createElement('div');
    shade.className = 'bg-shade';
    screen.appendChild(art);
    screen.appendChild(shade);
  }

  private buildTitle(screen: HTMLElement): void {
    this.addArt(screen);
    const logo = document.createElement('h1');
    logo.className = 'game-logo';
    logo.innerHTML = `ARCANE<br>COVENANT<small>BOSS RUSH · MMO</small>`;
    const actions = document.createElement('div');
    actions.className = 'title-actions';
    actions.appendChild(this.btn('PLAY', true, () => this.cb.onTitleEnter()));
    const hint = document.createElement('div');
    hint.className = 'title-hint';
    hint.textContent = 'WASD move · 1-4 spells · E revive · wheel zoom';
    actions.appendChild(hint);
    screen.appendChild(logo);
    screen.appendChild(actions);
  }

  private buildLobby(screen: HTMLElement): void {
    this.addArt(screen);
    const panel = document.createElement('div');
    panel.className = 'lobby-panel arc-panel';
    panel.innerHTML = `
      <div class="screen-heading">Buscar Grupo</div>
      <div class="screen-sub">Grupos reclutando para la incursión del Nexo</div>`;
    const list = document.createElement('div');
    list.className = 'lobby-list';
    const seed = Math.floor(Math.random() * 1000);
    const rows = 5;
    for (let i = 0; i < rows; i++) {
      const leader = LOBBY_NAMES[(seed + i * 3) % LOBBY_NAMES.length];
      const members = 3;
      const ping = 18 + ((seed * (i + 3)) % 46);
      const row = document.createElement('div');
      row.className = 'lobby-row';
      row.innerHTML = `
        <span class="l-name">Cruzada de ${leader}</span>
        <span class="l-meta">Nexo Arcano · ${ping} ms</span>
        <span class="l-members">${members}/4</span>`;
      const join = this.btn('Unirse', i === 0, () => this.startForming(panel, list));
      row.appendChild(join);
      list.appendChild(row);
    }
    panel.appendChild(list);
    screen.appendChild(panel);
  }

  private startForming(panel: HTMLElement, list: HTMLElement): void {
    list.remove();
    const forming = document.createElement('div');
    forming.className = 'lobby-forming';
    forming.innerHTML = `<div class="screen-sub">Formando grupo…</div>`;
    const names = ['Vanguard', 'Lumen', 'Sombra'];
    names.forEach((n, i) => {
      const s = document.createElement('span');
      s.className = 'f-name';
      s.style.animationDelay = `${0.25 + i * 0.4}s`;
      s.textContent = `⚔ ${n}`;
      forming.appendChild(s);
    });
    panel.appendChild(forming);
    setTimeout(() => this.cb.onJoin(), 1900);
  }

  private buildLoading(screen: HTMLElement): void {
    const sp = document.createElement('div');
    sp.className = 'rune-spinner';
    const tip = document.createElement('div');
    tip.className = 'loading-tip';
    tip.textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
    screen.appendChild(sp);
    screen.appendChild(tip);
  }

  private buildMarket(screen: HTMLElement, game: Game): void {
    this.addArt(screen);
    const panel = document.createElement('div');
    panel.className = 'market-panel arc-panel';
    panel.innerHTML = `
      <div class="screen-heading">Arcane Market</div>
      
      <div class="market-gold">◆ ${game.gold} gold</div>`;
    const grid = document.createElement('div');
    grid.className = 'market-grid';
    for (const u of UPGRADES) {
      const lvl = game.upgrades[u.id] ?? 0;
      const maxed = lvl >= u.maxLevel;
      const cost = upgradeCost(u, lvl);
      const card = document.createElement('div');
      card.className = 'upgrade-card';
      const pips = Array.from({ length: u.maxLevel }, (_, i) =>
        `<span class="u-pip${i < lvl ? ' on' : ''}"></span>`).join('');
      card.innerHTML = `
        <div class="u-icon" style="background-image:url(${this.img('icons_market.jpg')});background-position:${QUAD_POS[u.iconIndex]}"></div>
        <div class="u-name">${u.name}</div>
        <div class="u-desc">${u.desc}</div>
        <div class="u-pips">${pips}</div>`;
      const buy = this.btn(maxed ? 'MAX' : `${cost} gold`, false, () => {
        if (this.cb.onMarketBuy(u.id)) this.show('market', { game });
      });
      buy.disabled = maxed || game.gold < cost;
      card.appendChild(buy);
      grid.appendChild(card);
    }
    panel.appendChild(grid);
    const actions = document.createElement('div');
    actions.className = 'market-actions';
    actions.appendChild(this.btn('Next boss →', true, () => this.cb.onMarketContinue()));
    panel.appendChild(actions);
    screen.appendChild(panel);
  }

  private buildVictory(screen: HTMLElement, data: { reward: number; boss: BossDef }): void {
    const t = document.createElement('div');
    t.className = 'result-title win';
    t.textContent = 'VICTORY';
    const sub = document.createElement('div');
    sub.className = 'result-sub';
    sub.textContent = `${data.boss.name} has fallen`;
    const gold = document.createElement('div');
    gold.className = 'result-gold';
    gold.textContent = `+${data.reward} gold`;
    const actions = document.createElement('div');
    actions.className = 'result-actions';
    actions.appendChild(this.btn('To market', true, () => this.cb.onVictoryContinue()));
    screen.appendChild(t);
    screen.appendChild(sub);
    screen.appendChild(gold);
    screen.appendChild(actions);
  }

  private buildDefeat(screen: HTMLElement, data: { consolation: number }): void {
    const t = document.createElement('div');
    t.className = 'result-title lose';
    t.textContent = 'DEFEAT';
    const sub = document.createElement('div');
    sub.className = 'result-sub';
    sub.textContent = 'Your party has fallen.';
    const gold = document.createElement('div');
    gold.className = 'result-gold';
    gold.textContent = `+${data.consolation} gold`;
    const actions = document.createElement('div');
    actions.className = 'result-actions';
    actions.appendChild(this.btn('Back to lobby', true, () => this.cb.onDefeatContinue()));
    screen.appendChild(t);
    screen.appendChild(sub);
    screen.appendChild(gold);
    screen.appendChild(actions);
  }

  private buildRunComplete(screen: HTMLElement, data: { gold: number }): void {
    const t = document.createElement('div');
    t.className = 'result-title win';
    t.textContent = 'NEXUS CLEARED';
    const sub = document.createElement('div');
    sub.className = 'result-sub';
    sub.textContent = `All ${BOSSES.length} bosses defeated`;
    const gold = document.createElement('div');
    gold.className = 'result-gold';
    gold.textContent = `Total: ${data.gold} gold`;
    const actions = document.createElement('div');
    actions.className = 'result-actions';
    actions.appendChild(this.btn('Play again', true, () => this.cb.onRunCompleteContinue()));
    screen.appendChild(t);
    screen.appendChild(sub);
    screen.appendChild(gold);
    screen.appendChild(actions);
  }

  get active(): ScreenName | null { return this.current; }
}
