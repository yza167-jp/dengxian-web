import { OPPORTUNITY_BY_ID } from '../data/content';
import type {
  GameAction,
  GameState,
  GameView,
  OpportunityId,
  Persona,
  SeatId,
} from './types';

export interface BotDecision {
  action: GameAction;
  publicRationale: string;
  publicSpeech?: string;
}

const SPEECH: Record<Persona, string[]> = {
  steady: ['先把眼前天劫稳住，别让仙台再裂。', '我会按公开局势做稳妥选择。'],
  bold: ['再撑一轮，席位还能更多！', '富贵险中求，这轮我来赌一把。'],
  suspicious: ['承诺我都听见了，揭晓时再看谁守信。', '公开资源对不上，别怪我多留一手。'],
  selfish: ['我只保证不让自己掉出飞升线。', '合作可以，但功德和席位要算清楚。'],
  guardian: ['我优先保住仙台，有余力再谈排名。', '别让第三道裂痕落下，大家都要出力。'],
};

function deterministicNoise(actionId: string, seed: number): number {
  let hash = seed >>> 0;
  for (const char of actionId) hash = Math.imul(hash ^ char.charCodeAt(0), 0x45d9f3b);
  return (hash >>> 0) / 0xffff_ffff;
}

function scoreAction(
  state: GameState,
  view: GameView,
  seatId: SeatId,
  action: GameAction,
): number {
  const player = state.players.find((candidate) => candidate.id === seatId);
  if (!player) return -Infinity;
  let score = deterministicNoise(action.id, state.seed + state.revision) * 0.25;

  switch (action.type) {
    case 'READY_NEGOTIATION':
      return 100;
    case 'PASS_WINDOW':
      return 1;
    case 'PLAY_CARD':
    case 'USE_ABILITY':
      score += 6;
      if (action.label.includes('补天') || action.label.includes('逆转阵眼')) score += 20;
      if (action.label.includes('抗劫') || action.label.includes('引雷')) score += 5;
      if (action.label.includes('修台') || action.label.includes('护阵')) score += 4;
      return score;
    case 'SUBMIT_PLAN': {
      const choice = action.payload.action;
      const investment = Number(action.payload.investment);
      if (choice === 'cultivate') {
        score += player.cultivation < 6 ? 14 : player.cultivation < 8 ? 4 : -2;
        score += investment * (player.cultivation < 6 ? 2 : 0.5);
      } else if (choice === 'repair') {
        const remaining =
          view.platform.mainRequired -
          view.platform.mainProgress +
          view.platform.seatRequirements.reduce(
            (sum, required, index) =>
              sum + Math.max(0, required - (view.platform.seatProgress[index] ?? 0)),
            0,
          );
        score += remaining > 0 ? 8 + investment * 1.5 : -5;
        if (view.platform.mainProgress < view.platform.mainRequired) score += 4;
      } else if (choice === 'resist') {
        score += 7 + Math.min(view.currentDemand, investment) * 1.7;
        if (view.platform.cracks >= 2) score += 8;
      } else {
        score += player.hand.length === 0 ? 6 : 2;
        if (player.cultivation < 4 || view.platform.cracks >= 2) score -= 4;
      }
      return score;
    }
    case 'CHOOSE_EXPLORE_CARD': {
      const cardId = String(action.payload.cardId);
      const card = OPPORTUNITY_BY_ID.get(cardId as OpportunityId);
      score += card?.equipment ? 8 : 5;
      if (card?.notes.includes('防御') || card?.notes.includes('支援')) score += 3;
      return score;
    }
    case 'PASS_REACTION':
      return 0;
    case 'USE_REACTION':
      return 30;
    case 'SUBMIT_VOTE': {
      const qualifies = player.cultivation >= 6;
      const openSeats =
        1 +
        view.platform.seatRequirements.filter(
          (required, index) => (view.platform.seatProgress[index] ?? 0) >= required,
        ).length;
      const likelyInside =
        state.players.filter(
          (candidate) =>
            candidate.cultivation >= 6 &&
            (candidate.merit > player.merit ||
              (candidate.merit === player.merit && candidate.cultivation > player.cultivation)),
        ).length < openSeats;
      const launch = action.payload.vote === 'launch';
      return launch === (qualifies && likelyInside) ? 20 : 4;
    }
    case 'FORCE_BREACH':
      return 20;
    case 'DECLINE_FORCE_BREACH':
      return 2;
    case 'DISCARD_CARD': {
      const card = OPPORTUNITY_BY_ID.get(
        String(action.payload.cardId) as OpportunityId,
      );
      return card?.equipment ? 2 : 8;
    }
  }
}

export function chooseHeuristicAction(
  state: GameState,
  view: GameView,
  seatId: SeatId,
): BotDecision {
  if (view.legalActions.length === 0) throw new Error(`No legal actions for ${seatId}`);
  const player = state.players.find((candidate) => candidate.id === seatId);
  const persona = player?.ai?.persona ?? 'steady';
  const ranked = [...view.legalActions].sort(
    (left, right) =>
      scoreAction(state, view, seatId, right) - scoreAction(state, view, seatId, left),
  );
  const action = ranked[0]!;
  const publicRationale =
    action.type === 'SUBMIT_PLAN'
      ? '我根据修为、仙台进度和本轮劫力做了取舍。'
      : action.type === 'SUBMIT_VOTE'
        ? '我按当前席位和飞升资格判断是否启动。'
        : `我选择了“${action.label}”。`;
  const lines = SPEECH[persona];
  return {
    action,
    publicRationale,
    publicSpeech: lines[(state.round + player!.seatIndex) % lines.length],
  };
}

export function publicBotMessage(action: GameAction, personaSpeech?: string): string {
  switch (action.type) {
    case 'READY_NEGOTIATION':
      return personaSpeech ?? '先看清公开局势，再决定这一轮如何出手。';
    case 'SUBMIT_PLAN':
      return '我已经根据公开局势完成了本轮密议。';
    case 'SUBMIT_VOTE':
      return '我已经完成密票，等所有人一起揭晓。';
    case 'CHOOSE_EXPLORE_CARD':
    case 'DISCARD_CARD':
      return '我已经完成了私下选择。';
    default:
      return `我选择了“${action.label}”。`;
  }
}
