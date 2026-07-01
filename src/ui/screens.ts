import { LOBBY_NAMES, UPGRADES, upgradeCost, BOSSES, BossDef } from '../game/balance';
import type { Game } from '../game/game';

export type ScreenName = 'title' | 'lobby' | 'loading' | 'market' | 'victory' | 'defeat' | 'runComplete';

export interface ScreensCallbacks {
  onTitleEnter(): void;
  onJoin(): void;
  onVictoryContinue(): void;
  onMarketBuy(id: string): boolean;
  onMarketContinue(): void;
  onDefeatContinue(): void;
  onRunCompleteContinue(): void;
  playUi(sound: 'ui_click' | 'ui_hover'): void;
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
    }
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
