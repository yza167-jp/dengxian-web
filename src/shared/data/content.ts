import {
  upstreamCalamities,
  upstreamCharacters,
  upstreamFates,
  upstreamOpportunities,
  UPSTREAM_COMMIT,
} from './upstream.generated';
import type {
  CalamityId,
  CharacterAbilityId,
  CharacterId,
  FateId,
  OpportunityId,
} from '../game/types';

export { UPSTREAM_COMMIT };

export interface CharacterDefinition {
  id: CharacterId;
  name: string;
  passiveTrigger: string;
  passiveEffect: string;
  passiveRestriction: string;
  ability: {
    id: CharacterAbilityId;
    name: string;
    trigger: string;
    effect: string;
    restriction: string;
  };
}

export interface OpportunityDefinition {
  id: OpportunityId;
  name: string;
  type: string;
  trigger: string;
  cost: string;
  effect: string;
  restriction: string;
  notes: string;
  equipment: boolean;
  effectKey: OpportunityId;
}

export interface CalamityDefinition {
  id: CalamityId;
  name: string;
  stage: '初劫' | '重劫' | '灭世劫';
  demand: { 4: number; 5: number; 6: number };
  effect: string;
  notes: string;
}

export interface FateDefinition {
  id: FateId;
  name: string;
  mainFate: string;
  mainReward: number;
  obsession: string;
  obsessionReward: number;
  notes: string;
}

const characterRows = upstreamCharacters.filter((row) => row.type === '人物');

export const CHARACTERS: CharacterDefinition[] = characterRows.map((row) => {
  const ability = upstreamCharacters.find((candidate) => candidate.id === `${row.id}-U`);
  if (!ability) throw new Error(`Missing ultimate for ${row.id}`);
  return {
    id: row.id as CharacterId,
    name: row.name,
    passiveTrigger: row.trigger,
    passiveEffect: row.effect,
    passiveRestriction: row.restriction,
    ability: {
      id: ability.id as CharacterAbilityId,
      name: ability.name,
      trigger: ability.trigger,
      effect: ability.effect,
      restriction: ability.restriction,
    },
  };
});

export const OPPORTUNITIES: OpportunityDefinition[] = upstreamOpportunities.map((row) => ({
  id: row.id as OpportunityId,
  name: row.name,
  type: row.type,
  trigger: row.trigger,
  cost: row.cost,
  effect: row.effect,
  restriction: row.restriction,
  notes: row.notes,
  equipment: row.type === '持续法宝',
  effectKey: row.id as OpportunityId,
}));

export const CALAMITIES: CalamityDefinition[] = upstreamCalamities.map((row) => ({
  id: row.id as CalamityId,
  name: row.name,
  stage: row.stage as CalamityDefinition['stage'],
  demand: {
    4: Number(row.demand_4p),
    5: Number(row.demand_5p),
    6: Number(row.demand_6p),
  },
  effect: row.effect,
  notes: row.notes,
}));

function parseReward(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid reward: ${value}`);
  return parsed;
}

export const FATES: FateDefinition[] = upstreamFates.map((row) => ({
  id: row.id as FateId,
  name: row.name,
  mainFate: row.main_fate,
  mainReward: parseReward(row.main_reward),
  obsession: row.obsession,
  obsessionReward: parseReward(row.obsession_reward),
  notes: row.notes,
}));

export const CHARACTER_BY_ID = new Map(CHARACTERS.map((item) => [item.id, item]));
export const OPPORTUNITY_BY_ID = new Map(OPPORTUNITIES.map((item) => [item.id, item]));
export const CALAMITY_BY_ID = new Map(CALAMITIES.map((item) => [item.id, item]));
export const FATE_BY_ID = new Map(FATES.map((item) => [item.id, item]));

export const RULES_DIGEST =
  '最多八轮。每轮揭示天劫、吐纳、谈判、秘密选择修炼/修台/抗劫/探索并同时揭晓。' +
  '修台与抗劫的有效玩家投入获得等量功德；第三道裂痕或第八轮未启动则全员失败。' +
  '启动时修为至少6才合格，按天命结算后的功德、修为、灵力、劫首顺序竞争开放席位。';

export function assertContentCoverage(): void {
  if (CHARACTERS.length !== 7) throw new Error('Expected 7 characters');
  if (OPPORTUNITIES.length !== 48) throw new Error('Expected 48 opportunities');
  if (CALAMITIES.length !== 18) throw new Error('Expected 18 calamities');
  if (FATES.length !== 12) throw new Error('Expected 12 fates');

  const allIds = [
    ...CHARACTERS.map((item) => item.id),
    ...CHARACTERS.map((item) => item.ability.id),
    ...OPPORTUNITIES.map((item) => item.id),
    ...CALAMITIES.map((item) => item.id),
    ...FATES.map((item) => item.id),
  ];
  if (new Set(allIds).size !== 92) {
    throw new Error('Content IDs must be unique');
  }
}
