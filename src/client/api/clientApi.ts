import { io, type Socket } from 'socket.io-client';
import type { BotPreset, BotProfileFields } from '../../shared/bots';
import type { AiSeatConfig, GameView, PlayerKind, RoomId, SeatId } from '../../shared/game/types';

export interface ProviderDiagnostic {
  id: string;
  label: string;
  status: 'available' | 'missing-key' | 'offline' | 'unknown';
  model?: string;
  latencyMs?: number;
  message?: string;
}

export interface ProviderTestResult {
  ok: boolean;
  requestedProvider: 'deepseek' | 'openai-compatible';
  requestedModel: string;
  provider: AiSeatConfig['provider'];
  model: string;
  usedFallback: boolean;
  latencyMs: number;
  retryCount: number;
  requestMode: 'tool' | 'json' | 'local';
}

export interface RoomSeatView {
  id: SeatId;
  name: string;
  kind: PlayerKind;
  ready: boolean;
  connected: boolean;
  temporaryBot: boolean;
  disconnectedAt?: string;
  ai?: AiSeatConfig;
}

export interface PublicRoom {
  schemaVersion: 1;
  id: RoomId;
  code: string;
  status: 'lobby' | 'active' | 'finished';
  hostSeatId: SeatId;
  seed: number;
  maxSeats: number;
  seats: RoomSeatView[];
  chat: ServerChatMessage[];
  actionDeadlineAt?: string;
}

export interface RoomSnapshot {
  room: PublicRoom;
  view: GameView | null;
  stateHash: string | null;
}

export interface ClientSession {
  roomId: RoomId;
  code: string;
  seatId: SeatId;
  seatToken: string;
  snapshot: RoomSnapshot;
}

export interface ServerChatMessage {
  id: string;
  seatId: SeatId;
  name: string;
  message: string;
  createdAt: string;
  round?: number;
}

export interface SaveSummary {
  id: string;
  name: string;
  mode: 'solo' | 'online';
  updatedAt: string;
  round: number;
  phaseLabel: string;
}

export interface BotProfile extends BotProfileFields {
  id: string;
  presetId: string;
  isPreset: false;
  createdAt: string;
  updatedAt: string;
}

export interface BotGrowthStats {
  level: number;
  xp: number;
  games: number;
  ascensions: number;
  decisions: number;
  messages: number;
  fallback: number;
}

export interface BotUsageAnalytics {
  records: number;
  cacheHits: number;
  cacheMisses: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  latencyMsAvg: number;
  retryCount: number;
  fallback: number;
  usdMicros: number;
}

export interface BotMemory {
  id: string;
  profileId: string;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface BotDashboard {
  profile: BotProfile;
  growth: BotGrowthStats;
  usage: BotUsageAnalytics;
  memories: BotMemory[];
}

export interface ServerCommandResult {
  view: GameView;
  accepted: boolean;
  commandId: string;
}

type SocketHandlers = {
  onSnapshot?: (snapshot: RoomSnapshot) => void;
  onRoom?: (room: PublicRoom) => void;
  onChat?: (message: ServerChatMessage) => void;
  onError?: (message: string) => void;
};

interface SocketAck<T> {
  ok: boolean;
  data?: T;
  error?: string;
  issues?: unknown;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

export const clientApi = {
  health(): Promise<{ ok: boolean; version?: string }> {
    return requestJson('/api/health');
  },

  async providers(): Promise<ProviderDiagnostic[]> {
    const response = await requestJson<{ providers: ProviderDiagnostic[] }>('/api/providers');
    return response.providers;
  },

  providerTest(
    adminToken: string,
    input: {
      provider: 'deepseek' | 'openai-compatible';
      model?: string;
      thinking?: boolean;
    },
  ): Promise<ProviderTestResult> {
    return requestJson('/api/provider-test', {
      method: 'POST',
      headers: { 'x-provider-test-token': adminToken },
      body: JSON.stringify(input),
    });
  },

  async botPresets(): Promise<readonly BotPreset[]> {
    const response = await requestJson<{ presets: BotPreset[] }>('/api/bots/presets');
    return response.presets;
  },

  async botProfiles(managerToken: string): Promise<BotProfile[]> {
    const response = await requestJson<{ profiles: BotProfile[] }>('/api/bots', {
      headers: { 'x-bot-manager-token': managerToken },
    });
    return response.profiles;
  },

  createBot(
    managerToken: string,
    input: { presetId: string; overrides?: Partial<BotProfileFields> },
  ): Promise<{ profile: BotProfile }> {
    return requestJson('/api/bots', {
      method: 'POST',
      headers: { 'x-bot-manager-token': managerToken },
      body: JSON.stringify(input),
    });
  },

  updateBot(
    managerToken: string,
    profileId: string,
    patch: Partial<BotProfileFields>,
  ): Promise<{ profile: BotProfile }> {
    return requestJson(`/api/bots/${encodeURIComponent(profileId)}`, {
      method: 'PATCH',
      headers: { 'x-bot-manager-token': managerToken },
      body: JSON.stringify({ patch }),
    });
  },

  deleteBot(managerToken: string, profileId: string): Promise<void> {
    return requestJson(`/api/bots/${encodeURIComponent(profileId)}`, {
      method: 'DELETE',
      headers: { 'x-bot-manager-token': managerToken },
    });
  },

  botDashboard(managerToken: string, profileId: string): Promise<BotDashboard> {
    return requestJson(`/api/bots/${encodeURIComponent(profileId)}/dashboard`, {
      headers: { 'x-bot-manager-token': managerToken },
    });
  },

  async createRoom(input: { hostName: string; maxSeats: number; seed: number; characterId?: string }): Promise<ClientSession> {
    const response = await requestJson<{ room: PublicRoom; seatId: SeatId; seatToken: string }>('/api/rooms', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return sessionFromRoomAuth(response);
  },

  async joinRoom(input: { code?: string; roomId?: string; name: string }): Promise<ClientSession> {
    const response = await requestJson<{ room: PublicRoom; seatId: SeatId; seatToken: string }>('/api/rooms/join', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return sessionFromRoomAuth(response);
  },

  ready(session: ClientSession, ready: boolean): Promise<RoomSnapshot> {
    return authedPost('/api/rooms/ready', session, { ready });
  },

  startRoom(session: ClientSession): Promise<RoomSnapshot> {
    return authedPost('/api/rooms/start', session);
  },

  addBot(
    session: ClientSession,
    input: { name: string; ai: AiSeatConfig; botManagerToken?: string },
  ): Promise<RoomSnapshot> {
    return authedPost('/api/rooms/add-bot', session, input);
  },

  submitAction(session: ClientSession, actionId: string, baseRevision: number): Promise<RoomSnapshot> {
    return authedPost('/api/rooms/command', session, {
      commandId: crypto.randomUUID(),
      baseRevision,
      actionId,
    });
  },

  createServerSave(session: ClientSession, name: string): Promise<SaveSummary> {
    return requestJson('/api/saves', {
      method: 'POST',
      body: JSON.stringify({ name, ...authBody(session) }),
    });
  },

  async listSaves(session: ClientSession): Promise<SaveSummary[]> {
    const query = new URLSearchParams(authBody(session));
    const response = await requestJson<{ saves: SaveSummary[] }>(`/api/saves?${query.toString()}`);
    return response.saves;
  },

  connect(session: ClientSession, handlers: SocketHandlers): Socket {
    const socket = io('/', {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      auth: {
        roomId: session.roomId,
        seatId: session.seatId,
        seatToken: session.seatToken,
      },
    });
    socket.on('connect', () => {
      socket.emit('room:reconnect', authBody(session), (ack: SocketAck<RoomSnapshot>) => {
        if (ack.ok && ack.data) handlers.onSnapshot?.(ack.data);
        else handlers.onError?.(ack.error ?? 'Socket reconnect failed');
      });
    });
    socket.on('room:snapshot', (snapshot: RoomSnapshot) => handlers.onSnapshot?.(snapshot));
    socket.on('room:update', (payload: PublicRoom | RoomSnapshot) => {
      if ('view' in payload) handlers.onSnapshot?.(payload);
      else {
        handlers.onRoom?.(payload);
        socket.emit('room:reconnect', authBody(session), (ack: SocketAck<RoomSnapshot>) => {
          if (ack.ok && ack.data) handlers.onSnapshot?.(ack.data);
        });
      }
    });
    socket.on('chat:message', (message: ServerChatMessage) => handlers.onChat?.(message));
    socket.on('room:error', (message: string) => handlers.onError?.(message));
    return socket;
  },
};

function sessionFromRoomAuth(response: { room: PublicRoom; seatId: SeatId; seatToken: string }): ClientSession {
  return {
    roomId: response.room.id,
    code: response.room.code,
    seatId: response.seatId,
    seatToken: response.seatToken,
    snapshot: { room: response.room, view: null, stateHash: null },
  };
}

function authBody(session: ClientSession): { roomId: RoomId; seatId: SeatId; seatToken: string } {
  return {
    roomId: session.roomId,
    seatId: session.seatId,
    seatToken: session.seatToken,
  };
}

function authedPost<T>(path: string, session: ClientSession, body: Record<string, unknown> = {}): Promise<T> {
  return requestJson(path, {
    method: 'POST',
    body: JSON.stringify({ ...authBody(session), ...body }),
  });
}
