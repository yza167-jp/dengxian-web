export interface ProviderTokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  promptCacheHitTokens?: number;
  promptCacheMissTokens?: number;
  reasoningTokens?: number;
}

interface ModelRates {
  cacheHitInputUsdMicrosPerMillion: number;
  cacheMissInputUsdMicrosPerMillion: number;
  outputUsdMicrosPerMillion: number;
}

const DEEPSEEK_V4_RATES: Record<string, ModelRates> = {
  'deepseek-v4-flash': {
    cacheHitInputUsdMicrosPerMillion: 2_800,
    cacheMissInputUsdMicrosPerMillion: 140_000,
    outputUsdMicrosPerMillion: 280_000,
  },
  'deepseek-v4-pro': {
    cacheHitInputUsdMicrosPerMillion: 3_625,
    cacheMissInputUsdMicrosPerMillion: 435_000,
    outputUsdMicrosPerMillion: 870_000,
  },
};

function costUsdMicros(tokens: number | undefined, usdMicrosPerMillion: number): number {
  return Math.round(((tokens ?? 0) * usdMicrosPerMillion) / 1_000_000);
}

export function estimateDeepSeekUsdMicros(model: string, usage: ProviderTokenUsage): number | null {
  const rates = DEEPSEEK_V4_RATES[model];
  if (!rates) return null;

  const promptCacheHitTokens = usage.promptCacheHitTokens ?? 0;
  const promptCacheMissTokens = usage.promptCacheMissTokens
    ?? Math.max(0, (usage.promptTokens ?? 0) - promptCacheHitTokens);

  return costUsdMicros(promptCacheHitTokens, rates.cacheHitInputUsdMicrosPerMillion)
    + costUsdMicros(promptCacheMissTokens, rates.cacheMissInputUsdMicrosPerMillion)
    + costUsdMicros(usage.completionTokens, rates.outputUsdMicrosPerMillion);
}
