export type SeatId = string;
export type RoomId = string;
export type GameId = string;

export type CharacterId = `R0${1 | 2 | 3 | 4 | 5 | 6 | 7}`;
export type CharacterAbilityId = `${CharacterId}-U`;
export type OpportunityId = `C${string}` | `E${string}`;
export type CalamityId = `T${string}`;
export type FateId = `F${string}`;

export type PlayerKind = 'human' | 'bot';
export type ActionChoice = 'cultivate' | 'repair' | 'resist' | 'explore';
export type VoteChoice = 'launch' | 'continue';
export type GameMode = 'solo' | 'online';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type Persona = 'steady' | 'bold' | 'suspicious' | 'selfish' | 'guardian';

export type WindowTiming =
  | 'after_calamity'
  | 'after_breath'
  | 'after_reveal'
  | 'opportunity'
  | 'before_contribution'
  | 'before_lightning';

export type Phase =
  | 'window'
  | 'negotiation'
  | 'planning'
  | 'explore_choice'
  | 'recover_discard'
  | 'target_reaction'
  | 'lightning_reaction'
  | 'post_lightning_recovery'
  | 'crack_reaction'
  | 'voting'
  | 'force_breach'
  | 'discard'
  | 'finished';

export interface AiSeatConfig {
  provider: 'local-bot' | 'deepseek' | 'openai-compatible';
  model?: string;
  difficulty: Difficulty;
  persona: Persona;
  thinking?: boolean;
  botProfileId?: string;
}

export interface SeatConfig {
  id?: SeatId;
  name: string;
  kind: PlayerKind;
  characterId?: CharacterId;
  ai?: AiSeatConfig;
}

export interface CreateGameConfig {
  mode: GameMode;
  seats: SeatConfig[];
  seed: number;
  gameId?: string;
  faithfulRules?: boolean;
}

export interface SecretPlan {
  action: ActionChoice;
  investment: number;
  submittedAtRevision: number;
}

export interface PlayerState {
  id: SeatId;
  seatIndex: number;
  name: string;
  kind: PlayerKind;
  characterId: CharacterId;
  ai?: AiSeatConfig;
  spirit: number;
  cultivation: number;
  merit: number;
  fateId: FateId;
  hand: OpportunityId[];
  equipment: OpportunityId | null;
  pendingPlan: SecretPlan | null;
  revealedPlan: SecretPlan | null;
  pendingVote: VoteChoice | null;
  abilityUsed: boolean;
  opportunityUsedThisRound: boolean;
  abilityUsedThisRound: boolean;
  disconnected: boolean;
  temporaryBot: boolean;
  privateNotes: string[];
  roundFlags: string[];
}

export interface PlatformState {
  mainRequired: number;
  mainProgress: number;
  seatRequirements: number[];
  seatProgress: number[];
  cracks: number;
}

export interface RoundModifiers {
  calamityTextIgnored: boolean;
  disabledEquipmentSeats: SeatId[];
  blockedWindowSeats: SeatId[];
  priorityContributionSeats: SeatId[];
  lightningOrderBonus: Record<SeatId, number>;
  virtualRepair: Record<SeatId, number>;
  virtualResist: Record<SeatId, number>;
  cultivateBonus: Record<SeatId, number>;
  exploreBonusDraw: Record<SeatId, number>;
  effectiveContributors: SeatId[];
  redirectedLightning: boolean;
}

export interface WindowState {
  timing: WindowTiming;
  order: SeatId[];
  cursor: number;
}

export interface ExploreDecision {
  seatId: SeatId;
  drawn: OpportunityId[];
  sourceDiscard?: OpportunityId;
}

export interface LightningContext {
  remaining: number;
  order: SeatId[];
  cursor: number;
  currentVictim: SeatId | null;
  responderOrder: SeatId[];
  responderCursor: number;
  redirected: boolean;
  cost: number;
}

export interface CrackContext {
  responderOrder: SeatId[];
  responderCursor: number;
  source: 'lightning' | 'calamity';
}

export interface PostLightningRecoveryContext {
  seatId: SeatId;
}

export interface RecoverDiscardContext {
  explorerSeatId: SeatId;
  cardIds: OpportunityId[];
  responderOrder: SeatId[];
  responderCursor: number;
}

export interface TargetedEffectContext {
  sourceSeatId: SeatId;
  targetSeatId: SeatId;
  action: GameAction;
  window: WindowState;
}

export interface GameEvent {
  sequence: number;
  revision: number;
  type: string;
  publicText: string;
  actorSeatId?: SeatId;
  visibleTo?: SeatId[];
  data?: Record<string, unknown>;
}

export interface AscensionRanking {
  seatId: SeatId;
  fateId: FateId;
  printedMerit: number;
  fateBonus: number;
  finalMerit: number;
  cultivation: number;
  spirit: number;
  rank: number;
  ascended: boolean;
}

export interface AscensionOutcome {
  kind: 'ascension';
  reason: 'vote' | 'force_breach';
  round: number;
  openSeats: number;
  ascenders: SeatId[];
  defeated: SeatId[];
  ranking: AscensionRanking[];
  revealedFates: Record<SeatId, FateId>;
  stats: GameStats;
}

export interface CollectiveFailureOutcome {
  kind: 'collective_failure';
  reason: 'third_crack' | 'eighth_round_without_launch';
  round: number;
  ascenders: [];
  defeated: SeatId[];
  revealedFates: Record<SeatId, FateId>;
  stats: GameStats;
}

export type GameOutcome = AscensionOutcome | CollectiveFailureOutcome;

export interface GameStats {
  actions: Record<ActionChoice, number>;
  lightningHits: number;
  cracksPrevented: number;
  cardsPlayed: number;
  forcedBreach: boolean;
}

export interface GameState {
  schemaVersion: 2;
  rulesVersion: 'upstream-v0.1';
  upstreamCommit: string;
  gameId: GameId;
  mode: GameMode;
  faithfulRules: boolean;
  seed: number;
  rngState: number;
  revision: number;
  round: number;
  phase: Phase;
  phaseLabel: string;
  calamityLeaderIndex: number;
  players: PlayerState[];
  platform: PlatformState;
  calamityDeck: CalamityId[];
  calamityDiscard: CalamityId[];
  currentCalamity: CalamityId;
  currentDemand: number;
  opportunityDeck: OpportunityId[];
  opportunityDiscard: OpportunityId[];
  window: WindowState | null;
  readySeats: SeatId[];
  exploreQueue: SeatId[];
  exploreDecision: ExploreDecision | null;
  recoverDiscard: RecoverDiscardContext | null;
  targetedEffect: TargetedEffectContext | null;
  resolutionStep: 'none' | 'explore' | 'cultivate' | 'repair' | 'resist';
  lightning: LightningContext | null;
  postLightningRecovery: PostLightningRecoveryContext | null;
  crackContext: CrackContext | null;
  forceBreachOrder: SeatId[];
  forceBreachCursor: number;
  forcedBreachUsed: boolean;
  roundModifiers: RoundModifiers;
  events: GameEvent[];
  stats: GameStats;
  outcome: GameOutcome | null;
  createdAt: string;
  updatedAt: string;
}

export type GameActionType =
  | 'PASS_WINDOW'
  | 'READY_NEGOTIATION'
  | 'SUBMIT_PLAN'
  | 'PLAY_CARD'
  | 'USE_ABILITY'
  | 'CHOOSE_EXPLORE_CARD'
  | 'PASS_REACTION'
  | 'USE_REACTION'
  | 'SUBMIT_VOTE'
  | 'FORCE_BREACH'
  | 'DECLINE_FORCE_BREACH'
  | 'DISCARD_CARD';

export interface GameAction {
  id: string;
  type: GameActionType;
  seatId: SeatId;
  label: string;
  description: string;
  payload: Record<string, unknown>;
}

export interface PublicPlayerView {
  id: SeatId;
  seatIndex: number;
  name: string;
  kind: PlayerKind;
  characterId: CharacterId;
  spirit: number;
  cultivation: number;
  merit: number;
  handCount: number;
  equipment: OpportunityId | null;
  planSubmitted: boolean;
  revealedPlan: SecretPlan | null;
  voteSubmitted: boolean;
  abilityUsed: boolean;
  disconnected: boolean;
  temporaryBot: boolean;
}

export interface SeatPrivateView {
  fateId: FateId;
  hand: OpportunityId[];
  pendingPlan: SecretPlan | null;
  pendingVote: VoteChoice | null;
  privateNotes: string[];
}

export interface GameView {
  schemaVersion: 2;
  gameId: GameId;
  revision: number;
  mode: GameMode;
  round: number;
  phase: Phase;
  phaseLabel: string;
  seatId: SeatId | null;
  players: PublicPlayerView[];
  self: SeatPrivateView | null;
  platform: PlatformState;
  currentCalamity: CalamityId;
  currentDemand: number;
  calamityDiscard: CalamityId[];
  opportunityDiscard: OpportunityId[];
  window: WindowState | null;
  lightning: Omit<LightningContext, 'responderOrder'> | null;
  events: GameEvent[];
  legalActions: GameAction[];
  outcome: GameOutcome | null;
}

export interface CommandEnvelope {
  roomId: RoomId;
  commandId: string;
  baseRevision: number;
  actionId: string;
}

export interface ReplayEnvelope {
  schemaVersion: 2;
  upstreamCommit: string;
  initialConfig: CreateGameConfig;
  actionIds: string[];
  finalStateHash: string;
}
