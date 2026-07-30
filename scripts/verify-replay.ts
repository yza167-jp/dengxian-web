import { readFile } from 'node:fs/promises';
import { rebuildReplay } from '../src/shared/game/replay';
import type { ReplayEnvelope } from '../src/shared/game/types';

const path = process.argv[2];
if (!path) {
  console.error('Usage: npm exec tsx scripts/verify-replay.ts <replay.json>');
  process.exit(2);
}

const replay = JSON.parse(await readFile(path, 'utf8')) as ReplayEnvelope;
const state = rebuildReplay(replay);
console.log(`Replay verified: ${state.gameId} revision=${state.revision}`);
