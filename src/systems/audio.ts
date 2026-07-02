// Web Audio con grupos de volumen, unlock por gesto y carga perezosa.
const FILES = [
  'fireball_cast', 'fireball_impact', 'frost_nova', 'arcane_beam', 'meteor_incoming', 'meteor_impact',
  'heal_cast', 'holy_nova', 'arrow_shot', 'poison_hit', 'shield_slam', 'warrior_taunt',
  'boss_roar', 'boss_slam', 'boss_cast_dark', 'boss_enrage', 'hero_death',
  'revive_channel', 'revive_complete', 'player_hit', 'victory_stinger', 'defeat_stinger',
  'ui_click', 'ui_hover', 'ui_buy', 'ui_join', 'ambience_arena',
  // diálogos de boss (TTS)
  'voice/golem_intro', 'voice/golem_phase', 'voice/golem_enrage', 'voice/golem_kill', 'voice/golem_death',
  'voice/lich_intro', 'voice/lich_phase', 'voice/lich_enrage', 'voice/lich_kill', 'voice/lich_death',
  'voice/demon_intro', 'voice/demon_phase', 'voice/demon_enrage', 'voice/demon_kill', 'voice/demon_death',
] as const;

export type SoundName = typeof FILES[number];

interface LoopHandle { stop(): void; }

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private master!: GainNode;
  private sfx!: GainNode;
  private ui!: GainNode;
  private amb!: GainNode;
  private unlocked = false;
  private lastPlay = new Map<string, number>();
  /** Mientras un boss habla, sus SFX de ataque/daño se silencian. */
  muteBossUntil = 0;

  /** Debe llamarse desde un gesto del usuario. */
  unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);
    this.sfx = this.ctx.createGain();
    this.sfx.gain.value = 0.9;
    this.sfx.connect(this.master);
    this.ui = this.ctx.createGain();
    this.ui.gain.value = 0.7;
    this.ui.connect(this.master);
    this.amb = this.ctx.createGain();
    this.amb.gain.value = 0.55;
    this.amb.connect(this.master);
    void this.loadAll();
  }

  private async loadAll(): Promise<void> {
    const base = `${import.meta.env.BASE_URL}audio/`;
    await Promise.all(FILES.map(async (name) => {
      try {
        const res = await fetch(`${base}${name}.mp3`);
        if (!res.ok) return;
        const buf = await res.arrayBuffer();
        const audio = await this.ctx!.decodeAudioData(buf);
        this.buffers.set(name, audio);
      } catch {
        // silencioso: el juego funciona sin audio
      }
    }));
  }

  /** Devuelve la duración del sonido en segundos (0 si no sonó). */
  play(name: SoundName, opts: { volume?: number; rate?: number; group?: 'sfx' | 'ui'; throttleMs?: number } = {}): number {
    if (!this.ctx) return 0;
    // mientras el boss habla, silenciar sus SFX propios
    if (name.startsWith('boss_') && performance.now() < this.muteBossUntil) return 0;
    const buf = this.buffers.get(name);
    if (!buf) return 0;
    const now = performance.now();
    const throttle = opts.throttleMs ?? 60;
    if (now - (this.lastPlay.get(name) ?? -1e9) < throttle) return 0;
    this.lastPlay.set(name, now);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const rate = (opts.rate ?? 1) * (name.startsWith('voice/') ? 1 : 0.96 + Math.random() * 0.08);
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = opts.volume ?? 1;
    src.connect(g);
    g.connect(opts.group === 'ui' ? this.ui : this.sfx);
    src.start();
    return buf.duration / rate;
  }

  /** Duración de un buffer cargado (0 si aún no está). */
  duration(name: SoundName): number {
    return this.buffers.get(name)?.duration ?? 0;
  }

  loop(name: SoundName, opts: { volume?: number; group?: 'sfx' | 'amb'; fadeIn?: number } = {}): LoopHandle {
    if (!this.ctx) return { stop: () => {} };
    const buf = this.buffers.get(name);
    if (!buf) {
      // reintento perezoso cuando el buffer aún no cargó
      let stopped = false;
      let inner: LoopHandle | null = null;
      const tryStart = () => {
        if (stopped) return;
        if (this.buffers.has(name)) inner = this.loop(name, opts);
        else setTimeout(tryStart, 500);
      };
      tryStart();
      return { stop: () => { stopped = true; inner?.stop(); } };
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = this.ctx.createGain();
    const vol = opts.volume ?? 1;
    if (opts.fadeIn) {
      g.gain.value = 0;
      g.gain.linearRampToValueAtTime(vol, this.ctx.currentTime + opts.fadeIn);
    } else {
      g.gain.value = vol;
    }
    src.connect(g);
    g.connect(opts.group === 'amb' ? this.amb : this.sfx);
    src.start();
    const ctx = this.ctx;
    return {
      stop: () => {
        try {
          g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.25);
          setTimeout(() => src.stop(), 300);
        } catch { /* ya parado */ }
      },
    };
  }
}
