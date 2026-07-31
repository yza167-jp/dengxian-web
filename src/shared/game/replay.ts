import { createHash } from 'node:crypto';
import { z } from 'zod';
import { UPSTREAM_COMMIT } from '../data/content';
import { applyAction, createGame, getLegalActions } from './engine';
import type { GameState, ReplayEnvelope } from './types';

const replayAiSchema = z.object({
  provider: z.enum(['local-bot', 'deepseek', 'openai-compatible']),
  model: z.string().min(1).optional(),
  difficulty: z.enum(['easy', 'normal', 'hard']),
  persona: z.enum(['steady', 'bold', 'suspicious', 'selfish', 'guardian']),
  thinking: z.boolean().optional(),
  botProfileId: z.string().min(1).max(120).optional(),
}).strict();
const replaySeatSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1),
  kind: z.enum(['human', 'bot']),
  characterId: z.enum(['R01', 'R02', 'R03', 'R04', 'R05', 'R06', 'R07']).optional(),
  ai: replayAiSchema.optional(),
}).strict();
const replayEnvelopeSchema = z.object({
  schemaVersion: z.literal(2),
  upstreamCommit: z.literal(UPSTREAM_COMMIT),
  initialConfig: z.object({
    mode: z.enum(['solo', 'online']),
    seats: z.array(replaySeatSchema).min(4).max(6),
    seed: z.number().int().min(0).max(0xffff_ffff),
    gameId: z.string().min(1).optional(),
    faithfulRules: z.boolean().optional(),
  }).strict(),
  actionIds: z.array(z.string().min(1).max(240)).max(20_000),
  finalStateHash: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function hashGameState(state: GameState): string {
  return createHash('sha256').update(canonicalize(state)).digest('hex');
}

export function parseReplayEnvelope(value: unknown): ReplayEnvelope {
  return replayEnvelopeSchema.parse(value) as ReplayEnvelope;
}

export function rebuildReplay(value: unknown): GameState {
  const replay = parseReplayEnvelope(value);
  let state = createGame(replay.initialConfig);
  for (const actionId of replay.actionIds) {
    const parts = actionId.split(':');
    const seatId = parts[1];
    if (!seatId) throw new Error(`Invalid replay action ID: ${actionId}`);
    const action = getLegalActions(state, seatId).find((candidate) => candidate.id === actionId);
    if (!action) throw new Error(`Replay diverged at revision ${state.revision}: ${actionId}`);
    state = applyAction(state, action);
  }
  const finalHash = hashGameState(state);
  if (finalHash !== replay.finalStateHash) {
    throw new Error(`Replay hash mismatch: expected ${replay.finalStateHash}, received ${finalHash}`);
  }
  return state;
}
