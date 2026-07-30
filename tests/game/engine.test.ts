import { describe, expect, it } from 'vitest';
import {
  CALAMITIES,
  CHARACTERS,
  FATES,
  OPPORTUNITIES,
  assertContentCoverage,
} from '../../src/shared/data/content';
import { chooseHeuristicAction } from '../../src/shared/game/bot';
import {
  applyAction,
  assertValidGameState,
  createGame,
  getLegalActions,
} from '../../src/shared/game/engine';
import { assertEffectCoverage, CARD_EFFECTS } from '../../src/shared/game/effects';
import { hashGameState, rebuildReplay } from '../../src/shared/game/replay';
import { getViewForSeat } from '../../src/shared/game/view';
import type {
  CreateGameConfig,
  GameAction,
  GameState,
  OpportunityId,
} from '../../src/shared/game/types';

function config(playerCount = 4, seed = 42): CreateGameConfig {
  return {
    mode: 'solo',
    seed,
    seats: Array.from({ length: playerCount }, (_, index) => ({
      name: `修士 ${index + 1}`,
      kind: 'bot' as const,
      ai: {
        provider: 'local-bot' as const,
        difficulty: 'normal' as const,
        persona: 'steady' as const,
      },
    })),
  };
}

function nextAction(state: GameState): GameAction {
  for (const player of state.players) {
    const view = getViewForSeat(state, player.id);
    if (view.legalActions.length > 0) {
      return chooseHeuristicAction(state, view, player.id).action;
    }
  }
  throw new Error(`Deadlock at ${state.phase} r${state.round}`);
}

function advanceUntil(
  state: GameState,
  predicate: (candidate: GameState) => boolean,
  limit = 2_000,
): GameState {
  let next = state;
  for (let index = 0; index < limit && !predicate(next); index += 1) {
    next = applyAction(next, nextAction(next));
  }
  if (!predicate(next)) throw new Error('advanceUntil limit reached');
  return next;
}

describe('upstream content', () => {
  it('loads every upstream character, opportunity, calamity and fate', () => {
    expect(() => assertContentCoverage()).not.toThrow();
    expect(() => assertEffectCoverage()).not.toThrow();
    expect(CHARACTERS).toHaveLength(7);
    expect(OPPORTUNITIES).toHaveLength(48);
    expect(CALAMITIES).toHaveLength(18);
    expect(FATES).toHaveLength(12);
    expect(Object.keys(CARD_EFFECTS).sort()).toEqual(
      OPPORTUNITIES.map((card) => card.id).sort(),
    );
  });
});

describe('deterministic engine', () => {
  it.each([
    [4, 12, 3],
    [5, 15, 4],
    [6, 18, 5],
  ])('initializes %i players with scaled tracks', (players, mainRequired, extraSeats) => {
    const state = createGame(config(players, 123));
    expect(state.players).toHaveLength(players);
    expect(state.platform.mainRequired).toBe(mainRequired);
    expect(state.platform.seatRequirements).toHaveLength(extraSeats);
    expect(state.calamityDeck).toHaveLength(7);
    expect(state.currentCalamity).toMatch(/^T/);
    expect(state.events[0]?.type).toBe('game_created');
  });

  it('reproduces the same initial state from the same seed', () => {
    expect(hashGameState(createGame(config(6, 9981)))).toBe(
      hashGameState(createGame(config(6, 9981))),
    );
    expect(hashGameState(createGame(config(6, 9981)))).not.toBe(
      hashGameState(createGame(config(6, 9982))),
    );
  });

  it('keeps an explicitly selected character unique at the table', () => {
    const selected = config(4, 0);
    selected.seats[0]!.characterId = 'R07';
    const state = createGame(selected);

    expect(state.players[0]!.characterId).toBe('R07');
    expect(new Set(state.players.map((player) => player.characterId)).size).toBe(4);
    expect(state.players.filter((player) => player.characterId === 'R07')).toHaveLength(1);
  });

  it('rejects duplicate explicitly selected characters', () => {
    const duplicated = config(4, 0);
    duplicated.seats[0]!.characterId = 'R07';
    duplicated.seats[1]!.characterId = 'R07';

    expect(() => createGame(duplicated)).toThrow(/人物不可重复/);
  });

  it('rejects incomplete or malformed persisted states', () => {
    const missingCalamity = structuredClone(createGame(config()));
    delete (missingCalamity as Partial<GameState>).currentCalamity;
    expect(() => assertValidGameState(missingCalamity)).toThrow();

    const malformedDeck = structuredClone(createGame(config()));
    malformedDeck.opportunityDeck[0] = 'C999';
    expect(() => assertValidGameState(malformedDeck)).toThrow(/Unknown opportunity id/);

    const malformedOutcome = structuredClone(createGame(config()));
    malformedOutcome.outcome = {
      kind: 'collective_failure',
      reason: 'third_crack',
    } as GameState['outcome'];
    expect(() => assertValidGameState(malformedOutcome)).toThrow();
  });

  it('rejects stale or fabricated actions', () => {
    const state = createGame(config());
    const activeSeat = state.window!.order[state.window!.cursor]!;
    const legal = getLegalActions(state, activeSeat)[0]!;
    expect(() =>
      applyAction(state, {
        ...legal,
        id: `${legal.id}-forged`,
      }),
    ).toThrow(/Illegal or stale/);
    const next = applyAction(state, legal);
    expect(() => applyAction(next, legal)).toThrow(/Illegal or stale/);
  });

  it('keeps plans secret until every seat submits, then reveals together', () => {
    let state = advanceUntil(createGame(config()), (candidate) => candidate.phase === 'planning');
    const first = state.players[0]!;
    const firstPlan = getLegalActions(state, first.id).find(
      (action) => action.payload.action === 'repair' && action.payload.investment === 1,
    )!;
    state = applyAction(state, firstPlan);
    expect(state.phase).toBe('planning');
    expect(state.players[0]!.revealedPlan).toBeNull();
    expect(getViewForSeat(state, state.players[1]!.id).players[0]!.planSubmitted).toBe(true);
    expect(getViewForSeat(state, state.players[1]!.id).players[0]!.revealedPlan).toBeNull();

    for (const player of state.players.slice(1)) {
      const action = getLegalActions(state, player.id).find(
        (candidate) => candidate.payload.action === 'explore',
      )!;
      state = applyAction(state, action);
    }
    expect(state.phase).toBe('window');
    expect(state.players.every((player) => player.revealedPlan !== null)).toBe(true);
  });

  it('never exposes another seat hand, fate, plan or vote through its view', () => {
    const state = createGame(config());
    const owner = state.players[1]!;
    const card = state.opportunityDeck.shift()!;
    owner.hand.push(card);
    owner.fateId = 'F12';
    owner.pendingPlan = { action: 'repair', investment: 3, submittedAtRevision: 0 };
    owner.pendingVote = 'launch';

    const viewer = state.players[0]!;
    const view = getViewForSeat(state, viewer.id);
    const encoded = JSON.stringify(view);
    expect(encoded).not.toContain('"F12"');
    expect(encoded).not.toContain(`"${card}"`);
    expect(view.players[1]!.handCount).toBe(1);
    expect(view.players[1]!.planSubmitted).toBe(true);
    expect(view.players[1]!.revealedPlan).toBeNull();
    expect(view.players[1]!.voteSubmitted).toBe(true);
  });

  it('runs all player counts to a legal terminal outcome with bounded actions', () => {
    for (const playerCount of [4, 5, 6]) {
      for (let seed = 1; seed <= 4; seed += 1) {
        let state = createGame(config(playerCount, seed * 101 + playerCount));
        let steps = 0;
        while (!state.outcome && steps < 3_000) {
          state = applyAction(state, nextAction(state));
          for (const player of state.players) {
            expect(player.spirit).toBeGreaterThanOrEqual(0);
            expect(player.cultivation).toBeGreaterThanOrEqual(0);
            expect(player.cultivation).toBeLessThanOrEqual(9);
            expect(player.merit).toBeGreaterThanOrEqual(0);
          }
          steps += 1;
        }
        expect(state.outcome, `players=${playerCount} seed=${seed}`).not.toBeNull();
        expect(Object.keys(state.outcome!.revealedFates)).toHaveLength(playerCount);
        expect(state.outcome!.stats).toEqual(state.stats);
        if (state.outcome!.kind === 'ascension') {
          expect(state.outcome!.ranking.every((row) => row.fateId.startsWith('F'))).toBe(true);
        }
        expect(state.phase).toBe('finished');
        expect(state.round).toBeLessThanOrEqual(8);
      }
    }
  });

  it('rebuilds and verifies an action ledger', () => {
    const initialConfig = config(4, 771);
    let state = createGame(initialConfig);
    const actionIds: string[] = [];
    for (let index = 0; index < 40 && !state.outcome; index += 1) {
      const action = nextAction(state);
      actionIds.push(action.id);
      state = applyAction(state, action);
    }
    const replay = {
      schemaVersion: 2 as const,
      upstreamCommit: state.upstreamCommit,
      initialConfig,
      actionIds,
      finalStateHash: hashGameState(state),
    };
    expect(hashGameState(rebuildReplay(replay))).toBe(replay.finalStateHash);
  });

  it('keeps a newly drawn opportunity unavailable until the following round', () => {
    let state = advanceUntil(
      createGame(config(4, 31337)),
      (candidate) => candidate.phase === 'planning',
    );
    const explorer = state.players[0]!;
    const knownCard = state.opportunityDeck[0] as OpportunityId;
    for (const player of state.players) {
      const action = getLegalActions(state, player.id).find((candidate) =>
        player.id === explorer.id
          ? candidate.payload.action === 'explore'
          : candidate.payload.action === 'resist' && candidate.payload.investment === 1,
      )!;
      state = applyAction(state, action);
    }
    state = advanceUntil(
      state,
      (candidate) =>
        candidate.phase === 'explore_choice' &&
        (candidate.exploreDecision?.drawn.includes(knownCard) ?? false),
    );
    const keep = getLegalActions(state, explorer.id).find(
      (action) => action.payload.cardId === knownCard,
    )!;
    state = applyAction(state, keep);
    expect(explorer.id).toBe(state.players[0]!.id);
    expect(state.players[0]!.roundFlags).toContain(`new-card:${knownCard}`);
  });

  it('opens a real counter window for 假死丹 before targeted effects resolve', () => {
    let state = advanceUntil(
      createGame(config(4, 8801)),
      (candidate) =>
        candidate.phase === 'window' && candidate.window?.timing === 'opportunity',
    );
    const sourceId = state.window!.order[state.window!.cursor]!;
    const source = state.players.find((player) => player.id === sourceId)!;
    const target = state.players.find((player) => player.id !== sourceId)!;
    state.opportunityDeck = state.opportunityDeck.filter(
      (cardId) => cardId !== 'C04' && cardId !== 'C20',
    );
    source.hand.push('C04');
    target.hand.push('C20');
    const targeted = getLegalActions(state, source.id).find(
      (action) =>
        action.payload.cardId === 'C04' && action.payload.targetSeatId === target.id,
    )!;
    const beforeCultivation = target.cultivation;
    state = applyAction(state, targeted);
    expect(state.phase).toBe('target_reaction');
    const counter = getLegalActions(state, target.id).find(
      (action) => action.payload.cardId === 'C20',
    )!;
    state = applyAction(state, counter);
    expect(target.id).toBe(state.players.find((player) => player.id === target.id)!.id);
    expect(state.players.find((player) => player.id === target.id)!.cultivation).toBe(
      beforeCultivation,
    );
    expect(state.opportunityDiscard).toEqual(
      expect.arrayContaining(['C04', 'C20']),
    );
  });

  it('keeps 同心符 public contribution when 假死丹 cancels its personal targeting', () => {
    let state = advanceUntil(
      createGame(config(4, 8802)),
      (candidate) =>
        candidate.phase === 'window' && candidate.window?.timing === 'after_reveal',
    );
    const sourceId = state.window!.order[state.window!.cursor]!;
    const source = state.players.find((player) => player.id === sourceId)!;
    const target = state.players.find((player) => player.id !== sourceId)!;
    source.revealedPlan = { action: 'repair', investment: 1, submittedAtRevision: state.revision };
    target.revealedPlan = { action: 'repair', investment: 1, submittedAtRevision: state.revision };
    state.opportunityDeck = state.opportunityDeck.filter(
      (cardId) => cardId !== 'C20' && cardId !== 'C21',
    );
    source.hand.push('C21');
    target.hand.push('C20');

    const support = getLegalActions(state, source.id).find(
      (action) =>
        action.payload.cardId === 'C21' && action.payload.targetSeatId === target.id,
    )!;
    state = applyAction(state, support);
    const counter = getLegalActions(state, target.id).find(
      (action) => action.payload.cardId === 'C20',
    )!;
    state = applyAction(state, counter);

    expect(state.roundModifiers.virtualRepair[source.id]).toBe(1);
    expect(state.opportunityDiscard).toEqual(expect.arrayContaining(['C20', 'C21']));
  });

  it('limits 移星换斗 to switching between repair and resist', () => {
    const state = advanceUntil(
      createGame(config(4, 5505)),
      (candidate) =>
        candidate.phase === 'window' && candidate.window?.timing === 'after_reveal',
    );
    const seatId = state.window!.order[state.window!.cursor]!;
    const player = state.players.find((candidate) => candidate.id === seatId)!;
    player.characterId = 'R05';
    player.revealedPlan = { action: 'cultivate', investment: 1, submittedAtRevision: state.revision };
    expect(getLegalActions(state, seatId).filter(
      (action) => action.payload.abilityId === 'R05-U',
    )).toHaveLength(0);

    player.revealedPlan = { action: 'repair', investment: 1, submittedAtRevision: state.revision };
    const switches = getLegalActions(state, seatId).filter(
      (action) => action.payload.abilityId === 'R05-U',
    );
    expect(switches.map((action) => action.payload.destination)).toEqual(['resist']);
  });

  it('discards excess spirit immediately when 山河图 is replaced', () => {
    let state = advanceUntil(
      createGame(config(4, 1515)),
      (candidate) =>
        candidate.phase === 'window' && candidate.window?.timing === 'opportunity',
    );
    const seatId = state.window!.order[state.window!.cursor]!;
    const player = state.players.find((candidate) => candidate.id === seatId)!;
    state.opportunityDeck = state.opportunityDeck.filter(
      (cardId) => cardId !== 'E01' && cardId !== 'E15',
    );
    player.equipment = 'E15';
    player.spirit = 8;
    player.hand.push('E01');
    const equip = getLegalActions(state, seatId).find(
      (action) => action.payload.cardId === 'E01',
    )!;

    expect(() => {
      state = applyAction(state, equip);
    }).not.toThrow();
    expect(state.players.find((candidate) => candidate.id === seatId)?.equipment).toBe('E01');
    expect(state.players.find((candidate) => candidate.id === seatId)?.spirit).toBe(6);
    expect(state.opportunityDiscard).toContain('E15');
  });

  it('rewards 邪修 when another player loses cultivation to lightning', () => {
    let state = advanceUntil(
      createGame(config(4, 7070)),
      (candidate) => candidate.phase === 'lightning_reaction',
    );
    const victimId = state.lightning!.currentVictim!;
    const victim = state.players.find((candidate) => candidate.id === victimId)!;
    const cultivator = state.players.find((candidate) => candidate.id !== victimId)!;
    victim.characterId = 'R01';
    victim.spirit = 0;
    victim.cultivation = 1;
    cultivator.characterId = 'R07';
    cultivator.spirit = 0;
    cultivator.roundFlags = cultivator.roundFlags.filter(
      (flag) => flag !== 'other-lightning-reward',
    );
    state.lightning!.cost = 1;

    while (state.phase === 'lightning_reaction' && state.lightning?.currentVictim === victimId) {
      const responderId = state.lightning.responderOrder[state.lightning.responderCursor]!;
      const pass = getLegalActions(state, responderId).find(
        (action) => action.type === 'PASS_REACTION',
      )!;
      state = applyAction(state, pass);
    }

    expect(state.players.find((candidate) => candidate.id === victimId)?.cultivation).toBe(0);
    expect(state.players.find((candidate) => candidate.id === cultivator.id)?.spirit).toBe(1);
  });

  it('implements 牵机索 recovery as a private reaction with cost and new-card lock', () => {
    const state = createGame(config(4, 9901));
    const responder = state.players[1]!;
    state.opportunityDeck = state.opportunityDeck.filter(
      (cardId) => cardId !== 'C32' && cardId !== 'C04',
    );
    responder.hand.push('C32');
    responder.spirit = 2;
    state.opportunityDiscard.push('C04');
    state.phase = 'recover_discard';
    state.phaseLabel = '牵机索响应';
    state.recoverDiscard = {
      explorerSeatId: state.players[0]!.id,
      cardIds: ['C04'],
      responderOrder: [responder.id],
      responderCursor: 0,
    };
    const recover = getLegalActions(state, responder.id).find(
      (action) => action.payload.recoveredCardId === 'C04',
    )!;
    const next = applyAction(state, recover);
    const recovered = next.players.find((player) => player.id === responder.id)!;
    expect(recovered.spirit).toBe(0);
    expect(recovered.hand).toContain('C04');
    expect(recovered.roundFlags).toContain('new-card:C04');
    expect(next.opportunityDiscard).not.toContain('C04');
  });
});
