import { OPPORTUNITIES } from '../data/content';
import type { OpportunityId, WindowTiming } from './types';

export type ReactionTiming =
  | 'after_lightning_loss'
  | 'before_lightning'
  | 'before_cultivation_loss'
  | 'before_third_crack'
  | 'when_targeted'
  | 'before_explore_draw'
  | 'after_explore_discard';

export type EffectTiming = WindowTiming | ReactionTiming | 'equipment';
export type TargetMode =
  | 'none'
  | 'self'
  | 'any'
  | 'other'
  | 'other_more_spirit'
  | 'repair_player'
  | 'non_explore_player'
  | 'same_public_action'
  | 'lightning_redirect'
  | 'lightning_other'
  | 'effective_contributor';

export interface CardEffectMeta {
  timing: EffectTiming;
  target: TargetMode;
  amountChoices?: readonly number[];
  destinations?: readonly string[];
}

export const CARD_EFFECTS: Record<string, CardEffectMeta> = {
  C01: { timing: 'after_breath', target: 'self' },
  C02: { timing: 'after_reveal', target: 'self' },
  C03: { timing: 'after_lightning_loss', target: 'self' },
  C04: { timing: 'opportunity', target: 'any' },
  C05: { timing: 'after_reveal', target: 'self' },
  C06: { timing: 'before_lightning', target: 'self' },
  C07: { timing: 'before_third_crack', target: 'self' },
  C08: { timing: 'after_reveal', target: 'self' },
  C09: { timing: 'after_reveal', target: 'self' },
  C10: { timing: 'after_reveal', target: 'self', amountChoices: [1, 2] },
  C11: { timing: 'after_calamity', target: 'self' },
  C12: { timing: 'opportunity', target: 'other', amountChoices: [1, 2] },
  C13: { timing: 'after_reveal', target: 'other_more_spirit' },
  C14: { timing: 'after_reveal', target: 'repair_player' },
  C15: { timing: 'before_lightning', target: 'lightning_redirect' },
  C16: { timing: 'opportunity', target: 'other' },
  E01: { timing: 'equipment', target: 'self' },
  E02: { timing: 'equipment', target: 'self' },
  E03: { timing: 'equipment', target: 'self' },
  E04: { timing: 'equipment', target: 'self' },
  E05: { timing: 'equipment', target: 'self' },
  E06: { timing: 'equipment', target: 'self' },
  E07: { timing: 'equipment', target: 'self' },
  E08: { timing: 'equipment', target: 'self' },
  C17: { timing: 'after_reveal', target: 'self' },
  C18: { timing: 'before_cultivation_loss', target: 'self' },
  C19: { timing: 'opportunity', target: 'self' },
  C20: { timing: 'when_targeted', target: 'self' },
  C21: { timing: 'after_reveal', target: 'same_public_action' },
  C22: { timing: 'before_lightning', target: 'lightning_other' },
  C23: { timing: 'before_contribution', target: 'self' },
  C24: { timing: 'after_reveal', target: 'other' },
  C25: { timing: 'after_calamity', target: 'self' },
  C26: { timing: 'before_explore_draw', target: 'self' },
  C27: { timing: 'after_reveal', target: 'self' },
  C28: { timing: 'before_lightning', target: 'effective_contributor' },
  C29: {
    timing: 'after_reveal',
    target: 'self',
    destinations: ['repair', 'resist'],
  },
  C30: { timing: 'after_reveal', target: 'other' },
  C31: { timing: 'before_lightning', target: 'self' },
  C32: { timing: 'after_explore_discard', target: 'self' },
  E09: { timing: 'equipment', target: 'self' },
  E10: { timing: 'equipment', target: 'self' },
  E11: { timing: 'equipment', target: 'self' },
  E12: { timing: 'equipment', target: 'self' },
  E13: { timing: 'equipment', target: 'self' },
  E14: { timing: 'equipment', target: 'self' },
  E15: { timing: 'equipment', target: 'self' },
  E16: { timing: 'equipment', target: 'self' },
};

export function assertEffectCoverage(): void {
  const dataIds = OPPORTUNITIES.map((card) => card.id).sort();
  const effectIds = Object.keys(CARD_EFFECTS).sort();
  if (
    dataIds.length !== effectIds.length ||
    dataIds.some((id, index) => id !== effectIds[index])
  ) {
    throw new Error(
      `Effect registry mismatch. data=${dataIds.join(',')} effects=${effectIds.join(',')}`,
    );
  }
}

export function getEffectMeta(cardId: OpportunityId): CardEffectMeta {
  const meta = CARD_EFFECTS[cardId];
  if (!meta) throw new Error(`Unimplemented opportunity effect: ${cardId}`);
  return meta;
}
