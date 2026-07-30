import { z } from 'zod';
import type { GameAction, GameView } from '../shared/game/types';

export const providerSchema = z.enum(['local-bot', 'deepseek', 'openai-compatible']);
export const difficultySchema = z.enum(['easy', 'normal', 'hard']);
export const personaSchema = z.enum(['steady', 'bold', 'suspicious', 'selfish', 'guardian']);
export const characterSchema = z.enum(['R01', 'R02', 'R03', 'R04', 'R05', 'R06', 'R07']);

export const aiSeatConfigSchema = z.object({
  provider: providerSchema.default('local-bot'),
  model: z.string().trim().min(1).max(120).optional(),
  difficulty: difficultySchema.default('normal'),
  persona: personaSchema.default('steady'),
  thinking: z.boolean().optional(),
});

export const createRoomSchema = z.object({
  hostName: z.string().trim().min(1).max(40).default('房主'),
  maxSeats: z.number().int().min(4).max(6).default(4),
  seed: z.number().int().min(0).max(0xffff_ffff).default(() => Math.floor(Math.random() * 0xffff_ffff)),
  characterId: characterSchema.optional(),
});

export const joinRoomSchema = z.object({
  roomId: z.string().trim().min(6).optional(),
  code: z.string().trim().min(4).optional(),
  name: z.string().trim().min(1).max(40),
}).refine((value) => value.roomId || value.code, 'roomId or code is required');

export const tokenSeatSchema = z.object({
  roomId: z.string().trim().min(6),
  seatId: z.string().trim().min(1),
  seatToken: z.string().trim().min(16),
});

export const readySchema = tokenSeatSchema.extend({
  ready: z.boolean().default(true),
});

export const startRoomSchema = tokenSeatSchema;

export const commandSchema = tokenSeatSchema.extend({
  commandId: z.string().trim().min(1).max(120),
  baseRevision: z.number().int().min(0),
  actionId: z.string().trim().min(1).max(200),
});

export const transferHostSchema = tokenSeatSchema.extend({
  targetSeatId: z.string().trim().min(1),
});

export const addBotSchema = tokenSeatSchema.extend({
  name: z.string().trim().min(1).max(40).default('AI 修士'),
  ai: aiSeatConfigSchema.default({ provider: 'local-bot', difficulty: 'normal', persona: 'steady' }),
});

export const removeBotSchema = tokenSeatSchema.extend({
  targetSeatId: z.string().trim().min(1),
});

export const takeoverBotSchema = tokenSeatSchema.extend({
  targetSeatId: z.string().trim().min(1),
  ai: aiSeatConfigSchema.default({ provider: 'local-bot', difficulty: 'normal', persona: 'steady' }),
});

export const chatSchema = tokenSeatSchema.extend({
  message: z.string().trim().min(1).max(240),
});

export const saveCreateSchema = tokenSeatSchema.extend({
  name: z.string().trim().min(1).max(80),
});

export const saveUpdateSchema = saveCreateSchema;

export const getSnapshotSchema = z.object({
  seatId: z.string().trim().min(1).optional(),
  seatToken: z.string().trim().min(16).optional(),
}).refine((value) => (value.seatId && value.seatToken) || (!value.seatId && !value.seatToken), 'seatId and seatToken must be provided together');

export const aiMoveSchema = z.object({
  seatConfig: aiSeatConfigSchema,
  view: z.custom<GameView>((value) => typeof value === 'object' && value !== null),
  legalActions: z.array(z.object({
    id: z.string(),
    type: z.string(),
    seatId: z.string(),
    label: z.string(),
    description: z.string().optional(),
    payload: z.record(z.string(), z.unknown()).optional(),
  }).passthrough()).min(1).transform((actions) => actions as GameAction[]),
  rulesDigest: z.string().max(4_000).optional(),
});
