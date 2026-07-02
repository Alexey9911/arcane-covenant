import { LOBBY_NAMES, UPGRADES, upgradeCost, BOSSES, BossDef, PLAYER_KITS, CLASSES } from '../game/balance';
import { hex } from '../game/palette';
import type { Game, SetupStep } from '../game/game';

export type ScreenName = 'title' | 'lobby' | 'loading' | 'market' | 'victory' | 'defeat' | 'runComplete' | 'setup';

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
  mage: 'Daño mágico a distancia. Fuego, escarcha y el Meteoro definitivo.',
  warrior: 'Tanque. Aguanta al boss, provoca y protege a tu equipo.',
  cleric: 'Sanadora. Cura, revive y castiga con luz sagrada.',
  ranger: 'Daño físico ágil. Flechas rápidas, veneno y lluvia mortal.',
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
  'Los círculos rojos siempre se pueden esquivar. Muévete.',
  'Revivir te deja indefenso: elige el momento.',
  'La Nova de Escarcha ralentiza al boss. Úsala cuando cargue.',
  'Guarda el Meteoro para las ventanas de castigo.',
  'Vanguard mantiene la atención del boss. No se la robes.',
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
      <div class="setup-step">PASO 1 / 3</div>
      <div class="screen-heading">Tu nombre de leyenda</div>
      <div class="screen-sub">Así te verán tus compañeros en el Nexo</div>`;
    const row = document.createElement('div');
    row.className = 'nick-row';
    const inp = document.createElement('input');
    inp.className = 'nick-input';
    inp.maxLength = 16;
    inp.placeholder = 'Tu nickname…';
    inp.value = game.nickname;
    const play = this.btn('Jugar →', true, () => {
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
        <div class="setup-step">PASO 2 / 3</div>
        <div class="screen-heading">Elige tu héroe</div>
        <div class="avatar-row">
          <button class="av-arrow" data-dir="-1">‹</button>
          <div class="av-card">
            <div class="av-portrait" style="background-image:url(${this.img('portraits_party.jpg')});background-position:${QUAD_POS[hero.def.portraitIndex]};border-color:${hex(hero.def.color)}"></div>
            <div class="av-name" style="color:${hex(hero.def.color)}">${hero.def.name}</div>
            <div class="av-role">${hero.def.role === 'dps' ? 'DPS' : hero.def.role === 'tank' ? 'TANQUE' : 'SANADORA'}</div>
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
      actions.appendChild(this.btn('Confirmar héroe', true, () => {
        this.show('setup', { game, step: 'ready' });
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
      <div class="setup-step">PASO 3 / 3</div>
      <div class="screen-heading">Grupo del Nexo</div>
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
            <div class="r-class">${h.def.name} · ${h.def.role === 'dps' ? 'DPS' : h.def.role === 'tank' ? 'TANQUE' : 'SANADORA'}</div>
          </div>
          <div class="r-check">${ready[i] ? '✔ LISTO' : '…'}</div>
        </div>`).join('');
    };
    renderList();

    // leaderboard local
    const stats = loadStats();
    const lb = document.createElement('div');
    lb.className = 'setup-panel arc-panel lb-panel';
    lb.innerHTML = `
      <div class="screen-heading" style="font-size:17px">Tu historial</div>
      <div class="lb-grid">
        <div class="lb-stat"><b>${stats.bossKills}</b><span>Bosses<br>matados</span></div>
        <div class="lb-stat"><b>${stats.victories}</b><span>Nexos<br>purificados</span></div>
        <div class="lb-stat"><b>${stats.goldEarned}</b><span>Oro<br>ganado</span></div>
        <div class="lb-stat"><b>${stats.solEarned.toFixed(2)}</b><span>SOL<br>ganado</span></div>
      </div>
      <div class="lb-soon">Ranking global — próximamente con lobbies online</div>`;
    wrap.appendChild(lb);

    const actions = panel.querySelector('.setup-actions')!;
    const readyBtn = this.btn('¡Listo para luchar!', true, () => {
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
    actions.appendChild(this.btn('Cambiar héroe', false, () => this.show('setup', { game, step: 'avatar' })));
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
    actions.appendChild(this.btn('Entrar al Nexo', true, () => this.cb.onTitleEnter()));
    const hint = document.createElement('div');
    hint.className = 'title-hint';
    hint.textContent = 'WASD moverse · 1-4 hechizos · E revivir · rueda zoom';
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
      <div class="screen-heading">Mercado Arcano</div>
      <div class="screen-sub">Invierte tu oro antes del siguiente boss</div>
      <div class="market-gold">◆ ${game.gold} oro</div>`;
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
      const buy = this.btn(maxed ? 'Máximo' : `${cost} oro`, false, () => {
        if (this.cb.onMarketBuy(u.id)) this.show('market', { game });
      });
      buy.disabled = maxed || game.gold < cost;
      card.appendChild(buy);
      grid.appendChild(card);
    }
    panel.appendChild(grid);
    const actions = document.createElement('div');
    actions.className = 'market-actions';
    actions.appendChild(this.btn('Al siguiente boss →', true, () => this.cb.onMarketContinue()));
    panel.appendChild(actions);
    screen.appendChild(panel);
  }

  private buildVictory(screen: HTMLElement, data: { reward: number; boss: BossDef }): void {
    const t = document.createElement('div');
    t.className = 'result-title win';
    t.textContent = 'VICTORIA';
    const sub = document.createElement('div');
    sub.className = 'result-sub';
    sub.textContent = `${data.boss.name} ${data.boss.title} ha caído`;
    const gold = document.createElement('div');
    gold.className = 'result-gold';
    gold.textContent = `+${data.reward} oro`;
    const actions = document.createElement('div');
    actions.className = 'result-actions';
    actions.appendChild(this.btn('Ir al mercado', true, () => this.cb.onVictoryContinue()));
    screen.appendChild(t);
    screen.appendChild(sub);
    screen.appendChild(gold);
    screen.appendChild(actions);
  }

  private buildDefeat(screen: HTMLElement, data: { consolation: number }): void {
    const t = document.createElement('div');
    t.className = 'result-title lose';
    t.textContent = 'DERROTA';
    const sub = document.createElement('div');
    sub.className = 'result-sub';
    sub.textContent = 'La party ha caído. El Nexo os reclama.';
    const gold = document.createElement('div');
    gold.className = 'result-gold';
    gold.textContent = `+${data.consolation} oro de consolación`;
    const actions = document.createElement('div');
    actions.className = 'result-actions';
    actions.appendChild(this.btn('Volver al lobby', true, () => this.cb.onDefeatContinue()));
    screen.appendChild(t);
    screen.appendChild(sub);
    screen.appendChild(gold);
    screen.appendChild(actions);
  }

  private buildRunComplete(screen: HTMLElement, data: { gold: number }): void {
    const t = document.createElement('div');
    t.className = 'result-title win';
    t.textContent = 'NEXO PURIFICADO';
    const sub = document.createElement('div');
    sub.className = 'result-sub';
    sub.textContent = `Los ${BOSSES.length} señores del Nexo han caído ante tu covenant`;
    const gold = document.createElement('div');
    gold.className = 'result-gold';
    gold.textContent = `Tesoro final: ${data.gold} oro`;
    const actions = document.createElement('div');
    actions.className = 'result-actions';
    actions.appendChild(this.btn('Nueva incursión', true, () => this.cb.onRunCompleteContinue()));
    screen.appendChild(t);
    screen.appendChild(sub);
    screen.appendChild(gold);
    screen.appendChild(actions);
  }

  get active(): ScreenName | null { return this.current; }
}
