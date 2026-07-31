import compression from 'compression';
import express from 'express';
import helmet from 'helmet';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { Server as SocketServer } from 'socket.io';
import { ZodError } from 'zod';
import { chooseAiMove, listProviders } from './ai';
import { BotService } from './botService';
import { RoomService } from './roomService';
import {
  addBotSchema,
  aiMoveSchema,
  botCreateSchema,
  botUpdateSchema,
  chatSchema,
  commandSchema,
  createRoomSchema,
  getSnapshotSchema,
  joinRoomSchema,
  readySchema,
  removeBotSchema,
  saveCreateSchema,
  saveUpdateSchema,
  startRoomSchema,
  swapSeatSchema,
  takeoverBotSchema,
  tokenSeatSchema,
  transferHostSchema,
} from './schemas';
import { ServerStorage } from './storage';

type SocketAck = (response: { ok: boolean; data?: unknown; error?: string; issues?: unknown }) => void;
type SocketResult = Promise<unknown> | object | string | number | boolean | null | void;

export interface AppServices {
  storage: ServerStorage;
  rooms: RoomService;
  bots: BotService;
}

function errorPayload(error: unknown) {
  if (error instanceof ZodError) return { error: 'Validation failed', issues: error.issues };
  if (error instanceof Error) return { error: error.message };
  return { error: 'Unknown server error' };
}

function saveMetadata(save: ReturnType<ServerStorage['getSave']>) {
  if (!save) return null;
  const metadata: Omit<typeof save, 'payload'> & { payload?: unknown } = { ...save };
  delete metadata.payload;
  return metadata;
}

function botManagerToken(req: express.Request): string {
  const token = req.get('x-bot-manager-token')?.trim();
  if (!token || token.length < 32 || token.length > 256) throw new Error('Valid bot manager token required');
  return token;
}

function wireSocket(io: SocketServer, rooms: RoomService): (roomId: string) => void {
  const bindings = new Map<string, { roomId: string; seatId: string }>();
  const broadcastSnapshots = (roomId: string): void => {
    for (const [socketId, binding] of bindings) {
      if (binding.roomId !== roomId) continue;
      const target = io.sockets.sockets.get(socketId);
      if (!target) continue;
      target.emit('room:update', rooms.snapshot(rooms.getRoom(roomId), binding.seatId));
    }
  };

  io.on('connection', (socket) => {
    const handle = <T>(event: string, fn: (payload: T) => SocketResult) => {
      socket.on(event, async (payload, ack) => {
        const maybeAck: unknown = ack;
        const respond: SocketAck | null = typeof maybeAck === 'function' ? maybeAck as SocketAck : null;
        try {
          const result = await fn(payload as T);
          respond?.({ ok: true, data: result });
        } catch (error) {
          respond?.({ ok: false, ...errorPayload(error) });
        }
      });
    };

    handle('room:create', (payload) => {
      const result = rooms.createRoom(createRoomSchema.parse(payload));
      bindings.set(socket.id, { roomId: result.room.id, seatId: result.seatId });
      void socket.join(result.room.id);
      return result;
    });
    handle('room:join', (payload) => {
      const result = rooms.join(joinRoomSchema.parse(payload));
      bindings.set(socket.id, { roomId: result.room.id, seatId: result.seatId });
      void socket.join(result.room.id);
      broadcastSnapshots(result.room.id);
      return result;
    });
    handle('room:ready', (payload) => {
      const result = rooms.ready(readySchema.parse(payload));
      broadcastSnapshots(result.room.id);
      return result;
    });
    handle('room:reconnect', (payload) => {
      const parsed = tokenSeatSchema.parse(payload);
      const result = rooms.reconnect(parsed);
      bindings.set(socket.id, { roomId: parsed.roomId, seatId: parsed.seatId });
      void socket.join(parsed.roomId);
      return result;
    });
    handle('room:start', async (payload) => {
      const result = await rooms.start(startRoomSchema.parse(payload));
      broadcastSnapshots(result.room.id);
      return result;
    });
    handle('room:command', async (payload) => {
      const result = await rooms.applyCommand(commandSchema.parse(payload));
      broadcastSnapshots(result.room.id);
      return result;
    });
    handle('room:host-transfer', (payload) => {
      const result = rooms.transferHost(transferHostSchema.parse(payload));
      broadcastSnapshots(result.room.id);
      return result;
    });
    handle('room:swap-seat', (payload) => {
      const result = rooms.swapSeats(swapSeatSchema.parse(payload));
      broadcastSnapshots(result.room.id);
      return result;
    });
    handle('room:add-bot', (payload) => {
      const result = rooms.addBot(addBotSchema.parse(payload));
      broadcastSnapshots(result.room.id);
      return result;
    });
    handle('room:remove-bot', (payload) => {
      const result = rooms.removeBot(removeBotSchema.parse(payload));
      broadcastSnapshots(result.room.id);
      return result;
    });
    handle('room:takeover', async (payload) => {
      const result = await rooms.takeOverDisconnected(takeoverBotSchema.parse(payload));
      broadcastSnapshots(result.room.id);
      return result;
    });
    handle('chat:send', async (payload) => {
      const parsed = chatSchema.parse(payload);
      const result = await rooms.chat(parsed);
      io.to(parsed.roomId).emit('chat:message', result.entry);
      for (const reply of result.replies) io.to(parsed.roomId).emit('chat:message', reply);
      broadcastSnapshots(parsed.roomId);
      return result.entry;
    });

    socket.on('disconnect', () => {
      const bound = bindings.get(socket.id);
      if (bound) rooms.disconnect(bound.roomId, bound.seatId);
      bindings.delete(socket.id);
      if (bound) broadcastSnapshots(bound.roomId);
    });
  });
  return broadcastSnapshots;
}

export function createApp(options: {
  storage?: ServerStorage;
  now?: () => number;
  actionTimeoutMs?: number;
  sessionTokenTtlDays?: number;
  timeoutSweepMs?: number;
  log?: (event: Record<string, unknown>) => void;
} = {}) {
  const storage = options.storage ?? new ServerStorage();
  const bots = new BotService(storage);
  const rooms = new RoomService(storage, bots, {
    now: options.now,
    actionTimeoutMs: options.actionTimeoutMs,
    sessionTokenTtlDays: options.sessionTokenTtlDays,
    log: options.log,
  });
  const app = express();
  const server = createServer(app);
  const io = new SocketServer(server, {
    cors: process.env.NODE_ENV === 'production' ? undefined : { origin: true },
  });
  const broadcastSnapshots = wireSocket(io, rooms);
  let timeoutSweep: ReturnType<typeof setInterval> | null = null;
  let timeoutSweepRunning = false;
  server.on('listening', () => {
    timeoutSweep = setInterval(() => {
      if (timeoutSweepRunning) return;
      timeoutSweepRunning = true;
      void rooms.expireTimedOutRooms()
        .then((roomIds) => {
          for (const roomId of roomIds) broadcastSnapshots(roomId);
        })
        .finally(() => {
          timeoutSweepRunning = false;
        });
    }, Math.max(100, options.timeoutSweepMs ?? 1_000));
    timeoutSweep.unref();
  });
  server.on('close', () => {
    if (timeoutSweep) clearInterval(timeoutSweep);
    timeoutSweep = null;
  });

  app.use(helmet({
    contentSecurityPolicy: false,
  }));
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'dengxiantai-server', node: process.version });
  });

  app.get('/api/providers', (_req, res) => {
    res.json({ providers: listProviders() });
  });

  app.get('/api/bots/presets', (_req, res) => {
    res.json({ presets: bots.listPresets() });
  });

  app.get('/api/bots', (req, res, next) => {
    try {
      res.json({ profiles: bots.listProfiles(botManagerToken(req)) });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/bots', (req, res, next) => {
    try {
      const parsed = botCreateSchema.parse(req.body);
      const result = bots.createFromPreset({
        ...parsed,
        managerToken: botManagerToken(req),
      });
      res.status(201).json({ profile: result.profile });
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/bots/:profileId', (req, res, next) => {
    try {
      const parsed = botUpdateSchema.parse(req.body);
      const profile = bots.updateProfile({
        profileId: req.params.profileId,
        managerToken: botManagerToken(req),
        patch: parsed.patch,
      });
      res.json({ profile });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/bots/:profileId', (req, res, next) => {
    try {
      bots.deleteProfile({
        profileId: req.params.profileId,
        managerToken: botManagerToken(req),
      });
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/bots/:profileId/dashboard', (req, res, next) => {
    try {
      const managerToken = botManagerToken(req);
      const profile = bots.getManagedProfile(req.params.profileId, managerToken);
      res.json({
        profile,
        growth: bots.getGrowthStats(profile.id),
        usage: bots.getUsageAnalytics(profile.id),
        memories: bots.listMemories({ profileId: profile.id, managerToken, limit: 50 }),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/provider-test', async (req, res, next) => {
    try {
      const expectedToken = process.env.PROVIDER_TEST_TOKEN;
      if (!expectedToken) {
        res.status(503).json({ error: 'Provider test endpoint is disabled' });
        return;
      }
      if (req.get('x-provider-test-token') !== expectedToken) {
        res.status(403).json({ error: 'Provider test authorization failed' });
        return;
      }
      const parsed = aiMoveSchema.parse(req.body);
      const result = await chooseAiMove(parsed);
      res.json({ ok: true, provider: result.provider, usedFallback: result.usedFallback });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/rooms', (req, res, next) => {
    try {
      res.status(201).json(rooms.createRoom(createRoomSchema.parse(req.body)));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/rooms/join', (req, res, next) => {
    try {
      const result = rooms.join(joinRoomSchema.parse(req.body));
      broadcastSnapshots(result.room.id);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/rooms/code/:code', (req, res, next) => {
    try {
      res.json(rooms.snapshot(rooms.getRoomByCode(req.params.code), null));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/rooms/:roomId', (req, res, next) => {
    try {
      const parsed = getSnapshotSchema.parse(req.query);
      res.json(rooms.publicSnapshot(req.params.roomId, parsed.seatId ? {
        seatId: parsed.seatId,
        seatToken: parsed.seatToken!,
      } : undefined));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/rooms/ready', (req, res, next) => {
    try {
      const result = rooms.ready(readySchema.parse(req.body));
      broadcastSnapshots(result.room.id);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/rooms/start', async (req, res, next) => {
    try {
      const result = await rooms.start(startRoomSchema.parse(req.body));
      broadcastSnapshots(result.room.id);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/rooms/command', async (req, res, next) => {
    try {
      const result = await rooms.applyCommand(commandSchema.parse(req.body));
      broadcastSnapshots(result.room.id);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/rooms/add-bot', (req, res, next) => {
    try {
      const result = rooms.addBot(addBotSchema.parse(req.body));
      broadcastSnapshots(result.room.id);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/saves', (req, res, next) => {
    try {
      const auth = tokenSeatSchema.parse(req.query);
      res.json({ saves: rooms.listSaves(auth).map((save) => saveMetadata(save)) });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/saves', (req, res, next) => {
    try {
      const parsed = saveCreateSchema.parse(req.body);
      res.status(201).json(saveMetadata(rooms.createSave(parsed)));
    } catch (error) {
      next(error);
    }
  });

  app.put('/api/saves/:id', (req, res, next) => {
    try {
      const parsed = saveUpdateSchema.parse(req.body);
      res.json(saveMetadata(rooms.updateSave(req.params.id, parsed)));
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/saves/:id', (req, res, next) => {
    try {
      const parsed = tokenSeatSchema.parse(req.body);
      rooms.deleteSave(req.params.id, parsed);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  if (process.env.NODE_ENV === 'production') {
    const clientDist = resolve('dist/client');
    app.use(express.static(clientDist));
    app.get('*splat', (_req, res) => res.sendFile(resolve(clientDist, 'index.html')));
  }

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = error instanceof ZodError ? 400 : 422;
    res.status(status).json(errorPayload(error));
  });

  return { app, server, io, services: { storage, rooms, bots } satisfies AppServices };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 8787);
  const { server } = createApp();
  server.listen(port, () => {
    console.log(`Dengxiantai server listening on ${port}`);
  });
}
