import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import {
  BOT_DIFFICULTIES,
  BOT_PERSONAS,
  BOT_PROVIDERS,
  BOT_PRESETS,
  getBotPreset,
  type BotDifficulty,
  type BotPersona,
  type BotProfileFields,
  type BotProvider,
  type BotPreset,
} from '../shared/bots';
import { newId, newToken, sha256, type ServerStorage } from './storage';

const MAX_MEMORY_LIMIT = 200;
const DEFAULT_MEMORY_LIMIT = 50;
const MAX_TEXT_LENGTH = 2_000;

const botFieldsSchema = z.object({
  name: z.string().trim().min(1).max(40),
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(500),
  provider: z.enum(BOT_PROVIDERS),
  model: z.string().trim().min(1).max(120).nullable(),
  difficulty: z.enum(BOT_DIFFICULTIES),
  persona: z.enum(BOT_PERSONAS),
  thinking: z.boolean(),
  traits: z.array(z.string().trim().min(1).max(40)).max(12),
  preferences: z.array(z.string().trim().min(1).max(60)).max(12),
  communicationStyle: z.string().trim().min(1).max(240),
}) satisfies z.ZodType<BotProfileFields>;

const botPatchSchema = botFieldsSchema.partial().strict();

const metadataSchema = z.record(z.string(), z.unknown()).default({});

export interface StoredBotProfile extends BotProfileFields {
  id: string;
  presetId: string;
  isPreset: false;
  createdAt: string;
  updatedAt: string;
}

export interface BotCreateResult {
  profile: StoredBotProfile;
  managerToken: string;
}

export interface BotMemory {
  id: string;
  profileId: string;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface BotGrowthStats {
  level: number;
  xp: number;
  games: number;
  ascensions: number;
  decisions: number;
  messages: number;
  fallback: number;
}

export interface BotUsageRecord {
  id: string;
  profileId: string;
  provider: BotProvider;
  model: string | null;
  cacheStatus: 'hit' | 'miss';
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  latencyMs: number;
  retryCount: number;
  usedFallback: boolean;
  usdMicros: number;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface BotUsageAnalytics {
  records: number;
  cacheHits: number;
  cacheMisses: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  latencyMsAvg: number;
  retryCount: number;
  fallback: number;
  usdMicros: number;
}

interface BotProfileRow {
  id: string;
  preset_id: string;
  name: string;
  title: string;
  description: string;
  provider: BotProvider;
  model: string | null;
  difficulty: BotDifficulty;
  persona: BotPersona;
  thinking: number;
  traits_json: string;
  preferences_json: string;
  communication_style: string;
  created_at: string;
  updated_at: string;
}

interface BotMemoryRow {
  id: string;
  profile_id: string;
  content: string;
  metadata_json: string;
  created_at: string;
}

interface BotUsageRow {
  id: string;
  profile_id: string;
  provider: BotProvider;
  model: string | null;
  cache_status: 'hit' | 'miss';
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  latency_ms: number;
  retry_count: number;
  used_fallback: number;
  usd_micros: number;
  metadata_json: string;
  created_at: string;
}

interface GrowthRow {
  level: number;
  xp: number;
  games: number;
  ascensions: number;
  decisions: number;
  messages: number;
  fallback: number;
}

interface UsageAnalyticsRow {
  records: number | null;
  cache_hits: number | null;
  cache_misses: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  reasoning_tokens: number | null;
  latency_ms_avg: number | null;
  retry_count: number | null;
  fallback: number | null;
  usd_micros: number | null;
}

function now(): string {
  return new Date().toISOString();
}

function encode(value: unknown): string {
  return JSON.stringify(value);
}

function decodeRecord(value: string): Record<string, unknown> {
  return metadataSchema.parse(JSON.parse(value));
}

function decodeStringArray(value: string): string[] {
  return z.array(z.string()).parse(JSON.parse(value));
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_MEMORY_LIMIT;
  if (!Number.isInteger(limit) || limit < 1) throw new Error('Limit must be a positive integer');
  return Math.min(limit, MAX_MEMORY_LIMIT);
}

function assertNonNegativeInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${field} must be a non-negative integer`);
}

function equalSha256(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, 'hex');
  const rightBytes = Buffer.from(right, 'hex');
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function toProfile(row: BotProfileRow): StoredBotProfile {
  return {
    id: row.id,
    presetId: row.preset_id,
    isPreset: false,
    name: row.name,
    title: row.title,
    description: row.description,
    provider: row.provider,
    model: row.model,
    difficulty: row.difficulty,
    persona: row.persona,
    thinking: row.thinking === 1,
    traits: decodeStringArray(row.traits_json),
    preferences: decodeStringArray(row.preferences_json),
    communicationStyle: row.communication_style,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toMemory(row: BotMemoryRow): BotMemory {
  return {
    id: row.id,
    profileId: row.profile_id,
    content: row.content,
    metadata: decodeRecord(row.metadata_json),
    createdAt: row.created_at,
  };
}

function toUsage(row: BotUsageRow): BotUsageRecord {
  return {
    id: row.id,
    profileId: row.profile_id,
    provider: row.provider,
    model: row.model,
    cacheStatus: row.cache_status,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    reasoningTokens: row.reasoning_tokens,
    latencyMs: row.latency_ms,
    retryCount: row.retry_count,
    usedFallback: row.used_fallback === 1,
    usdMicros: row.usd_micros,
    metadata: decodeRecord(row.metadata_json),
    createdAt: row.created_at,
  };
}

export class BotService {
  constructor(private readonly storage: ServerStorage) {}

  listPresets(): readonly BotPreset[] {
    return BOT_PRESETS;
  }

  getPreset(id: string): BotPreset | null {
    return getBotPreset(id);
  }

  createFromPreset(input: {
    presetId: string;
    overrides?: Partial<BotProfileFields>;
    managerToken?: string;
  }): BotCreateResult {
    const preset = getBotPreset(input.presetId);
    if (!preset) throw new Error('Bot preset not found');
    const fields = botFieldsSchema.parse({ ...preset, ...input.overrides });
    const id = newId('bot');
    const managerToken = input.managerToken ?? newToken();
    const createdAt = now();
    this.storage.db.prepare(`
      INSERT INTO bot_profiles (
        id, preset_id, name, title, description, provider, model, difficulty, persona, thinking,
        traits_json, preferences_json, communication_style, manager_token_hash, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      preset.id,
      fields.name,
      fields.title,
      fields.description,
      fields.provider,
      fields.model,
      fields.difficulty,
      fields.persona,
      fields.thinking ? 1 : 0,
      encode(fields.traits),
      encode(fields.preferences),
      fields.communicationStyle,
      sha256(managerToken),
      createdAt,
      createdAt,
    );
    return { profile: this.getProfile(id)!, managerToken };
  }

  listProfiles(managerToken: string): StoredBotProfile[];
  listProfiles(input: { managerToken: string }): StoredBotProfile[];
  listProfiles(input: string | { managerToken: string }): StoredBotProfile[] {
    const managerToken = typeof input === 'string' ? input : input.managerToken;
    return (this.storage.db.prepare(`
      SELECT *
      FROM bot_profiles
      WHERE manager_token_hash = ? AND deleted_at IS NULL
      ORDER BY updated_at DESC, created_at DESC
    `).all(sha256(managerToken)) as unknown as BotProfileRow[]).map(toProfile);
  }

  getProfile(profileId: string): StoredBotProfile | null {
    const row = this.storage.db.prepare(`
      SELECT *
      FROM bot_profiles
      WHERE id = ? AND deleted_at IS NULL
    `).get(profileId) as BotProfileRow | undefined;
    return row ? toProfile(row) : null;
  }

  getManagedProfile(profileId: string, managerToken: string): StoredBotProfile {
    this.assertManager(profileId, managerToken);
    return this.getProfile(profileId)!;
  }

  updateProfile(input: {
    profileId: string;
    managerToken: string;
    patch: Partial<BotProfileFields>;
  }): StoredBotProfile {
    this.assertManager(input.profileId, input.managerToken);
    const current = this.getProfile(input.profileId);
    if (!current) throw new Error('Bot profile not found');
    const fields = botFieldsSchema.parse({ ...current, ...botPatchSchema.parse(input.patch) });
    const updatedAt = now();
    this.storage.db.prepare(`
      UPDATE bot_profiles
      SET name = ?, title = ?, description = ?, provider = ?, model = ?, difficulty = ?, persona = ?,
        thinking = ?, traits_json = ?, preferences_json = ?, communication_style = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL
    `).run(
      fields.name,
      fields.title,
      fields.description,
      fields.provider,
      fields.model,
      fields.difficulty,
      fields.persona,
      fields.thinking ? 1 : 0,
      encode(fields.traits),
      encode(fields.preferences),
      fields.communicationStyle,
      updatedAt,
      input.profileId,
    );
    return this.getProfile(input.profileId)!;
  }

  deleteProfile(input: { profileId: string; managerToken: string }): void {
    this.assertManager(input.profileId, input.managerToken);
    const deletedAt = now();
    const result = this.storage.db.prepare(`
      UPDATE bot_profiles
      SET deleted_at = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL
    `).run(deletedAt, deletedAt, input.profileId);
    if (result.changes === 0) throw new Error('Bot profile not found');
  }

  appendMemory(input: {
    profileId: string;
    managerToken: string;
    content: string;
    metadata?: Record<string, unknown>;
  }): BotMemory {
    this.assertManager(input.profileId, input.managerToken);
    return this.insertMemory(input.profileId, input.content, input.metadata);
  }

  appendRuntimeMemory(input: {
    profileId: string;
    content: string;
    metadata?: Record<string, unknown>;
  }): BotMemory {
    if (!this.getProfile(input.profileId)) throw new Error('Bot profile not found');
    return this.insertMemory(input.profileId, input.content, input.metadata);
  }

  private insertMemory(
    profileId: string,
    rawContent: string,
    rawMetadata: Record<string, unknown> | undefined,
  ): BotMemory {
    const content = z.string().trim().min(1).max(MAX_TEXT_LENGTH).parse(rawContent);
    const metadata = metadataSchema.parse(rawMetadata ?? {});
    const id = newId('botmem');
    this.storage.db.prepare(`
      INSERT INTO bot_memories (id, profile_id, content, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, profileId, content, encode(metadata), now());
    return this.getMemory(id)!;
  }

  listMemories(input: {
    profileId: string;
    managerToken: string;
    limit?: number;
  }): BotMemory[] {
    this.assertManager(input.profileId, input.managerToken);
    const rows = this.storage.db.prepare(`
      SELECT *
      FROM bot_memories
      WHERE profile_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `).all(input.profileId, clampLimit(input.limit)) as unknown as BotMemoryRow[];
    return rows.map(toMemory);
  }

  listRuntimeMemories(profileId: string, limit?: number): BotMemory[] {
    if (!this.getProfile(profileId)) throw new Error('Bot profile not found');
    const rows = this.storage.db.prepare(`
      SELECT *
      FROM bot_memories
      WHERE profile_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `).all(profileId, clampLimit(limit)) as unknown as BotMemoryRow[];
    return rows.map(toMemory);
  }

  recordGrowth(input: {
    profileId: string;
    xp?: number;
    games?: number;
    ascensions?: number;
    decisions?: number;
    messages?: number;
    fallback?: number;
  }): BotGrowthStats {
    if (!this.getProfile(input.profileId)) throw new Error('Bot profile not found');
    const increments = {
      xp: input.xp ?? 0,
      games: input.games ?? 0,
      ascensions: input.ascensions ?? 0,
      decisions: input.decisions ?? 0,
      messages: input.messages ?? 0,
      fallback: input.fallback ?? 0,
    };
    for (const [field, value] of Object.entries(increments)) assertNonNegativeInteger(value, field);
    this.storage.db.prepare(`
      UPDATE bot_profiles
      SET xp = xp + ?,
        games = games + ?,
        ascensions = ascensions + ?,
        decisions = decisions + ?,
        messages = messages + ?,
        fallback = fallback + ?,
        level = MAX(level, CAST(((xp + ?) / 100) AS INTEGER) + 1),
        updated_at = ?
      WHERE id = ? AND deleted_at IS NULL
    `).run(
      increments.xp,
      increments.games,
      increments.ascensions,
      increments.decisions,
      increments.messages,
      increments.fallback,
      increments.xp,
      now(),
      input.profileId,
    );
    return this.getGrowthStats(input.profileId);
  }

  getGrowthStats(profileId: string): BotGrowthStats {
    const row = this.storage.db.prepare(`
      SELECT level, xp, games, ascensions, decisions, messages, fallback
      FROM bot_profiles
      WHERE id = ? AND deleted_at IS NULL
    `).get(profileId) as GrowthRow | undefined;
    if (!row) throw new Error('Bot profile not found');
    return row;
  }

  recordUsage(input: {
    profileId: string;
    provider: BotProvider;
    model?: string | null;
    cacheStatus: 'hit' | 'miss';
    inputTokens?: number;
    outputTokens?: number;
    reasoningTokens?: number;
    latencyMs?: number;
    retryCount?: number;
    usedFallback?: boolean;
    usdMicros?: number;
    metadata?: Record<string, unknown>;
  }): BotUsageRecord {
    if (!this.getProfile(input.profileId)) throw new Error('Bot profile not found');
    const provider = z.enum(BOT_PROVIDERS).parse(input.provider);
    const cacheStatus = z.enum(['hit', 'miss']).parse(input.cacheStatus);
    const metadata = metadataSchema.parse(input.metadata ?? {});
    const numbers = {
      inputTokens: input.inputTokens ?? 0,
      outputTokens: input.outputTokens ?? 0,
      reasoningTokens: input.reasoningTokens ?? 0,
      latencyMs: input.latencyMs ?? 0,
      retryCount: input.retryCount ?? 0,
      usdMicros: input.usdMicros ?? 0,
    };
    for (const [field, value] of Object.entries(numbers)) assertNonNegativeInteger(value, field);
    const id = newId('botuse');
    this.storage.db.prepare(`
      INSERT INTO bot_usage (
        id, profile_id, provider, model, cache_status, input_tokens, output_tokens, reasoning_tokens,
        latency_ms, retry_count, used_fallback, usd_micros, metadata_json, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.profileId,
      provider,
      input.model ?? null,
      cacheStatus,
      numbers.inputTokens,
      numbers.outputTokens,
      numbers.reasoningTokens,
      numbers.latencyMs,
      numbers.retryCount,
      input.usedFallback ? 1 : 0,
      numbers.usdMicros,
      encode(metadata),
      now(),
    );
    return this.getUsage(id)!;
  }

  listUsage(profileId: string, limit = 50): BotUsageRecord[] {
    if (!this.getProfile(profileId)) throw new Error('Bot profile not found');
    const rows = this.storage.db.prepare(`
      SELECT *
      FROM bot_usage
      WHERE profile_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `).all(profileId, clampLimit(limit)) as unknown as BotUsageRow[];
    return rows.map(toUsage);
  }

  getUsageAnalytics(profileId?: string): BotUsageAnalytics {
    const row = profileId
      ? this.storage.db.prepare(`
          SELECT
            COUNT(*) AS records,
            SUM(CASE WHEN cache_status = 'hit' THEN 1 ELSE 0 END) AS cache_hits,
            SUM(CASE WHEN cache_status = 'miss' THEN 1 ELSE 0 END) AS cache_misses,
            SUM(input_tokens) AS input_tokens,
            SUM(output_tokens) AS output_tokens,
            SUM(reasoning_tokens) AS reasoning_tokens,
            AVG(latency_ms) AS latency_ms_avg,
            SUM(retry_count) AS retry_count,
            SUM(used_fallback) AS fallback,
            SUM(usd_micros) AS usd_micros
          FROM bot_usage
          WHERE profile_id = ?
        `).get(profileId) as unknown as UsageAnalyticsRow
      : this.storage.db.prepare(`
          SELECT
            COUNT(*) AS records,
            SUM(CASE WHEN cache_status = 'hit' THEN 1 ELSE 0 END) AS cache_hits,
            SUM(CASE WHEN cache_status = 'miss' THEN 1 ELSE 0 END) AS cache_misses,
            SUM(input_tokens) AS input_tokens,
            SUM(output_tokens) AS output_tokens,
            SUM(reasoning_tokens) AS reasoning_tokens,
            AVG(latency_ms) AS latency_ms_avg,
            SUM(retry_count) AS retry_count,
            SUM(used_fallback) AS fallback,
            SUM(usd_micros) AS usd_micros
          FROM bot_usage
        `).get() as unknown as UsageAnalyticsRow;
    const inputTokens = row.input_tokens ?? 0;
    const outputTokens = row.output_tokens ?? 0;
    const reasoningTokens = row.reasoning_tokens ?? 0;
    return {
      records: row.records ?? 0,
      cacheHits: row.cache_hits ?? 0,
      cacheMisses: row.cache_misses ?? 0,
      inputTokens,
      outputTokens,
      reasoningTokens,
      totalTokens: inputTokens + outputTokens + reasoningTokens,
      latencyMsAvg: row.latency_ms_avg ?? 0,
      retryCount: row.retry_count ?? 0,
      fallback: row.fallback ?? 0,
      usdMicros: row.usd_micros ?? 0,
    };
  }

  private getMemory(memoryId: string): BotMemory | null {
    const row = this.storage.db.prepare('SELECT * FROM bot_memories WHERE id = ?')
      .get(memoryId) as BotMemoryRow | undefined;
    return row ? toMemory(row) : null;
  }

  private getUsage(usageId: string): BotUsageRecord | null {
    const row = this.storage.db.prepare('SELECT * FROM bot_usage WHERE id = ?')
      .get(usageId) as BotUsageRow | undefined;
    return row ? toUsage(row) : null;
  }

  private assertManager(profileId: string, managerToken: string): void {
    const row = this.storage.db.prepare(`
      SELECT manager_token_hash
      FROM bot_profiles
      WHERE id = ? AND deleted_at IS NULL
    `).get(profileId) as { manager_token_hash: string } | undefined;
    if (!row) throw new Error('Bot profile not found');
    if (!equalSha256(row.manager_token_hash, sha256(managerToken))) throw new Error('Invalid bot manager token');
  }
}
