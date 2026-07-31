import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BotService } from '../../src/server/botService';
import { ServerStorage, sha256 } from '../../src/server/storage';
import { BOT_PRESETS } from '../../src/shared/bots';

let storage: ServerStorage;
let bots: BotService;

beforeEach(() => {
  storage = new ServerStorage(':memory:');
  bots = new BotService(storage);
});

afterEach(() => {
  storage.close();
});

describe('BotService', () => {
  it('applies bot migration id 3 and exposes immutable Chinese presets', () => {
    const migration = storage.db.prepare('SELECT id FROM migrations WHERE id = 3').get();
    expect(migration).toEqual({ id: 3 });
    expect(bots.listPresets().length).toBeGreaterThanOrEqual(16);
    expect(BOT_PRESETS.every((preset) => preset.immutable)).toBe(true);
    expect(BOT_PRESETS.some((preset) => preset.name === '守台玄衡')).toBe(true);
    expect(() => {
      (BOT_PRESETS[0] as { name: string }).name = 'mutated';
    }).toThrow();
  });

  it('creates profiles from presets with one-time manager tokens and no raw token persistence', () => {
    const created = bots.createFromPreset({
      presetId: 'steady-altar-keeper',
      overrides: {
        name: '我的守台者',
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        thinking: true,
      },
      managerToken: 'client-held-token',
    });

    expect(created.managerToken).toBe('client-held-token');
    expect(created.profile).toMatchObject({
      name: '我的守台者',
      presetId: 'steady-altar-keeper',
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      thinking: true,
    });
    expect(JSON.stringify(created.profile)).not.toContain('client-held-token');

    const row = storage.db.prepare('SELECT manager_token_hash FROM bot_profiles WHERE id = ?')
      .get(created.profile.id) as { manager_token_hash: string };
    expect(row.manager_token_hash).toBe(sha256('client-held-token'));
    expect(JSON.stringify(row)).not.toContain('client-held-token');
  });

  it('lists, gets, updates, and deletes custom profiles through manager-token authorization', () => {
    const { profile, managerToken } = bots.createFromPreset({
      presetId: 'quiet-merit-ledger',
      managerToken: 'shared-manager-token',
    });
    const second = bots.createFromPreset({
      presetId: 'silent-sword',
      managerToken: 'shared-manager-token',
    });
    const other = bots.createFromPreset({
      presetId: 'bold-thunder-rider',
      managerToken: 'other-manager-token',
    });

    expect(bots.listProfiles({ managerToken }).map((listed) => listed.id).sort()).toEqual([
      profile.id,
      second.profile.id,
    ].sort());
    expect(bots.listProfiles({ managerToken: other.managerToken }).map((listed) => listed.id)).toEqual([
      other.profile.id,
    ]);
    expect(bots.listProfiles({ managerToken: 'unused-manager-token' })).toEqual([]);
    expect(bots.getProfile(profile.id)?.name).toBe('功簿青衣');
    expect(bots.getManagedProfile(profile.id, managerToken).id).toBe(profile.id);
    expect(() => bots.getManagedProfile(profile.id, 'wrong-token')).toThrow(/Invalid bot manager token/);
    expect(() => bots.updateProfile({
      profileId: profile.id,
      managerToken: 'wrong-token',
      patch: { name: '伪造' },
    })).toThrow(/Invalid bot manager token/);

    const updated = bots.updateProfile({
      profileId: profile.id,
      managerToken,
      patch: {
        name: '功簿青衣二号',
        traits: ['算分', '可编辑'],
        communicationStyle: '只报告可验证的账目变化。',
      },
    });
    expect(updated.name).toBe('功簿青衣二号');
    expect(updated.traits).toEqual(['算分', '可编辑']);

    bots.deleteProfile({ profileId: profile.id, managerToken });
    expect(bots.getProfile(profile.id)).toBeNull();
    expect(bots.listProfiles({ managerToken }).some((listed) => listed.id === profile.id)).toBe(false);
  });

  it('appends and lists memories with a bounded limit', () => {
    const { profile, managerToken } = bots.createFromPreset({ presetId: 'archive-sage' });

    expect(() => bots.appendMemory({
      profileId: profile.id,
      managerToken: 'wrong-token',
      content: 'should fail',
    })).toThrow(/Invalid bot manager token/);

    for (let index = 0; index < 5; index += 1) {
      const memory = bots.appendMemory({
        profileId: profile.id,
        managerToken,
        content: `第 ${index + 1} 条记忆`,
        metadata: { roomId: `room-${index + 1}` },
      });
      expect(memory.profileId).toBe(profile.id);
    }
    const runtimeMemory = bots.appendRuntimeMemory({
      profileId: profile.id,
      content: '终局摘要：共同飞升失败，但仙台保住一裂。',
      metadata: { source: 'room-service' },
    });
    expect(runtimeMemory.metadata).toEqual({ source: 'room-service' });

    expect(bots.listMemories({ profileId: profile.id, managerToken, limit: 3 })).toHaveLength(3);
    expect(bots.listRuntimeMemories(profile.id, 2)).toHaveLength(2);
    expect(bots.listMemories({ profileId: profile.id, managerToken, limit: 500 })).toHaveLength(6);
    expect(bots.listRuntimeMemories(profile.id, 500)).toHaveLength(6);
    expect(() => bots.listMemories({ profileId: profile.id, managerToken, limit: 0 })).toThrow(/Limit/);
    expect(() => bots.appendRuntimeMemory({
      profileId: 'missing-profile',
      content: 'should fail',
    })).toThrow(/Bot profile not found/);
  });

  it('tracks growth stats and usage analytics', () => {
    const { profile } = bots.createFromPreset({ presetId: 'jade-calculator' });

    expect(bots.getGrowthStats(profile.id)).toEqual({
      level: 1,
      xp: 0,
      games: 0,
      ascensions: 0,
      decisions: 0,
      messages: 0,
      fallback: 0,
    });
    expect(bots.recordGrowth({
      profileId: profile.id,
      xp: 250,
      games: 2,
      ascensions: 1,
      decisions: 8,
      messages: 3,
      fallback: 1,
    })).toEqual({
      level: 3,
      xp: 250,
      games: 2,
      ascensions: 1,
      decisions: 8,
      messages: 3,
      fallback: 1,
    });

    const miss = bots.recordUsage({
      profileId: profile.id,
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      cacheStatus: 'miss',
      inputTokens: 100,
      outputTokens: 20,
      reasoningTokens: 5,
      latencyMs: 250,
      retryCount: 1,
      usedFallback: true,
      usdMicros: 42,
      metadata: { actionId: 'a1' },
    });
    expect(miss).toMatchObject({
      provider: 'deepseek',
      cacheStatus: 'miss',
      inputTokens: 100,
      outputTokens: 20,
      reasoningTokens: 5,
    });
    bots.recordUsage({
      profileId: profile.id,
      provider: 'local-bot',
      cacheStatus: 'hit',
      latencyMs: 10,
    });

    expect(bots.listUsage(profile.id, 10)).toHaveLength(2);
    expect(bots.getUsageAnalytics(profile.id)).toEqual({
      records: 2,
      cacheHits: 1,
      cacheMisses: 1,
      inputTokens: 100,
      outputTokens: 20,
      reasoningTokens: 5,
      totalTokens: 125,
      latencyMsAvg: 130,
      retryCount: 1,
      fallback: 1,
      usdMicros: 42,
    });
  });
});
