import assert from 'node:assert/strict';
import { parseArgs } from 'node:util';
import { CHARACTERS } from '../src/shared/data/content';
import { chooseHeuristicAction } from '../src/shared/game/bot';
import { applyAction, assertValidGameState, createGame } from '../src/shared/game/engine';
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
  actions: 0,
  maximumActions: 0,
  byPlayers: {} as Record<number, { games: number; ascensions: number }>,
  characterAscensions: {} as Record<string, number>,
  characterStats: Object.fromEntries(
    CHARACTERS.map((character) => [
      character.id,
      { name: character.name, games: 0, ascensions: 0 },
    ]),
  ) as Record<string, { name: string; games: number; ascensions: number }>,
  outcomeReasons: {
    vote: 0,
    force_breach: 0,
    third_crack: 0,
    eighth_round_without_launch: 0,
  } as Record<string, number>,
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

function assertSimulationInvariants(state: GameState): void {
  assertValidGameState(state);
  assert(Number.isInteger(state.round) && state.round >= 1 && state.round <= 8);
  assert(state.platform.mainProgress >= 0);
  assert(state.platform.mainProgress <= state.platform.mainRequired);
  assert(state.platform.cracks >= 0 && state.platform.cracks <= 3);
  state.platform.seatProgress.forEach((progress, index) => {
    assert(progress >= 0);
    assert(progress <= state.platform.seatRequirements[index]!);
  });

  for (const player of state.players) {
    assert(Number.isInteger(player.spirit));
    assert(player.spirit >= 0);
    assert(player.spirit <= (player.equipment === 'E15' ? 8 : 6));
    assert(Number.isInteger(player.cultivation));
    assert(player.cultivation >= 0 && player.cultivation <= 9);
    assert(Number.isInteger(player.merit));
    assert(player.merit >= 0);

    const view = getViewForSeat(state, player.id);
    assert.equal(view.seatId, player.id);
    assert.deepEqual(view.self?.hand, player.hand);
    assert.equal(view.self?.fateId, player.fateId);
    assert(view.legalActions.every((action) => action.seatId === player.id));
    assert(
      view.events.every((event) => !event.visibleTo || event.visibleTo.includes(player.id)),
      `Private event leak for ${player.id}`,
    );
    for (const publicPlayer of view.players) {
      const runtime = publicPlayer as unknown as Record<string, unknown>;
      for (const privateKey of ['hand', 'fateId', 'pendingPlan', 'pendingVote', 'privateNotes']) {
        assert(!(privateKey in runtime), `Public player view leaked ${privateKey}`);
      }
    }
  }
}

for (let index = 0; index < games; index += 1) {
  const playerCount = (4 + (index % 3)) as 4 | 5 | 6;
  let state = createGame({
    mode: 'solo',
    seed: 0x5eed_0000 + index,
    seats: Array.from({ length: playerCount }, (_, seatIndex) => ({
      name: `Bot ${seatIndex + 1}`,
      kind: 'bot' as const,
      characterId: CHARACTERS[(index + seatIndex) % CHARACTERS.length]!.id,
      ai: {
        provider: 'local-bot' as const,
        difficulty: 'normal' as const,
        persona: ['steady', 'bold', 'suspicious', 'selfish', 'guardian'][
          seatIndex % 5
        ] as 'steady',
      },
    })),
  });
  for (const player of state.players) {
    summary.characterStats[player.characterId]!.games += 1;
  }
  let steps = 0;
  while (!state.outcome && steps < 5_000) {
    assertSimulationInvariants(state);
    const action = nextAutomatedAction(state);
    if (!action) {
      throw new Error(
        `Deadlock: game=${index} round=${state.round} phase=${state.phase} revision=${state.revision}`,
      );
    }
    const previousRevision = state.revision;
    state = applyAction(state, action);
    assert.equal(state.revision, previousRevision + 1);
    steps += 1;
  }
  if (!state.outcome) throw new Error(`Game ${index} exceeded 5,000 actions`);
  assertSimulationInvariants(state);

  summary.games += 1;
  summary.rounds += state.round;
  summary.actions += steps;
  summary.maximumActions = Math.max(summary.maximumActions, steps);
  summary.byPlayers[playerCount] ??= { games: 0, ascensions: 0 };
  summary.byPlayers[playerCount].games += 1;
  summary.outcomeReasons[state.outcome.reason] += 1;
  if (state.outcome.kind === 'ascension') {
    summary.ascensions += 1;
    summary.byPlayers[playerCount].ascensions += 1;
    for (const seatId of state.outcome.ascenders) {
      const characterId = state.players.find((player) => player.id === seatId)!.characterId;
      summary.characterAscensions[characterId] =
        (summary.characterAscensions[characterId] ?? 0) + 1;
      summary.characterStats[characterId]!.ascensions += 1;
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
      averageActions: Number((summary.actions / summary.games).toFixed(2)),
      ascensionRate: Number((summary.ascensions / summary.games).toFixed(3)),
      collectiveFailureRate: Number(
        (summary.collectiveFailures / summary.games).toFixed(3),
      ),
      characterStats: Object.fromEntries(
        Object.entries(summary.characterStats).map(([characterId, stats]) => [
          characterId,
          {
            ...stats,
            ascensionRate: stats.games === 0
              ? 0
              : Number((stats.ascensions / stats.games).toFixed(3)),
          },
        ]),
      ),
    },
    null,
    2,
  ),
);
