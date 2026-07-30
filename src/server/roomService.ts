import {
  applyAction,
  assertActionBelongsToLegalSet,
  createGame,
  getLegalActions,
  parseGameState,
} from '../shared/game/engine';
import { CHARACTERS } from '../shared/data/content';
import { chooseHeuristicAction, publicBotMessage } from '../shared/game/bot';
import { hashGameState } from '../shared/game/replay';
import { getViewForSeat } from '../shared/game/view';
import type { AiSeatConfig, CharacterId, CreateGameConfig, GameState, GameView, PlayerKind, SeatId } from '../shared/game/types';
import { chooseAiMove } from './ai';
import { newId, newToken, sha256 } from './storage';
import type { ServerStorage } from './storage';

export interface RoomSeat {
  id: SeatId;
  name: string;
  kind: PlayerKind;
  ready: boolean;
  connected: boolean;
  temporaryBot: boolean;
  disconnectedAt?: string;
  tokenHash: string;
  tokenExpiresAt?: string;
  ai?: AiSeatConfig;
  characterId?: CharacterId;
}

export interface RoomPayload {
  schemaVersion: 1;
  id: string;
  code: string;
  status: 'lobby' | 'active' | 'finished';
  hostSeatId: SeatId;
  seed: number;
  maxSeats: number;
  seats: RoomSeat[];
  gameState: GameState | null;
  initialConfig: CreateGameConfig | null;
  actionIds: string[];
  chat: Array<{ id: string; seatId: SeatId; name: string; message: string; createdAt: string; round?: number }>;
  actionDeadlineAt?: string;
  actionDeadlineRevision?: number;
}

export interface SeatAuth {
  room: RoomPayload;
  seat: RoomSeat;
}

function restorePersistedGameState(room: RoomPayload): { state: GameState; repairedCharacters: boolean } {
  if (!room.gameState) throw new Error('Game has not started');
  try {
    return { state: parseGameState(room.gameState), repairedCharacters: false };
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'Duplicate player character id') throw error;
  }

  const legacyState = structuredClone(room.gameState);
  const used = new Set<CharacterId>();
  for (const player of legacyState.players) {
    if (!used.has(player.characterId)) {
      used.add(player.characterId);
      continue;
    }
    const replacement = CHARACTERS.find((character) => !used.has(character.id))?.id;
    if (!replacement) throw new Error('Unable to repair duplicate persisted character');
    player.characterId = replacement;
    used.add(replacement);
    const roomSeat = room.seats.find((seat) => seat.id === player.id);
    if (roomSeat) roomSeat.characterId = replacement;
    const initialSeat = room.initialConfig?.seats.find((seat) => seat.id === player.id);
    if (initialSeat) initialSeat.characterId = replacement;
  }
  return { state: parseGameState(legacyState), repairedCharacters: true };
}

export interface RoomSnapshot {
  room: PublicRoom;
  view: GameView | null;
  stateHash: string | null;
}

export interface PublicSeat {
  id: SeatId;
  name: string;
  kind: PlayerKind;
  ready: boolean;
  connected: boolean;
  temporaryBot: boolean;
  disconnectedAt?: string;
}

export interface PublicRoom {
  schemaVersion: 1;
  id: string;
  code: string;
  status: RoomPayload['status'];
  hostSeatId: SeatId;
  seed: number;
  maxSeats: number;
  seats: PublicSeat[];
  chat: RoomPayload['chat'];
  actionDeadlineAt?: string;
}

function codeFromId(id: string): string {
  return sha256(id).slice(0, 6).toUpperCase();
}

function publicSeat(seat: RoomSeat): PublicSeat {
  return {
    id: seat.id,
    name: seat.name,
    kind: seat.kind,
    ready: seat.ready,
    connected: seat.connected,
    temporaryBot: seat.temporaryBot,
    disconnectedAt: seat.disconnectedAt,
  };
}

function toPublicRoom(room: RoomPayload): PublicRoom {
  return {
    schemaVersion: room.schemaVersion,
    id: room.id,
    code: room.code,
    status: room.status,
    hostSeatId: room.hostSeatId,
    seed: room.seed,
    maxSeats: room.maxSeats,
    seats: room.seats.map(publicSeat),
    chat: room.chat,
    actionDeadlineAt: room.actionDeadlineAt,
  };
}

function nextAvailableSeatId(room: RoomPayload): SeatId {
  const occupied = new Set(room.seats.map((seat) => seat.id));
  for (let index = 1; index <= room.maxSeats; index += 1) {
    const seatId = `seat-${index}`;
    if (!occupied.has(seatId)) return seatId;
  }
  throw new Error('Room is full');
}

export class RoomService {
  private readonly botQueues = new Map<string, Promise<RoomPayload>>();
  private readonly now: () => number;
  private readonly actionTimeoutMs: number;
  private readonly sessionTokenTtlMs: number;
  private readonly log: (event: Record<string, unknown>) => void;

  constructor(
    private readonly storage: ServerStorage,
    options: {
      now?: () => number;
      actionTimeoutMs?: number;
      sessionTokenTtlDays?: number;
      log?: (event: Record<string, unknown>) => void;
    } = {},
  ) {
    this.now = options.now ?? Date.now;
    this.actionTimeoutMs = Math.max(
      1,
      options.actionTimeoutMs ?? Number(process.env.ACTION_TIMEOUT_MS ?? 90_000),
    );
    this.sessionTokenTtlMs = Math.max(
      1,
      (options.sessionTokenTtlDays ?? Number(process.env.SESSION_TOKEN_TTL_DAYS ?? 30))
        * 24 * 60 * 60 * 1_000,
    );
    this.log = options.log ?? ((event) => {
      if (process.env.NODE_ENV !== 'test' && process.env.LOG_LEVEL !== 'silent') {
        console.info(JSON.stringify(event));
      }
    });
    this.markPersistedHumansDisconnected();
  }

  createRoom(input: { hostName: string; maxSeats: number; seed: number; characterId?: CharacterId }) {
    const roomId = newId('room');
    const token = newToken();
    const hostSeatId = 'seat-1';
    const room: RoomPayload = {
      schemaVersion: 1,
      id: roomId,
      code: codeFromId(roomId),
      status: 'lobby',
      hostSeatId,
      seed: input.seed >>> 0,
      maxSeats: input.maxSeats,
      seats: [{
        id: hostSeatId,
        name: input.hostName,
        kind: 'human',
        ready: false,
        connected: true,
        temporaryBot: false,
        tokenHash: sha256(token),
        tokenExpiresAt: this.newTokenExpiry(),
        characterId: input.characterId,
      }],
      gameState: null,
      initialConfig: null,
      actionIds: [],
      chat: [],
    };
    this.save(room, 'room_created', { hostSeatId });
    return { room: toPublicRoom(room), seatId: hostSeatId, seatToken: token };
  }

  getRoom(roomId: string): RoomPayload {
    const stored = this.storage.getRoom(roomId);
    if (!stored) throw new Error('Room not found');
    return stored.payload as RoomPayload;
  }

  getRoomByCode(code: string): RoomPayload {
    const stored = this.storage.getRoomByCode(code.toUpperCase());
    if (!stored) throw new Error('Room not found');
    return stored.payload as RoomPayload;
  }

  join(input: { roomId?: string; code?: string; name: string }) {
    const room = input.roomId ? this.getRoom(input.roomId) : this.getRoomByCode(input.code!);
    if (room.status !== 'lobby') throw new Error('Room already started');
    if (room.seats.length >= room.maxSeats) throw new Error('Room is full');
    const token = newToken();
    const seatId = nextAvailableSeatId(room);
    room.seats.push({
      id: seatId,
      name: input.name,
      kind: 'human',
      ready: false,
      connected: true,
      temporaryBot: false,
      tokenHash: sha256(token),
      tokenExpiresAt: this.newTokenExpiry(),
    });
    this.save(room, 'seat_joined', { seatId });
    return { room: toPublicRoom(room), seatId, seatToken: token };
  }

  authenticate(roomId: string, seatId: SeatId, token: string): SeatAuth {
    const room = this.getRoom(roomId);
    const seat = room.seats.find((candidate) => candidate.id === seatId);
    if (!seat || seat.tokenHash !== sha256(token)) throw new Error('Invalid seat token');
    if (seat.tokenExpiresAt && Date.parse(seat.tokenExpiresAt) <= this.now()) {
      throw new Error('Seat token expired');
    }
    return { room, seat };
  }

  ready(input: { roomId: string; seatId: SeatId; seatToken: string; ready: boolean }) {
    const { room, seat } = this.authenticate(input.roomId, input.seatId, input.seatToken);
    seat.ready = input.ready;
    this.save(room, 'seat_ready', { seatId: seat.id, ready: seat.ready });
    return this.snapshot(room, seat.id);
  }

  reconnect(input: { roomId: string; seatId: SeatId; seatToken: string }) {
    const { room, seat } = this.authenticate(input.roomId, input.seatId, input.seatToken);
    seat.connected = true;
    seat.disconnectedAt = undefined;
    if (seat.temporaryBot) {
      seat.kind = 'human';
      seat.temporaryBot = false;
      seat.ai = undefined;
    }
    const player = room.gameState?.players.find((candidate) => candidate.id === seat.id);
    if (player) {
      player.disconnected = false;
      if (player.kind === 'bot' && !seat.temporaryBot) {
        player.kind = 'human';
        player.ai = undefined;
      }
    }
    this.save(room, 'seat_reconnected', { seatId: seat.id });
    return this.snapshot(room, seat.id);
  }

  disconnect(roomId: string, seatId: SeatId): void {
    const room = this.getRoom(roomId);
    const seat = room.seats.find((candidate) => candidate.id === seatId);
    if (!seat) return;
    seat.connected = false;
    seat.disconnectedAt = new Date().toISOString();
    const player = room.gameState?.players.find((candidate) => candidate.id === seatId);
    if (player) player.disconnected = true;
    this.save(room, 'seat_disconnected', { seatId });
  }

  addBot(input: { roomId: string; seatId: SeatId; seatToken: string; name: string; ai: AiSeatConfig }) {
    const { room, seat } = this.authenticate(input.roomId, input.seatId, input.seatToken);
    this.assertHost(room, seat.id);
    if (room.status !== 'lobby') throw new Error('Cannot add bot after start');
    if (room.seats.length >= room.maxSeats) throw new Error('Room is full');
    const botId = nextAvailableSeatId(room);
    room.seats.push({
      id: botId,
      name: input.name,
      kind: 'bot',
      ready: true,
      connected: true,
      temporaryBot: false,
      tokenHash: sha256(newToken()),
      ai: input.ai,
    });
    this.save(room, 'bot_added', { seatId: botId });
    return this.snapshot(room, seat.id);
  }

  removeBot(input: { roomId: string; seatId: SeatId; seatToken: string; targetSeatId: SeatId }) {
    const { room, seat } = this.authenticate(input.roomId, input.seatId, input.seatToken);
    this.assertHost(room, seat.id);
    if (room.status !== 'lobby') throw new Error('Cannot remove bot after start');
    const target = room.seats.find((candidate) => candidate.id === input.targetSeatId);
    if (!target || target.kind !== 'bot') throw new Error('Target is not a bot');
    room.seats = room.seats.filter((candidate) => candidate.id !== input.targetSeatId);
    this.save(room, 'bot_removed', { seatId: input.targetSeatId });
    return this.snapshot(room, seat.id);
  }

  transferHost(input: { roomId: string; seatId: SeatId; seatToken: string; targetSeatId: SeatId }) {
    const { room, seat } = this.authenticate(input.roomId, input.seatId, input.seatToken);
    this.assertHost(room, seat.id);
    const target = room.seats.find((candidate) => candidate.id === input.targetSeatId);
    if (!target || target.kind !== 'human') throw new Error('Target human seat not found');
    room.hostSeatId = input.targetSeatId;
    this.save(room, 'host_transferred', { from: seat.id, to: input.targetSeatId });
    return this.snapshot(room, seat.id);
  }

  swapSeats(input: { roomId: string; seatId: SeatId; seatToken: string; targetSeatId: SeatId }) {
    const { room, seat } = this.authenticate(input.roomId, input.seatId, input.seatToken);
    this.assertHost(room, seat.id);
    if (room.status !== 'lobby') throw new Error('Cannot swap seats after start');
    if (seat.id === input.targetSeatId) throw new Error('Choose another seat to swap');
    const hostIndex = room.seats.findIndex((candidate) => candidate.id === seat.id);
    const targetIndex = room.seats.findIndex((candidate) => candidate.id === input.targetSeatId);
    if (hostIndex < 0 || targetIndex < 0) throw new Error('Target seat not found');
    [room.seats[hostIndex], room.seats[targetIndex]] = [
      room.seats[targetIndex]!,
      room.seats[hostIndex]!,
    ];
    this.save(room, 'seats_swapped', {
      firstSeatId: seat.id,
      secondSeatId: input.targetSeatId,
      firstPosition: targetIndex,
      secondPosition: hostIndex,
    });
    return this.snapshot(room, seat.id);
  }

  async takeOverDisconnected(input: {
    roomId: string;
    seatId: SeatId;
    seatToken: string;
    targetSeatId: SeatId;
    ai: AiSeatConfig;
  }): Promise<RoomSnapshot> {
    const { room, seat } = this.authenticate(input.roomId, input.seatId, input.seatToken);
    this.assertHost(room, seat.id);
    const target = room.seats.find((candidate) => candidate.id === input.targetSeatId);
    if (!target || target.kind !== 'human' || target.connected || !target.disconnectedAt) {
      throw new Error('Target seat is not an eligible disconnected human');
    }
    const graceMs = Math.max(0, Number(process.env.DISCONNECT_GRACE_MS ?? 120_000));
    if (Date.now() - Date.parse(target.disconnectedAt) < graceMs) {
      throw new Error('Disconnect grace period is still active');
    }
    target.kind = 'bot';
    target.temporaryBot = true;
    target.ai = input.ai;
    const player = room.gameState?.players.find((candidate) => candidate.id === target.id);
    if (player) {
      player.kind = 'bot';
      player.ai = input.ai;
      player.disconnected = false;
    }
    this.save(room, 'temporary_bot_takeover', { seatId: target.id });
    const advanced = await this.advanceBots(room.id);
    return this.snapshot(advanced, seat.id);
  }

  async start(input: { roomId: string; seatId: SeatId; seatToken: string }): Promise<RoomSnapshot> {
    const { room, seat } = this.authenticate(input.roomId, input.seatId, input.seatToken);
    this.assertHost(room, seat.id);
    if (room.status !== 'lobby') throw new Error('Room already started');
    if (room.seats.length < 4 || room.seats.length > 6) throw new Error('Game requires 4-6 seats');
    const notReady = room.seats.filter((candidate) => candidate.kind === 'human' && !candidate.ready);
    if (notReady.length > 0) throw new Error('All human seats must be ready');
    const initialConfig: CreateGameConfig = {
      mode: 'online',
      seed: room.seed,
      seats: room.seats.map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        kind: candidate.kind,
        characterId: candidate.characterId,
        ai: candidate.kind === 'bot' ? candidate.ai : undefined,
      })),
    };
    room.initialConfig = initialConfig;
    room.gameState = createGame(initialConfig);
    room.status = 'active';
    this.save(room, 'game_started', { revision: room.gameState.revision });
    const advanced = await this.advanceBots(room.id);
    return this.snapshot(advanced, seat.id);
  }

  async applyCommand(input: { roomId: string; seatId: SeatId; seatToken: string; commandId: string; baseRevision: number; actionId: string }): Promise<RoomSnapshot> {
    const { room, seat } = this.authenticate(input.roomId, input.seatId, input.seatToken);
    const existing = this.storage.getCommand(input.roomId, input.commandId);
    if (existing) {
      const matchesOriginalCommand = existing.seatId === seat.id
        && existing.baseRevision === input.baseRevision
        && existing.actionId === input.actionId;
      if (!matchesOriginalCommand) throw new Error('Command id already used with different payload');
      if (existing.status === 'complete') {
        return existing.response as unknown as RoomSnapshot;
      }
      const advanced = await this.advanceBots(room.id);
      const recovered = this.snapshot(advanced, seat.id);
      this.storage.completeCommand(room.id, input.commandId, recovered);
      return recovered;
    }
    if (!room.gameState) throw new Error('Game has not started');
    if (room.gameState.revision !== input.baseRevision) throw new Error('Stale baseRevision');
    const action = assertActionBelongsToLegalSet(room.gameState, seat.id, input.actionId);
    room.gameState = applyAction(room.gameState, action);
    room.actionIds.push(action.id);
    if (room.gameState.outcome) room.status = 'finished';
    this.storage.putPendingCommandWithRoom({
      room: {
        id: room.id,
        code: room.code,
        status: room.status,
        hostSeatId: room.hostSeatId,
        payload: room,
      },
      commandId: input.commandId,
      seatId: seat.id,
      baseRevision: input.baseRevision,
      actionId: action.id,
      eventType: 'command_applied',
      eventPayload: {
        seatId: seat.id,
        commandId: input.commandId,
        actionId: action.id,
        revision: room.gameState.revision,
      },
    });
    const advanced = await this.advanceBots(room.id);
    const response = this.snapshot(advanced, seat.id);
    this.storage.completeCommand(room.id, input.commandId, response);
    return response;
  }

  async expireTimedOutRooms(): Promise<string[]> {
    const changedRoomIds: string[] = [];
    for (const stored of this.storage.listRooms()) {
      let room = stored.payload as RoomPayload;
      const state = room.gameState;
      if (
        room.status !== 'active' ||
        !state ||
        state.outcome ||
        !room.actionDeadlineAt ||
        Date.parse(room.actionDeadlineAt) > this.now()
      ) {
        continue;
      }
      if (room.actionDeadlineRevision !== state.revision) {
        if (this.syncActionDeadline(room)) {
          this.save(room, 'action_deadline_refreshed', { revision: state.revision });
          changedRoomIds.push(room.id);
        }
        continue;
      }

      const timedOutSeatIds = room.seats
        .filter((seat) => seat.kind === 'human' && getLegalActions(state, seat.id).length > 0)
        .map((seat) => seat.id);
      delete room.actionDeadlineAt;
      delete room.actionDeadlineRevision;
      const applied: Array<{ seatId: SeatId; actionId: string; revision: number }> = [];
      for (const seatId of timedOutSeatIds) {
        if (!room.gameState || room.gameState.outcome) break;
        const legalActions = getLegalActions(room.gameState, seatId);
        if (legalActions.length === 0) continue;
        const view = getViewForSeat(room.gameState, seatId);
        const action = chooseHeuristicAction(room.gameState, view, seatId).action;
        room.gameState = applyAction(room.gameState, action);
        room.actionIds.push(action.id);
        applied.push({ seatId, actionId: action.id, revision: room.gameState.revision });
        const seat = room.seats.find((candidate) => candidate.id === seatId);
        room.chat.push({
          id: newId('chat'),
          seatId: 'system',
          name: '系统',
          message: `${seat?.name ?? seatId} 未在时限内响应，已自动执行安全默认动作。`,
          createdAt: new Date(this.now()).toISOString(),
          round: room.gameState.round,
        });
      }
      room.chat = room.chat.slice(-100);
      if (room.gameState?.outcome) room.status = 'finished';
      if (applied.length > 0) {
        this.save(room, 'action_timeout_applied', {
          deadlineRevision: state.revision,
          actions: applied,
        });
        room = await this.advanceBots(room.id);
        changedRoomIds.push(room.id);
      } else if (this.syncActionDeadline(room)) {
        this.save(room, 'action_deadline_refreshed', {
          revision: room.gameState?.revision,
          reason: 'no_eligible_human_action',
        });
        changedRoomIds.push(room.id);
      }
    }
    return changedRoomIds;
  }

  chat(input: { roomId: string; seatId: SeatId; seatToken: string; message: string }) {
    const { room, seat } = this.authenticate(input.roomId, input.seatId, input.seatToken);
    const now = Date.now();
    const recent = room.chat.filter((entry) => entry.seatId === seat.id && now - Date.parse(entry.createdAt) < 10_000);
    if (recent.length >= 5) throw new Error('Chat rate limit exceeded');
    const entry = {
      id: newId('chat'),
      seatId: seat.id,
      name: seat.name,
      message: input.message.replace(/\s+/g, ' '),
      createdAt: new Date(now).toISOString(),
      round: room.gameState?.round ?? 0,
    };
    room.chat.push(entry);
    room.chat = room.chat.slice(-100);
    this.save(room, 'chat_sent', { seatId: seat.id });
    return entry;
  }

  snapshot(room: RoomPayload, seatId: SeatId | null): RoomSnapshot {
    return {
      room: toPublicRoom(room),
      view: room.gameState ? getViewForSeat(room.gameState, seatId) : null,
      stateHash: room.gameState ? hashGameState(room.gameState) : null,
    };
  }

  publicSnapshot(roomId: string, auth?: { seatId: SeatId; seatToken: string }): RoomSnapshot {
    if (auth) {
      const { room, seat } = this.authenticate(roomId, auth.seatId, auth.seatToken);
      return this.snapshot(room, seat.id);
    }
    return this.snapshot(this.getRoom(roomId), null);
  }

  listSaves(input: { roomId: string; seatId: SeatId; seatToken: string }) {
    const { room, seat } = this.authenticate(input.roomId, input.seatId, input.seatToken);
    this.assertHost(room, seat.id);
    return this.storage.listSaves(room.id);
  }

  createSave(input: { name: string; roomId: string; seatId: SeatId; seatToken: string }) {
    const { room, seat } = this.authenticate(input.roomId, input.seatId, input.seatToken);
    this.assertHost(room, seat.id);
    return this.storage.createSave({
      name: input.name,
      roomId: room.id,
      payload: { schemaVersion: 1, room },
    });
  }

  updateSave(saveId: string, input: { name: string; roomId: string; seatId: SeatId; seatToken: string }) {
    const { room, seat } = this.authenticate(input.roomId, input.seatId, input.seatToken);
    this.assertHost(room, seat.id);
    this.assertSaveBelongsToRoom(saveId, room.id);
    return this.storage.updateSave(saveId, {
      name: input.name,
      roomId: room.id,
      payload: { schemaVersion: 1, room },
    });
  }

  deleteSave(saveId: string, input: { roomId: string; seatId: SeatId; seatToken: string }): void {
    const { room, seat } = this.authenticate(input.roomId, input.seatId, input.seatToken);
    this.assertHost(room, seat.id);
    this.assertSaveBelongsToRoom(saveId, room.id);
    this.storage.deleteSave(saveId);
  }

  private assertSaveBelongsToRoom(saveId: string, roomId: string): void {
    const save = this.storage.getSave(saveId);
    if (!save || save.roomId !== roomId) throw new Error('Save not found');
  }

  private assertHost(room: RoomPayload, seatId: SeatId): void {
    if (room.hostSeatId !== seatId) throw new Error('Host permission required');
  }

  private markPersistedHumansDisconnected(): void {
    const disconnectedAt = new Date(this.now()).toISOString();
    for (const stored of this.storage.listRooms()) {
      const room = stored.payload as RoomPayload;
      const restored = room.gameState
        ? restorePersistedGameState(room)
        : { state: null, repairedCharacters: false };
      room.gameState = restored.state;
      const humanSeatIds: SeatId[] = [];
      for (const seat of room.seats) {
        if (seat.kind !== 'human') continue;
        seat.connected = false;
        seat.disconnectedAt = disconnectedAt;
        seat.tokenExpiresAt ??= this.newTokenExpiry();
        const player = room.gameState?.players.find((candidate) => candidate.id === seat.id);
        if (player) player.disconnected = true;
        humanSeatIds.push(seat.id);
      }
      const deadlineChanged = this.syncActionDeadline(room);
      if (humanSeatIds.length === 0 && !deadlineChanged && !restored.repairedCharacters) continue;
      this.storage.upsertRoom({
        id: room.id,
        code: room.code,
        status: room.status,
        hostSeatId: room.hostSeatId,
        payload: room,
      });
      this.storage.appendEvent(room.id, 'server_restart_disconnected', {
        seatIds: humanSeatIds,
        actionDeadlineAt: room.actionDeadlineAt,
        repairedCharacters: restored.repairedCharacters,
      });
    }
  }

  private save(room: RoomPayload, eventType: string, eventPayload: unknown): void {
    this.storage.upsertRoom({
      id: room.id,
      code: room.code,
      status: room.status,
      hostSeatId: room.hostSeatId,
      payload: room,
    });
    this.storage.appendEvent(room.id, eventType, eventPayload);
  }

  private newTokenExpiry(): string {
    return new Date(this.now() + this.sessionTokenTtlMs).toISOString();
  }

  private async advanceBots(roomId: string): Promise<RoomPayload> {
    const previous = this.botQueues.get(roomId) ?? Promise.resolve(this.getRoom(roomId));
    const queued = previous
      .catch(() => this.getRoom(roomId))
      .then(() => this.runBotLoop(roomId))
      .then((room) => {
        if (this.syncActionDeadline(room)) {
          this.save(room, 'action_deadline_updated', {
            revision: room.gameState?.revision,
            actionDeadlineAt: room.actionDeadlineAt,
          });
        }
        return room;
      })
      .finally(() => {
        if (this.botQueues.get(roomId) === queued) this.botQueues.delete(roomId);
      });
    this.botQueues.set(roomId, queued);
    return queued;
  }

  private syncActionDeadline(room: RoomPayload): boolean {
    const state = room.gameState;
    const hasPendingHumanAction = room.status === 'active'
      && state !== null
      && !state.outcome
      && room.seats.some(
        (seat) => seat.kind === 'human' && getLegalActions(state, seat.id).length > 0,
      );
    if (!hasPendingHumanAction) {
      const changed = room.actionDeadlineAt !== undefined || room.actionDeadlineRevision !== undefined;
      delete room.actionDeadlineAt;
      delete room.actionDeadlineRevision;
      return changed;
    }
    if (
      room.actionDeadlineRevision === state.revision &&
      room.actionDeadlineAt !== undefined
    ) {
      return false;
    }
    room.actionDeadlineRevision = state.revision;
    room.actionDeadlineAt = new Date(this.now() + this.actionTimeoutMs).toISOString();
    return true;
  }

  private async runBotLoop(roomId: string): Promise<RoomPayload> {
    let room = this.getRoom(roomId);
    for (let steps = 0; steps < 250; steps += 1) {
      if (room.status !== 'active' || !room.gameState || room.gameState.outcome) return room;
      const bot = room.seats.find((seat) => seat.kind === 'bot' && getLegalActions(room.gameState!, seat.id).length > 0);
      if (!bot) return room;
      const state = room.gameState;
      const view = getViewForSeat(state, bot.id);
      const legalActions = getLegalActions(state, bot.id);
      const heuristic = chooseHeuristicAction(state, view, bot.id);
      let actionId = heuristic.action.id;
      const configuredProvider = bot.ai?.provider ?? 'local-bot';
      let usedProvider: AiSeatConfig['provider'] = 'local-bot';
      let usedFallback = false;
      let usedModel = 'heuristic-v1';
      let requestedModel = 'heuristic-v1';
      let latencyMs = 0;
      let retryCount = 0;
      let requestMode: 'tool' | 'json' | 'local' = 'local';
      let tokenUsage: { promptTokens?: number; completionTokens?: number; totalTokens?: number } | undefined;
      if (bot.ai?.provider && bot.ai.provider !== 'local-bot') {
        const ai = await chooseAiMove({
          seatConfig: bot.ai,
          view,
          legalActions,
          rulesDigest: '只能选择服务端提供的合法动作；目标是在保住仙台的同时争取飞升席位。',
        });
        usedProvider = ai.provider;
        usedFallback = ai.usedFallback;
        usedModel = ai.model;
        requestedModel = ai.requestedModel;
        latencyMs = ai.latencyMs;
        retryCount = ai.retryCount;
        requestMode = ai.requestMode;
        tokenUsage = ai.tokenUsage;
        if (!ai.usedFallback && legalActions.some((action) => action.id === ai.actionId)) {
          actionId = ai.actionId;
        }
      }
      const action = legalActions.find((candidate) => candidate.id === actionId) ?? heuristic.action;
      room.gameState = applyAction(state, action);
      room.actionIds.push(action.id);
      room.chat.push({
        id: newId('chat'),
        seatId: bot.id,
        name: bot.name,
        message: [
          publicBotMessage(action, heuristic.publicSpeech),
          usedFallback ? '（外部 Provider 不可用，本步由本地 Bot 接管。）' : '',
        ].filter(Boolean).join(' '),
        createdAt: new Date().toISOString(),
        round: room.gameState.round,
      });
      room.chat = room.chat.slice(-100);
      if (room.gameState.outcome) room.status = 'finished';
      this.log({
        event: 'ai_decision',
        roomId: room.id,
        turnId: `${room.id}:${state.revision}:${bot.id}`,
        seatId: bot.id,
        actionId: action.id,
        configuredProvider,
        provider: usedProvider,
        model: usedModel,
        requestedModel,
        latencyMs,
        retryCount,
        requestMode,
        tokenUsage,
        usedFallback,
      });
      this.save(room, 'ai_command_applied', {
        seatId: bot.id,
        actionId: action.id,
        revision: room.gameState.revision,
        configuredProvider,
        usedProvider,
        model: usedModel,
        requestedModel,
        latencyMs,
        retryCount,
        requestMode,
        tokenUsage,
        usedFallback,
      });
      room = this.getRoom(roomId);
    }
    this.storage.appendEvent(room.id, 'ai_loop_stopped', { reason: 'step_limit' });
    return room;
  }
}
