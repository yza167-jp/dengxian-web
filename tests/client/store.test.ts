import { describe, expect, it, vi } from 'vitest';
import { useGameStore } from '../../src/client/store/gameStore';

function installMemoryWindow(): Map<string, string> {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    get length() {
      return values.size;
    },
  };
  vi.stubGlobal('window', { localStorage: storage, sessionStorage: storage });
  return values;
}

describe('client game store', () => {
  it('starts a local solo game and exposes legal human actions', () => {
    const store = useGameStore.getState();
    store.updateSetup({ playerName: '测试修士', playerCount: 4, seed: 42 });
    store.startSolo();
    const view = useGameStore.getState().view;
    expect(view?.mode).toBe('solo');
    expect(view?.seatId).toBe('seat-1');
    expect(view?.players).toHaveLength(4);
    expect(view?.legalActions.length).toBeGreaterThan(0);
  });

  it('submits a current legal action without losing the redacted self view', async () => {
    const store = useGameStore.getState();
    store.updateSetup({ playerName: '测试修士', playerCount: 4, seed: 77 });
    store.startSolo();
    const before = useGameStore.getState().view;
    expect(before?.legalActions[0]).toBeDefined();
    await useGameStore.getState().submitAction(before!.legalActions[0]!.id);
    const after = useGameStore.getState().view;
    expect(after?.seatId).toBe('seat-1');
    expect(after?.revision).toBeGreaterThan(before!.revision);
    expect(after?.self).toBeTruthy();
  });

  it('autosaves the recent local solo game after transitions', async () => {
    const values = installMemoryWindow();
    const store = useGameStore.getState();
    store.updateSetup({ playerName: '自动存档', playerCount: 4, seed: 88 });
    store.startSolo();
    expect(values.has('dengxiantai.recentSolo')).toBe(true);
    const before = useGameStore.getState().view;
    await useGameStore.getState().submitAction(before!.legalActions[0]!.id);
    const saved = JSON.parse(values.get('dengxiantai.recentSolo') ?? '{}') as { state?: { revision?: number } };
    expect(saved.state?.revision).toBe(useGameStore.getState().view?.revision);
  });

  it('rejects an unsupported local save schema instead of silently loading it', () => {
    installMemoryWindow();
    expect(() => useGameStore.getState().importLocalSave(JSON.stringify({
      schemaVersion: 0,
      state: {},
      humanSeatId: 'seat-1',
    }))).toThrow(/存档格式无效/);
  });
});
