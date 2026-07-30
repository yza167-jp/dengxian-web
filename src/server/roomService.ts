import { applyAction, assertActionBelongsToLegalSet, createGame, getLegalActions } from '../shared/game/engine';
import { chooseHeuristicAction } from '../shared/game/bot';
import { hashGameState } from '../shared/game/replay';
import { getViewForSeat } from '../shared/game/view';
import type { AiSeatConfig, CreateGameConfig, GameState, GameView, PlayerKind, SeatId } from '../shared/game/types';
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
  ai?: AiSeatConfig;
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
  chat: Array<{ id: string; seatId: SeatId; name: string; message: string; createdAt: string }>;
}

export interface SeatAuth {
  room: RoomPayload;
  seat: RoomSeat;
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

  constructor(private readonly storage: ServerStorage) {}

  createRoom(input: { hostName: string; maxSeats: number; seed: number }) {
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
    });
    this.save(room, 'seat_joined', { seatId });
    return { room: toPublicRoom(room), seatId, seatToken: token };
  }

  authenticate(roomId: string, seatId: SeatId, token: string): SeatAuth {
    const room = this.getRoom(roomId);
    const seat = room.seats.find((candidate) => candidate.id === seatId);
    if (!seat || seat.tokenHash !== sha256(token)) throw new Error('Invalid seat token');
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
      return existing.response as unknown as RoomSnapshot;
    }
    if (!room.gameState) throw new Error('Game has not started');
    if (room.gameState.revision !== input.baseRevision) throw new Error('Stale baseRevision');
    const action = assertActionBelongsToLegalSet(room.gameState, seat.id, input.actionId);
    room.gameState = applyAction(room.gameState, action);
    room.actionIds.push(action.id);
    if (room.gameState.outcome) room.status = 'finished';
    this.save(room, 'command_applied', { seatId: seat.id, commandId: input.commandId, actionId: action.id, revision: room.gameState.revision });
    const advanced = await this.advanceBots(room.id);
    const response = this.snapshot(advanced, seat.id);
    this.storage.putCommand({
      roomId: room.id,
      commandId: input.commandId,
      seatId: seat.id,
      baseRevision: input.baseRevision,
      actionId: action.id,
      response,
    });
    return response;
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

  private async advanceBots(roomId: string): Promise<RoomPayload> {
    const previous = this.botQueues.get(roomId) ?? Promise.resolve(this.getRoom(roomId));
    const queued = previous
      .catch(() => this.getRoom(roomId))
      .then(() => this.runBotLoop(roomId))
      .finally(() => {
        if (this.botQueues.get(roomId) === queued) this.botQueues.delete(roomId);
      });
    this.botQueues.set(roomId, queued);
    return queued;
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
      let reasoning = heuristic.publicRationale;
      if (bot.ai?.provider && bot.ai.provider !== 'local-bot') {
        const ai = await chooseAiMove({
          seatConfig: bot.ai,
          view,
          legalActions,
          rulesDigest: '只能选择服务端提供的合法动作；目标是在保住仙台的同时争取飞升席位。',
        });
        if (!ai.usedFallback && legalActions.some((action) => action.id === ai.actionId)) {
          actionId = ai.actionId;
          reasoning = ai.reasoning;
        }
      }
      const action = legalActions.find((candidate) => candidate.id === actionId) ?? heuristic.action;
      room.gameState = applyAction(state, action);
      room.actionIds.push(action.id);
      room.chat.push({
        id: newId('chat'),
        seatId: bot.id,
        name: bot.name,
        message: reasoning.replace(/\s+/g, ' ').slice(0, 240),
        createdAt: new Date().toISOString(),
      });
      room.chat = room.chat.slice(-100);
      if (room.gameState.outcome) room.status = 'finished';
      this.save(room, 'ai_command_applied', {
        seatId: bot.id,
        actionId: action.id,
        revision: room.gameState.revision,
        usedProvider: bot.ai?.provider ?? 'local-bot',
      });
      room = this.getRoom(roomId);
    }
    this.storage.appendEvent(room.id, 'ai_loop_stopped', { reason: 'step_limit' });
    return room;
  }
}
