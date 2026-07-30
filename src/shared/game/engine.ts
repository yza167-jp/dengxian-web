import {
  CALAMITIES,
  CALAMITY_BY_ID,
  CHARACTERS,
  FATES,
  OPPORTUNITIES,
  OPPORTUNITY_BY_ID,
  UPSTREAM_COMMIT,
  assertContentCoverage,
} from '../data/content';
import { assertEffectCoverage, getEffectMeta } from './effects';
import { shuffleSeeded } from './rng';
import type {
  ActionChoice,
  CalamityId,
  CollectiveFailureOutcome,
  CreateGameConfig,
  FateId,
  GameAction,
  GameActionType,
  GameOutcome,
  GameState,
  OpportunityId,
  PlayerState,
  SeatId,
  WindowTiming,
} from './types';

const MAIN_REQUIREMENT: Record<4 | 5 | 6, number> = { 4: 12, 5: 15, 6: 18 };
const SEAT_REQUIREMENTS = [3, 4, 5, 7, 9] as const;
const DEFAULT_AI = {
  provider: 'local-bot' as const,
  difficulty: 'normal' as const,
  persona: 'steady' as const,
  thinking: false,
};
const LOGICAL_TIME = '1970-01-01T00:00:00.000Z';

function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

function seatOrderFromLeader(state: GameState): SeatId[] {
  return state.players.map(
    (_, offset) =>
      state.players[(state.calamityLeaderIndex + offset) % state.players.length]!.id,
  );
}

function playerById(state: GameState, seatId: SeatId): PlayerState {
  const player = state.players.find((candidate) => candidate.id === seatId);
  if (!player) throw new Error(`Unknown seat: ${seatId}`);
  return player;
}

function spiritCap(state: GameState, player: PlayerState): number {
  return equipmentActive(state, player, 'E15') ? 8 : 6;
}

function handLimit(state: GameState, player: PlayerState): number {
  return equipmentActive(state, player, 'E05') ? 5 : 3;
}

function equipmentActive(
  state: GameState,
  player: PlayerState,
  equipmentId?: OpportunityId,
): boolean {
  if (!player.equipment) return false;
  if (equipmentId && player.equipment !== equipmentId) return false;
  if (state.roundModifiers.disabledEquipmentSeats.includes(player.id)) return false;
  if (!state.roundModifiers.calamityTextIgnored && ['T09', 'T15'].includes(state.currentCalamity)) {
    return false;
  }
  return true;
}

function addEvent(
  state: GameState,
  type: string,
  publicText: string,
  actorSeatId?: SeatId,
  data?: Record<string, unknown>,
  visibleTo?: SeatId[],
): void {
  state.events.push({
    sequence: state.events.length + 1,
    revision: state.revision,
    type,
    publicText,
    actorSeatId,
    data,
    visibleTo,
  });
}

function newRoundModifiers(): GameState['roundModifiers'] {
  return {
    calamityTextIgnored: false,
    disabledEquipmentSeats: [],
    blockedWindowSeats: [],
    priorityContributionSeats: [],
    lightningOrderBonus: {},
    virtualRepair: {},
    virtualResist: {},
    cultivateBonus: {},
    exploreBonusDraw: {},
    redirectedLightning: false,
  };
}

function currentCalamityDefinition(state: GameState) {
  const calamity = CALAMITY_BY_ID.get(state.currentCalamity);
  if (!calamity) throw new Error(`Missing calamity ${state.currentCalamity}`);
  return calamity;
}

function beginWindow(state: GameState, timing: WindowTiming): void {
  state.phase = 'window';
  state.phaseLabel = windowLabel(timing);
  state.window = {
    timing,
    order: seatOrderFromLeader(state),
    cursor: 0,
  };
}

function windowLabel(timing: WindowTiming): string {
  const labels: Record<WindowTiming, string> = {
    after_calamity: '天劫揭示响应',
    after_breath: '吐纳后响应',
    after_reveal: '秘密计划揭晓响应',
    opportunity: '机缘与神通窗口',
    before_contribution: '有效贡献排序前',
    before_lightning: '雷击分配前',
  };
  return labels[timing];
}

function openNextCalamityPrivateInfo(state: GameState): void {
  for (const player of state.players) {
    if (equipmentActive(state, player, 'E12') && state.calamityDeck[0]) {
      player.privateNotes = [
        ...player.privateNotes.filter((note) => !note.startsWith('观星盘：')),
        `观星盘：下一张天劫是 ${state.calamityDeck[0]}`,
      ];
    }
  }
}

function beginRound(state: GameState): void {
  const calamity = state.calamityDeck.shift();
  if (!calamity) throw new Error('Calamity deck exhausted before game end');
  if (state.currentCalamity) state.calamityDiscard.push(state.currentCalamity);
  state.currentCalamity = calamity;
  state.roundModifiers = newRoundModifiers();
  state.readySeats = [];
  state.window = null;
  state.exploreQueue = [];
  state.exploreDecision = null;
  state.recoverDiscard = null;
  state.targetedEffect = null;
  state.resolutionStep = 'none';
  state.lightning = null;
  state.crackContext = null;
  for (const player of state.players) {
    player.pendingPlan = null;
    player.revealedPlan = null;
    player.pendingVote = null;
    player.opportunityUsedThisRound = false;
    player.abilityUsedThisRound = false;
    player.roundFlags = [];
    player.privateNotes = player.privateNotes.filter(
      (note) => !note.startsWith('观星盘：') && !note.startsWith('窥天简：'),
    );
  }

  const definition = currentCalamityDefinition(state);
  const playerCount = state.players.length as 4 | 5 | 6;
  state.currentDemand =
    definition.demand[playerCount] +
    (calamity === 'T18' && state.platform.cracks === 2 ? 2 : 0);
  addEvent(
    state,
    'calamity_revealed',
    `第 ${state.round} 轮揭示「${definition.name}」，抗劫需求 ${state.currentDemand}。`,
    undefined,
    { calamityId: calamity, demand: state.currentDemand },
  );
  openNextCalamityPrivateInfo(state);
  beginWindow(state, 'after_calamity');
}

function applyBreath(state: GameState): void {
  const gain =
    !state.roundModifiers.calamityTextIgnored && ['T03', 'T10'].includes(state.currentCalamity)
      ? 2
      : 3;
  for (const player of state.players) {
    const before = player.spirit;
    let total = before + gain;
    if (equipmentActive(state, player, 'E01') && before <= 2) total += 1;
    player.spirit = Math.min(spiritCap(state, player), total);
  }
  addEvent(state, 'breath', `众修士吐纳灵力，每人获得 ${gain} 灵力（受上限限制）。`);
  beginWindow(state, 'after_breath');
}

function finishWindow(state: GameState, timing: WindowTiming): void {
  state.window = null;
  switch (timing) {
    case 'after_calamity':
      applyBreath(state);
      break;
    case 'after_breath':
      state.phase = 'negotiation';
      state.phaseLabel = '公开谈判';
      state.readySeats = [];
      addEvent(state, 'negotiation_started', '公开谈判开始。口头承诺不受规则约束。');
      break;
    case 'after_reveal':
      beginWindow(state, 'opportunity');
      break;
    case 'opportunity':
      beginExploration(state);
      break;
    case 'before_contribution':
      resolveContributions(state);
      break;
    case 'before_lightning':
      beginLightning(state);
      break;
  }
}

function advanceWindow(state: GameState): void {
  const window = state.window;
  if (!window) throw new Error('No active window');
  window.cursor += 1;
  if (window.cursor >= window.order.length) finishWindow(state, window.timing);
}

function revealPlans(state: GameState): void {
  for (const player of state.players) {
    const plan = player.pendingPlan;
    if (!plan) throw new Error(`Missing plan for ${player.id}`);
    player.revealedPlan = plan;
    player.spirit = Math.max(0, player.spirit - plan.investment);
    state.stats.actions[plan.action] += 1;

    if (plan.action === 'resist' && plan.investment >= 2) {
      if (player.characterId === 'R01') {
        state.roundModifiers.virtualResist[player.id] =
          (state.roundModifiers.virtualResist[player.id] ?? 0) + 1;
      }
      if (equipmentActive(state, player, 'E03')) {
        state.roundModifiers.virtualResist[player.id] =
          (state.roundModifiers.virtualResist[player.id] ?? 0) + 1;
      }
    }
    if (plan.action === 'repair' && plan.investment >= 2) {
      if (player.characterId === 'R04') {
        state.roundModifiers.virtualRepair[player.id] =
          (state.roundModifiers.virtualRepair[player.id] ?? 0) + 1;
      }
      if (equipmentActive(state, player, 'E04')) {
        state.roundModifiers.virtualRepair[player.id] =
          (state.roundModifiers.virtualRepair[player.id] ?? 0) + 1;
      }
    }
    if (
      plan.action === 'cultivate' &&
      plan.investment >= 2 &&
      equipmentActive(state, player, 'E09')
    ) {
      state.roundModifiers.cultivateBonus[player.id] =
        (state.roundModifiers.cultivateBonus[player.id] ?? 0) + 1;
    }
  }
  addEvent(
    state,
    'plans_revealed',
    '所有秘密计划同时揭晓。',
    undefined,
    {
      plans: Object.fromEntries(
        state.players.map((player) => [player.id, player.revealedPlan]),
      ),
    },
  );
  beginWindow(state, 'after_reveal');
}

function drawOpportunity(state: GameState): OpportunityId | undefined {
  if (state.opportunityDeck.length === 0 && state.opportunityDiscard.length > 0) {
    const shuffled = shuffleSeeded(state.opportunityDiscard, state.rngState);
    state.opportunityDeck = shuffled.value;
    state.rngState = shuffled.state;
    state.opportunityDiscard = [];
  }
  return state.opportunityDeck.shift();
}

function beginExploration(state: GameState): void {
  state.resolutionStep = 'explore';
  state.exploreQueue = seatOrderFromLeader(state).filter(
    (seatId) => playerById(state, seatId).revealedPlan?.action === 'explore',
  );
  startNextExplore(state);
}

function startNextExplore(state: GameState): void {
  const seatId = state.exploreQueue[0];
  if (!seatId) {
    resolveCultivation(state);
    return;
  }
  state.phase = 'explore_choice';
  state.phaseLabel = `${playerById(state, seatId).name} 探索机缘`;
  state.exploreDecision = { seatId, drawn: [] };
}

function performExploreDraw(state: GameState, player: PlayerState): void {
  let count = player.characterId === 'R03' ? 3 : 2;
  count += state.roundModifiers.exploreBonusDraw[player.id] ?? 0;
  const drawn: OpportunityId[] = [];
  for (let index = 0; index < count; index += 1) {
    const card = drawOpportunity(state);
    if (card) drawn.push(card);
  }
  if (equipmentActive(state, player, 'E13')) {
    player.spirit = Math.min(spiritCap(state, player), player.spirit + 1);
  }
  state.exploreDecision = { seatId: player.id, drawn };
  if (drawn.length === 0) finishExploreChoice(state, undefined);
}

function finishExploreChoice(
  state: GameState,
  keptCard: OpportunityId | undefined,
): void {
  const decision = state.exploreDecision;
  if (!decision) throw new Error('Missing explore decision');
  const explorer = playerById(state, decision.seatId);
  if (keptCard) {
    explorer.hand.push(keptCard);
    explorer.roundFlags.push(`new-card:${keptCard}`);
  }
  const discarded = decision.drawn.filter((card) => card !== keptCard);
  for (const card of discarded) state.opportunityDiscard.push(card);
  addEvent(
    state,
    'explore_resolved',
    `${explorer.name} 探索机缘，保留了 ${keptCard ? '1 张私密机缘' : '0 张牌'}。`,
    explorer.id,
    { keptCard },
    keptCard ? [explorer.id] : undefined,
  );
  state.exploreQueue.shift();
  state.exploreDecision = null;
  beginDiscardRecovery(state, explorer.id, discarded);
}

function beginDiscardRecovery(
  state: GameState,
  explorerSeatId: SeatId,
  cardIds: OpportunityId[],
): void {
  const responders = seatOrderFromLeader(state).filter((seatId) => {
    const player = playerById(state, seatId);
    return (
      seatId !== explorerSeatId &&
      cardIds.length > 0 &&
      player.hand.includes('C32') &&
      !player.roundFlags.includes('new-card:C32') &&
      player.spirit >= 2 &&
      !player.opportunityUsedThisRound &&
      cardAllowedByCalamity(state, 'C32', 'before_lightning')
    );
  });
  if (responders.length === 0) {
    startNextExplore(state);
    return;
  }
  state.recoverDiscard = {
    explorerSeatId,
    cardIds,
    responderOrder: responders,
    responderCursor: 0,
  };
  state.phase = 'recover_discard';
  state.phaseLabel = '牵机索响应';
}

function finishDiscardRecovery(state: GameState): void {
  state.recoverDiscard = null;
  startNextExplore(state);
}

function resolveCultivation(state: GameState): void {
  state.resolutionStep = 'cultivate';
  for (const player of state.players) {
    const plan = player.revealedPlan;
    if (plan?.action !== 'cultivate') continue;
    const gain = plan.investment + (state.roundModifiers.cultivateBonus[player.id] ?? 0);
    const before = player.cultivation;
    player.cultivation = Math.min(9, before + gain);
    addEvent(
      state,
      'cultivate',
      `${player.name} 修炼，修为 ${before} → ${player.cultivation}。`,
      player.id,
    );
  }
  beginWindow(state, 'before_contribution');
}

function contributionOrder(state: GameState, action: 'repair' | 'resist'): PlayerState[] {
  const leaderOrder = seatOrderFromLeader(state);
  return state.players
    .filter((player) => player.revealedPlan?.action === action)
    .sort((left, right) => {
      const priorityLeft = state.roundModifiers.priorityContributionSeats.includes(left.id)
        ? 0
        : 1;
      const priorityRight = state.roundModifiers.priorityContributionSeats.includes(right.id)
        ? 0
        : 1;
      if (priorityLeft !== priorityRight) return priorityLeft - priorityRight;
      if (left.merit !== right.merit) return left.merit - right.merit;
      return leaderOrder.indexOf(left.id) - leaderOrder.indexOf(right.id);
    });
}

function platformRemaining(state: GameState): number {
  const main = Math.max(0, state.platform.mainRequired - state.platform.mainProgress);
  const seats = state.platform.seatRequirements.reduce(
    (sum, required, index) =>
      sum + Math.max(0, required - (state.platform.seatProgress[index] ?? 0)),
    0,
  );
  return main + seats;
}

function applyRepairPoint(state: GameState): boolean {
  if (state.platform.mainProgress < state.platform.mainRequired) {
    state.platform.mainProgress += 1;
    return true;
  }
  for (let index = 0; index < state.platform.seatRequirements.length; index += 1) {
    const required = state.platform.seatRequirements[index]!;
    const progress = state.platform.seatProgress[index] ?? 0;
    if (progress < required) {
      state.platform.seatProgress[index] = progress + 1;
      return true;
    }
  }
  return false;
}

function allocatePlayerContribution(
  state: GameState,
  action: 'repair' | 'resist',
  capacity: number,
): { used: Record<SeatId, number>; remaining: number } {
  const order = contributionOrder(state, action);
  const investments = Object.fromEntries(
    order.map((player) => [player.id, player.revealedPlan?.investment ?? 0]),
  );
  const used: Record<SeatId, number> = {};
  let remaining = capacity;

  while (remaining > 0 && Object.values(investments).some((value) => value > 0)) {
    for (const player of order) {
      if (remaining <= 0) break;
      if ((investments[player.id] ?? 0) <= 0) continue;
      investments[player.id] -= 1;
      used[player.id] = (used[player.id] ?? 0) + 1;
      remaining -= 1;
    }
  }
  return { used, remaining };
}

function awardContributionMerit(
  state: GameState,
  action: 'repair' | 'resist',
  used: Record<SeatId, number>,
): void {
  for (const [seatId, amount] of Object.entries(used)) {
    const player = playerById(state, seatId);
    player.merit += amount;
    if (amount === 3 && equipmentActive(state, player, 'E10')) player.merit += 1;
    addEvent(
      state,
      `${action}_contribution`,
      `${player.name} 有效${action === 'repair' ? '修台' : '抗劫'} ${amount}，获得 ${amount} 功德。`,
      player.id,
      { amount },
    );
  }
}

function resolveContributions(state: GameState): void {
  state.resolutionStep = 'repair';
  const repairCapacity = platformRemaining(state);
  const repair = allocatePlayerContribution(state, 'repair', repairCapacity);
  awardContributionMerit(state, 'repair', repair.used);
  const usedRepair = Object.values(repair.used).reduce((sum, value) => sum + value, 0);
  for (let index = 0; index < usedRepair; index += 1) applyRepairPoint(state);

  const virtualRepair = Object.values(state.roundModifiers.virtualRepair).reduce(
    (sum, value) => sum + value,
    0,
  );
  for (let index = 0; index < virtualRepair; index += 1) {
    if (!applyRepairPoint(state)) break;
  }

  state.resolutionStep = 'resist';
  const resist = allocatePlayerContribution(state, 'resist', state.currentDemand);
  awardContributionMerit(state, 'resist', resist.used);
  const usedResist = Object.values(resist.used).reduce((sum, value) => sum + value, 0);
  const virtualResist = Object.values(state.roundModifiers.virtualResist).reduce(
    (sum, value) => sum + value,
    0,
  );
  const remaining = Math.max(0, state.currentDemand - usedResist - virtualResist);
  state.lightning = {
    remaining,
    order: [],
    cursor: 0,
    currentVictim: null,
    responderOrder: [],
    responderCursor: 0,
    redirected: false,
    cost: lightningCost(state),
  };

  if (remaining === 0) applyNoLightningCalamityRewards(state);
  beginWindow(state, 'before_lightning');
}

function applyNoLightningCalamityRewards(state: GameState): void {
  if (state.roundModifiers.calamityTextIgnored) return;
  if (state.currentCalamity === 'T06') {
    const minimum = Math.min(...state.players.map((player) => player.merit));
    for (const player of state.players.filter((candidate) => candidate.merit === minimum)) {
      player.spirit = Math.min(spiritCap(state, player), player.spirit + 1);
    }
  }
  if (state.currentCalamity === 'T12' && state.platform.cracks > 0) {
    state.platform.cracks -= 1;
    addEvent(state, 'crack_removed', '返照天光移除了一道裂痕。');
  }
}

function lightningCost(state: GameState): number {
  if (
    !state.roundModifiers.calamityTextIgnored &&
    ['T04', 'T16'].includes(state.currentCalamity)
  ) {
    return 3;
  }
  return 2;
}

function buildLightningOrder(state: GameState): SeatId[] {
  const leaderOrder = seatOrderFromLeader(state);
  const compareMerit =
    !state.roundModifiers.calamityTextIgnored && state.currentCalamity === 'T11';
  return [...state.players]
    .sort((left, right) => {
      const leftInvest =
        (left.revealedPlan?.action === 'resist' ? left.revealedPlan.investment : 0) +
        (state.roundModifiers.lightningOrderBonus[left.id] ?? 0);
      const rightInvest =
        (right.revealedPlan?.action === 'resist' ? right.revealedPlan.investment : 0) +
        (state.roundModifiers.lightningOrderBonus[right.id] ?? 0);
      if (leftInvest !== rightInvest) return leftInvest - rightInvest;
      if (compareMerit && left.merit !== right.merit) return right.merit - left.merit;
      const leftValue = equipmentActive(state, left, 'E11') ? 0 : left.cultivation;
      const rightValue = equipmentActive(state, right, 'E11') ? 0 : right.cultivation;
      if (leftValue !== rightValue) return rightValue - leftValue;
      return leaderOrder.indexOf(left.id) - leaderOrder.indexOf(right.id);
    })
    .map((player) => player.id);
}

function beginLightning(state: GameState): void {
  if (!state.lightning) throw new Error('Missing lightning state');
  if (state.lightning.remaining <= 0) {
    beginVoteOrCleanup(state);
    return;
  }

  if (
    !state.roundModifiers.calamityTextIgnored &&
    state.currentCalamity === 'T17' &&
    !state.roundModifiers.redirectedLightning
  ) {
    state.lightning.remaining -= 1;
    state.roundModifiers.redirectedLightning = true;
    requestCrack(state, 'calamity');
    return;
  }

  state.lightning.order = buildLightningOrder(state);
  startNextLightning(state);
}

function wouldLoseCultivation(state: GameState, victim: PlayerState): boolean {
  const cost = effectiveLightningCost(state, victim);
  return victim.spirit < cost;
}

function effectiveLightningCost(state: GameState, victim: PlayerState): number {
  if (victim.characterId === 'R06' && !victim.roundFlags.includes('body-first-hit')) {
    return 1;
  }
  let cost = state.lightning?.cost ?? lightningCost(state);
  if (equipmentActive(state, victim, 'E02') && !victim.roundFlags.includes('turtle-first-hit')) {
    cost = Math.max(0, cost - 1);
  }
  return cost;
}

function startNextLightning(state: GameState): void {
  const lightning = state.lightning;
  if (!lightning) throw new Error('Missing lightning');
  if (lightning.remaining <= 0) {
    beginVoteOrCleanup(state);
    return;
  }
  const victim = lightning.order[lightning.cursor % lightning.order.length];
  if (!victim) throw new Error('Missing lightning victim');
  lightning.currentVictim = victim;
  lightning.redirected = false;
  lightning.responderOrder = [victim, ...seatOrderFromLeader(state).filter((id) => id !== victim)];
  lightning.responderCursor = 0;
  state.phase = 'lightning_reaction';
  state.phaseLabel = `${playerById(state, victim).name} 将承受雷击`;
}

function resolveLightningHit(state: GameState): void {
  const lightning = state.lightning;
  if (!lightning?.currentVictim) throw new Error('No lightning victim');
  const victim = playerById(state, lightning.currentVictim);
  const cost = effectiveLightningCost(state, victim);
  const bodyFirst = victim.characterId === 'R06' && !victim.roundFlags.includes('body-first-hit');
  if (bodyFirst) victim.roundFlags.push('body-first-hit');
  if (equipmentActive(state, victim, 'E02') && !victim.roundFlags.includes('turtle-first-hit')) {
    victim.roundFlags.push('turtle-first-hit');
  }

  const spiritBefore = victim.spirit;
  const cultivationBefore = victim.cultivation;
  if (cost === 0) {
    // A zero-cost hit is fully absorbed.
  } else if (victim.spirit >= cost) {
    victim.spirit -= cost;
  } else {
    victim.spirit = 0;
    if (victim.cultivation > 0) victim.cultivation -= 1;
    else {
      requestCrack(state, 'lightning');
      return;
    }
  }
  state.stats.lightningHits += 1;
  lightning.remaining -= 1;
  lightning.cursor += 1;
  addEvent(
    state,
    'lightning_hit',
    `${victim.name} 承受雷击，灵力 ${spiritBefore} → ${victim.spirit}，修为 ${cultivationBefore} → ${victim.cultivation}。`,
    victim.id,
    { cost },
  );

  if (spiritBefore > victim.spirit) {
    for (const player of state.players) {
      if (player.id === victim.id) continue;
      if (
        (player.characterId === 'R07' || equipmentActive(state, player, 'E07')) &&
        !player.roundFlags.includes('other-lightning-reward')
      ) {
        player.spirit = Math.min(spiritCap(state, player), player.spirit + 1);
        player.roundFlags.push('other-lightning-reward');
      }
    }
    if (
      victim.hand.includes('C03') &&
      !victim.roundFlags.includes('new-card:C03') &&
      !victim.opportunityUsedThisRound &&
      cardAllowedByCalamity(state, 'C03', 'before_lightning')
    ) {
      consumeCard(state, victim, 'C03');
      victim.spirit = Math.min(spiritCap(state, victim), victim.spirit + 2);
      addEvent(state, 'card_played', `${victim.name} 使用「回气散」恢复 2 灵力。`, victim.id);
    }
  }
  startNextLightning(state);
}

function requestCrack(state: GameState, source: 'lightning' | 'calamity'): void {
  if (state.platform.cracks < 2) {
    state.platform.cracks += 1;
    addEvent(state, 'crack_added', `登仙台新增一道裂痕（${state.platform.cracks}/3）。`);
    if (source === 'lightning' && state.lightning) {
      state.lightning.remaining -= 1;
      state.lightning.cursor += 1;
      startNextLightning(state);
    } else if (source === 'calamity') {
      beginLightning(state);
    }
    return;
  }
  state.crackContext = {
    responderOrder: seatOrderFromLeader(state),
    responderCursor: 0,
    source,
  };
  state.phase = 'crack_reaction';
  state.phaseLabel = '第三道裂痕即将形成';
}

function finishCrackReaction(state: GameState, prevented: boolean): void {
  const context = state.crackContext;
  if (!context) throw new Error('No crack context');
  state.crackContext = null;
  if (prevented) {
    state.stats.cracksPrevented += 1;
    addEvent(state, 'crack_prevented', '第三道裂痕被取消。');
    if (context.source === 'lightning' && state.lightning) {
      state.lightning.remaining -= 1;
      state.lightning.cursor += 1;
      startNextLightning(state);
    } else {
      beginLightning(state);
    }
    return;
  }
  state.platform.cracks = 3;
  finishCollectiveFailure(state, 'third_crack');
}

function beginVoteOrCleanup(state: GameState): void {
  if (state.platform.mainProgress >= state.platform.mainRequired) {
    state.phase = 'voting';
    state.phaseLabel = '秘密启动表决';
    for (const player of state.players) player.pendingVote = null;
    addEvent(state, 'vote_started', '登仙台主体完成，开始秘密启动表决。');
  } else {
    beginDiscard(state);
  }
}

function openSeatCount(state: GameState): number {
  let count = state.platform.mainProgress >= state.platform.mainRequired ? 1 : 0;
  for (let index = 0; index < state.platform.seatRequirements.length; index += 1) {
    if ((state.platform.seatProgress[index] ?? 0) >= state.platform.seatRequirements[index]!) {
      count += 1;
    } else {
      break;
    }
  }
  return count;
}

function evaluateFate(state: GameState, player: PlayerState, printedMerit: number): number {
  const target = state.players[(player.seatIndex + 1) % state.players.length]!;
  let main = false;
  let obsession = false;
  switch (player.fateId) {
    case 'F01':
      main = target.cultivation >= 6;
      obsession = player.spirit >= 5;
      break;
    case 'F02':
      main = printedMerit > target.merit;
      obsession = player.cultivation >= 8;
      break;
    case 'F03':
      main = player.cultivation >= 6 && target.cultivation >= 6;
      obsession = player.equipment !== null;
      break;
    case 'F04':
      main = target.cultivation <= 5;
      obsession = player.spirit === 0;
      break;
    case 'F05':
      main = target.spirit <= 1;
      obsession = player.hand.length >= 2;
      break;
    case 'F06':
      main = target.spirit >= 5;
      obsession = player.cultivation === 6;
      break;
    case 'F07':
      main = player.cultivation > target.cultivation;
      obsession = printedMerit >= 10;
      break;
    case 'F08':
      main = player.cultivation === target.cultivation;
      obsession = player.hand.length === 0;
      break;
    case 'F09':
      main = target.merit >= 8;
      obsession = Math.abs(printedMerit - target.merit) <= 2;
      break;
    case 'F10':
      main = target.merit <= 5;
      obsession = player.equipment !== null;
      break;
    case 'F11':
      main = target.equipment !== null;
      obsession = player.spirit >= 4;
      break;
    case 'F12':
      main = target.hand.length === 0;
      obsession = player.cultivation >= 7;
      break;
  }
  return (main ? 2 : 0) + (obsession ? 1 : 0);
}

function finishAscension(state: GameState, reason: 'vote' | 'force_breach'): void {
  const leaderOrder = seatOrderFromLeader(state);
  const printed = new Map(state.players.map((player) => [player.id, player.merit]));
  const bonuses = new Map(
    state.players.map((player) => [
      player.id,
      evaluateFate(state, player, printed.get(player.id) ?? 0),
    ]),
  );
  for (const player of state.players) player.merit += bonuses.get(player.id) ?? 0;
  const qualified = state.players
    .filter((player) => player.cultivation >= 6)
    .sort((left, right) => {
      if (left.merit !== right.merit) return right.merit - left.merit;
      if (left.cultivation !== right.cultivation) return right.cultivation - left.cultivation;
      if (left.spirit !== right.spirit) return right.spirit - left.spirit;
      return leaderOrder.indexOf(left.id) - leaderOrder.indexOf(right.id);
    });
  const openSeats = openSeatCount(state);
  const ascenders = qualified.slice(0, openSeats).map((player) => player.id);
  const ranking = qualified.map((player, index) => ({
    seatId: player.id,
    printedMerit: printed.get(player.id) ?? 0,
    fateBonus: bonuses.get(player.id) ?? 0,
    finalMerit: player.merit,
    cultivation: player.cultivation,
    spirit: player.spirit,
    rank: index + 1,
    ascended: index < openSeats,
  }));
  state.outcome = {
    kind: 'ascension',
    reason,
    round: state.round,
    openSeats,
    ascenders,
    defeated: state.players
      .filter((player) => !ascenders.includes(player.id))
      .map((player) => player.id),
    ranking,
  };
  state.phase = 'finished';
  state.phaseLabel = '飞升结算';
  addEvent(state, 'ascension', `登仙台启动，${ascenders.length} 名修士飞升。`);
}

function finishCollectiveFailure(
  state: GameState,
  reason: CollectiveFailureOutcome['reason'],
): void {
  state.outcome = {
    kind: 'collective_failure',
    reason,
    round: state.round,
    ascenders: [],
    defeated: state.players.map((player) => player.id),
  };
  state.phase = 'finished';
  state.phaseLabel = reason === 'third_crack' ? '第三道裂痕 · 全员失败' : '末法降临 · 全员失败';
  addEvent(state, 'collective_failure', state.phaseLabel);
}

function beginForceBreach(state: GameState): void {
  state.forceBreachOrder = seatOrderFromLeader(state).filter((seatId) => {
    const player = playerById(state, seatId);
    return player.cultivation >= 6 && player.spirit >= 3 && player.merit >= 3;
  });
  state.forceBreachCursor = 0;
  if (state.forcedBreachUsed || state.forceBreachOrder.length === 0) {
    beginDiscard(state);
    return;
  }
  state.phase = 'force_breach';
  state.phaseLabel = '强行破界询问';
}

function beginDiscard(state: GameState): void {
  const overLimit = state.players.some((player) => player.hand.length > handLimit(state, player));
  if (overLimit) {
    state.phase = 'discard';
    state.phaseLabel = '回合结束 · 弃牌';
    return;
  }
  finishRound(state);
}

function finishRound(state: GameState): void {
  for (const player of state.players) {
    if (equipmentActive(state, player, 'E06') && player.spirit === 0) {
      player.spirit = 1;
    }
  }
  if (state.round >= 8) {
    finishCollectiveFailure(state, 'eighth_round_without_launch');
    return;
  }
  state.calamityLeaderIndex = (state.calamityLeaderIndex + 1) % state.players.length;
  state.round += 1;
  beginRound(state);
}

function makeAction(
  state: GameState,
  seatId: SeatId,
  type: GameActionType,
  label: string,
  description: string,
  payload: Record<string, unknown> = {},
): GameAction {
  return {
    id: `${state.revision}:${seatId}:${type}:${encodeURIComponent(JSON.stringify(payload))}`,
    type,
    seatId,
    label,
    description,
    payload,
  };
}

function currentWindowSeat(state: GameState): SeatId | null {
  if (!state.window) return null;
  return state.window.order[state.window.cursor] ?? null;
}

function cardAllowedByCalamity(
  state: GameState,
  cardId: OpportunityId,
  timing: WindowTiming,
): boolean {
  if (state.roundModifiers.calamityTextIgnored) return true;
  if (state.currentCalamity === 'T09') return false;
  if (
    state.currentCalamity === 'T05' &&
    cardId.startsWith('C') &&
    ['after_calamity', 'after_breath', 'after_reveal', 'opportunity', 'before_contribution'].includes(
      timing,
    )
  ) {
    return false;
  }
  return true;
}

function actionTargets(state: GameState, player: PlayerState, mode: string): PlayerState[] {
  switch (mode) {
    case 'any':
      return state.players;
    case 'other':
      return state.players.filter((candidate) => candidate.id !== player.id);
    case 'other_more_spirit':
      return state.players.filter(
        (candidate) => candidate.id !== player.id && candidate.spirit > player.spirit,
      );
    case 'repair_player':
      return state.players.filter((candidate) => candidate.revealedPlan?.action === 'repair');
    case 'non_explore_player':
      return state.players.filter((candidate) => candidate.revealedPlan?.action !== 'explore');
    case 'same_public_action':
      return state.players.filter(
        (candidate) =>
          candidate.id !== player.id &&
          candidate.revealedPlan?.action === player.revealedPlan?.action &&
          ['repair', 'resist'].includes(candidate.revealedPlan?.action ?? ''),
      );
    case 'effective_contributor':
      return state.players.filter(
        (candidate) =>
          candidate.id !== player.id &&
          ['repair', 'resist'].includes(candidate.revealedPlan?.action ?? ''),
      );
    default:
      return [];
  }
}

function cardPrecondition(
  state: GameState,
  player: PlayerState,
  cardId: OpportunityId,
): boolean {
  const plan = player.revealedPlan;
  switch (cardId) {
    case 'C02':
      return plan?.action === 'cultivate';
    case 'C05':
    case 'C08':
      return true;
    case 'C09':
      return plan?.action === 'repair' || plan?.action === 'resist';
    case 'C10':
      return (plan?.investment ?? 0) >= 2;
    case 'C12':
      return player.spirit >= 1;
    case 'C17':
      return plan?.action !== 'explore' && player.spirit >= 1;
    case 'C19':
      return player.merit >= 1 && player.cultivation < 9;
    case 'C21':
      return plan?.action === 'repair' || plan?.action === 'resist';
    case 'C23':
      return plan?.action === 'repair' || plan?.action === 'resist';
    case 'C25':
      return state.round < 8 && state.calamityDeck.length > 0;
    case 'C27':
      return (plan?.action === 'repair' || plan?.action === 'resist') && player.spirit >= 1;
    case 'C28':
      return player.merit >= 1;
    case 'C29':
      return plan?.action === 'cultivate';
    case 'C31':
      return true;
    default:
      return true;
  }
}

function legalWindowCardActions(state: GameState, player: PlayerState): GameAction[] {
  const timing = state.window?.timing;
  if (!timing || player.opportunityUsedThisRound) return [];
  if (state.roundModifiers.blockedWindowSeats.includes(player.id) && timing === 'opportunity') {
    return [];
  }
  const actions: GameAction[] = [];
  for (const cardId of player.hand) {
    const definition = OPPORTUNITY_BY_ID.get(cardId);
    if (!definition) continue;
    if (player.roundFlags.includes(`new-card:${cardId}`)) continue;
    const meta = getEffectMeta(cardId);
    const matches = definition.equipment ? timing === 'opportunity' : meta.timing === timing;
    if (!matches || !cardAllowedByCalamity(state, cardId, timing)) continue;
    if (!cardPrecondition(state, player, cardId)) continue;

    const base = { cardId };
    if (definition.equipment) {
      actions.push(
        makeAction(
          state,
          player.id,
          'PLAY_CARD',
          `装备「${definition.name}」`,
          definition.effect,
          base,
        ),
      );
      continue;
    }
    if (cardId === 'C11') {
      const top = state.opportunityDeck.slice(0, 3);
      const permutations = top.length === 3
        ? [
            [top[0], top[1], top[2]],
            [top[0], top[2], top[1]],
            [top[1], top[0], top[2]],
            [top[1], top[2], top[0]],
            [top[2], top[0], top[1]],
            [top[2], top[1], top[0]],
          ]
        : [top];
      for (const order of permutations) {
        actions.push(
          makeAction(
            state,
            player.id,
            'PLAY_CARD',
            `使用「天机简」重排牌库顶`,
            `私密顺序：${order.join(' → ')}`,
            { cardId, order },
          ),
        );
      }
      continue;
    }
    if (cardId === 'C10') {
      for (const amount of [1, 2].filter((value) => value < (player.revealedPlan?.investment ?? 0))) {
        actions.push(
          makeAction(
            state,
            player.id,
            'PLAY_CARD',
            `使用「归元诀」取回 ${amount} 灵力`,
            definition.effect,
            { cardId, amount },
          ),
        );
      }
      continue;
    }
    if (cardId === 'C12') {
      for (const target of actionTargets(state, player, 'other')) {
        for (const amount of [1, 2]) {
          if (amount <= player.spirit && target.spirit + amount <= spiritCap(state, target)) {
            actions.push(
              makeAction(
                state,
                player.id,
                'PLAY_CARD',
                `给 ${target.name} ${amount} 灵力`,
                definition.effect,
                { cardId, targetSeatId: target.id, amount },
              ),
            );
          }
        }
      }
      continue;
    }
    if (cardId === 'C29') {
      for (const destination of ['repair', 'resist']) {
        actions.push(
          makeAction(
            state,
            player.id,
            'PLAY_CARD',
            `使用「逆行诀」改为${destination === 'repair' ? '修台' : '抗劫'}`,
            definition.effect,
            { cardId, destination },
          ),
        );
      }
      continue;
    }

    const targets = actionTargets(state, player, meta.target);
    if (targets.length > 0) {
      for (const target of targets) {
        actions.push(
          makeAction(
            state,
            player.id,
            'PLAY_CARD',
            `使用「${definition.name}」→ ${target.name}`,
            definition.effect,
            { cardId, targetSeatId: target.id },
          ),
        );
      }
    } else {
      actions.push(
        makeAction(
          state,
          player.id,
          'PLAY_CARD',
          `使用「${definition.name}」`,
          definition.effect,
          base,
        ),
      );
    }
  }
  return actions;
}

function legalAbilityActions(state: GameState, player: PlayerState): GameAction[] {
  if (!state.window || state.window.timing === 'after_breath') return [];
  const actions: GameAction[] = [];
  if (player.characterId === 'R03' && !player.abilityUsed && state.window.timing === 'after_calamity') {
    actions.push(
      makeAction(state, player.id, 'USE_ABILITY', '发动「镇界符」', '本轮忽略天劫特殊文字。', {
        abilityId: 'R03-U',
      }),
    );
  }
  if (state.window.timing === 'after_reveal') {
    if (player.characterId === 'R01' && !player.abilityUsed) {
      actions.push(
        makeAction(state, player.id, 'USE_ABILITY', '发动「一剑开天」', '增加 3 点虚拟抗劫贡献。', {
          abilityId: 'R01-U',
        }),
      );
    }
    if (player.characterId === 'R05' && !player.abilityUsedThisRound) {
      const investment = player.revealedPlan?.investment ?? 0;
      if (investment > 1) {
        actions.push(
          makeAction(state, player.id, 'USE_ABILITY', '御气：取回 1 灵力', '本轮投入减少 1。', {
            abilityId: 'R05-P',
            direction: 'withdraw',
          }),
        );
      }
      if (investment < 3 && player.spirit > 0 && player.revealedPlan?.action !== 'explore') {
        actions.push(
          makeAction(state, player.id, 'USE_ABILITY', '御气：增加 1 投入', '从储存区增加 1 灵力。', {
            abilityId: 'R05-P',
            direction: 'add',
          }),
        );
      }
    }
    if (player.characterId === 'R05' && !player.abilityUsed) {
      for (const destination of ['repair', 'resist']) {
        if (player.revealedPlan?.action !== destination) {
          actions.push(
            makeAction(
              state,
              player.id,
              'USE_ABILITY',
              `发动「移星换斗」改为${destination === 'repair' ? '修台' : '抗劫'}`,
              '转换当前行动。',
              { abilityId: 'R05-U', destination },
            ),
          );
        }
      }
    }
    if (player.characterId === 'R07' && !player.abilityUsed) {
      for (const target of actionTargets(state, player, 'non_explore_player')) {
        if ((target.revealedPlan?.investment ?? 0) > 0) {
          actions.push(
            makeAction(
              state,
              player.id,
              'USE_ABILITY',
              `发动「夺运」→ ${target.name}`,
              '夺取目标投入中的 1 灵力。',
              { abilityId: 'R07-U', targetSeatId: target.id },
            ),
          );
        }
      }
    }
  }
  if (player.characterId === 'R02' && !player.abilityUsed && state.window.timing === 'opportunity') {
    for (const target of state.players) {
      actions.push(
        makeAction(
          state,
          player.id,
          'USE_ABILITY',
          `发动「九转金丹」→ ${target.name}`,
          '恢复最多 2 修为并获得 2 灵力。',
          { abilityId: 'R02-U', targetSeatId: target.id },
        ),
      );
    }
  }
  if (player.characterId === 'R06' && !player.abilityUsed && state.window.timing === 'before_lightning') {
    const remaining = state.lightning?.remaining ?? 0;
    for (const count of [1, 2, 3].filter((value) => value <= remaining)) {
      actions.push(
        makeAction(
          state,
          player.id,
          'USE_ABILITY',
          `发动「法天象地」承受 ${count} 雷击`,
          '每次失去 1 灵力；无灵力时失去 1 修为。',
          { abilityId: 'R06-U', count },
        ),
      );
    }
  }
  return actions;
}

function legalLightningActions(state: GameState, responder: PlayerState): GameAction[] {
  const lightning = state.lightning;
  if (!lightning?.currentVictim) return [];
  const victim = playerById(state, lightning.currentVictim);
  const actions = [
    makeAction(state, responder.id, 'PASS_REACTION', '不响应', '继续询问下一名玩家。'),
  ];
  if (!responder.opportunityUsedThisRound && cardAllowedByCalamity(state, 'C06', 'before_lightning')) {
    if (responder.id === victim.id && responder.hand.includes('C06')) {
      actions.push(
        makeAction(state, responder.id, 'USE_REACTION', '使用「避雷符」', '取消这次雷击。', {
          cardId: 'C06',
        }),
      );
    }
    if (responder.id !== victim.id && responder.hand.includes('C22')) {
      actions.push(
        makeAction(state, responder.id, 'USE_REACTION', `使用「渡厄符」保护 ${victim.name}`, '取消这次雷击。', {
          cardId: 'C22',
        }),
      );
    }
    if (responder.id === victim.id && responder.hand.includes('C15') && !lightning.redirected) {
      for (const target of state.players.filter((candidate) => {
        if (candidate.id === victim.id) return false;
        const candidateInvest =
          candidate.revealedPlan?.action === 'resist'
            ? candidate.revealedPlan.investment
            : 0;
        const victimInvest =
          victim.revealedPlan?.action === 'resist' ? victim.revealedPlan.investment : 0;
        return candidateInvest <= victimInvest;
      })) {
        actions.push(
          makeAction(
            state,
            responder.id,
            'USE_REACTION',
            `使用「借劫符」转给 ${target.name}`,
            '本次雷击最多转移一次。',
            { cardId: 'C15', targetSeatId: target.id },
          ),
        );
      }
    }
    if (responder.id === victim.id && responder.hand.includes('C18') && wouldLoseCultivation(state, victim)) {
      actions.push(
        makeAction(
          state,
          responder.id,
          'USE_REACTION',
          '使用「定神丹」',
          '失去全部灵力，但防止修为损失并视为承受。',
          { cardId: 'C18' },
        ),
      );
    }
  }
  if (
    responder.characterId === 'R02' &&
    !responder.abilityUsedThisRound &&
    responder.spirit >= 1 &&
    wouldLoseCultivation(state, victim)
  ) {
    actions.push(
      makeAction(
        state,
        responder.id,
        'USE_REACTION',
        `悬壶：保护 ${victim.name}`,
        '支付 1 灵力，防止修为损失并视为承受。',
        { abilityId: 'R02-P' },
      ),
    );
  }
  if (
    responder.id === victim.id &&
    equipmentActive(state, responder, 'E14') &&
    !responder.roundFlags.includes('soul-bell-used') &&
    responder.hand.length > 0 &&
    wouldLoseCultivation(state, victim)
  ) {
    for (const cardId of responder.hand) {
      actions.push(
        makeAction(
          state,
          responder.id,
          'USE_REACTION',
          `镇魂铃：弃「${OPPORTUNITY_BY_ID.get(cardId)?.name ?? cardId}」`,
          '防止修为损失并视为承受。',
          { equipmentId: 'E14', discardCardId: cardId },
        ),
      );
    }
  }
  return actions;
}

function legalCrackActions(state: GameState, responder: PlayerState): GameAction[] {
  const actions = [
    makeAction(state, responder.id, 'PASS_REACTION', '不响应', '继续询问下一名玩家。'),
  ];
  if (
    !responder.opportunityUsedThisRound &&
    responder.hand.includes('C07') &&
    !responder.roundFlags.includes('new-card:C07') &&
    cardAllowedByCalamity(state, 'C07', 'before_lightning')
  ) {
    actions.push(
      makeAction(state, responder.id, 'USE_REACTION', '使用「补天石」', '取消第三道裂痕。', {
        cardId: 'C07',
      }),
    );
  }
  if (responder.characterId === 'R04' && !responder.abilityUsed) {
    actions.push(
      makeAction(state, responder.id, 'USE_REACTION', '发动「逆转阵眼」', '取消第三道裂痕。', {
        abilityId: 'R04-U',
      }),
    );
  }
  return actions;
}

export function getLegalActions(state: GameState, seatId: SeatId): GameAction[] {
  if (state.outcome) return [];
  const player = playerById(state, seatId);
  switch (state.phase) {
    case 'window':
      if (currentWindowSeat(state) !== seatId) return [];
      return [
        ...legalWindowCardActions(state, player),
        ...legalAbilityActions(state, player),
        makeAction(state, seatId, 'PASS_WINDOW', '跳过', '不在此窗口使用牌或神通。'),
      ];
    case 'negotiation':
      if (state.readySeats.includes(seatId)) return [];
      return [
        makeAction(
          state,
          seatId,
          'READY_NEGOTIATION',
          '锁定谈判准备',
          '结束自己的公开谈判，等待所有玩家进入秘密计划。',
        ),
      ];
    case 'planning': {
      if (player.pendingPlan) return [];
      const actions: GameAction[] = [
        makeAction(state, seatId, 'SUBMIT_PLAN', '探索机缘', '不投入灵力；抽牌留一。', {
          action: 'explore',
          investment: 0,
        }),
      ];
      const maximum = Math.min(3, player.spirit);
      for (const choice of ['cultivate', 'repair', 'resist'] as const) {
        for (let investment = 1; investment <= maximum; investment += 1) {
          actions.push(
            makeAction(
              state,
              seatId,
              'SUBMIT_PLAN',
              `${choice === 'cultivate' ? '修炼' : choice === 'repair' ? '修台' : '抗劫'} ${investment}`,
              `秘密投入 ${investment} 灵力。`,
              { action: choice, investment },
            ),
          );
        }
      }
      return actions;
    }
    case 'explore_choice': {
      const decision = state.exploreDecision;
      if (!decision || decision.seatId !== seatId) return [];
      if (decision.drawn.length === 0) {
        const actions = [
          makeAction(state, seatId, 'PASS_REACTION', '按基础规则抽牌', '开始本次探索抽牌。'),
        ];
        if (
          !player.opportunityUsedThisRound &&
          player.hand.includes('C26') &&
          !player.roundFlags.includes('new-card:C26') &&
          cardAllowedByCalamity(state, 'C26', 'before_lightning')
        ) {
          actions.unshift(
            makeAction(
              state,
              seatId,
              'USE_REACTION',
              '使用「探云尺」',
              '本次探索额外抽 1 张。',
              { cardId: 'C26' },
            ),
          );
        }
        return actions;
      }
      return decision.drawn.map((cardId) =>
        makeAction(
          state,
          seatId,
          'CHOOSE_EXPLORE_CARD',
          `保留「${OPPORTUNITY_BY_ID.get(cardId)?.name ?? cardId}」`,
          '其余牌面朝上弃置；新牌本轮不能使用。',
          { cardId },
        ),
      );
    }
    case 'recover_discard': {
      const recovery = state.recoverDiscard;
      const responder =
        recovery?.responderOrder[recovery.responderCursor];
      if (!recovery || responder !== seatId) return [];
      return [
        ...recovery.cardIds.map((cardId) =>
          makeAction(
            state,
            seatId,
            'USE_REACTION',
            `牵回「${OPPORTUNITY_BY_ID.get(cardId)?.name ?? cardId}」`,
            '支付 2 灵力，将刚弃置的牌横置加入手牌。',
            { cardId: 'C32', recoveredCardId: cardId },
          ),
        ),
        makeAction(state, seatId, 'PASS_REACTION', '不使用牵机索', '放弃回收。'),
      ];
    }
    case 'target_reaction': {
      const context = state.targetedEffect;
      if (!context || context.targetSeatId !== seatId) return [];
      return [
        makeAction(
          state,
          seatId,
          'USE_REACTION',
          '使用「假死丹」',
          '取消该效果中只针对你的部分。',
          { cardId: 'C20' },
        ),
        makeAction(state, seatId, 'PASS_REACTION', '接受该效果', '不使用反制牌。'),
      ];
    }
    case 'lightning_reaction': {
      const responder = state.lightning?.responderOrder[state.lightning.responderCursor];
      return responder === seatId ? legalLightningActions(state, player) : [];
    }
    case 'crack_reaction': {
      const responder =
        state.crackContext?.responderOrder[state.crackContext.responderCursor];
      return responder === seatId ? legalCrackActions(state, player) : [];
    }
    case 'voting':
      if (player.pendingVote) return [];
      return (['launch', 'continue'] as const).map((vote) =>
        makeAction(
          state,
          seatId,
          'SUBMIT_VOTE',
          vote === 'launch' ? '启动登仙台' : '继续一轮',
          '秘密投票，所有人提交后同时揭晓。',
          { vote },
        ),
      );
    case 'force_breach': {
      const current = state.forceBreachOrder[state.forceBreachCursor];
      if (current !== seatId) return [];
      return [
        makeAction(
          state,
          seatId,
          'FORCE_BREACH',
          '支付 3 灵力与 3 功德，强行破界',
          '立即启动登仙台。',
        ),
        makeAction(
          state,
          seatId,
          'DECLINE_FORCE_BREACH',
          '暂不破界',
          '询问下一名符合条件的玩家。',
        ),
      ];
    }
    case 'discard':
      if (player.hand.length <= handLimit(state, player)) return [];
      return player.hand.map((cardId) =>
        makeAction(
          state,
          seatId,
          'DISCARD_CARD',
          `弃置「${OPPORTUNITY_BY_ID.get(cardId)?.name ?? cardId}」`,
          `弃至手牌上限 ${handLimit(state, player)}。`,
          { cardId },
        ),
      );
    case 'finished':
      return [];
  }
}

function consumeCard(state: GameState, player: PlayerState, cardId: OpportunityId): void {
  const index = player.hand.indexOf(cardId);
  if (index < 0) throw new Error(`${player.id} does not hold ${cardId}`);
  player.hand.splice(index, 1);
  player.opportunityUsedThisRound = true;
  const definition = OPPORTUNITY_BY_ID.get(cardId);
  if (!definition?.equipment) state.opportunityDiscard.push(cardId);
  state.stats.cardsPlayed += 1;
}

function afterTargetedEffect(
  state: GameState,
  source: PlayerState,
  target: PlayerState,
  effectType: 'card' | 'ability',
): void {
  if (
    effectType === 'card' &&
    equipmentActive(state, target, 'E08') &&
    !target.roundFlags.includes('mirror-target-reward')
  ) {
    target.spirit = Math.min(spiritCap(state, target), target.spirit + 1);
    target.roundFlags.push('mirror-target-reward');
  }
  if (
    equipmentActive(state, target, 'E16') &&
    !target.roundFlags.includes('umbrella-target-reward') &&
    source.spirit > 0
  ) {
    source.spirit -= 1;
    target.spirit = Math.min(spiritCap(state, target), target.spirit + 1);
    target.roundFlags.push('umbrella-target-reward');
  }
}

function startTargetedReaction(
  state: GameState,
  source: PlayerState,
  action: GameAction,
): boolean {
  const targetSeatId = action.payload.targetSeatId as SeatId | undefined;
  if (!targetSeatId || targetSeatId === source.id || !state.window) return false;
  const target = playerById(state, targetSeatId);
  const canCounter =
    target.hand.includes('C20') &&
    !target.roundFlags.includes('new-card:C20') &&
    !target.opportunityUsedThisRound &&
    cardAllowedByCalamity(state, 'C20', 'before_lightning');
  if (!canCounter) return false;
  state.targetedEffect = {
    sourceSeatId: source.id,
    targetSeatId: target.id,
    action,
    window: structuredClone(state.window),
  };
  state.phase = 'target_reaction';
  state.phaseLabel = `${target.name} 可响应定向效果`;
  return true;
}

function finishTargetedEffect(
  state: GameState,
  responder: PlayerState,
  countered: boolean,
): void {
  const context = state.targetedEffect;
  if (!context) throw new Error('No targeted effect');
  const source = playerById(state, context.sourceSeatId);
  const target = playerById(state, context.targetSeatId);
  state.window = context.window;
  state.targetedEffect = null;
  state.phase = 'window';
  state.phaseLabel = windowLabel(context.window.timing);

  if (countered) {
    consumeCard(state, responder, 'C20');
    if (context.action.type === 'PLAY_CARD') {
      const sourceCardId = context.action.payload.cardId as OpportunityId;
      consumeCard(state, source, sourceCardId);
    } else {
      source.abilityUsed = true;
    }
    addEvent(
      state,
      'target_effect_countered',
      `${target.name} 使用「假死丹」取消了只针对自己的效果。`,
      target.id,
      {
        sourceCardId: context.action.payload.cardId,
        abilityId: context.action.payload.abilityId,
      },
    );
  } else {
    if (context.action.type === 'PLAY_CARD') {
      applyCard(state, source, context.action);
      afterTargetedEffect(state, source, target, 'card');
    } else {
      applyAbility(state, source, context.action);
      afterTargetedEffect(state, source, target, 'ability');
    }
  }
  advanceWindow(state);
}

function applyCard(state: GameState, player: PlayerState, action: GameAction): void {
  const cardId = action.payload.cardId as OpportunityId;
  const definition = OPPORTUNITY_BY_ID.get(cardId);
  if (!definition) throw new Error(`Unknown card ${cardId}`);
  consumeCard(state, player, cardId);
  const targetId = action.payload.targetSeatId as SeatId | undefined;
  const target = targetId ? playerById(state, targetId) : undefined;
  const plan = player.revealedPlan;

  if (definition.equipment) {
    if (player.equipment) state.opportunityDiscard.push(player.equipment);
    player.equipment = cardId;
  } else {
    switch (cardId) {
      case 'C01':
        player.spirit = Math.min(spiritCap(state, player), player.spirit + 2);
        break;
      case 'C02':
        state.roundModifiers.cultivateBonus[player.id] =
          (state.roundModifiers.cultivateBonus[player.id] ?? 0) + 1;
        break;
      case 'C04':
        if (target) target.cultivation = Math.min(9, target.cultivation + 1);
        break;
      case 'C05':
        state.roundModifiers.virtualResist[player.id] =
          (state.roundModifiers.virtualResist[player.id] ?? 0) + 2;
        break;
      case 'C08':
        state.roundModifiers.virtualRepair[player.id] =
          (state.roundModifiers.virtualRepair[player.id] ?? 0) + 2;
        break;
      case 'C09':
        if (plan) plan.action = plan.action === 'repair' ? 'resist' : 'repair';
        break;
      case 'C10': {
        const amount = Number(action.payload.amount ?? 1);
        if (plan) plan.investment -= amount;
        player.spirit = Math.min(spiritCap(state, player), player.spirit + amount);
        break;
      }
      case 'C11': {
        const order = action.payload.order as OpportunityId[];
        state.opportunityDeck.splice(0, order.length, ...order);
        player.privateNotes.push(`天机简：已重排 ${order.join(' → ')}`);
        break;
      }
      case 'C12': {
        const amount = Number(action.payload.amount ?? 1);
        if (target) {
          player.spirit -= amount;
          target.spirit = Math.min(spiritCap(state, target), target.spirit + amount);
        }
        break;
      }
      case 'C13':
        if (target) {
          target.spirit -= 1;
          player.spirit = Math.min(spiritCap(state, player), player.spirit + 1);
        }
        break;
      case 'C14':
        if (target?.revealedPlan && target.revealedPlan.investment > 0) {
          target.revealedPlan.investment -= 1;
          target.spirit = Math.min(spiritCap(state, target), target.spirit + 1);
        }
        break;
      case 'C16':
        if (target) player.privateNotes.push(`观因镜：${target.name} 手牌为 ${target.hand.join('、') || '空'}`);
        break;
      case 'C17':
        if (plan) plan.investment += 1;
        player.spirit -= 1;
        break;
      case 'C19':
        player.merit -= 1;
        player.cultivation = Math.min(9, player.cultivation + 2);
        break;
      case 'C21':
        if (plan?.action === 'repair') {
          state.roundModifiers.virtualRepair[player.id] =
            (state.roundModifiers.virtualRepair[player.id] ?? 0) + 1;
        } else if (plan?.action === 'resist') {
          state.roundModifiers.virtualResist[player.id] =
            (state.roundModifiers.virtualResist[player.id] ?? 0) + 1;
        }
        break;
      case 'C23':
        state.roundModifiers.priorityContributionSeats.push(player.id);
        break;
      case 'C24':
        if (target) state.roundModifiers.blockedWindowSeats.push(target.id);
        break;
      case 'C25':
        if (state.calamityDeck[0]) player.privateNotes.push(`窥天简：下一张天劫是 ${state.calamityDeck[0]}`);
        break;
      case 'C27':
        player.spirit -= 1;
        if (plan?.action === 'repair') {
          state.roundModifiers.virtualRepair[player.id] =
            (state.roundModifiers.virtualRepair[player.id] ?? 0) + 2;
        } else {
          state.roundModifiers.virtualResist[player.id] =
            (state.roundModifiers.virtualResist[player.id] ?? 0) + 2;
        }
        break;
      case 'C28':
        if (target) {
          player.merit -= 1;
          target.merit += 1;
        }
        break;
      case 'C29':
        if (plan) plan.action = action.payload.destination as 'repair' | 'resist';
        break;
      case 'C30':
        if (target) state.roundModifiers.disabledEquipmentSeats.push(target.id);
        break;
      case 'C31':
        state.roundModifiers.lightningOrderBonus[player.id] =
          (state.roundModifiers.lightningOrderBonus[player.id] ?? 0) + 2;
        break;
      default:
        // Reaction-only cards are handled by the reaction state machine.
        break;
    }
  }
  addEvent(
    state,
    'card_played',
    `${player.name} 使用「${definition.name}」。`,
    player.id,
    { cardId, targetSeatId: targetId },
  );
}

function applyAbility(state: GameState, player: PlayerState, action: GameAction): void {
  const abilityId = String(action.payload.abilityId);
  const targetId = action.payload.targetSeatId as SeatId | undefined;
  const target = targetId ? playerById(state, targetId) : undefined;
  switch (abilityId) {
    case 'R03-U':
      state.roundModifiers.calamityTextIgnored = true;
      player.abilityUsed = true;
      break;
    case 'R01-U':
      state.roundModifiers.virtualResist[player.id] =
        (state.roundModifiers.virtualResist[player.id] ?? 0) + 3;
      player.abilityUsed = true;
      break;
    case 'R02-U':
      if (target) {
        target.cultivation = Math.min(9, target.cultivation + 2);
        target.spirit = Math.min(spiritCap(state, target), target.spirit + 2);
      }
      player.abilityUsed = true;
      break;
    case 'R05-P':
      if (player.revealedPlan) {
        if (action.payload.direction === 'add') {
          player.spirit -= 1;
          player.revealedPlan.investment += 1;
        } else {
          player.revealedPlan.investment -= 1;
          player.spirit = Math.min(spiritCap(state, player), player.spirit + 1);
        }
      }
      player.abilityUsedThisRound = true;
      break;
    case 'R05-U':
      if (player.revealedPlan) {
        player.revealedPlan.action = action.payload.destination as 'repair' | 'resist';
      }
      player.abilityUsed = true;
      break;
    case 'R06-U': {
      const count = Number(action.payload.count);
      let absorbed = 0;
      for (let index = 0; index < count; index += 1) {
        if (player.spirit > 0) player.spirit -= 1;
        else if (player.cultivation > 0) player.cultivation -= 1;
        else break;
        absorbed += 1;
      }
      if (state.lightning) {
        state.lightning.remaining = Math.max(0, state.lightning.remaining - absorbed);
      }
      player.abilityUsed = true;
      break;
    }
    case 'R07-U':
      if (target?.revealedPlan && target.revealedPlan.investment > 0) {
        target.revealedPlan.investment -= 1;
        player.spirit = Math.min(spiritCap(state, player), player.spirit + 1);
      }
      player.abilityUsed = true;
      break;
    default:
      throw new Error(`Unhandled ability ${abilityId}`);
  }
  addEvent(state, 'ability_used', `${player.name} 发动人物能力。`, player.id, { abilityId, targetId });
}

function applyLightningReaction(state: GameState, player: PlayerState, action: GameAction): void {
  const lightning = state.lightning;
  if (!lightning?.currentVictim) throw new Error('No lightning');
  if (action.type === 'PASS_REACTION') {
    lightning.responderCursor += 1;
    if (lightning.responderCursor >= lightning.responderOrder.length) resolveLightningHit(state);
    return;
  }
  const cardId = action.payload.cardId as OpportunityId | undefined;
  if (cardId) consumeCard(state, player, cardId);
  if (cardId === 'C15') {
    lightning.currentVictim = action.payload.targetSeatId as SeatId;
    lightning.redirected = true;
    lightning.responderOrder = [lightning.currentVictim];
    lightning.responderCursor = 0;
    addEvent(state, 'lightning_redirected', `${player.name} 转移了本次雷击。`, player.id);
    return;
  }
  if (cardId === 'C18') {
    const victim = playerById(state, lightning.currentVictim);
    victim.spirit = 0;
  }
  if (action.payload.abilityId === 'R02-P') {
    player.spirit -= 1;
    player.abilityUsedThisRound = true;
  }
  if (action.payload.equipmentId === 'E14') {
    const discard = action.payload.discardCardId as OpportunityId;
    const index = player.hand.indexOf(discard);
    if (index >= 0) {
      player.hand.splice(index, 1);
      state.opportunityDiscard.push(discard);
    }
    player.roundFlags.push('soul-bell-used');
  }
  lightning.remaining -= 1;
  lightning.cursor += 1;
  addEvent(state, 'lightning_prevented', `${player.name} 令本次雷击视为已承受。`, player.id);
  startNextLightning(state);
}

function applyCrackReaction(state: GameState, player: PlayerState, action: GameAction): void {
  if (action.type === 'PASS_REACTION') {
    if (!state.crackContext) throw new Error('No crack context');
    state.crackContext.responderCursor += 1;
    if (state.crackContext.responderCursor >= state.crackContext.responderOrder.length) {
      finishCrackReaction(state, false);
    }
    return;
  }
  if (action.payload.cardId === 'C07') consumeCard(state, player, 'C07');
  if (action.payload.abilityId === 'R04-U') player.abilityUsed = true;
  finishCrackReaction(state, true);
}

function validateState(state: GameState): void {
  if (state.players.length < 4 || state.players.length > 6) {
    throw new Error('Player count outside 4-6');
  }
  for (const player of state.players) {
    if (player.spirit < 0 || player.spirit > spiritCap(state, player)) {
      throw new Error(`Spirit invariant failed for ${player.id}`);
    }
    if (player.cultivation < 0 || player.cultivation > 9) {
      throw new Error(`Cultivation invariant failed for ${player.id}`);
    }
    if (player.merit < 0) throw new Error(`Merit invariant failed for ${player.id}`);
  }
  if (state.platform.cracks < 0 || state.platform.cracks > 3) {
    throw new Error('Crack invariant failed');
  }
}

export function createGame(config: CreateGameConfig): GameState {
  assertContentCoverage();
  assertEffectCoverage();
  if (config.seats.length < 4 || config.seats.length > 6) {
    throw new Error('《末法登仙台》只支持 4–6 人');
  }
  if (!Number.isInteger(config.seed)) throw new Error('Seed must be an integer');

  let rngState = config.seed >>> 0;
  const characterShuffle = shuffleSeeded(
    CHARACTERS.map((character) => character.id),
    rngState,
  );
  rngState = characterShuffle.state;
  const fateShuffle = shuffleSeeded(
    FATES.map((fate) => fate.id),
    rngState,
  );
  rngState = fateShuffle.state;
  const opportunityShuffle = shuffleSeeded(
    OPPORTUNITIES.map((card) => card.id),
    rngState,
  );
  rngState = opportunityShuffle.state;

  const calamityDeck: CalamityId[] = [];
  for (const [stage, count] of [
    ['初劫', 3],
    ['重劫', 3],
    ['灭世劫', 2],
  ] as const) {
    const shuffled = shuffleSeeded(
      CALAMITIES.filter((card) => card.stage === stage).map((card) => card.id),
      rngState,
    );
    rngState = shuffled.state;
    calamityDeck.push(...shuffled.value.slice(0, count));
  }
  const leaderShuffle = shuffleSeeded(
    config.seats.map((_, index) => index),
    rngState,
  );
  rngState = leaderShuffle.state;

  const players: PlayerState[] = config.seats.map((seat, index) => ({
    id: seat.id ?? `seat-${index + 1}`,
    seatIndex: index,
    name: seat.name,
    kind: seat.kind,
    characterId: seat.characterId ?? characterShuffle.value[index]!,
    ai: seat.kind === 'bot' ? seat.ai ?? DEFAULT_AI : undefined,
    spirit: 0,
    cultivation: 0,
    merit: 0,
    fateId: fateShuffle.value[index] as FateId,
    hand: [],
    equipment: null,
    pendingPlan: null,
    revealedPlan: null,
    pendingVote: null,
    abilityUsed: false,
    opportunityUsedThisRound: false,
    abilityUsedThisRound: false,
    disconnected: false,
    temporaryBot: false,
    privateNotes: [],
    roundFlags: [],
  }));
  const playerCount = config.seats.length as 4 | 5 | 6;
  const state: GameState = {
    schemaVersion: 2,
    rulesVersion: 'upstream-v0.1',
    upstreamCommit: UPSTREAM_COMMIT,
    gameId: config.gameId ?? `game-${config.seed >>> 0}`,
    mode: config.mode,
    faithfulRules: config.faithfulRules ?? true,
    seed: config.seed >>> 0,
    rngState,
    revision: 0,
    round: 1,
    phase: 'window',
    phaseLabel: '开局',
    calamityLeaderIndex: leaderShuffle.value[0] ?? 0,
    players,
    platform: {
      mainRequired: MAIN_REQUIREMENT[playerCount],
      mainProgress: 0,
      seatRequirements: SEAT_REQUIREMENTS.slice(0, playerCount - 1),
      seatProgress: Array.from({ length: playerCount - 1 }, () => 0),
      cracks: 0,
    },
    calamityDeck,
    calamityDiscard: [],
    currentCalamity: '' as CalamityId,
    currentDemand: 0,
    opportunityDeck: opportunityShuffle.value,
    opportunityDiscard: [],
    window: null,
    readySeats: [],
    exploreQueue: [],
    exploreDecision: null,
    recoverDiscard: null,
    targetedEffect: null,
    resolutionStep: 'none',
    lightning: null,
    crackContext: null,
    forceBreachOrder: [],
    forceBreachCursor: 0,
    forcedBreachUsed: false,
    roundModifiers: newRoundModifiers(),
    events: [],
    stats: {
      actions: { cultivate: 0, repair: 0, resist: 0, explore: 0 },
      lightningHits: 0,
      cracksPrevented: 0,
      cardsPlayed: 0,
      forcedBreach: false,
    },
    outcome: null,
    createdAt: LOGICAL_TIME,
    updatedAt: LOGICAL_TIME,
  };
  addEvent(state, 'game_created', `创建 ${players.length} 人对局，seed=${state.seed}。`);
  beginRound(state);
  validateState(state);
  return state;
}

export function applyAction(state: GameState, action: GameAction): GameState {
  const legal = getLegalActions(state, action.seatId);
  const canonical = legal.find((candidate) => candidate.id === action.id);
  if (!canonical) {
    throw new Error(`Illegal or stale action ${action.id} at revision ${state.revision}`);
  }
  const next = cloneState(state);
  next.revision += 1;
  next.updatedAt = new Date(next.revision * 1000).toISOString();
  const player = playerById(next, action.seatId);

  switch (action.type) {
    case 'PASS_WINDOW':
      advanceWindow(next);
      break;
    case 'READY_NEGOTIATION':
      next.readySeats.push(player.id);
      if (next.readySeats.length === next.players.length) {
        next.phase = 'planning';
        next.phaseLabel = '秘密计划';
        next.readySeats = [];
      }
      break;
    case 'SUBMIT_PLAN': {
      const choice = action.payload.action as ActionChoice;
      const investment = Number(action.payload.investment);
      player.pendingPlan = {
        action: choice,
        investment,
        submittedAtRevision: next.revision,
      };
      addEvent(
        next,
        'plan_submitted',
        `${player.name} 已锁定秘密计划。`,
        player.id,
        undefined,
        [player.id],
      );
      if (next.players.every((candidate) => candidate.pendingPlan)) revealPlans(next);
      break;
    }
    case 'PLAY_CARD':
      if (!startTargetedReaction(next, player, action)) {
        const targetSeatId = action.payload.targetSeatId as SeatId | undefined;
        applyCard(next, player, action);
        if (targetSeatId) {
          afterTargetedEffect(next, player, playerById(next, targetSeatId), 'card');
        }
        advanceWindow(next);
      }
      break;
    case 'USE_ABILITY':
      if (!startTargetedReaction(next, player, action)) {
        const targetSeatId = action.payload.targetSeatId as SeatId | undefined;
        applyAbility(next, player, action);
        if (targetSeatId) {
          afterTargetedEffect(
            next,
            player,
            playerById(next, targetSeatId),
            'ability',
          );
        }
        advanceWindow(next);
      }
      break;
    case 'CHOOSE_EXPLORE_CARD':
      finishExploreChoice(next, action.payload.cardId as OpportunityId);
      break;
    case 'PASS_REACTION':
      if (next.phase === 'explore_choice') performExploreDraw(next, player);
      else if (next.phase === 'recover_discard') {
        if (!next.recoverDiscard) throw new Error('No discard recovery');
        next.recoverDiscard.responderCursor += 1;
        if (
          next.recoverDiscard.responderCursor >=
          next.recoverDiscard.responderOrder.length
        ) {
          finishDiscardRecovery(next);
        }
      } else if (next.phase === 'target_reaction') {
        finishTargetedEffect(next, player, false);
      }
      else if (next.phase === 'lightning_reaction') applyLightningReaction(next, player, action);
      else if (next.phase === 'crack_reaction') applyCrackReaction(next, player, action);
      break;
    case 'USE_REACTION':
      if (next.phase === 'explore_choice' && action.payload.cardId === 'C26') {
        consumeCard(next, player, 'C26');
        next.roundModifiers.exploreBonusDraw[player.id] =
          (next.roundModifiers.exploreBonusDraw[player.id] ?? 0) + 1;
        performExploreDraw(next, player);
      } else if (next.phase === 'recover_discard') {
        const recovery = next.recoverDiscard;
        if (!recovery) throw new Error('No discard recovery');
        const recoveredCardId = action.payload.recoveredCardId as OpportunityId;
        consumeCard(next, player, 'C32');
        player.spirit -= 2;
        const discardIndex = next.opportunityDiscard.lastIndexOf(recoveredCardId);
        if (discardIndex < 0) throw new Error('Recovered card is no longer in discard');
        next.opportunityDiscard.splice(discardIndex, 1);
        player.hand.push(recoveredCardId);
        player.roundFlags.push(`new-card:${recoveredCardId}`);
        addEvent(
          next,
          'discard_recovered',
          `${player.name} 使用「牵机索」回收了一张刚弃置的机缘。`,
          player.id,
          { recoveredCardId },
          [player.id],
        );
        finishDiscardRecovery(next);
      } else if (next.phase === 'target_reaction') {
        finishTargetedEffect(next, player, true);
      } else if (next.phase === 'lightning_reaction') {
        applyLightningReaction(next, player, action);
      } else if (next.phase === 'crack_reaction') {
        applyCrackReaction(next, player, action);
      }
      break;
    case 'SUBMIT_VOTE':
      player.pendingVote = action.payload.vote as 'launch' | 'continue';
      addEvent(next, 'vote_submitted', `${player.name} 已提交秘密投票。`, player.id);
      if (next.players.every((candidate) => candidate.pendingVote)) {
        const launchVotes = next.players.filter(
          (candidate) => candidate.pendingVote === 'launch',
        ).length;
        addEvent(next, 'votes_revealed', `投票揭晓：${launchVotes} 票启动。`);
        if (launchVotes > next.players.length / 2) finishAscension(next, 'vote');
        else beginForceBreach(next);
      }
      break;
    case 'FORCE_BREACH':
      player.spirit -= 3;
      player.merit -= 3;
      next.forcedBreachUsed = true;
      next.stats.forcedBreach = true;
      finishAscension(next, 'force_breach');
      break;
    case 'DECLINE_FORCE_BREACH':
      next.forceBreachCursor += 1;
      if (next.forceBreachCursor >= next.forceBreachOrder.length) beginDiscard(next);
      break;
    case 'DISCARD_CARD': {
      const cardId = action.payload.cardId as OpportunityId;
      const index = player.hand.indexOf(cardId);
      if (index < 0) throw new Error('Discarded card is not in hand');
      player.hand.splice(index, 1);
      next.opportunityDiscard.push(cardId);
      if (!next.players.some((candidate) => candidate.hand.length > handLimit(next, candidate))) {
        finishRound(next);
      }
      break;
    }
  }
  validateState(next);
  return next;
}

export function checkOutcome(state: GameState): GameOutcome | null {
  return state.outcome;
}

export function assertActionBelongsToLegalSet(
  state: GameState,
  seatId: SeatId,
  actionId: string,
): GameAction {
  const action = getLegalActions(state, seatId).find((candidate) => candidate.id === actionId);
  if (!action) throw new Error('Action ID is not legal for this seat and revision');
  return action;
}
