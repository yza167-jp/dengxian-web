import { createHash } from 'node:crypto';
import { applyAction, createGame, getLegalActions } from './engine';
import type { GameState, ReplayEnvelope } from './types';

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

export function rebuildReplay(replay: ReplayEnvelope): GameState {
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
