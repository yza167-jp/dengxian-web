import { create } from 'zustand';
import { z } from 'zod';
import type { Socket } from 'socket.io-client';
import { applyAction, assertValidGameState, createGame } from '../../shared/game/engine';
import { chooseHeuristicAction, publicBotMessage } from '../../shared/game/bot';
import { getViewForSeat } from '../../shared/game/view';
import type {
  AiSeatConfig,
  CharacterId,
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
  characterId: CharacterId | 'random';
  provider: AiSeatConfig['provider'];
  model: string;
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
  chatMuted: boolean;
  setMode: (mode: ScreenMode) => void;
  updateSetup: (patch: Partial<SoloSetup>) => void;
  startSolo: () => Promise<boolean>;
  continueRecentSolo: () => boolean;
  createOnline: () => Promise<void>;
  joinOnline: (code: string, name: string) => Promise<void>;
  reconnectOnline: () => Promise<boolean>;
  setReady: (ready: boolean) => Promise<void>;
  startOnline: () => Promise<boolean>;
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
  setChatMuted: (muted: boolean) => void;
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
  characterId: 'random',
  provider: 'local-bot',
  model: '',
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
  chat?: ServerChatMessage[];
}

const serverChatMessageSchema = z.object({
  id: z.string().min(1),
  seatId: z.string().min(1),
  name: z.string().min(1),
  message: z.string(),
  createdAt: z.string().min(1),
  round: z.number().int().min(1).max(8).optional(),
}).strict();

function parseStoredChat(value: unknown): ServerChatMessage[] {
  if (value === undefined) return [];
  return z.array(serverChatMessageSchema).parse(value);
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
      provider: setup.provider,
      model: setup.model.trim() || undefined,
      difficulty: setup.difficulty,
      persona: personas[(index + personas.indexOf(setup.persona)) % personas.length] ?? 'steady',
      thinking: setup.difficulty === 'hard',
    },
  };
}

function buildSoloConfig(setup: SoloSetup): CreateGameConfig {
  return {
    mode: 'solo',
    seed: setup.seed,
    faithfulRules: true,
    seats: [
      {
        id: HUMAN_SEAT,
        name: setup.playerName.trim() || DEFAULT_SETUP.playerName,
        kind: 'human',
        characterId: setup.characterId === 'random' ? undefined : setup.characterId,
      },
      ...Array.from({ length: setup.playerCount - 1 }, (_, index) => botConfig(index + 1, setup)),
    ],
  };
}

function saveRecentSolo(state: GameState, humanSeatId: SeatId, chat: ServerChatMessage[]): void {
  getStorage('local')?.setItem(RECENT_SOLO_KEY, JSON.stringify({
    schemaVersion: 1,
    state,
    humanSeatId,
    chat,
  }));
}

function parseStoredState(state: unknown, humanSeatId: unknown): { state: GameState; humanSeatId: SeatId } {
  assertValidGameState(state);
  if (
    typeof humanSeatId !== 'string' ||
    !state.players.some((player) => player.id === humanSeatId && player.kind === 'human')
  ) {
    throw new Error('存档中的真人席位无效。');
  }
  return { state, humanSeatId };
}

function readRecentSolo(): { state: GameState; humanSeatId: SeatId; chat: ServerChatMessage[] } | null {
  const raw = getStorage('local')?.getItem(RECENT_SOLO_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as {
      schemaVersion?: number;
      state?: unknown;
      humanSeatId?: unknown;
      chat?: ServerChatMessage[];
    };
    if (parsed.schemaVersion !== 1) return null;
    return {
      ...parseStoredState(parsed.state, parsed.humanSeatId),
      chat: parseStoredChat(parsed.chat),
    };
  } catch {
    return null;
  }
}

function readLocalSaves(): LocalSaveEnvelope[] {
  const raw = getStorage('local')?.getItem(LOCAL_SAVES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((candidate) => {
      try {
        if (!candidate || typeof candidate !== 'object') return [];
        const save = candidate as Partial<LocalSaveEnvelope>;
        if (
          save.schemaVersion !== 1 ||
          typeof save.id !== 'string' ||
          typeof save.name !== 'string' ||
          typeof save.updatedAt !== 'string' ||
          typeof save.round !== 'number' ||
          typeof save.phaseLabel !== 'string'
        ) {
          return [];
        }
        return [{
          ...save,
          ...parseStoredState(save.state, save.humanSeatId),
          chat: parseStoredChat(save.chat),
        } as LocalSaveEnvelope];
      } catch {
        return [];
      }
    });
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
  getStorage('local')?.setItem(ONLINE_SESSION_KEY, JSON.stringify({
    roomId: session.roomId,
    code: session.code,
    seatId: session.seatId,
    seatToken: session.seatToken,
  }));
}

function readOnlineSession(): ClientSession | null {
  const raw = getStorage('local')?.getItem(ONLINE_SESSION_KEY)
    ?? getStorage('session')?.getItem(ONLINE_SESSION_KEY);
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

function advanceBots(
  state: GameState,
  humanSeatId: SeatId,
  existingChat: ServerChatMessage[] = [],
): { state: GameState; chat: ServerChatMessage[] } {
  let next = state;
  const chat = [...existingChat];
  let guard = 0;
  while (!next.outcome && guard < 80) {
    const humanView = getViewForSeat(next, humanSeatId);
    if (humanView.legalActions.length > 0) return { state: next, chat };
    const actor = next.players.find((player) => getViewForSeat(next, player.id).legalActions.length > 0);
    if (!actor) return { state: next, chat };
    const actorView = getViewForSeat(next, actor.id);
    const decision = actor.kind === 'bot'
      ? chooseHeuristicAction(next, actorView, actor.id)
      : { action: actorView.legalActions[0]!, publicRationale: '自动处理等待动作。' };
    next = applyAction(next, decision.action);
    if (actor.kind === 'bot') {
      chat.push({
        id: `local-chat-${next.gameId}-${next.revision}-${actor.id}`,
        seatId: actor.id,
        name: actor.name,
        message: publicBotMessage(
          decision.action,
          'publicSpeech' in decision ? decision.publicSpeech : undefined,
        ),
        createdAt: new Date().toISOString(),
        round: next.round,
      });
    }
    guard += 1;
  }
  return { state: next, chat };
}

function errorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  try {
    const payload = JSON.parse(error.message) as { error?: string };
    return payload.error ?? error.message;
  } catch {
    return error.message || fallback;
  }
}

async function attempt<T>(
  set: StoreSet,
  fallback: string,
  operation: () => Promise<T>,
): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    set({ error: errorMessage(error, fallback), status: fallback });
    return null;
  }
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
  chatMuted: false,

  setMode: (mode) => set({ mode, error: null }),
  updateSetup: (patch) => set((state) => ({ setup: { ...state.setup, ...patch } })),

  startSolo: async () => {
    const setup = get().setup;
    get().socket?.disconnect();
    if (setup.provider === 'local-bot') {
      try {
        const initial = createGame(buildSoloConfig(setup));
        const advanced = advanceBots(initial, HUMAN_SEAT);
        saveRecentSolo(advanced.state, HUMAN_SEAT, advanced.chat);
        set({
          localState: advanced.state,
          view: getViewForSeat(advanced.state, HUMAN_SEAT),
          room: null,
          session: null,
          socket: null,
          chat: advanced.chat,
          mode: 'table',
          selectedCardId: null,
          status: '离线本地规则引擎已启动，Bot 会在谈判栏公开发言。',
          error: null,
        });
        return true;
      } catch (error) {
        set({ error: errorMessage(error, '无法创建本地单人局。') });
        return false;
      }
    }

    set({ status: `正在创建 ${setup.provider} 私房单人局...`, error: null });
    const session = await attempt(set, '无法创建 Provider 私房。', () => clientApi.createRoom({
      hostName: setup.playerName.trim() || DEFAULT_SETUP.playerName,
      maxSeats: setup.playerCount,
      seed: setup.seed,
      characterId: setup.characterId === 'random' ? undefined : setup.characterId,
    }));
    if (!session) return false;
    attachOnlineSession(session, set);
    set({ status: `已创建 ${setup.provider} 私房，正在配置 AI 席位。` });
    const personas: Persona[] = ['steady', 'guardian', 'bold', 'suspicious', 'selfish'];
    for (let index = 1; index < setup.playerCount; index += 1) {
      const snapshot = await attempt(set, '无法添加 Provider Bot。', () => clientApi.addBot(session, {
        name: ['玄霄', '扶摇', '照夜', '青璃', '问石'][index - 1] ?? `道友${index}`,
        ai: {
          provider: setup.provider,
          model: setup.model.trim() || undefined,
          difficulty: setup.difficulty,
          persona: personas[(index + personas.indexOf(setup.persona)) % personas.length] ?? 'steady',
          thinking: setup.difficulty === 'hard',
        },
      }));
      if (!snapshot) return false;
      session.snapshot = snapshot;
      applySnapshot(snapshot, set);
    }
    const ready = await attempt(set, '无法准备 Provider 私房。', () => clientApi.ready(session, true));
    if (!ready) return false;
    session.snapshot = ready;
    applySnapshot(ready, set);
    const started = await attempt(set, '无法启动 Provider 私房。', () => clientApi.startRoom(session));
    if (!started) return false;
    session.snapshot = started;
    applySnapshot(started, set);
    set({ status: `${setup.provider} 私房已启动；服务异常时自动改由本地 Bot 接管。` });
    return true;
  },

  continueRecentSolo: () => {
    const recent = readRecentSolo();
    if (!recent) {
      set({ error: '没有可继续的最近单人局。' });
      return false;
    }
    get().socket?.disconnect();
    const advanced = advanceBots(recent.state, recent.humanSeatId, recent.chat);
    set({
      localState: advanced.state,
      view: getViewForSeat(advanced.state, recent.humanSeatId),
      room: null,
      session: null,
      socket: null,
      chat: advanced.chat,
      humanSeatId: recent.humanSeatId,
      mode: advanced.state.outcome ? 'outcome' : 'table',
      status: '已继续最近的本地单人局。',
      error: null,
    });
    return true;
  },

  createOnline: async () => {
    const setup = get().setup;
    get().socket?.disconnect();
    set({ status: '正在创建在线房间...', error: null });
    const session = await attempt(set, '创建在线房间失败。', () => clientApi.createRoom({
      hostName: setup.playerName,
      maxSeats: setup.playerCount,
      seed: setup.seed,
    }));
    if (session) attachOnlineSession(session, set);
  },

  joinOnline: async (code, name) => {
    get().socket?.disconnect();
    set({ status: '正在加入在线房间...', error: null });
    const session = await attempt(set, '加入在线房间失败。', () => clientApi.joinRoom({ code, name }));
    if (session) attachOnlineSession(session, set);
  },

  reconnectOnline: () => {
    const saved = readOnlineSession();
    if (!saved) {
      set({ error: '没有保存的在线席位令牌。' });
      return Promise.resolve(false);
    }
    attachOnlineSession(saved, set);
    return Promise.resolve(true);
  },

  setReady: async (ready) => {
    const session = get().session;
    if (!session) {
      set({ error: '请先创建或加入在线房间。' });
      return;
    }
    const snapshot = await attempt(set, '更新准备状态失败。', () => clientApi.ready(session, ready));
    if (snapshot) applySnapshot(snapshot, set);
  },

  startOnline: async () => {
    const session = get().session;
    if (!session) {
      set({ error: '请先创建或加入在线房间。' });
      return false;
    }
    const snapshot = await attempt(set, '在线对局启动失败。', () => clientApi.startRoom(session));
    if (!snapshot) return false;
    applySnapshot(snapshot, set);
    return true;
  },

  addBot: async (ai) => {
    const { session, socket } = get();
    if (!session || !socket) {
      set({ error: '在线连接尚未建立。' });
      return;
    }
    const count = get().room?.seats.length ?? 1;
    const snapshot = await attempt(set, '添加 AI 失败。', () => emitRoomSnapshot(socket, 'room:add-bot', session, {
      name: `${ai.provider === 'local-bot' ? '本地' : ai.provider === 'deepseek' ? 'DeepSeek' : '兼容'} AI ${count}`,
      ai,
    }));
    if (snapshot) applySnapshot(snapshot, set);
  },

  removeBot: async (seatId) => {
    const { session, socket } = get();
    if (!session || !socket) {
      set({ error: '在线连接尚未建立。' });
      return;
    }
    const snapshot = await attempt(set, '移除 AI 失败。', () =>
      emitRoomSnapshot(socket, 'room:remove-bot', session, { targetSeatId: seatId }));
    if (snapshot) applySnapshot(snapshot, set);
  },

  transferHost: async (seatId) => {
    const { session, socket } = get();
    if (!session || !socket) {
      set({ error: '在线连接尚未建立。' });
      return;
    }
    const snapshot = await attempt(set, '移交房主失败。', () =>
      emitRoomSnapshot(socket, 'room:host-transfer', session, { targetSeatId: seatId }));
    if (snapshot) applySnapshot(snapshot, set);
  },

  takeOverDisconnected: async (seatId) => {
    const { session, socket } = get();
    if (!session || !socket) {
      set({ error: '在线连接尚未建立。' });
      return;
    }
    const snapshot = await attempt(set, '临时接管失败。', () => emitRoomSnapshot(socket, 'room:takeover', session, {
      targetSeatId: seatId,
      ai: { provider: 'local-bot', difficulty: 'normal', persona: 'steady' },
    }));
    if (snapshot) applySnapshot(snapshot, set);
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
      const result = await attempt(set, '动作提交失败，请重试。', () =>
        clientApi.submitAction(session, action.id, view.revision));
      if (result) applySnapshot(result, set);
      return;
    }
    if (!localState) {
      set({ error: '当前没有可操作的单人对局。' });
      return;
    }
    try {
      const applied = applyAction(localState, action);
      const advanced = advanceBots(applied, humanSeatId, get().chat);
      saveRecentSolo(advanced.state, humanSeatId, advanced.chat);
      set({
        localState: advanced.state,
        view: getViewForSeat(advanced.state, humanSeatId),
        chat: advanced.chat,
        mode: advanced.state.outcome ? 'outcome' : 'table',
        selectedCardId: null,
        status: `已结算“${action.label}”。`,
        error: null,
      });
    } catch (error) {
      set({ error: errorMessage(error, '本地动作结算失败。') });
    }
  },

  sendChat: (message) => {
    const { session, socket } = get();
    const trimmed = message.trim();
    if (!trimmed) return;
    if (!session || !socket) {
      set({ error: '离线单人局只能查看 Bot 公开发言；真人聊天仅用于在线房间。' });
      return;
    }
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
    const { localState, humanSeatId, chat } = get();
    if (!localState) {
      set({ error: '当前没有可保存的本地单人局。' });
      return;
    }
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
      chat,
    };
    writeLocalSaves([save, ...readLocalSaves().filter((item) => item.name !== save.name)].slice(0, 30));
    set({ localSaves: summarizeLocalSaves(), status: `已保存“${save.name}”。` });
  },

  loadLocalSave: (id) => {
    const save = readLocalSaves().find((candidate) => candidate.id === id);
    if (!save) {
      set({ error: '找不到这个本地存档，可能已被删除或版本不兼容。' });
      return false;
    }
    get().socket?.disconnect();
    saveRecentSolo(save.state, save.humanSeatId, save.chat ?? []);
    set({
      localState: save.state,
      view: getViewForSeat(save.state, save.humanSeatId),
      humanSeatId: save.humanSeatId,
      room: null,
      session: null,
      socket: null,
      chat: save.chat ?? [],
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
    if (!save) set({ error: '找不到要导出的本地存档。' });
    return save ? JSON.stringify(save, null, 2) : null;
  },

  importLocalSave: (text, overwrite = false) => {
    try {
      const candidate = JSON.parse(text) as Partial<LocalSaveEnvelope>;
      if (
        candidate.schemaVersion !== 1 ||
        typeof candidate.id !== 'string' ||
        typeof candidate.name !== 'string' ||
        typeof candidate.updatedAt !== 'string' ||
        typeof candidate.round !== 'number' ||
        typeof candidate.phaseLabel !== 'string'
      ) {
        throw new Error('存档格式无效。');
      }
      const valid = parseStoredState(candidate.state, candidate.humanSeatId);
      const parsed: LocalSaveEnvelope = {
        ...candidate,
        ...valid,
        schemaVersion: 1,
        id: candidate.id,
        name: candidate.name,
        updatedAt: candidate.updatedAt,
        round: candidate.round,
        phaseLabel: candidate.phaseLabel,
        chat: parseStoredChat(candidate.chat),
      };
      const saves = readLocalSaves();
      const imported = overwrite || !saves.some((save) => save.id === parsed.id)
        ? parsed
        : { ...parsed, id: `local-import-${Date.now()}`, name: `${parsed.name}（导入）` };
      writeLocalSaves([imported, ...saves.filter((save) => save.id !== imported.id)].slice(0, 30));
      set({ localSaves: summarizeLocalSaves(), status: `已导入“${imported.name}”。`, error: null });
    } catch (error) {
      set({ error: `导入失败：${errorMessage(error, '存档格式无效。')}` });
    }
  },

  selectCard: (cardId) => set({ selectedCardId: cardId }),
  setActivePanel: (panel) => set({ activePanel: panel }),
  setAudio: (patch) => set((state) => ({
    muted: patch.muted ?? state.muted,
    volume: patch.volume ?? state.volume,
    reducedMotion: patch.reducedMotion ?? state.reducedMotion,
  })),
  setChatMuted: (chatMuted) => set({ chatMuted }),
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
    mode: session.snapshot.view
      ? session.snapshot.view.outcome ? 'outcome' : 'table'
      : 'online',
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
