import { describe, expect, it, vi } from 'vitest';
import { clientApi, type ClientSession, type RoomSnapshot } from '../../src/client/api/clientApi';
import { useGameStore } from '../../src/client/store/gameStore';
import { createGame } from '../../src/shared/game/engine';
import { getViewForSeat } from '../../src/shared/game/view';

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
  it('starts a local solo game and exposes legal human actions', async () => {
    const store = useGameStore.getState();
    store.updateSetup({
      playerName: '测试修士',
      playerCount: 4,
      seed: 42,
      provider: 'local-bot',
      characterId: 'R07',
    });
    await store.startSolo();
    const view = useGameStore.getState().view;
    expect(view?.mode).toBe('solo');
    expect(view?.seatId).toBe('seat-1');
    expect(view?.players).toHaveLength(4);
    expect(view?.legalActions.length).toBeGreaterThan(0);
    expect(view?.players.find((player) => player.id === 'seat-1')?.characterId).toBe('R07');
  });

  it('submits a current legal action without losing the redacted self view', async () => {
    const store = useGameStore.getState();
    store.updateSetup({ playerName: '测试修士', playerCount: 4, seed: 77, provider: 'local-bot' });
    await store.startSolo();
    const before = useGameStore.getState().view;
    expect(before?.legalActions[0]).toBeDefined();
    await useGameStore.getState().submitAction(before!.legalActions[0]!.id);
    const after = useGameStore.getState().view;
    expect(after?.seatId).toBe('seat-1');
    expect(after?.revision).toBeGreaterThan(before!.revision);
    expect(after?.self).toBeTruthy();
    expect(useGameStore.getState().chat.every((message) => message.message.length > 0)).toBe(true);
  });

  it('autosaves the recent local solo game after transitions', async () => {
    const values = installMemoryWindow();
    const store = useGameStore.getState();
    store.updateSetup({ playerName: '自动存档', playerCount: 4, seed: 88, provider: 'local-bot' });
    await store.startSolo();
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
    }))).not.toThrow();
    expect(useGameStore.getState().error).toMatch(/导入失败.*存档格式无效/);
  });

  it('rejects saves from a different upstream rules commit', async () => {
    installMemoryWindow();
    const store = useGameStore.getState();
    store.updateSetup({ provider: 'local-bot', characterId: 'random', seed: 909 });
    await store.startSolo();
    useGameStore.getState().saveLocalNamed('规则版本校验');
    const save = useGameStore.getState().localSaves[0]!;
    const exported = useGameStore.getState().exportLocalSave(save.id)!;
    const tampered = JSON.parse(exported) as { state: { upstreamCommit: string } };
    tampered.state.upstreamCommit = 'forged-upstream-commit';

    useGameStore.getState().importLocalSave(JSON.stringify(tampered), true);
    expect(useGameStore.getState().error).toMatch(/导入失败/);
  });

  it('rejects malformed chat payloads in imported saves', async () => {
    installMemoryWindow();
    const store = useGameStore.getState();
    store.updateSetup({ provider: 'local-bot', characterId: 'random', seed: 910 });
    await store.startSolo();
    store.saveLocalNamed('会话校验');
    const save = useGameStore.getState().localSaves[0]!;
    const exported = useGameStore.getState().exportLocalSave(save.id)!;
    const malformed = JSON.parse(exported) as { chat: unknown };
    malformed.chat = [{ id: 'bad', message: 7 }];

    store.importLocalSave(JSON.stringify(malformed), true);

    expect(useGameStore.getState().error).toMatch(/导入失败/);
  });

  it('starts a Provider solo room through the recoverable online session', async () => {
    const values = installMemoryWindow();
    const initial = providerSession();
    const activeState = createGame({
      mode: 'online',
      seed: 5150,
      seats: [
        { id: 'seat-1', name: '测试修士', kind: 'human', characterId: 'R07' },
        ...Array.from({ length: 3 }, (_, index) => ({
          id: `seat-${index + 2}`,
          name: `Bot ${index + 1}`,
          kind: 'bot' as const,
          ai: {
            provider: 'deepseek' as const,
            difficulty: 'normal' as const,
            persona: 'steady' as const,
          },
        })),
      ],
    });
    const active: RoomSnapshot = {
      room: { ...initial.snapshot.room, status: 'active' },
      view: getViewForSeat(activeState, 'seat-1'),
      stateHash: 'active-hash',
    };
    const connect = vi.spyOn(clientApi, 'connect').mockReturnValue(fakeSocket());
    vi.spyOn(clientApi, 'createRoom').mockResolvedValue(initial);
    const addBot = vi.spyOn(clientApi, 'addBot').mockResolvedValue(initial.snapshot);
    vi.spyOn(clientApi, 'ready').mockResolvedValue(initial.snapshot);
    vi.spyOn(clientApi, 'startRoom').mockResolvedValue(active);
    const store = useGameStore.getState();
    store.updateSetup({
      playerName: '测试修士',
      playerCount: 4,
      seed: 5150,
      provider: 'deepseek',
      characterId: 'R07',
    });

    await expect(store.startSolo()).resolves.toBe(true);

    expect(addBot).toHaveBeenCalledTimes(3);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(useGameStore.getState().mode).toBe('table');
    expect(useGameStore.getState().view?.seatId).toBe('seat-1');
    expect(values.has('dengxiantai.onlineSession')).toBe(true);
    vi.restoreAllMocks();
  });

  it('keeps a partially created Provider room recoverable after setup failure', async () => {
    const values = installMemoryWindow();
    const session = providerSession();
    vi.spyOn(clientApi, 'connect').mockReturnValue(fakeSocket());
    vi.spyOn(clientApi, 'createRoom').mockResolvedValue(session);
    vi.spyOn(clientApi, 'addBot').mockRejectedValue(new Error('provider setup interrupted'));
    const ready = vi.spyOn(clientApi, 'ready');
    const store = useGameStore.getState();
    store.updateSetup({
      playerName: '恢复测试',
      playerCount: 4,
      seed: 5151,
      provider: 'deepseek',
      characterId: 'random',
    });

    await expect(store.startSolo()).resolves.toBe(false);

    expect(useGameStore.getState().session?.roomId).toBe(session.roomId);
    expect(useGameStore.getState().mode).toBe('online');
    expect(useGameStore.getState().error).toMatch(/provider setup interrupted/);
    expect(values.has('dengxiantai.onlineSession')).toBe(true);
    expect(ready).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('automatically resyncs an online room after a stale revision rejection', async () => {
    const session = providerSession();
    const state = createGame({
      mode: 'online',
      seed: 6262,
      seats: [
        { id: 'seat-1', name: '同步测试', kind: 'human', characterId: 'R07' },
        ...Array.from({ length: 3 }, (_, index) => ({
          id: `seat-${index + 2}`,
          name: `Bot ${index + 1}`,
          kind: 'bot' as const,
          ai: { provider: 'local-bot' as const, difficulty: 'normal' as const, persona: 'steady' as const },
        })),
      ],
    });
    const staleView = getViewForSeat(state, 'seat-1');
    const latest: RoomSnapshot = {
      room: { ...session.snapshot.room, status: 'active' },
      view: { ...staleView, revision: staleView.revision + 3 },
      stateHash: 'latest-hash',
    };
    const submit = vi.spyOn(clientApi, 'submitAction').mockRejectedValue(
      new Error(JSON.stringify({ error: 'Stale baseRevision' })),
    );
    const refresh = vi.spyOn(clientApi, 'snapshot').mockResolvedValue(latest);
    useGameStore.setState({
      localState: null,
      view: staleView,
      room: latest.room,
      session,
      socket: fakeSocket(),
      humanSeatId: 'seat-1',
      actionPending: false,
      error: null,
      mode: 'table',
    });
    expect(staleView.legalActions[0]).toBeDefined();

    await useGameStore.getState().submitAction(staleView.legalActions[0]!.id);

    expect(submit).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith(session);
    expect(useGameStore.getState().view?.revision).toBe(latest.view!.revision);
    expect(useGameStore.getState().status).toMatch(/自动同步到修订.*重新选择行动/);
    expect(useGameStore.getState().error).toBeNull();
    expect(useGameStore.getState().actionPending).toBe(false);
    vi.restoreAllMocks();
  });

  it('locks duplicate online action submissions until the first request settles', async () => {
    const session = providerSession();
    const state = createGame({
      mode: 'online',
      seed: 6262,
      seats: [
        { id: 'seat-1', name: '防重测试', kind: 'human', characterId: 'R07' },
        ...Array.from({ length: 3 }, (_, index) => ({
          id: `seat-${index + 2}`,
          name: `Bot ${index + 1}`,
          kind: 'bot' as const,
          ai: { provider: 'local-bot' as const, difficulty: 'normal' as const, persona: 'steady' as const },
        })),
      ],
    });
    const view = getViewForSeat(state, 'seat-1');
    const snapshot: RoomSnapshot = {
      room: { ...session.snapshot.room, status: 'active' },
      view,
      stateHash: 'settled-hash',
    };
    let resolveSubmit!: (value: RoomSnapshot) => void;
    const pending = new Promise<RoomSnapshot>((resolve) => {
      resolveSubmit = resolve;
    });
    const submit = vi.spyOn(clientApi, 'submitAction').mockReturnValue(pending);
    useGameStore.setState({
      localState: null,
      view,
      room: snapshot.room,
      session,
      socket: fakeSocket(),
      humanSeatId: 'seat-1',
      actionPending: false,
      error: null,
      mode: 'table',
    });

    const first = useGameStore.getState().submitAction(view.legalActions[0]!.id);
    const second = useGameStore.getState().submitAction(view.legalActions[0]!.id);

    expect(useGameStore.getState().actionPending).toBe(true);
    expect(submit).toHaveBeenCalledTimes(1);
    resolveSubmit(snapshot);
    await Promise.all([first, second]);
    expect(useGameStore.getState().actionPending).toBe(false);
    vi.restoreAllMocks();
  });
});

function providerSession(): ClientSession {
  const snapshot: RoomSnapshot = {
    room: {
      schemaVersion: 1,
      id: 'room-provider',
      code: 'PRO123',
      status: 'lobby',
      hostSeatId: 'seat-1',
      seed: 5150,
      maxSeats: 4,
      seats: [],
      chat: [],
    },
    view: null,
    stateHash: null,
  };
  return {
    roomId: snapshot.room.id,
    code: snapshot.room.code,
    seatId: 'seat-1',
    seatToken: 'token-provider-1234567890',
    snapshot,
  };
}

function fakeSocket(): ReturnType<typeof clientApi.connect> {
  return {
    on: vi.fn(),
    disconnect: vi.fn(),
  } as unknown as ReturnType<typeof clientApi.connect>;
}
