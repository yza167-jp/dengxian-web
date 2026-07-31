/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import request from 'supertest';
import { io as clientIo, type Socket } from 'socket.io-client';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { publicBotMessage } from '../../src/shared/game/bot';
import { createApp } from '../../src/server/index';
import { RoomService } from '../../src/server/roomService';
import { ServerStorage } from '../../src/server/storage';

let app: ReturnType<typeof createApp>;

beforeEach(() => {
  app = createApp({ storage: new ServerStorage(':memory:') });
});

afterEach(() => {
  void app.io.close();
  void app.server.close();
  app.services.storage.close();
});

async function createStartedRoom() {
  const created = await request(app.app).post('/api/rooms').send({ hostName: '甲', maxSeats: 4, seed: 1234 }).expect(201);
  const host = created.body as any;
  const seats = [host];
  for (let index = 0; index < 3; index += 1) {
    const joined = await request(app.app).post('/api/rooms/join').send({
      roomId: host.room.id,
      name: `乙${index + 1}`,
    }).expect(200);
    seats.push(joined.body);
  }
  for (const seat of seats) {
    await request(app.app).post('/api/rooms/ready').send({
      roomId: host.room.id,
      seatId: seat.seatId,
      seatToken: seat.seatToken,
      ready: true,
    }).expect(200);
  }
  const started = await request(app.app).post('/api/rooms/start').send({
    roomId: host.room.id,
    seatId: host.seatId,
    seatToken: host.seatToken,
  }).expect(200);
  const actor = seats.map((seat) => ({
    ...seat,
    snapshot: app.services.rooms.snapshot(app.services.rooms.getRoom(host.room.id), seat.seatId),
  })).find((seat) => seat.snapshot.view?.legalActions.length);
  if (!actor) throw new Error('No legal actor after start');
  return { host, seats, actor, started: started.body as any };
}

function collectStringValues(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(collectStringValues);
  if (value && typeof value === 'object') return Object.values(value).flatMap(collectStringValues);
  return [];
}

describe('server http contracts', () => {
  it('reports health and redacts provider secrets', async () => {
    const health = await request(app.app).get('/api/health').expect(200);
    expect(health.body.ok).toBe(true);
    const providers = await request(app.app).get('/api/providers').expect(200);
    expect(JSON.stringify(providers.body)).not.toContain('API_KEY');
    expect(providers.body.providers.some((provider: any) => provider.id === 'local-bot')).toBe(true);
  });

  it('manages token-scoped persistent bots and records public conversation growth', async () => {
    const managerToken = 'm'.repeat(64);
    const otherToken = 'n'.repeat(64);
    const presets = await request(app.app).get('/api/bots/presets').expect(200);
    expect(presets.body.presets).toHaveLength(16);

    const createdBot = await request(app.app)
      .post('/api/bots')
      .set('x-bot-manager-token', managerToken)
      .send({ presetId: 'archive-sage' })
      .expect(201);
    expect(createdBot.body.profile.name).toBe('藏经老修');
    expect(JSON.stringify(createdBot.body)).not.toContain(managerToken);

    const ownList = await request(app.app)
      .get('/api/bots')
      .set('x-bot-manager-token', managerToken)
      .expect(200);
    expect(ownList.body.profiles).toHaveLength(1);
    const otherList = await request(app.app)
      .get('/api/bots')
      .set('x-bot-manager-token', otherToken)
      .expect(200);
    expect(otherList.body.profiles).toHaveLength(0);

    const room = await request(app.app).post('/api/rooms').send({
      hostName: '甲',
      maxSeats: 4,
      seed: 901,
    }).expect(201);
    await request(app.app).post('/api/rooms/add-bot').send({
      roomId: room.body.room.id,
      seatId: room.body.seatId,
      seatToken: room.body.seatToken,
      name: '不能覆盖长期名',
      ai: {
        provider: 'local-bot',
        difficulty: 'normal',
        persona: 'steady',
        botProfileId: createdBot.body.profile.id,
      },
      botManagerToken: managerToken,
    }).expect(200);

    const conversation = await app.services.rooms.chat({
      roomId: room.body.room.id,
      seatId: room.body.seatId,
      seatToken: room.body.seatToken,
      message: '这一轮谁愿意和我一起修台？',
    });
    expect(conversation.replies).toHaveLength(1);
    expect(conversation.replies[0]!.name).toBe('藏经老修');

    const dashboard = await request(app.app)
      .get(`/api/bots/${createdBot.body.profile.id}/dashboard`)
      .set('x-bot-manager-token', managerToken)
      .expect(200);
    expect(dashboard.body.growth.messages).toBe(1);
    expect(dashboard.body.memories[0].content).toContain('一起修台');
    expect(JSON.stringify(dashboard.body)).not.toContain('manager_token');
  });

  it('creates lobby rooms with one-time tokens but no persisted token hashes in responses', async () => {
    const response = await request(app.app).post('/api/rooms').send({ hostName: '甲', maxSeats: 4, seed: 7 }).expect(201);
    expect(response.body.seatToken).toHaveLength(32);
    expect(JSON.stringify(response.body.room)).not.toContain('tokenHash');
    expect(response.body.room.status).toBe('lobby');
    const withBot = await request(app.app).post('/api/rooms/add-bot').send({
      roomId: response.body.room.id,
      seatId: response.body.seatId,
      seatToken: response.body.seatToken,
      name: '私房 AI',
      ai: { provider: 'deepseek', difficulty: 'normal', persona: 'steady' },
    }).expect(200);
    expect(withBot.body.room.seats).toHaveLength(2);
  });

  it('starts a game, returns seat-redacted views, and makes commands idempotent', async () => {
    const { host, actor } = await createStartedRoom();
    expect(actor.snapshot.view!.self!.hand).toBeDefined();
    expect(actor.snapshot.view!.players[1].hand).toBeUndefined();
    expect(actor.snapshot.view!.players[1].handCount).toBeTypeOf('number');
    const action = actor.snapshot.view!.legalActions[0]!;
    const command = {
      roomId: host.room.id,
      seatId: actor.seatId,
      seatToken: actor.seatToken,
      commandId: 'cmd-1',
      baseRevision: actor.snapshot.view!.revision,
      actionId: action.id,
    };
    const first = await request(app.app).post('/api/rooms/command').send(command).expect(200);
    const second = await request(app.app).post('/api/rooms/command').send(command).expect(200);
    expect(second.body.stateHash).toBe(first.body.stateHash);
    expect(second.body.view.revision).toBe(first.body.view.revision);

    const invalidToken = await request(app.app).post('/api/rooms/command').send({
      ...command,
      seatToken: 'x'.repeat(32),
    }).expect(422);
    expect(JSON.stringify(invalidToken.body)).not.toContain(actor.snapshot.view!.self!.fateId);
    expect(invalidToken.body).not.toHaveProperty('view');

    await request(app.app).post('/api/rooms/command').send({
      ...command,
      actionId: 'forged-action-id',
    }).expect(422, { error: 'Command id already used with different payload' });
  });

  it('recovers a pending command without applying its action twice', async () => {
    const { host, actor } = await createStartedRoom();
    const action = actor.snapshot.view!.legalActions[0]!;
    const command = {
      roomId: host.room.id,
      seatId: actor.seatId,
      seatToken: actor.seatToken,
      commandId: 'cmd-pending-recovery',
      baseRevision: actor.snapshot.view!.revision,
      actionId: action.id,
    };
    const complete = vi
      .spyOn(app.services.storage, 'completeCommand')
      .mockImplementationOnce(() => {
        throw new Error('simulated crash before command completion');
      });

    await expect(app.services.rooms.applyCommand(command)).rejects.toThrow(/simulated crash/);
    const revisionAfterCrash = app.services.rooms.getRoom(host.room.id).gameState!.revision;
    expect(app.services.storage.getCommand(host.room.id, command.commandId)?.status).toBe('pending');

    const recovered = await app.services.rooms.applyCommand(command);

    expect(recovered.view!.revision).toBe(revisionAfterCrash);
    expect(app.services.storage.getCommand(host.room.id, command.commandId)?.status).toBe('complete');
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it('expires seat tokens at the configured server-side TTL', () => {
    const storage = new ServerStorage(':memory:');
    let now = Date.parse('2026-07-31T00:00:00.000Z');
    const rooms = new RoomService(storage, {
      now: () => now,
      sessionTokenTtlDays: 1,
    });
    try {
      const host = rooms.createRoom({ hostName: '甲', maxSeats: 4, seed: 403 });
      expect(() => rooms.authenticate(host.room.id, host.seatId, host.seatToken)).not.toThrow();
      now += 24 * 60 * 60 * 1_000;
      expect(() => rooms.authenticate(host.room.id, host.seatId, host.seatToken)).toThrow(/expired/);
      expect(JSON.stringify(host.room)).not.toContain('tokenExpiresAt');
    } finally {
      storage.close();
    }
  });

  it('persists action deadlines and applies a safe action after timeout', async () => {
    const storage = new ServerStorage(':memory:');
    let now = Date.parse('2026-07-31T00:00:00.000Z');
    const rooms = new RoomService(storage, {
      now: () => now,
      actionTimeoutMs: 1_000,
    });
    try {
      const host = rooms.createRoom({ hostName: '甲', maxSeats: 4, seed: 404 });
      const seats = [
        host,
        rooms.join({ roomId: host.room.id, name: '乙' }),
        rooms.join({ roomId: host.room.id, name: '丙' }),
        rooms.join({ roomId: host.room.id, name: '丁' }),
      ];
      for (const seat of seats) {
        rooms.ready({
          roomId: host.room.id,
          seatId: seat.seatId,
          seatToken: seat.seatToken,
          ready: true,
        });
      }
      const started = await rooms.start({
        roomId: host.room.id,
        seatId: host.seatId,
        seatToken: host.seatToken,
      });
      const startingRevision = started.view!.revision;
      expect(started.room.actionDeadlineAt).toBe(new Date(now + 1_000).toISOString());

      now += 1_001;
      await expect(rooms.expireTimedOutRooms()).resolves.toEqual([host.room.id]);

      const after = rooms.getRoom(host.room.id);
      expect(after.gameState!.revision).toBeGreaterThan(startingRevision);
      expect(after.actionDeadlineRevision).toBe(after.gameState!.revision);
      expect(Date.parse(after.actionDeadlineAt!)).toBeGreaterThan(now);
      expect(after.chat.at(-1)).toMatchObject({
        seatId: 'system',
        name: '系统',
      });
      expect(storage.listEvents(host.room.id).some((event) => event.type === 'action_timeout_applied')).toBe(true);
    } finally {
      storage.close();
    }
  });

  it('reuses vacant seat ids without creating duplicate players', async () => {
    const created = await request(app.app).post('/api/rooms').send({
      hostName: '甲',
      maxSeats: 4,
      seed: 77,
      characterId: 'R07',
    }).expect(201);
    const host = created.body as any;
    const addBot = (name: string) => app.services.rooms.addBot({
      roomId: host.room.id,
      seatId: host.seatId,
      seatToken: host.seatToken,
      name,
      ai: { provider: 'local-bot', difficulty: 'normal', persona: 'steady' },
    });
    addBot('乙');
    addBot('丙');
    addBot('丁');
    app.services.rooms.removeBot({
      roomId: host.room.id,
      seatId: host.seatId,
      seatToken: host.seatToken,
      targetSeatId: 'seat-2',
    });
    const refilled = addBot('戊');
    const ids = refilled.room.seats.map((seat: any) => seat.id);
    expect(ids).toHaveLength(new Set(ids).size);
    expect(ids).toContain('seat-2');

    app.services.rooms.ready({
      roomId: host.room.id,
      seatId: host.seatId,
      seatToken: host.seatToken,
      ready: true,
    });
    const started = await app.services.rooms.start({
      roomId: host.room.id,
      seatId: host.seatId,
      seatToken: host.seatToken,
    });
    expect(started.view?.players.map((player) => player.id).sort()).toEqual(['seat-1', 'seat-2', 'seat-3', 'seat-4']);
    expect(started.view?.players.find((player) => player.id === host.seatId)?.characterId).toBe('R07');
  });

  it('starts a six-seat online room with two humans and four bots', async () => {
    const rooms = app.services.rooms;
    const host = rooms.createRoom({ hostName: '甲', maxSeats: 6, seed: 79 });
    const guest = rooms.join({ roomId: host.room.id, name: '乙' });
    for (let index = 0; index < 4; index += 1) {
      rooms.addBot({
        roomId: host.room.id,
        seatId: host.seatId,
        seatToken: host.seatToken,
        name: `Bot ${index + 1}`,
        ai: { provider: 'local-bot', difficulty: 'normal', persona: 'steady' },
      });
    }
    for (const human of [host, guest]) {
      rooms.ready({
        roomId: host.room.id,
        seatId: human.seatId,
        seatToken: human.seatToken,
        ready: true,
      });
    }

    const started = await rooms.start({
      roomId: host.room.id,
      seatId: host.seatId,
      seatToken: host.seatToken,
    });
    expect(started.room.seats).toHaveLength(6);
    expect(started.view?.players).toHaveLength(6);
    expect(new Set(started.view?.players.map((player) => player.characterId)).size).toBe(6);

    const guestSnapshot = await request(app.app)
      .get(`/api/rooms/${host.room.id}`)
      .query({ seatId: guest.seatId, seatToken: guest.seatToken })
      .expect(200);
    expect(guestSnapshot.body.view.seatId).toBe(guest.seatId);
    expect(guestSnapshot.body.view.players).toHaveLength(6);
  });

  it('lets the host swap lobby order without invalidating either seat token', () => {
    const host = app.services.rooms.createRoom({ hostName: '甲', maxSeats: 4, seed: 78 });
    const guest = app.services.rooms.join({ roomId: host.room.id, name: '乙' });

    const swapped = app.services.rooms.swapSeats({
      roomId: host.room.id,
      seatId: host.seatId,
      seatToken: host.seatToken,
      targetSeatId: guest.seatId,
    });

    expect(swapped.room.seats.map((seat) => seat.name)).toEqual(['乙', '甲']);
    expect(app.services.rooms.reconnect({
      roomId: host.room.id,
      seatId: guest.seatId,
      seatToken: guest.seatToken,
    }).room.seats[0]?.name).toBe('乙');
    expect(() => app.services.rooms.swapSeats({
      roomId: host.room.id,
      seatId: guest.seatId,
      seatToken: guest.seatToken,
      targetSeatId: host.seatId,
    })).toThrow(/Host permission/);
  });

  it('never serializes canonical room state or another seat private cards in public snapshots', async () => {
    const { host, seats } = await createStartedRoom();
    const fullRoom = app.services.rooms.getRoom(host.room.id);
    const seatA = seats[0];
    const seatB = seats[1];
    const playerB = fullRoom.gameState!.players.find((player) => player.id === seatB.seatId)!;
    const snapshot = await request(app.app)
      .get(`/api/rooms/${host.room.id}`)
      .query({ seatId: seatA.seatId, seatToken: seatA.seatToken })
      .expect(200);
    const publicRoomJson = JSON.stringify(snapshot.body.room);
    expect(publicRoomJson).not.toContain('gameState');
    expect(publicRoomJson).not.toContain('initialConfig');
    expect(publicRoomJson).not.toContain('actionIds');
    expect(publicRoomJson).not.toContain('tokenHash');
    for (const seat of snapshot.body.room.seats) {
      expect(seat).not.toHaveProperty('ai');
    }
    const stringValues = collectStringValues(snapshot.body);
    expect(stringValues).not.toContain(playerB.fateId);
    for (const cardId of playerB.hand) expect(stringValues).not.toContain(cardId);
    expect(snapshot.body.view.players.find((player: any) => player.id === seatB.seatId).revealedPlan).toBeNull();
    expect(snapshot.body.view.self.fateId).not.toBe(playerB.fateId);
  });

  it('auto-runs bot seats after accepted human commands without leaking raw AI internals', async () => {
    const created = await request(app.app).post('/api/rooms').send({ hostName: '甲', maxSeats: 4, seed: 1234 }).expect(201);
    const host = created.body;
    for (let index = 0; index < 3; index += 1) {
      app.services.rooms.addBot({
        roomId: host.room.id,
        seatId: host.seatId,
        seatToken: host.seatToken,
        name: `Bot ${index + 1}`,
        ai: { provider: 'local-bot', difficulty: 'normal', persona: 'steady' },
      });
    }
    await request(app.app).post('/api/rooms/ready').send({
      roomId: host.room.id,
      seatId: host.seatId,
      seatToken: host.seatToken,
      ready: true,
    }).expect(200);
    const started = await request(app.app).post('/api/rooms/start').send({
      roomId: host.room.id,
      seatId: host.seatId,
      seatToken: host.seatToken,
    }).expect(200);
    const action = started.body.view.legalActions[0];
    const afterHuman = await request(app.app).post('/api/rooms/command').send({
      roomId: host.room.id,
      seatId: host.seatId,
      seatToken: host.seatToken,
      commandId: 'host-command-1',
      baseRevision: started.body.view.revision,
      actionId: action.id,
    }).expect(200);
    expect(afterHuman.body.view.revision).toBeGreaterThan(started.body.view.revision + 1);
    expect(JSON.stringify(afterHuman.body)).not.toContain('reasoning_content');
    const botChat = afterHuman.body.room.chat.filter((entry: any) => entry.seatId.startsWith('seat-'));
    expect(botChat.length).toBeLessThanOrEqual(3);
    expect(botChat.some((entry: any) => /私下选择|本轮密议|我选择了/.test(entry.message))).toBe(false);
  });

  it('emits bounded structured AI diagnostics without prompts or reasoning', async () => {
    const storage = new ServerStorage(':memory:');
    const logs: Array<Record<string, unknown>> = [];
    const rooms = new RoomService(storage, { log: (event) => logs.push(event) });
    try {
      const host = rooms.createRoom({ hostName: '甲', maxSeats: 4, seed: 1235 });
      for (let index = 0; index < 3; index += 1) {
        rooms.addBot({
          roomId: host.room.id,
          seatId: host.seatId,
          seatToken: host.seatToken,
          name: `Bot ${index + 1}`,
          ai: { provider: 'local-bot', difficulty: 'normal', persona: 'steady' },
        });
      }
      rooms.ready({
        roomId: host.room.id,
        seatId: host.seatId,
        seatToken: host.seatToken,
        ready: true,
      });
      let snapshot = await rooms.start({
        roomId: host.room.id,
        seatId: host.seatId,
        seatToken: host.seatToken,
      });
      for (let index = 0; logs.length === 0 && index < 6; index += 1) {
        const action = snapshot.view?.legalActions[0];
        if (!action) break;
        snapshot = await rooms.applyCommand({
          roomId: host.room.id,
          seatId: host.seatId,
          seatToken: host.seatToken,
          commandId: `diagnostic-command-${index}`,
          baseRevision: snapshot.view!.revision,
          actionId: action.id,
        });
      }

      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0]).toMatchObject({
        event: 'ai_decision',
        roomId: host.room.id,
        provider: 'local-bot',
        model: 'heuristic-v1',
        retryCount: 0,
        requestMode: 'local',
        usedFallback: false,
      });
      const encoded = JSON.stringify(logs);
      expect(encoded).not.toContain('reasoning');
      expect(encoded).not.toContain('prompt');
      expect(encoded).not.toContain('API_KEY');
    } finally {
      storage.close();
    }
  });

  it('persists host-scoped saves without exposing canonical payloads', async () => {
    const { host } = await createStartedRoom();
    const auth = { roomId: host.room.id, seatId: host.seatId, seatToken: host.seatToken };
    const saved = await request(app.app).post('/api/saves').send({ name: '测试存档', ...auth }).expect(201);
    await request(app.app).get(`/api/saves/${saved.body.id}/export`).expect(404);
    await request(app.app).get('/api/saves').expect(400);
    const updated = await request(app.app).put(`/api/saves/${saved.body.id}`).send({ name: '覆盖存档', ...auth }).expect(200);
    expect(updated.body.name).toBe('覆盖存档');
    const list = await request(app.app).get('/api/saves').query(auth).expect(200);
    expect(list.body.saves.length).toBe(1);
    expect(list.body.saves[0]).not.toHaveProperty('payload');
    expect(JSON.stringify(list.body)).not.toContain('tokenHash');
    expect(JSON.stringify(list.body)).not.toContain('gameState');
    await request(app.app).delete(`/api/saves/${saved.body.id}`).send(auth).expect(204);
  });

  it('restores an active room and authenticated seat after a SQLite-backed restart', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dengxian-restart-'));
    const database = join(directory, 'game.sqlite');
    let first: ReturnType<typeof createApp> | null = null;
    let second: ReturnType<typeof createApp> | null = null;
    try {
      first = createApp({ storage: new ServerStorage(database) });
      const created = first.services.rooms.createRoom({ hostName: '重启房主', maxSeats: 4, seed: 90210 });
      for (let index = 0; index < 3; index += 1) {
        first.services.rooms.addBot({
          roomId: created.room.id,
          seatId: created.seatId,
          seatToken: created.seatToken,
          name: `恢复 Bot ${index + 1}`,
          ai: { provider: 'local-bot', difficulty: 'normal', persona: 'steady' },
        });
      }
      first.services.rooms.ready({
        roomId: created.room.id,
        seatId: created.seatId,
        seatToken: created.seatToken,
        ready: true,
      });
      const started = await first.services.rooms.start({
        roomId: created.room.id,
        seatId: created.seatId,
        seatToken: created.seatToken,
      });
      const revision = started.view!.revision;
      first.services.storage.close();
      first = null;

      second = createApp({ storage: new ServerStorage(database) });
      const beforeReconnect = second.services.rooms.getRoom(created.room.id);
      const persistedHost = beforeReconnect.seats.find((seat) => seat.id === created.seatId)!;
      expect(persistedHost.connected).toBe(false);
      expect(persistedHost.disconnectedAt).toBeTruthy();
      expect(beforeReconnect.gameState?.players.find((player) => player.id === created.seatId)?.disconnected).toBe(true);
      const restored = second.services.rooms.reconnect({
        roomId: created.room.id,
        seatId: created.seatId,
        seatToken: created.seatToken,
      });
      expect(restored.room.status).toBe('active');
      expect(restored.view?.revision).toBe(revision);
      expect(restored.view?.seatId).toBe(created.seatId);
      expect(JSON.stringify(restored.room)).not.toContain('tokenHash');
    } finally {
      if (first) first.services.storage.close();
      if (second) second.services.storage.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('repairs duplicate characters from pre-uniqueness persisted rooms on restart', async () => {
    const storage = new ServerStorage(':memory:');
    try {
      const rooms = new RoomService(storage);
      const created = rooms.createRoom({ hostName: '旧房主', maxSeats: 4, seed: 90211 });
      for (let index = 0; index < 3; index += 1) {
        rooms.addBot({
          roomId: created.room.id,
          seatId: created.seatId,
          seatToken: created.seatToken,
          name: `旧 Bot ${index + 1}`,
          ai: { provider: 'local-bot', difficulty: 'normal', persona: 'steady' },
        });
      }
      rooms.ready({
        roomId: created.room.id,
        seatId: created.seatId,
        seatToken: created.seatToken,
        ready: true,
      });
      await rooms.start({
        roomId: created.room.id,
        seatId: created.seatId,
        seatToken: created.seatToken,
      });

      const legacy = rooms.getRoom(created.room.id);
      const duplicateCharacter = legacy.gameState!.players[0]!.characterId;
      legacy.gameState!.players[1]!.characterId = duplicateCharacter;
      legacy.seats[1]!.characterId = duplicateCharacter;
      legacy.initialConfig!.seats[1]!.characterId = duplicateCharacter;
      storage.upsertRoom({
        id: legacy.id,
        code: legacy.code,
        status: legacy.status,
        hostSeatId: legacy.hostSeatId,
        payload: legacy,
      });

      const restarted = new RoomService(storage);
      const repaired = restarted.getRoom(created.room.id);
      const repairedCharacters = repaired.gameState!.players.map((player) => player.characterId);
      expect(new Set(repairedCharacters).size).toBe(repairedCharacters.length);
      expect(repaired.seats[1]!.characterId).toBe(repaired.gameState!.players[1]!.characterId);
      expect(repaired.initialConfig!.seats[1]!.characterId).toBe(
        repaired.gameState!.players[1]!.characterId,
      );
    } finally {
      storage.close();
    }
  });

  it('keeps private bot decisions out of public chat messages', () => {
    expect(publicBotMessage({
      id: 'secret-plan',
      seatId: 'seat-2',
      type: 'SUBMIT_PLAN',
      label: '抗劫 · 投入 4 灵力',
      description: '秘密计划',
      payload: { action: 'resist', investment: 4 },
    })).toBe('我已经根据公开局势完成了本轮密议。');
    expect(publicBotMessage({
      id: 'secret-vote',
      seatId: 'seat-2',
      type: 'SUBMIT_VOTE',
      label: '启动飞升',
      description: '秘密投票',
      payload: { vote: 'launch' },
    })).toBe('我已经完成密票，等所有人一起揭晓。');
  });

  it('falls back to local bot for provider tests without exposing reasoning_content', async () => {
    const previousToken = process.env.PROVIDER_TEST_TOKEN;
    process.env.PROVIDER_TEST_TOKEN = 'test-provider-token';
    try {
      await request(app.app).post('/api/provider-test').send({}).expect(403);
      const response = await request(app.app)
        .post('/api/provider-test')
        .set('x-provider-test-token', 'test-provider-token')
        .send({
          provider: 'deepseek',
        })
        .expect(200);
      expect(response.body.ok).toBe(false);
      expect(response.body.requestedProvider).toBe('deepseek');
      expect(response.body.provider).toBe('local-bot');
      expect(response.body.usedFallback).toBe(true);
      expect(JSON.stringify(response.body)).not.toContain('reasoning_content');
      expect(JSON.stringify(response.body)).not.toContain('legalActions');
      expect(JSON.stringify(response.body)).not.toContain('view');

      await request(app.app)
        .post('/api/provider-test')
        .set('x-provider-test-token', 'test-provider-token')
        .send({
          provider: 'deepseek',
          view: { forged: true },
        })
        .expect(400);
    } finally {
      if (previousToken === undefined) delete process.env.PROVIDER_TEST_TOKEN;
      else process.env.PROVIDER_TEST_TOKEN = previousToken;
    }
  });

  it('authenticates and rate-limits public chat messages', async () => {
    const created = app.services.rooms.createRoom({ hostName: '甲', maxSeats: 4, seed: 8 });
    const input = {
      roomId: created.room.id,
      seatId: created.seatId,
      seatToken: created.seatToken,
      message: '<script>承诺抗劫</script>',
    };
    await expect(app.services.rooms.chat({ ...input, seatToken: 'invalid-token-value' })).rejects.toThrow(/Invalid seat token/);
    for (let index = 0; index < 5; index += 1) {
      const result = await app.services.rooms.chat({ ...input, message: `承诺抗劫 ${index}` });
      expect(result.entry.message).toBe(`承诺抗劫 ${index}`);
    }
    await expect(app.services.rooms.chat(input)).rejects.toThrow(/rate limit/i);
  });

  it('lets the host assign a temporary bot after grace and restores the human on reconnect', async () => {
    const storage = new ServerStorage(':memory:');
    const rooms = new RoomService(storage, { disconnectGraceMs: 0 });
    try {
      const host = rooms.createRoom({ hostName: '甲', maxSeats: 4, seed: 913 });
      const seats = [
        host,
        rooms.join({ roomId: host.room.id, name: '乙' }),
        rooms.join({ roomId: host.room.id, name: '丙' }),
        rooms.join({ roomId: host.room.id, name: '丁' }),
      ];
      for (const seat of seats) {
        rooms.ready({
          roomId: host.room.id,
          seatId: seat.seatId,
          seatToken: seat.seatToken,
          ready: true,
        });
      }
      await rooms.start({
        roomId: host.room.id,
        seatId: host.seatId,
        seatToken: host.seatToken,
      });
      const guest = seats[1]!;
      rooms.disconnect(host.room.id, guest.seatId);
      const takenOver = await rooms.takeOverDisconnected({
        roomId: host.room.id,
        seatId: host.seatId,
        seatToken: host.seatToken,
        targetSeatId: guest.seatId,
        ai: { provider: 'local-bot', difficulty: 'normal', persona: 'steady' },
      });
      expect(takenOver.room.seats.find((seat) => seat.id === guest.seatId)).toMatchObject({
        kind: 'bot',
        temporaryBot: true,
      });
      const restored = rooms.reconnect({
        roomId: host.room.id,
        seatId: guest.seatId,
        seatToken: guest.seatToken,
      });
      expect(restored.room.seats.find((seat) => seat.id === guest.seatId)).toMatchObject({
        kind: 'human',
        connected: true,
        temporaryBot: false,
      });
    } finally {
      storage.close();
    }
  });

  it('reassigns a disconnected host after grace while preserving every seat token', async () => {
    const storage = new ServerStorage(':memory:');
    let now = Date.parse('2026-07-31T03:00:00.000Z');
    const rooms = new RoomService(storage, {
      now: () => now,
      disconnectGraceMs: 1_000,
    });
    try {
      const host = rooms.createRoom({ hostName: '原房主', maxSeats: 4, seed: 912 });
      const successor = rooms.join({ roomId: host.room.id, name: '继任修士' });
      const observer = rooms.join({ roomId: host.room.id, name: '旁观修士' });

      rooms.disconnect(host.room.id, host.seatId);
      await expect(rooms.expireTimedOutRooms()).resolves.toEqual([]);
      expect(rooms.getRoom(host.room.id).hostSeatId).toBe(host.seatId);

      now += 1_001;
      await expect(rooms.expireTimedOutRooms()).resolves.toEqual([host.room.id]);
      const reassigned = rooms.getRoom(host.room.id);
      expect(reassigned.hostSeatId).toBe(successor.seatId);
      expect(reassigned.chat.at(-1)?.message).toContain('房主已自动移交');

      expect(() => rooms.authenticate(host.room.id, host.seatId, host.seatToken)).not.toThrow();
      expect(() => rooms.authenticate(host.room.id, successor.seatId, successor.seatToken)).not.toThrow();
      expect(() => rooms.authenticate(host.room.id, observer.seatId, observer.seatToken)).not.toThrow();

      const reconnected = rooms.reconnect({
        roomId: host.room.id,
        seatId: host.seatId,
        seatToken: host.seatToken,
      });
      expect(reconnected.room.hostSeatId).toBe(successor.seatId);
      expect(reconnected.room.seats.find((seat) => seat.id === host.seatId)?.connected).toBe(true);
    } finally {
      storage.close();
    }
  });
});

describe('socket room lifecycle', () => {
  it('reconnects seats and sends chat through Socket.IO acknowledgements', async () => {
    await new Promise<void>((resolve) => app.server.listen(0, resolve));
    const address = app.server.address();
    if (!address || typeof address === 'string') throw new Error('No test port');
    const socket: Socket = clientIo(`http://127.0.0.1:${address.port}`, { transports: ['websocket'] });
    await new Promise<void>((resolve) => socket.once('connect', resolve));
    const created = await socket.emitWithAck('room:create', { hostName: '甲', maxSeats: 4, seed: 5 });
    expect(created.ok).toBe(true);
    const reconnect = await socket.emitWithAck('room:reconnect', {
      roomId: created.data.room.id,
      seatId: created.data.seatId,
      seatToken: created.data.seatToken,
    });
    expect(reconnect.ok).toBe(true);
    const chat = await socket.emitWithAck('chat:send', {
      roomId: created.data.room.id,
      seatId: created.data.seatId,
      seatToken: created.data.seatToken,
      message: '  准备好了  ',
    });
    expect(chat.ok).toBe(true);
    expect(chat.data.message).toBe('准备好了');
    socket.close();
  });

  it('broadcasts seat-specific snapshots after socket room updates', async () => {
    await new Promise<void>((resolve) => app.server.listen(0, resolve));
    const address = app.server.address();
    if (!address || typeof address === 'string') throw new Error('No test port');
    const hostSocket: Socket = clientIo(`http://127.0.0.1:${address.port}`, { transports: ['websocket'] });
    const joinSocket: Socket = clientIo(`http://127.0.0.1:${address.port}`, { transports: ['websocket'] });
    await Promise.all([
      new Promise<void>((resolve) => hostSocket.once('connect', resolve)),
      new Promise<void>((resolve) => joinSocket.once('connect', resolve)),
    ]);
    const created = await hostSocket.emitWithAck('room:create', { hostName: '甲', maxSeats: 4, seed: 21 });
    const joined = await joinSocket.emitWithAck('room:join', { roomId: created.data.room.id, name: '乙' });
    for (let index = 0; index < 2; index += 1) {
      await hostSocket.emitWithAck('room:add-bot', {
        roomId: created.data.room.id,
        seatId: created.data.seatId,
        seatToken: created.data.seatToken,
        name: `Bot ${index + 1}`,
        ai: { provider: 'local-bot', difficulty: 'normal', persona: 'steady' },
      });
    }
    await hostSocket.emitWithAck('room:ready', {
      roomId: created.data.room.id,
      seatId: created.data.seatId,
      seatToken: created.data.seatToken,
      ready: true,
    });
    await joinSocket.emitWithAck('room:ready', {
      roomId: joined.data.room.id,
      seatId: joined.data.seatId,
      seatToken: joined.data.seatToken,
      ready: true,
    });
    const hostUpdate = new Promise<any>((resolve) => hostSocket.once('room:update', resolve));
    const joinUpdate = new Promise<any>((resolve) => joinSocket.once('room:update', resolve));
    const started = await hostSocket.emitWithAck('room:start', {
      roomId: created.data.room.id,
      seatId: created.data.seatId,
      seatToken: created.data.seatToken,
    });
    expect(started.ok).toBe(true);
    expect((await hostUpdate).view.seatId).toBe(created.data.seatId);
    expect((await joinUpdate).view.seatId).toBe(joined.data.seatId);
    hostSocket.close();
    joinSocket.close();
  });
});
