import { parseArgs } from 'node:util';
import { chooseHeuristicAction } from '../src/shared/game/bot';
import { applyAction, createGame } from '../src/shared/game/engine';
import { getViewForSeat } from '../src/shared/game/view';
import type { GameState } from '../src/shared/game/types';

const args = parseArgs({
  options: {
    games: { type: 'string', default: '60' },
  },
});
const games = Number(args.values.games);
if (!Number.isInteger(games) || games <= 0) throw new Error('--games must be positive');

const summary = {
  games: 0,
  ascensions: 0,
  collectiveFailures: 0,
  rounds: 0,
  byPlayers: {} as Record<number, { games: number; ascensions: number }>,
  characterAscensions: {} as Record<string, number>,
};

function nextAutomatedAction(state: GameState) {
  for (const player of state.players) {
    const view = getViewForSeat(state, player.id);
    if (view.legalActions.length > 0) {
      return chooseHeuristicAction(state, view, player.id).action;
    }
  }
  return null;
}

for (let index = 0; index < games; index += 1) {
  const playerCount = (4 + (index % 3)) as 4 | 5 | 6;
  let state = createGame({
    mode: 'solo',
    seed: 0x5eed_0000 + index,
    seats: Array.from({ length: playerCount }, (_, seatIndex) => ({
      name: `Bot ${seatIndex + 1}`,
      kind: 'bot' as const,
      ai: {
        provider: 'local-bot' as const,
        difficulty: 'normal' as const,
        persona: ['steady', 'bold', 'suspicious', 'selfish', 'guardian'][
          seatIndex % 5
        ] as 'steady',
      },
    })),
  });
  let steps = 0;
  while (!state.outcome && steps < 5_000) {
    const action = nextAutomatedAction(state);
    if (!action) {
      throw new Error(
        `Deadlock: game=${index} round=${state.round} phase=${state.phase} revision=${state.revision}`,
      );
    }
    state = applyAction(state, action);
    steps += 1;
  }
  if (!state.outcome) throw new Error(`Game ${index} exceeded 5,000 actions`);

  summary.games += 1;
  summary.rounds += state.round;
  summary.byPlayers[playerCount] ??= { games: 0, ascensions: 0 };
  summary.byPlayers[playerCount].games += 1;
  if (state.outcome.kind === 'ascension') {
    summary.ascensions += 1;
    summary.byPlayers[playerCount].ascensions += 1;
    for (const seatId of state.outcome.ascenders) {
      const characterId = state.players.find((player) => player.id === seatId)!.characterId;
      summary.characterAscensions[characterId] =
        (summary.characterAscensions[characterId] ?? 0) + 1;
    }
  } else {
    summary.collectiveFailures += 1;
  }
}

console.log(
  JSON.stringify(
    {
      ...summary,
      averageRounds: Number((summary.rounds / summary.games).toFixed(2)),
      ascensionRate: Number((summary.ascensions / summary.games).toFixed(3)),
      collectiveFailureRate: Number(
        (summary.collectiveFailures / summary.games).toFixed(3),
      ),
    },
    null,
    2,
  ),
);
