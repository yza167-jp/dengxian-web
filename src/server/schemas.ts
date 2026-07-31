import { z } from 'zod';
import { BOT_DIFFICULTIES, BOT_PERSONAS, BOT_PROVIDERS } from '../shared/bots';

export const providerSchema = z.enum(BOT_PROVIDERS);
export const difficultySchema = z.enum(BOT_DIFFICULTIES);
export const personaSchema = z.enum(BOT_PERSONAS);
export const characterSchema = z.enum(['R01', 'R02', 'R03', 'R04', 'R05', 'R06', 'R07']);

export const aiSeatConfigSchema = z.object({
  provider: providerSchema.default('local-bot'),
  model: z.string().trim().min(1).max(120).optional(),
  difficulty: difficultySchema.default('normal'),
  persona: personaSchema.default('steady'),
  thinking: z.boolean().optional(),
  botProfileId: z.string().trim().min(1).max(120).optional(),
});

const botProfileFieldsSchema = z.object({
  name: z.string().trim().min(1).max(40),
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(500),
  provider: providerSchema,
  model: z.string().trim().min(1).max(120).nullable(),
  difficulty: difficultySchema,
  persona: personaSchema,
  thinking: z.boolean(),
  traits: z.array(z.string().trim().min(1).max(40)).max(12),
  preferences: z.array(z.string().trim().min(1).max(60)).max(12),
  communicationStyle: z.string().trim().min(1).max(240),
}).strict();

export const botCreateSchema = z.object({
  presetId: z.string().trim().min(1).max(120),
  overrides: botProfileFieldsSchema.partial().optional(),
}).strict();

export const botUpdateSchema = z.object({
  patch: botProfileFieldsSchema.partial(),
}).strict();

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

export const swapSeatSchema = tokenSeatSchema.extend({
  targetSeatId: z.string().trim().min(1),
});

export const addBotSchema = tokenSeatSchema.extend({
  name: z.string().trim().min(1).max(40).default('AI 修士'),
  ai: aiSeatConfigSchema.default({ provider: 'local-bot', difficulty: 'normal', persona: 'steady' }),
  botManagerToken: z.string().trim().min(32).max(256).optional(),
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

export const providerTestSchema = z.object({
  provider: z.enum(['deepseek', 'openai-compatible']).default('deepseek'),
  model: z.string().trim().min(1).max(120).optional(),
  thinking: z.boolean().default(false),
}).strict();
