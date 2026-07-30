import { getLegalActions } from './engine';
import type { GameState, GameView, SeatId } from './types';

export function getViewForSeat(state: GameState, seatId: SeatId | null): GameView {
  const self = seatId ? state.players.find((player) => player.id === seatId) : undefined;
  if (seatId && !self) throw new Error(`Unknown seat ${seatId}`);

  return {
    schemaVersion: 2,
    gameId: state.gameId,
    revision: state.revision,
    mode: state.mode,
    round: state.round,
    phase: state.phase,
    phaseLabel: state.phaseLabel,
    seatId,
    players: state.players.map((player) => ({
      id: player.id,
      seatIndex: player.seatIndex,
      name: player.name,
      kind: player.kind,
      characterId: player.characterId,
      spirit: player.spirit,
      cultivation: player.cultivation,
      merit: player.merit,
      handCount: player.hand.length,
      equipment: player.equipment,
      planSubmitted: player.pendingPlan !== null,
      revealedPlan: player.revealedPlan,
      voteSubmitted: player.pendingVote !== null,
      abilityUsed: player.abilityUsed,
      disconnected: player.disconnected,
      temporaryBot: player.temporaryBot,
    })),
    self: self
      ? {
          fateId: self.fateId,
          hand: [...self.hand],
          pendingPlan: self.pendingPlan,
          pendingVote: self.pendingVote,
          privateNotes: [...self.privateNotes],
        }
      : null,
    platform: structuredClone(state.platform),
    currentCalamity: state.currentCalamity,
    currentDemand: state.currentDemand,
    calamityDiscard: [...state.calamityDiscard],
    opportunityDiscard: [...state.opportunityDiscard],
    window: state.window ? structuredClone(state.window) : null,
    lightning: state.lightning
      ? {
          remaining: state.lightning.remaining,
          order: [...state.lightning.order],
          cursor: state.lightning.cursor,
          currentVictim: state.lightning.currentVictim,
          responderCursor: state.lightning.responderCursor,
          redirected: state.lightning.redirected,
          cost: state.lightning.cost,
        }
      : null,
    events: state.events
      .filter((event) => !event.visibleTo || (seatId !== null && event.visibleTo.includes(seatId)))
      .map((event) => structuredClone(event)),
    legalActions: self ? getLegalActions(state, self.id) : [],
    outcome: state.outcome ? structuredClone(state.outcome) : null,
  };
}
