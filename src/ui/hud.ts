import * as THREE from 'three';
import type { Hero, Boss } from '../entities/units';
import type { Game } from '../game/game';
import { BossDef, PLAYER_SPELLS, REVIVE_RANGE, BOSSES } from '../game/balance';
import { hex } from '../game/palette';
import { Input } from '../core/input';
import { IS_MOBILE } from '../core/engine';

type Projector = (world: THREE.Vector3) => { x: number; y: number; visible: boolean };

const QUAD_POS = ['0% 0%', '100% 0%', '0% 100%', '100% 100%'];
const ROLE_LABEL: Record<string, string> = { dps: 'DPS', tank: 'TANQUE', healer: 'SANADOR' };

interface CText { el: HTMLDivElement; t: number; dur: number; x: number; y: number; vy: number; active: boolean; }

export class Hud {
  private root: HTMLDivElement;
  private party!: HTMLDivElement;
  private frames: { el: HTMLDivElement; hp: HTMLDivElement; mp: HTMLDivElement; rev: HTMLDivElement }[] = [];
  private bossbar!: HTMLDivElement;
  private bossHp!: HTMLDivElement;
  private bossHpText!: HTMLDivElement;
  private bossCastFill!: HTMLDivElement;
  private bossName!: HTMLDivElement;
  private bossSub!: HTMLDivElement;
  private bossPortrait!: HTMLDivElement;
  private slots: HTMLDivElement[] = [];
  private slotCds: HTMLDivElement[] = [];
  private castbar!: HTMLDivElement;
  private castLabel!: HTMLDivElement;
  private castFill!: HTMLDivElement;
  private runGold!: HTMLSpanElement;
  private runRound!: HTMLSpanElement;
  private runchip!: HTMLDivElement;
  private bannerEl!: HTMLDivElement;
  private bannerTitle!: HTMLDivElement;
  private bannerSub!: HTMLDivElement;
  private bannerT = 0;
  private promptEl!: HTMLDivElement;
  private flashEl!: HTMLDivElement;
  private flashT = 0;
  private ctexts: CText[] = [];
  private projector: Projector = () => ({ x: 0, y: 0, visible: false });
  private bossCastStart = -1;
  private bossCastEnd = -1;
  private heroes: Hero[] = [];

  constructor(container: HTMLElement, private input: Input) {
    this.root = document.createElement('div');
    this.root.id = 'hud';
    this.root.classList.add('hidden');
    if (IS_MOBILE) document.body.classList.add('mobile');
    container.appendChild(this.root);
    this.build();
  }

  setProjector(fn: Projector): void { this.projector = fn; }

  private build(): void {
    const img = (name: string): string => `${import.meta.env.BASE_URL}images/${name}`;
    // party
    this.party = document.createElement('div');
    this.party.className = 'party';
    this.root.appendChild(this.party);

    // boss bar
    this.bossbar = document.createElement('div');
    this.bossbar.className = 'bossbar arc-panel';
    this.bossbar.innerHTML = `
      <div class="b-head">
        <div class="b-portrait"></div>
        <div class="b-titles">
          <div class="b-name"></div>
          <div class="b-sub"></div>
        </div>
      </div>
      <div class="b-hpwrap">
        <div class="b-hp"></div>
        <div class="b-hptext"></div>
      </div>
      <div class="b-cast"><div class="fill"></div></div>`;
    this.root.appendChild(this.bossbar);
    this.bossHp = this.bossbar.querySelector('.b-hp')!;
    this.bossHpText = this.bossbar.querySelector('.b-hptext')!;
    this.bossCastFill = this.bossbar.querySelector('.b-cast .fill')!;
    this.bossName = this.bossbar.querySelector('.b-name')!;
    this.bossSub = this.bossbar.querySelector('.b-sub')!;
    this.bossPortrait = this.bossbar.querySelector('.b-portrait')!;

    // hotbar
    const hotbar = document.createElement('div');
    hotbar.className = 'hotbar clickable';
    PLAYER_SPELLS.forEach((spell, i) => {
      const slot = document.createElement('div');
      slot.className = `slot${i === 3 ? ' ult' : ''}`;
      slot.style.backgroundImage = `url(${img('icons_mage.jpg')})`;
      slot.style.backgroundSize = '200% 200%';
      slot.style.backgroundPosition = QUAD_POS[spell.iconIndex ?? i];
      slot.innerHTML = `<span class="s-key">${i + 1}</span><span class="s-cost">${spell.manaCost}</span><div class="s-cd" style="--cd:0"></div>`;
      slot.title = spell.name;
      slot.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.input.queueSlot(i);
      });
      hotbar.appendChild(slot);
      this.slots.push(slot);
      this.slotCds.push(slot.querySelector('.s-cd')!);
    });
    this.root.appendChild(hotbar);

    // cast bar
    this.castbar = document.createElement('div');
    this.castbar.className = 'castbar arc-panel';
    this.castbar.innerHTML = `<div class="c-label"></div><div class="c-track"><div class="c-fill"></div></div>`;
    this.root.appendChild(this.castbar);
    this.castLabel = this.castbar.querySelector('.c-label')!;
    this.castFill = this.castbar.querySelector('.c-fill')!;

    // run chip
    this.runchip = document.createElement('div');
    this.runchip.className = 'runchip arc-panel';
    this.runchip.innerHTML = `<span class="r-gold">0</span><span class="r-round">BOSS I</span>`;
    this.root.appendChild(this.runchip);
    this.runGold = this.runchip.querySelector('.r-gold')!;
    this.runRound = this.runchip.querySelector('.r-round')!;

    // banner
    this.bannerEl = document.createElement('div');
    this.bannerEl.className = 'banner';
    this.bannerEl.innerHTML = `<div class="bn-title"></div><div class="bn-sub"></div>`;
    this.root.appendChild(this.bannerEl);
    this.bannerTitle = this.bannerEl.querySelector('.bn-title')!;
    this.bannerSub = this.bannerEl.querySelector('.bn-sub')!;

    // prompt E
    this.promptEl = document.createElement('div');
    this.promptEl.className = 'prompt arc-panel clickable';
    this.root.appendChild(this.promptEl);
    // móvil: mantener pulsado el prompt = mantener E
    this.promptEl.addEventListener('pointerdown', () => { this.input.reviveHeld = true; });
    window.addEventListener('pointerup', () => { if (IS_MOBILE) this.input.reviveHeld = false; });

    // flash de daño
    this.flashEl = document.createElement('div');
    this.flashEl.className = 'dmg-flash';
    this.root.appendChild(this.flashEl);

    // combat text pool
    for (let i = 0; i < 26; i++) {
      const el = document.createElement('div');
      el.className = 'ctext';
      el.style.display = 'none';
      this.root.appendChild(el);
      this.ctexts.push({ el, t: 0, dur: 1, x: 0, y: 0, vy: 0, active: false });
    }

    // joystick móvil
    if (IS_MOBILE) this.buildJoystick();
  }

  private buildJoystick(): void {
    const joy = document.createElement('div');
    joy.className = 'joy';
    const base = document.createElement('div');
    base.className = 'joy-base';
    const nub = document.createElement('div');
    nub.className = 'joy-nub';
    joy.appendChild(base);
    joy.appendChild(nub);
    this.root.appendChild(joy);
    let originX = 0, originY = 0, activeId = -1;
    const max = 52;
    joy.addEventListener('pointerdown', (e) => {
      activeId = e.pointerId;
      originX = e.clientX; originY = e.clientY;
      base.style.display = nub.style.display = 'block';
      base.style.left = nub.style.left = `${originX}px`;
      base.style.top = nub.style.top = `${originY}px`;
      this.input.touchActive = true;
      joy.setPointerCapture(e.pointerId);
    });
    joy.addEventListener('pointermove', (e) => {
      if (e.pointerId !== activeId) return;
      let dx = e.clientX - originX, dy = e.clientY - originY;
      const len = Math.hypot(dx, dy);
      if (len > max) { dx *= max / len; dy *= max / len; }
      nub.style.left = `${originX + dx}px`;
      nub.style.top = `${originY + dy}px`;
      this.input.touchMove.set(dx / max, dy / max);
    });
    const end = (e: PointerEvent): void => {
      if (e.pointerId !== activeId) return;
      activeId = -1;
      base.style.display = nub.style.display = 'none';
      this.input.touchMove.set(0, 0);
      this.input.touchActive = false;
    };
    joy.addEventListener('pointerup', end);
    joy.addEventListener('pointercancel', end);
  }

  setVisible(v: boolean): void {
    this.root.classList.toggle('hidden', !v);
  }

  setupMatch(heroes: Hero[], bossDef: BossDef, bossIndex: number, gold: number): void {
    this.heroes = heroes;
    const img = (name: string): string => `${import.meta.env.BASE_URL}images/${name}`;
    // party frames
    this.party.innerHTML = '';
    this.frames = [];
    heroes.forEach((h) => {
      const el = document.createElement('div');
      el.className = 'pframe arc-panel';
      el.style.setProperty('--pc', hex(h.def.color));
      el.innerHTML = `
        <div class="p-portrait" style="background-image:url(${img('portraits_party.jpg')});background-position:${QUAD_POS[h.def.portraitIndex]}"></div>
        <div class="p-body">
          <div class="p-name"><span>${h.def.name}${h.isPlayer ? ' (TÚ)' : ''}</span><span class="p-role">${ROLE_LABEL[h.def.role]}</span></div>
          <div class="bar hp"><div class="fill"></div></div>
          <div class="bar mp"><div class="fill"></div></div>
        </div>
        <div class="p-revive"><div class="fill"></div></div>
        <span class="p-skull" style="display:none">☠</span>`;
      this.party.appendChild(el);
      this.frames.push({
        el,
        hp: el.querySelector('.bar.hp .fill')!,
        mp: el.querySelector('.bar.mp .fill')!,
        rev: el.querySelector('.p-revive .fill')!,
      });
    });

    // boss bar
    this.bossbar.classList.add('on');
    this.bossName.textContent = bossDef.name;
    this.bossSub.textContent = bossDef.title.toUpperCase();
    this.bossPortrait.style.backgroundImage = `url(${img(bossDef.portrait + '.jpg')})`;
    // ticks de fase
    this.bossbar.querySelectorAll('.b-tick').forEach((t) => t.remove());
    const wrap = this.bossbar.querySelector('.b-hpwrap')!;
    for (const th of bossDef.phases) {
      const tick = document.createElement('div');
      tick.className = 'b-tick';
      tick.style.left = `${th * 100}%`;
      wrap.appendChild(tick);
    }
    this.bossCastStart = -1;
    this.runGold.textContent = String(gold);
    this.runRound.textContent = `BOSS ${'I'.repeat(bossIndex + 1)} / ${'I'.repeat(BOSSES.length)}`;
  }

  updateCombat(game: Game, _dt: number): void {
    const now = game.now;
    // party
    this.heroes.forEach((h, i) => {
      const f = this.frames[i];
      if (!f) return;
      f.hp.style.setProperty('--v', String(Math.max(0, h.hp / h.maxHp)));
      f.mp.style.setProperty('--v', String(Math.max(0, h.mana / h.maxMana)));
      f.el.classList.toggle('dead', !h.alive);
      (f.el.querySelector('.p-skull') as HTMLElement).style.display = h.alive ? 'none' : 'block';
      // progreso de revive sobre el frame del muerto
      let rev = 0;
      if (!h.alive) {
        const reviver = this.heroes.find((o) => o.alive && o.reviveTargetId === h.id);
        if (reviver) rev = reviver.reviveProgress;
      }
      f.rev.style.setProperty('--v', String(rev));
    });

    // hotbar
    const p = game.player;
    PLAYER_SPELLS.forEach((spell, i) => {
      const total = spell.cooldown * game.cooldownMult;
      const left = p.cooldownLeft(spell, now);
      const frac = total > 0 ? Math.min(1, left / total) : 0;
      this.slotCds[i].style.setProperty('--cd', String(frac));
      this.slotCds[i].textContent = left > 0.2 ? String(Math.ceil(left)) : '';
      this.slots[i].classList.toggle('nomana', p.mana < spell.manaCost && left <= 0);
      this.slots[i].classList.toggle('casting', p.castingSpell?.id === spell.id);
    });

    // cast bar / revive channel
    if (p.castingSpell && p.castTotal > 0) {
      this.castbar.classList.add('on');
      this.castbar.classList.remove('revive');
      this.castLabel.textContent = p.castingSpell.name;
      this.castFill.style.setProperty('--v', String(Math.min(1, p.castT / p.castTotal)));
    } else if (p.reviveTargetId) {
      const corpse = this.heroes.find((h) => h.id === p.reviveTargetId);
      this.castbar.classList.add('on', 'revive');
      this.castLabel.textContent = `Reviviendo a ${corpse?.def.name ?? ''}…`;
      this.castFill.style.setProperty('--v', String(Math.min(1, p.reviveProgress)));
    } else {
      this.castbar.classList.remove('on');
    }

    // boss
    const boss: Boss | null = game.boss;
    if (boss) {
      this.bossHp.style.transform = `scaleX(${Math.max(0, boss.hpFrac())})`;
      this.bossHp.classList.toggle('enraged', boss.enraged);
      this.bossHpText.textContent = `${Math.ceil(boss.hp).toLocaleString()} — ${Math.round(boss.hpFrac() * 100)}%`;
      if (boss.busyUntil > now) {
        if (this.bossCastStart < 0) {
          this.bossCastStart = now;
          this.bossCastEnd = boss.busyUntil;
        }
        const prog = (now - this.bossCastStart) / Math.max(0.001, this.bossCastEnd - this.bossCastStart);
        this.bossCastFill.style.setProperty('--v', String(Math.min(1, prog)));
      } else {
        this.bossCastStart = -1;
        this.bossCastFill.style.setProperty('--v', '0');
      }
    }

    // prompt de revive
    if (p.alive && !p.reviveTargetId) {
      const corpse = this.heroes.find((h) => !h.alive
        && Math.hypot(h.pos.x - p.pos.x, h.pos.z - p.pos.z) < REVIVE_RANGE);
      if (corpse) {
        this.promptEl.innerHTML = `<b>E</b> Revivir a ${corpse.def.name}`;
        this.promptEl.classList.add('on');
      } else {
        this.promptEl.classList.remove('on');
      }
    } else {
      this.promptEl.classList.remove('on');
    }

    this.runGold.textContent = String(game.gold);
  }

  banner(title: string, sub: string): void {
    this.bannerTitle.textContent = title;
    this.bannerSub.textContent = sub;
    this.bannerEl.classList.add('on');
    this.bannerT = 2.6;
  }

  prompt(text: string | null): void {
    if (!text) this.promptEl.classList.remove('on');
    else {
      this.promptEl.textContent = text;
      this.promptEl.classList.add('on');
    }
  }

  combatText(world: THREE.Vector3, text: string, color: string, big: boolean): void {
    const s = this.projector(world);
    if (!s.visible) return;
    const c = this.ctexts.find((x) => !x.active) ?? this.ctexts[0];
    c.active = true;
    c.t = 0;
    c.dur = big ? 1.3 : 0.9;
    c.x = Math.min(window.innerWidth - 80, Math.max(40, s.x + (Math.random() - 0.5) * 30));
    c.y = Math.min(window.innerHeight - 160, Math.max(150, s.y - 10));
    c.vy = big ? 70 : 55;
    c.el.textContent = text;
    c.el.style.color = color;
    c.el.classList.toggle('big', big);
    c.el.style.display = 'block';
  }

  damageFlash(): void { this.flashT = 0.25; }

  tick(dt: number): void {
    // banner
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.bannerEl.classList.remove('on');
    }
    // flash
    if (this.flashT > 0) {
      this.flashT -= dt;
      this.flashEl.style.opacity = String(Math.max(0, this.flashT / 0.25) * 0.9);
    } else {
      this.flashEl.style.opacity = '0';
    }
    // combat text
    for (const c of this.ctexts) {
      if (!c.active) continue;
      c.t += dt;
      if (c.t >= c.dur) {
        c.active = false;
        c.el.style.display = 'none';
        continue;
      }
      const k = c.t / c.dur;
      const y = c.y - c.vy * c.t;
      c.el.style.transform = `translate(${c.x}px, ${y}px) scale(${1 + (c.el.classList.contains('big') ? (1 - k) * 0.3 : 0)})`;
      c.el.style.opacity = String(k < 0.7 ? 1 : (1 - k) / 0.3);
    }
  }
}
