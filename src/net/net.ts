// Capa de red: lobbies online, chat global moderado, leaderboard y relay
// de partida host-autoritativo (snap/pinput). Patrón de football-game.
import { io, Socket } from 'socket.io-client';

export interface NetLobbyPlayer {
  id: string;
  nick: string;
  classId: string;
  ready: boolean;
  escrowed: boolean;
  wallet: string | null;
}

export interface NetLobby {
  code: string;
  title: string;
  mode: 'normal' | 'solana';
  bet: number;
  bossIndex: number;
  status: string;
  hostId: string;
  players: NetLobbyPlayer[];
}

export interface NetMeta {
  online: number;
  lobbies: NetLobby[];
  leaderboard: { nick: string; bossKills: number; victories: number; solEarned: number }[];
  solana: { enabled: boolean; cluster: string; house: string | null };
}

export interface MatchSlot { slot: number; id: string; nick: string; classId: string; }

export interface PInput {
  mx: number; my: number;            // movimiento -1..1
  ax: number; az: number;            // aim en mundo
  casts: number[];                   // slots pedidos
  rev: boolean;                      // E mantenida
}

type Cb<T> = (data: T) => void;

export class Net {
  private socket: Socket | null = null;
  connected = false;
  myId = '';
  permUpgrades = 0;
  meta: NetMeta | null = null;
  lobby: NetLobby | null = null;
  matchSlots: MatchSlot[] | null = null;
  isHost = false;

  onMeta: Cb<NetMeta> = () => {};
  onLobby: Cb<NetLobby | null> = () => {};
  onChat: Cb<{ nick: string; msg: string }> = () => {};
  onChatBlocked: Cb<{ reason: string }> = () => {};
  onChatHistory: Cb<{ nick: string; msg: string }[]> = () => {};
  onCountdown: Cb<{ seconds: number }> = () => {};
  onMatchStart: Cb<{ lobby: NetLobby; slots: MatchSlot[]; bossIndex: number; hostId: string }> = () => {};
  onSnap: Cb<unknown> = () => {};
  onPInput: Cb<{ slot: number; input: PInput }> = () => {};
  onSettled: Cb<{ type: string; payouts: { nick: string; amount: number; share: number }[]; nextBossIndex: number }> = () => {};
  onAborted: Cb<{ reason: string }> = () => {};
  onError: Cb<{ msg: string }> = () => {};

  connect(url: string, nick: string, wallet: string | null = null): void {
    if (this.socket) {
      this.socket.emit('hello', { nick, wallet });
      return;
    }
    this.socket = io(url, { transports: ['websocket'], reconnectionAttempts: 6 });
    const s = this.socket;
    s.on('connect', () => {
      this.connected = true;
      s.emit('hello', { nick, wallet });
    });
    s.on('disconnect', () => {
      this.connected = false;
      this.lobby = null;
      this.onLobby(null);
    });
    s.on('helloOk', (d: { id: string; permUpgrades: number }) => {
      this.myId = d.id;
      this.permUpgrades = d.permUpgrades ?? 0;
    });
    s.on('meta', (m: NetMeta) => { this.meta = m; this.onMeta(m); });
    s.on('lobbyUpdate', (l: NetLobby) => {
      this.lobby = l;
      this.isHost = l.hostId === this.myId;
      this.onLobby(l);
    });
    s.on('chat', (m: { nick: string; msg: string }) => this.onChat(m));
    s.on('chatBlocked', (d: { reason: string }) => this.onChatBlocked(d));
    s.on('chatHistory', (h: { nick: string; msg: string }[]) => this.onChatHistory(h));
    s.on('countdown', (d: { seconds: number }) => this.onCountdown(d));
    s.on('matchStart', (d: { lobby: NetLobby; slots: MatchSlot[]; bossIndex: number; hostId: string }) => {
      this.lobby = d.lobby;
      this.matchSlots = d.slots;
      this.isHost = d.hostId === this.myId;
      this.onMatchStart(d);
    });
    s.on('snap', (d: unknown) => this.onSnap(d));
    s.on('pinput', (d: { slot: number; input: PInput }) => this.onPInput(d));
    s.on('betSettled', (d: { type: string; payouts: { nick: string; amount: number; share: number }[]; nextBossIndex: number }) => this.onSettled(d));
    s.on('matchAborted', (d: { reason: string }) => { this.matchSlots = null; this.onAborted(d); });
    s.on('errorMsg', (d: { msg: string }) => this.onError(d));
  }

  hello(nick: string, wallet: string | null = null): void { this.socket?.emit('hello', { nick, wallet }); }
  chat(msg: string): void { this.socket?.emit('chat', { msg }); }
  createLobby(opts: { title: string; mode: 'normal' | 'solana'; bet: number; classId: string }): void { this.socket?.emit('createLobby', opts); }
  joinLobby(code: string, classId: string): void { this.socket?.emit('joinLobby', { code, classId }); }
  updateClass(classId: string): void { this.socket?.emit('updateClass', { classId }); }
  setReady(ready: boolean): void { this.socket?.emit('setReady', ready); }
  leaveLobby(): void { this.socket?.emit('leaveLobby'); this.lobby = null; this.matchSlots = null; }
  escrowDeposit(sig: string): void { this.socket?.emit('escrowDeposit', { sig }); }
  sendSnap(state: unknown): void { this.socket?.volatile.emit('snap', state); }
  sendInput(input: PInput): void { this.socket?.volatile.emit('pinput', input); }
  matchEvent(ev: { type: string; damageBySlot?: Record<number, number>; bossIndex?: number }): void { this.socket?.emit('matchEvent', ev); }

  get inMatch(): boolean { return this.matchSlots !== null; }
  get mySlot(): number { return this.matchSlots?.find((s) => s.id === this.myId)?.slot ?? -1; }
}

export const net = new Net();
