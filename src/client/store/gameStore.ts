import { create } from 'zustand';
import type { Socket } from 'socket.io-client';
import { applyAction, createGame } from '../../shared/game/engine';
import { chooseHeuristicAction } from '../../shared/game/bot';
import { getViewForSeat } from '../../shared/game/view';
import type {
  AiSeatConfig,
  CreateGameConfig,
  GameState,
  GameView,
  Persona,
  SeatConfig,
  SeatId,
} from '../../shared/game/types';
import { RULES_DIGEST } from '../../shared/data/content';
import {
  clientApi,
  type ClientSession,
  type ProviderDiagnostic,
  type PublicRoom,
  type RoomSnapshot,
  type SaveSummary,
  type ServerChatMessage,
} from '../api/clientApi';

export type ScreenMode = 'menu' | 'solo' | 'online' | 'table' | 'tutorial' | 'saves' | 'settings' | 'credits' | 'outcome';

export interface SoloSetup {
  playerName: string;
  playerCount: 4 | 5 | 6;
  seed: number;
  difficulty: AiSeatConfig['difficulty'];
  persona: Persona;
}

interface GameStore {
  mode: ScreenMode;
  setup: SoloSetup;
  localState: GameState | null;
  view: GameView | null;
  room: PublicRoom | null;
  humanSeatId: SeatId;
  session: ClientSession | null;
  socket: Socket | null;
  providers: ProviderDiagnostic[];
  serverSaves: SaveSummary[];
  localSaves: LocalSaveSummary[];
  chat: ServerChatMessage[];
  selectedCardId: string | null;
  activePanel: 'log' | 'chat';
  status: string;
  error: string | null;
  muted: boolean;
  volume: number;
  reducedMotion: boolean;
  setMode: (mode: ScreenMode) => void;
  updateSetup: (patch: Partial<SoloSetup>) => void;
  startSolo: () => void;
  continueRecentSolo: () => boolean;
  createOnline: () => Promise<void>;
  joinOnline: (code: string, name: string) => Promise<void>;
  reconnectOnline: () => Promise<boolean>;
  setReady: (ready: boolean) => Promise<void>;
  startOnline: () => Promise<void>;
  addBot: (ai: AiSeatConfig) => Promise<void>;
  removeBot: (seatId: SeatId) => Promise<void>;
  transferHost: (seatId: SeatId) => Promise<void>;
  takeOverDisconnected: (seatId: SeatId) => Promise<void>;
  submitAction: (actionId: string) => Promise<void>;
  sendChat: (message: string) => void;
  refreshDiagnostics: () => Promise<void>;
  refreshSaves: () => Promise<void>;
  saveLocalNamed: (name: string) => void;
  loadLocalSave: (id: string) => boolean;
  deleteLocalSave: (id: string) => void;
  exportLocalSave: (id: string) => string | null;
  importLocalSave: (text: string, overwrite?: boolean) => void;
  selectCard: (cardId: string | null) => void;
  setActivePanel: (panel: 'log' | 'chat') => void;
  setAudio: (patch: { muted?: boolean; volume?: number; reducedMotion?: boolean }) => void;
  clearError: () => void;
}

type StoreSet = (partial: Partial<GameStore> | ((state: GameStore) => Partial<GameStore>)) => void;

const HUMAN_SEAT = 'seat-1';

const DEFAULT_SETUP: SoloSetup = {
  playerName: '观局者',
  playerCount: 4,
  seed: 20260730,
  difficulty: 'normal',
  persona: 'steady',
};

const RECENT_SOLO_KEY = 'dengxiantai.recentSolo';
const LOCAL_SAVES_KEY = 'dengxiantai.localSaves';
const ONLINE_SESSION_KEY = 'dengxiantai.onlineSession';

export interface LocalSaveSummary {
  id: string;
  name: string;
  updatedAt: string;
  round: number;
  phaseLabel: string;
}

interface LocalSaveEnvelope extends LocalSaveSummary {
  schemaVersion: 1;
  state: GameState;
  humanSeatId: SeatId;
}

function getStorage(kind: 'local' | 'session'): Storage | null {
  if (typeof window === 'undefined') return null;
  return kind === 'local' ? window.localStorage : window.sessionStorage;
}

function botConfig(index: number, setup: SoloSetup): SeatConfig {
  const personas: Persona[] = ['steady', 'guardian', 'bold', 'suspicious', 'selfish'];
  return {
    id: `seat-${index + 1}`,
    name: ['玄霄', '扶摇', '照夜', '青璃', '问石'][index - 1] ?? `道友${index}`,
    kind: 'bot',
    ai: {
      provider: 'local-bot',
      difficulty: setup.difficulty,
      persona: personas[(index + personas.indexOf(setup.persona)) % personas.length] ?? 'steady',
    },
  };
}

function buildSoloConfig(setup: SoloSetup): CreateGameConfig {
  return {
    mode: 'solo',
    seed: setup.seed,
    faithfulRules: true,
    seats: [
      { id: HUMAN_SEAT, name: setup.playerName.trim() || DEFAULT_SETUP.playerName, kind: 'human' },
      ...Array.from({ length: setup.playerCount - 1 }, (_, index) => botConfig(index + 1, setup)),
    ],
  };
}

function saveRecentSolo(state: GameState, humanSeatId: SeatId): void {
  getStorage('local')?.setItem(RECENT_SOLO_KEY, JSON.stringify({ schemaVersion: 1, state, humanSeatId }));
}

function readRecentSolo(): { state: GameState; humanSeatId: SeatId } | null {
  const raw = getStorage('local')?.getItem(RECENT_SOLO_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { schemaVersion?: number; state?: GameState; humanSeatId?: SeatId };
    if (parsed.schemaVersion !== 1 || !parsed.state || !parsed.humanSeatId) return null;
    return { state: parsed.state, humanSeatId: parsed.humanSeatId };
  } catch {
    return null;
  }
}

function readLocalSaves(): LocalSaveEnvelope[] {
  const raw = getStorage('local')?.getItem(LOCAL_SAVES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as LocalSaveEnvelope[];
    return Array.isArray(parsed) ? parsed.filter((save) => save.schemaVersion === 1 && Boolean(save.state)) : [];
  } catch {
    return [];
  }
}

function writeLocalSaves(saves: LocalSaveEnvelope[]): void {
  getStorage('local')?.setItem(LOCAL_SAVES_KEY, JSON.stringify(saves));
}

function summarizeLocalSaves(): LocalSaveSummary[] {
  return readLocalSaves().map(({ id, name, updatedAt, round, phaseLabel }) => ({ id, name, updatedAt, round, phaseLabel }));
}

function persistOnlineSession(session: ClientSession): void {
  getStorage('session')?.setItem(ONLINE_SESSION_KEY, JSON.stringify({
    roomId: session.roomId,
    code: session.code,
    seatId: session.seatId,
    seatToken: session.seatToken,
  }));
}

function readOnlineSession(): ClientSession | null {
  const raw = getStorage('session')?.getItem(ONLINE_SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Pick<ClientSession, 'roomId' | 'code' | 'seatId' | 'seatToken'>;
    if (!parsed.roomId || !parsed.seatId || !parsed.seatToken) return null;
    return {
      ...parsed,
      code: parsed.code || '',
      snapshot: {
        room: {
          schemaVersion: 1,
          id: parsed.roomId,
          code: parsed.code || '',
          status: 'lobby',
          hostSeatId: parsed.seatId,
          seed: 0,
          maxSeats: 4,
          seats: [],
          chat: [],
        },
        view: null,
        stateHash: null,
      },
    };
  } catch {
    return null;
  }
}

function advanceBots(state: GameState, humanSeatId: SeatId): GameState {
  let next = state;
  let guard = 0;
  while (!next.outcome && guard < 80) {
    const humanView = getViewForSeat(next, humanSeatId);
    if (humanView.legalActions.length > 0) return next;
    const actor = next.players.find((player) => getViewForSeat(next, player.id).legalActions.length > 0);
    if (!actor) return next;
    const actorView = getViewForSeat(next, actor.id);
    const decision = actor.kind === 'bot'
      ? chooseHeuristicAction(next, actorView, actor.id)
      : { action: actorView.legalActions[0]!, publicRationale: '自动处理等待动作。' };
    next = applyAction(next, decision.action);
    guard += 1;
  }
  return next;
}

export const useGameStore = create<GameStore>((set, get) => ({
  mode: 'menu',
  setup: DEFAULT_SETUP,
  localState: null,
  view: null,
  room: null,
  humanSeatId: HUMAN_SEAT,
  session: null,
  socket: null,
  providers: [],
  serverSaves: [],
  localSaves: summarizeLocalSaves(),
  chat: [],
  selectedCardId: null,
  activePanel: 'log',
  status: RULES_DIGEST,
  error: null,
  muted: false,
  volume: 0.35,
  reducedMotion: false,

  setMode: (mode) => set({ mode, error: null }),
  updateSetup: (patch) => set((state) => ({ setup: { ...state.setup, ...patch } })),

  startSolo: () => {
    const initial = createGame(buildSoloConfig(get().setup));
    const advanced = advanceBots(initial, HUMAN_SEAT);
    saveRecentSolo(advanced, HUMAN_SEAT);
    set({
      localState: advanced,
      view: getViewForSeat(advanced, HUMAN_SEAT),
      room: null,
      session: null,
      socket: null,
      mode: 'table',
      selectedCardId: null,
      status: '离线本地规则引擎已启动，所有 Bot 使用启发式决策。',
      error: null,
    });
  },

  continueRecentSolo: () => {
    const recent = readRecentSolo();
    if (!recent) return false;
    const advanced = advanceBots(recent.state, recent.humanSeatId);
    set({
      localState: advanced,
      view: getViewForSeat(advanced, recent.humanSeatId),
      room: null,
      session: null,
      humanSeatId: recent.humanSeatId,
      mode: advanced.outcome ? 'outcome' : 'table',
      status: '已继续最近的本地单人局。',
      error: null,
    });
    return true;
  },

  createOnline: async () => {
    const setup = get().setup;
    set({ status: '正在创建在线房间...', error: null });
    const session = await clientApi.createRoom({ hostName: setup.playerName, maxSeats: setup.playerCount, seed: setup.seed });
    attachOnlineSession(session, set);
  },

  joinOnline: async (code, name) => {
    set({ status: '正在加入在线房间...', error: null });
    const session = await clientApi.joinRoom({ code, name });
    attachOnlineSession(session, set);
  },

  reconnectOnline: () => {
    const saved = readOnlineSession();
    if (!saved) return Promise.resolve(false);
    attachOnlineSession(saved, set);
    return Promise.resolve(true);
  },

  setReady: async (ready) => {
    const session = get().session;
    if (!session) return;
    applySnapshot(await clientApi.ready(session, ready), set);
  },

  startOnline: async () => {
    const session = get().session;
    if (!session) return;
    applySnapshot(await clientApi.startRoom(session), set);
  },

  addBot: async (ai) => {
    const { session, socket } = get();
    if (!session || !socket) return;
    const count = get().room?.seats.length ?? 1;
    const snapshot = await emitRoomSnapshot(socket, 'room:add-bot', session, {
      name: `${ai.provider === 'local-bot' ? '本地' : ai.provider === 'deepseek' ? 'DeepSeek' : '兼容'} AI ${count}`,
      ai,
    });
    applySnapshot(snapshot, set);
  },

  removeBot: async (seatId) => {
    const { session, socket } = get();
    if (!session || !socket) return;
    applySnapshot(await emitRoomSnapshot(socket, 'room:remove-bot', session, { targetSeatId: seatId }), set);
  },

  transferHost: async (seatId) => {
    const { session, socket } = get();
    if (!session || !socket) return;
    applySnapshot(await emitRoomSnapshot(socket, 'room:host-transfer', session, { targetSeatId: seatId }), set);
  },

  takeOverDisconnected: async (seatId) => {
    const { session, socket } = get();
    if (!session || !socket) return;
    applySnapshot(await emitRoomSnapshot(socket, 'room:takeover', session, {
      targetSeatId: seatId,
      ai: { provider: 'local-bot', difficulty: 'normal', persona: 'steady' },
    }), set);
  },

  submitAction: async (actionId) => {
    const { localState, view, session, humanSeatId } = get();
    const action = view?.legalActions.find((candidate) => candidate.id === actionId);
    if (!action) {
      set({ error: '这个动作已经过期或当前不可执行。' });
      return;
    }
    if (session) {
      if (!view) return;
      const result = await clientApi.submitAction(session, action.id, view.revision);
      applySnapshot(result, set);
      return;
    }
    if (!localState) return;
    const applied = applyAction(localState, action);
    const advanced = advanceBots(applied, humanSeatId);
    saveRecentSolo(advanced, humanSeatId);
    set({
      localState: advanced,
      view: getViewForSeat(advanced, humanSeatId),
      mode: advanced.outcome ? 'outcome' : 'table',
      selectedCardId: null,
      status: `已结算“${action.label}”。`,
      error: null,
    });
  },

  sendChat: (message) => {
    const { session, socket } = get();
    const trimmed = message.trim();
    if (!session || !socket || !trimmed) return;
    socket.emit('chat:send', {
      roomId: session.roomId,
      seatId: session.seatId,
      seatToken: session.seatToken,
      message: trimmed,
    }, (ack: { ok: boolean; data?: ServerChatMessage; error?: string }) => {
      if (!ack.ok) set({ error: ack.error ?? '聊天发送失败。' });
    });
  },

  refreshDiagnostics: async () => {
    try {
      const providers = await clientApi.providers();
      set({ providers, status: 'Provider 诊断已刷新。', error: null });
    } catch (error) {
      set({
        providers: [{ id: 'local-bot', label: '本地启发式 Bot', status: 'available', message: '无需服务器。' }],
        error: error instanceof Error ? error.message : '无法连接诊断接口。',
      });
    }
  },

  refreshSaves: async () => {
    try {
      const session = get().session;
      if (!session) {
        set({ serverSaves: [], localSaves: summarizeLocalSaves(), status: '本地存档已刷新；在线存档需先进入房间。', error: null });
        return;
      }
      const saves = await clientApi.listSaves(session);
      set({ serverSaves: saves, localSaves: summarizeLocalSaves(), status: '存档列表已刷新。', error: null });
    } catch (error) {
      set({ serverSaves: [], localSaves: summarizeLocalSaves(), error: error instanceof Error ? error.message : '无法读取服务端存档。' });
    }
  },

  saveLocalNamed: (name) => {
    const { localState, humanSeatId } = get();
    if (!localState) return;
    const now = new Date().toISOString();
    const id = `local-${localState.gameId}-${Date.now()}`;
    const save: LocalSaveEnvelope = {
      schemaVersion: 1,
      id,
      name: name.trim() || `第 ${localState.round} 轮存档`,
      updatedAt: now,
      round: localState.round,
      phaseLabel: localState.phaseLabel,
      state: localState,
      humanSeatId,
    };
    writeLocalSaves([save, ...readLocalSaves().filter((item) => item.name !== save.name)].slice(0, 30));
    set({ localSaves: summarizeLocalSaves(), status: `已保存“${save.name}”。` });
  },

  loadLocalSave: (id) => {
    const save = readLocalSaves().find((candidate) => candidate.id === id);
    if (!save) return false;
    saveRecentSolo(save.state, save.humanSeatId);
    set({
      localState: save.state,
      view: getViewForSeat(save.state, save.humanSeatId),
      humanSeatId: save.humanSeatId,
      room: null,
      session: null,
      mode: save.state.outcome ? 'outcome' : 'table',
      status: `已载入“${save.name}”。`,
      error: null,
    });
    return true;
  },

  deleteLocalSave: (id) => {
    writeLocalSaves(readLocalSaves().filter((save) => save.id !== id));
    set({ localSaves: summarizeLocalSaves(), status: '本地存档已删除。' });
  },

  exportLocalSave: (id) => {
    const save = readLocalSaves().find((candidate) => candidate.id === id);
    return save ? JSON.stringify(save, null, 2) : null;
  },

  importLocalSave: (text, overwrite = false) => {
    const parsed = JSON.parse(text) as LocalSaveEnvelope;
    if (parsed.schemaVersion !== 1 || !parsed.state || !parsed.humanSeatId) throw new Error('存档格式无效。');
    const saves = readLocalSaves();
    const imported = overwrite || !saves.some((save) => save.id === parsed.id)
      ? parsed
      : { ...parsed, id: `local-import-${Date.now()}`, name: `${parsed.name}（导入）` };
    writeLocalSaves([imported, ...saves.filter((save) => save.id !== imported.id)].slice(0, 30));
    set({ localSaves: summarizeLocalSaves(), status: `已导入“${imported.name}”。` });
  },

  selectCard: (cardId) => set({ selectedCardId: cardId }),
  setActivePanel: (panel) => set({ activePanel: panel }),
  setAudio: (patch) => set((state) => ({
    muted: patch.muted ?? state.muted,
    volume: patch.volume ?? state.volume,
    reducedMotion: patch.reducedMotion ?? state.reducedMotion,
  })),
  clearError: () => set({ error: null }),
}));

function attachOnlineSession(session: ClientSession, set: StoreSet): void {
  persistOnlineSession(session);
  const socket = clientApi.connect(session, {
    onSnapshot: (snapshot) => applySnapshot(snapshot, set),
    onRoom: (room) => set({ room, chat: room.chat, status: `房间 ${room.code} 已更新。` }),
    onChat: (message) => set((state) => ({ chat: [...state.chat.slice(-80), message] })),
    onError: (message) => set({ error: message }),
  });
  socket.on('disconnect', () => set({ status: '连接已断开，Socket.IO 将尝试重连。' }));
  set({
    session,
    socket,
    room: session.snapshot.room,
    view: session.snapshot.view,
    chat: session.snapshot.room.chat,
    humanSeatId: session.seatId,
    localState: null,
    mode: 'online',
    status: `已进入房间 ${session.snapshot.room.code || session.code}。`,
    error: null,
  });
}

function applySnapshot(snapshot: RoomSnapshot, set: StoreSet): void {
  set({
    room: snapshot.room,
    view: snapshot.view,
    chat: snapshot.room.chat,
    mode: snapshot.view ? (snapshot.view.outcome ? 'outcome' : 'table') : 'online',
    status: snapshot.view ? `房间 ${snapshot.room.code} 已同步到修订 ${snapshot.view.revision}。` : `房间 ${snapshot.room.code} 大厅已同步。`,
    error: null,
  });
}

function emitRoomSnapshot(
  socket: Socket,
  event: string,
  session: ClientSession,
  body: Record<string, unknown> = {},
): Promise<RoomSnapshot> {
  return new Promise((resolve, reject) => {
    socket.emit(event, {
      roomId: session.roomId,
      seatId: session.seatId,
      seatToken: session.seatToken,
      ...body,
    }, (ack: { ok: boolean; data?: RoomSnapshot; error?: string }) => {
      if (ack.ok && ack.data) resolve(ack.data);
      else reject(new Error(ack.error ?? `${event} failed`));
    });
  });
}
