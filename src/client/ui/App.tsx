import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, NavLink, Route, Routes, useNavigate } from '../router';
import {
  CALAMITIES,
  CALAMITY_BY_ID,
  CHARACTER_BY_ID,
  CHARACTERS,
  FATES,
  FATE_BY_ID,
  OPPORTUNITIES,
  OPPORTUNITY_BY_ID,
  RULES_DIGEST,
} from '../../shared/data/content';
import type { BotProfileFields } from '../../shared/bots';
import type {
  ActionChoice,
  CalamityId,
  CharacterId,
  GameAction,
  GameOutcome,
  GameView,
  OpportunityId,
  PublicPlayerView,
} from '../../shared/game/types';
import { clientApi, type ProviderTestResult } from '../api/clientApi';
import { ritualAudio } from '../audio/sound';
import { useGameStore } from '../store/gameStore';

const HERO = {
  small: '/assets/upstream/web/01-封面招募-720.webp',
  large: '/assets/upstream/web/01-封面招募-941.webp',
  alt: '末法登仙台封面招募图：修士列阵于玄坛前',
};
const RULE_IMAGES = [
  {
    small: '/assets/upstream/web/02-末法世界与共同目标-720.webp',
    large: '/assets/upstream/web/02-末法世界与共同目标-941.webp',
    title: '末法世界',
    alt: '规则展示图 1：末法世界与共同目标，说明末法危机和玩家共同修筑登仙台',
  },
  {
    small: '/assets/upstream/web/03-共同修台争夺飞升-720.webp',
    large: '/assets/upstream/web/03-共同修台争夺飞升-941.webp',
    title: '共同修台',
    alt: '规则展示图 2：共同修台并争夺有限飞升席位',
  },
  {
    small: '/assets/upstream/web/04-每轮秘密四选一-720.webp',
    large: '/assets/upstream/web/04-每轮秘密四选一-941.webp',
    title: '秘密四选一',
    alt: '规则展示图 3：秘密四选一，每轮秘密选择修炼、修台、抗劫或探索',
  },
];
const CHARACTER_ART = {
  R01: {
    card: '/assets/upstream/characters/R01-card.webp',
    portrait: '/assets/upstream/characters/R01-portrait.webp',
  },
  R02: {
    card: '/assets/upstream/characters/R02-card.webp',
    portrait: '/assets/upstream/characters/R02-portrait.webp',
  },
  R03: {
    card: '/assets/upstream/characters/R03-card.webp',
    portrait: '/assets/upstream/characters/R03-portrait.webp',
  },
  R04: {
    card: '/assets/upstream/characters/R04-card.webp',
    portrait: '/assets/upstream/characters/R04-portrait.webp',
  },
  R05: {
    card: '/assets/upstream/characters/R05-card.webp',
    portrait: '/assets/upstream/characters/R05-portrait.webp',
  },
  R06: {
    card: '/assets/upstream/characters/R06-card.webp',
    portrait: '/assets/upstream/characters/R06-portrait.webp',
  },
  R07: {
    card: '/assets/upstream/characters/R07-card.webp',
    portrait: '/assets/upstream/characters/R07-portrait.webp',
  },
} satisfies Record<CharacterId, { card: string; portrait: string }>;
const ACTION_ART = {
  cultivate: '/assets/upstream/actions/cultivate.webp',
  repair: '/assets/upstream/actions/repair.webp',
  resist: '/assets/upstream/actions/resist.webp',
  explore: '/assets/upstream/actions/explore.webp',
} satisfies Record<ActionChoice, string>;
const ALTAR_ART = '/assets/upstream/table/altar.webp';
const ACTION_NAMES = {
  cultivate: '修炼',
  repair: '修台',
  resist: '抗劫',
  explore: '探索',
} satisfies Record<ActionChoice, string>;
const ACTION_ORDER: ActionChoice[] = ['cultivate', 'repair', 'resist', 'explore'];
const RULE_FLOW = [
  ['1. 揭示天劫', '翻开本轮天劫，按 4/5/6 人读取劫力与特殊文字。'],
  ['2. 吐纳与谈判', '所有修士补充灵力；公开讨论承诺，但不得展示手牌、天命、密议或密票。'],
  ['3. 秘密四选一', '每席秘密选择修炼、修台、抗劫或探索，并选择合法投入；全部提交后同时揭晓。'],
  ['4. 机缘与神通窗口', '按劫首顺序处理合法机缘、人物能力、定向反应与替换效果；每轮机缘使用次数受限。'],
  ['5. 公共结算', '修台填补主体与席位轨，抗劫抵消劫力；有效贡献者按投入获得功德。'],
  ['6. 雷击与裂痕', '未抵消的劫力逐次造成雷击；无法承受时降低修为或形成裂痕，第三道裂痕全员失败。'],
  ['7. 启动与飞升', '主体完成后秘密投票；启动时修为至少 6 才合格，按天命后功德、修为、灵力、劫首顺序排名。'],
  ['8. 回合结束', '未启动则弃牌、轮转劫首并进入下一轮；第八轮结束仍未启动则全员失败。'],
] as const;

function characterCardPath(id: CharacterId): string {
  return CHARACTER_ART[id].card;
}

function characterPortraitPath(id: CharacterId): string {
  return CHARACTER_ART[id].portrait;
}

function actionArtPath(choice: ActionChoice): string {
  return ACTION_ART[choice];
}

function cardArtPath(cardId: string): string {
  return `/assets/upstream/cards/${encodeURIComponent(cardId)}.webp`;
}

function calamityPreviewIdFromNotes(notes: string[]): CalamityId | null {
  for (const note of notes) {
    const match = /^窥天简：下一张天劫是 (T\d{2})/.exec(note);
    if (match?.[1] && CALAMITY_BY_ID.has(match[1] as CalamityId)) {
      return match[1] as CalamityId;
    }
  }
  return null;
}

function actionCardId(action: GameAction): OpportunityId | null {
  const candidate = action.payload.cardId ?? action.payload.recoveredCardId;
  return typeof candidate === 'string' && /^(?:C|E)\d{2}$/.test(candidate)
    ? candidate as OpportunityId
    : null;
}

function isActionChoice(value: unknown): value is ActionChoice {
  return value === 'cultivate' || value === 'repair' || value === 'resist' || value === 'explore';
}

function actionChoiceFromAction(action: GameAction): ActionChoice | null {
  const payloadAction = action.payload.action;
  if (isActionChoice(payloadAction)) return payloadAction;
  if (action.type === 'CHOOSE_EXPLORE_CARD') return 'explore';
  return null;
}

function artVariable(name: string, path: string): CSSProperties {
  return { [name]: `url("${path}")` } as CSSProperties;
}

function Shell({ children }: { children: React.ReactNode }) {
  const status = useGameStore((state) => state.status);
  const error = useGameStore((state) => state.error);
  const clearError = useGameStore((state) => state.clearError);
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand" aria-label="返回主菜单">
          <span className="brand-mark">登</span>
          <span>
            <strong>末法登仙台</strong>
            <small>忠实规则 · v0.1</small>
          </span>
        </Link>
        <nav className="main-nav" aria-label="主导航">
          <NavLink to="/solo">单人</NavLink>
          <NavLink to="/bots">Bot 道友</NavLink>
          <NavLink to="/online">联机</NavLink>
          <NavLink to="/tutorial">规则</NavLink>
          <NavLink to="/saves">存档</NavLink>
          <NavLink to="/settings">设置</NavLink>
          <NavLink to="/credits">制作</NavLink>
        </nav>
      </header>
      {error ? (
        <div className="toast" role="alert">
          <span>{error}</span>
          <button type="button" onClick={clearError}>关闭</button>
        </div>
      ) : null}
      <main>{children}</main>
      <footer className="statusbar" aria-live="polite">{status}</footer>
    </div>
  );
}

export function App() {
  const session = useGameStore((state) => state.session);
  const reconnectOnline = useGameStore((state) => state.reconnectOnline);
  useEffect(() => {
    if (
      !session &&
      (window.location.pathname === '/game' || window.location.pathname === '/online') &&
      (
        window.localStorage.getItem('dengxiantai.onlineSession') ||
        window.sessionStorage.getItem('dengxiantai.onlineSession')
      )
    ) {
      void reconnectOnline();
    }
  }, [reconnectOnline, session]);
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<MainMenu />} />
        <Route path="/solo" element={<SoloSetup />} />
        <Route path="/bots" element={<BotManager />} />
        <Route path="/online" element={<OnlineLobby />} />
        <Route path="/game" element={<GameTable />} />
        <Route path="/tutorial" element={<Tutorial />} />
        <Route path="/saves" element={<Saves />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/credits" element={<Credits />} />
        <Route path="/outcome" element={<Outcome />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Shell>
  );
}

function NotFound() {
  return (
    <section className="empty-state">
      <p className="eyebrow">404 · 迷失云海</p>
      <h2>这条登仙路不存在</h2>
      <p>地址可能已经失效；当前本地或在线对局不会因此被清除。</p>
      <div className="hero-actions">
        <Link className="primary-action" to="/">返回主菜单</Link>
        <Link className="secondary-action" to="/game">回到当前对局</Link>
      </div>
    </section>
  );
}

function MainMenu() {
  const navigate = useNavigate();
  const continueRecentSolo = useGameStore((state) => state.continueRecentSolo);
  const reconnectOnline = useGameStore((state) => state.reconnectOnline);
  const localSaves = useGameStore((state) => state.localSaves);
  const loadLocalSave = useGameStore((state) => state.loadLocalSave);
  const [showWelcome, setShowWelcome] = useState(
    () => window.localStorage.getItem('dengxiantai.onboarding.v1') !== 'done',
  );
  return (
    <section className="hero mofa-hero">
      <picture className="mofa-hero-art" aria-hidden="true">
        <source srcSet={HERO.small} media="(max-width: 720px)" />
        <img
          src={HERO.large}
          alt=""
          loading="eager"
        />
      </picture>
      <div className="hero-copy mofa-hero-copy">
        <p className="eyebrow">末法玄坛 · 在线规则桌面</p>
        <h1>末法登仙台</h1>
        <p>合作修台，暗争飞升。四到六名修士在八轮天劫中秘密投入、谈判、抗劫并争夺有限席位。</p>
        {showWelcome ? (
          <aside className="first-run-guide" aria-label="首次进入指引">
            <strong>第一次入坛？三句话就能开局</strong>
            <ol>
              <li>默认点“开始单人局”，无需 API Key。</li>
              <li>每轮先谈判，再秘密选择修炼、修台、抗劫或探索。</li>
              <li>保住仙台只是共同底线；最终飞升席位仍按个人排名争夺。</li>
            </ol>
            <div className="hero-actions">
              <Link className="secondary-action" to="/tutorial">先读完整规则</Link>
              <button
                className="primary-action"
                type="button"
                onClick={() => {
                  window.localStorage.setItem('dengxiantai.onboarding.v1', 'done');
                  setShowWelcome(false);
                }}
              >
                明白，开始选择
              </button>
            </div>
          </aside>
        ) : null}
        <div className="hero-actions">
          <Link className="primary-action" to="/solo">开始单人局</Link>
          <button
            className="secondary-action"
            type="button"
            onClick={() => {
              if (continueRecentSolo()) void navigate('/game');
            }}
          >
            继续最近单人局
          </button>
          <button
            className="secondary-action"
            type="button"
            onClick={() => {
              void reconnectOnline().then((ok) => {
                if (ok) void navigate('/online');
              });
            }}
          >
            重连在线席位
          </button>
          <Link className="secondary-action" to="/online">加入在线房间</Link>
          <Link className="secondary-action" to="/bots">管理长期 Bot 道友</Link>
          <Link className="secondary-action" to="/tutorial">查看规则</Link>
          <Link className="secondary-action" to="/credits">制作人员与许可</Link>
        </div>
        {localSaves.length > 0 ? (
          <div className="menu-saves" aria-label="最近命名存档">
            <strong>最近存档</strong>
            {localSaves.slice(0, 3).map((save) => (
              <button
                key={save.id}
                type="button"
                onClick={() => {
                  if (loadLocalSave(save.id)) navigate('/game');
                }}
              >
                {save.name} · 第 {save.round} 轮
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function SoloSetup() {
  const navigate = useNavigate();
  const setup = useGameStore((state) => state.setup);
  const botProfiles = useGameStore((state) => state.botProfiles);
  const refreshBots = useGameStore((state) => state.refreshBots);
  const updateSetup = useGameStore((state) => state.updateSetup);
  const startSolo = useGameStore((state) => state.startSolo);
  useEffect(() => {
    void refreshBots();
  }, [refreshBots]);
  return (
    <section className="panel-page">
      <div className="section-head">
        <p className="eyebrow">离线本地对局</p>
        <h2>单人配置</h2>
      </div>
      <div className="setup-grid">
        <label>
          玩家名
          <input value={setup.playerName} onChange={(event) => updateSetup({ playerName: event.target.value })} />
        </label>
        <label>
          人数
          <select value={setup.playerCount} onChange={(event) => updateSetup({ playerCount: Number(event.target.value) as 4 | 5 | 6 })}>
            <option value={4}>4 人快速局</option>
            <option value={5}>5 人标准局</option>
            <option value={6}>6 人满席局</option>
          </select>
        </label>
        <label>
          Seed
          <input type="number" value={setup.seed} onChange={(event) => updateSetup({ seed: Number(event.target.value) })} />
        </label>
        <label>
          你的角色
          <select value={setup.characterId} onChange={(event) => updateSetup({ characterId: event.target.value as typeof setup.characterId })}>
            <option value="random">随机分配</option>
            {CHARACTERS.map((character) => (
              <option key={character.id} value={character.id}>{character.name} · {character.ability.name}</option>
            ))}
          </select>
        </label>
        <label>
          AI Provider
          <select value={setup.provider} onChange={(event) => updateSetup({ provider: event.target.value as typeof setup.provider })}>
            <option value="local-bot">本地启发式（离线）</option>
            <option value="deepseek">DeepSeek（服务端私房）</option>
            <option value="openai-compatible">OpenAI-compatible（服务端私房）</option>
          </select>
        </label>
        <label>
          AI 模型
          <input
            value={setup.model}
            onChange={(event) => updateSetup({ model: event.target.value })}
            placeholder="留空使用服务端默认"
            disabled={setup.provider === 'local-bot'}
          />
        </label>
        <label>
          Bot 难度
          <select value={setup.difficulty} onChange={(event) => updateSetup({ difficulty: event.target.value as typeof setup.difficulty })}>
            <option value="easy">入门</option>
            <option value="normal">标准</option>
            <option value="hard">强硬</option>
          </select>
        </label>
        <label>
          你的对桌气质
          <select value={setup.persona} onChange={(event) => updateSetup({ persona: event.target.value as typeof setup.persona })}>
            <option value="steady">稳健</option>
            <option value="guardian">护台</option>
            <option value="bold">激进</option>
            <option value="suspicious">多疑</option>
            <option value="selfish">自利</option>
          </select>
        </label>
      </div>
      <section className="rule-card solo-bot-roster" aria-labelledby="solo-bot-roster-title">
        <div className="section-head compact">
          <p className="eyebrow">逐席配置</p>
          <h3 id="solo-bot-roster-title">本局同行的 Bot 道友</h3>
        </div>
        <p className="rules-digest">
          选择已创建的长期 Bot 后，它会携带人设与跨局记忆入局，并累计成长与调用消费；留空则使用上方统一配置。
        </p>
        <div className="solo-bot-seat-grid">
          {Array.from({ length: setup.playerCount - 1 }, (_, index) => {
            const profileId = setup.botProfileIds[index] ?? '';
            const profile = botProfiles.find((candidate) => candidate.id === profileId);
            return (
              <label key={index} className="solo-bot-seat">
                <img
                  src={characterPortraitPath(CHARACTERS[(index + 1) % CHARACTERS.length]!.id)}
                  alt=""
                  aria-hidden="true"
                />
                <span>
                  <strong>第 {index + 2} 席</strong>
                  <small>{profile ? `${profile.title} · ${profile.provider}` : '使用本局统一 AI 配置'}</small>
                </span>
                <select
                  aria-label={`第 ${index + 2} 席 Bot`}
                  value={profileId}
                  onChange={(event) => {
                    const next = [...setup.botProfileIds];
                    next[index] = event.target.value;
                    updateSetup({ botProfileIds: next });
                  }}
                >
                  <option value="">临时 Bot</option>
                  {botProfiles.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name} · {candidate.title}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
        </div>
        <div className="hero-actions">
          <Link className="secondary-action" to="/bots">
            {botProfiles.length > 0 ? '查看与编辑 Bot 道友' : '从 16 套预设创建 Bot'}
          </Link>
        </div>
      </section>
      <section className="rule-card mofa-character-gallery" aria-label="上游人物卡预览">
        <h3>七名修士人物卡</h3>
        <p className="rules-digest">可在上方指定自己的角色；选择“随机分配”时按固定 seed 洗牌。外部 Provider 通过服务端权威私房运行，失败会自动回退本地 Bot。</p>
        <div className="cards mofa-character-gallery-list">
          {CHARACTERS.map((character) => (
            <article
              key={character.id}
              className="hand-card zoomable mofa-character-preview"
              tabIndex={0}
              aria-label={`${character.name} 人物卡预览`}
              data-character-id={character.id}
              style={artVariable('--character-art', characterCardPath(character.id))}
            >
              <strong>{character.name}</strong>
              <span>{character.ability.name}</span>
              <small>{character.passiveEffect}</small>
            </article>
          ))}
        </div>
      </section>
      <button
        className="primary-action wide"
        type="button"
        onClick={() => {
          ritualAudio.pulse('reveal');
          void startSolo().then((started) => {
            if (started) void navigate('/game');
            else if (useGameStore.getState().session) void navigate('/online');
          });
        }}
      >
        入坛开局
      </button>
    </section>
  );
}

function BotManager() {
  const botPresets = useGameStore((state) => state.botPresets);
  const botProfiles = useGameStore((state) => state.botProfiles);
  const botDashboard = useGameStore((state) => state.botDashboard);
  const refreshBots = useGameStore((state) => state.refreshBots);
  const createBot = useGameStore((state) => state.createBot);
  const updateBot = useGameStore((state) => state.updateBot);
  const deleteBot = useGameStore((state) => state.deleteBot);
  const loadBotDashboard = useGameStore((state) => state.loadBotDashboard);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<BotProfileFields | null>(null);
  const [pendingDelete, setPendingDelete] = useState(false);

  useEffect(() => {
    void refreshBots();
  }, [refreshBots]);
  useEffect(() => {
    if (!selectedId && botProfiles[0]) setSelectedId(botProfiles[0].id);
    if (selectedId && !botProfiles.some((profile) => profile.id === selectedId)) {
      setSelectedId(botProfiles[0]?.id ?? null);
    }
  }, [botProfiles, selectedId]);
  useEffect(() => {
    const profile = botProfiles.find((candidate) => candidate.id === selectedId);
    setDraft(profile ? {
      name: profile.name,
      title: profile.title,
      description: profile.description,
      provider: profile.provider,
      model: profile.model,
      difficulty: profile.difficulty,
      persona: profile.persona,
      thinking: profile.thinking,
      traits: [...profile.traits],
      preferences: [...profile.preferences],
      communicationStyle: profile.communicationStyle,
    } : null);
    setPendingDelete(false);
    if (profile) void loadBotDashboard(profile.id);
  }, [botProfiles, loadBotDashboard, selectedId]);

  const selectedProfile = botProfiles.find((profile) => profile.id === selectedId) ?? null;
  const updateDraft = <K extends keyof BotProfileFields>(key: K, value: BotProfileFields[K]) => {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  };
  const dollars = botDashboard ? botDashboard.usage.usdMicros / 1_000_000 : 0;

  return (
    <section className="panel-page bot-manager-page">
      <div className="section-head">
        <p className="eyebrow">跨对局 AI 名册</p>
        <h2>Bot 道友管理</h2>
      </div>
      <p className="rules-digest">
        每位道友保留独立人设、偏好、公开记忆、成长与调用消费。浏览器只保存随机管理令牌，API Key 始终留在服务端。
      </p>

      <section className="bot-manager-layout" aria-label="Bot 名册与编辑器">
        <aside className="bot-profile-list" aria-label="已创建 Bot">
          <header>
            <strong>我的道友</strong>
            <span>{botProfiles.length} 位</span>
          </header>
          {botProfiles.length === 0 ? (
            <p className="info-strip">尚未创建长期 Bot。可从下方 16 套预设一键创建。</p>
          ) : null}
          {botProfiles.map((profile, index) => (
            <button
              key={profile.id}
              type="button"
              className={profile.id === selectedId ? 'bot-profile-pick selected' : 'bot-profile-pick'}
              onClick={() => setSelectedId(profile.id)}
            >
              <img
                src={characterPortraitPath(CHARACTERS[index % CHARACTERS.length]!.id)}
                alt=""
                aria-hidden="true"
              />
              <span>
                <strong>{profile.name}</strong>
                <small>{profile.title}</small>
                <em>{profile.provider} · {profile.difficulty}</em>
              </span>
            </button>
          ))}
        </aside>

        <div className="bot-profile-workspace">
          {draft && selectedProfile ? (
            <>
              <form
                className="bot-editor"
                onSubmit={(event) => {
                  event.preventDefault();
                  void updateBot(selectedProfile.id, draft);
                }}
              >
                <div className="bot-editor-heading">
                  <div>
                    <p className="eyebrow">人设与策略</p>
                    <h3>{selectedProfile.name}</h3>
                  </div>
                  <span className="bot-level-badge">Lv.{botDashboard?.growth.level ?? 1}</span>
                </div>
                <div className="setup-grid bot-editor-grid">
                  <label>名字<input value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} /></label>
                  <label>称号<input value={draft.title} onChange={(event) => updateDraft('title', event.target.value)} /></label>
                  <label>
                    Provider
                    <select value={draft.provider} onChange={(event) => updateDraft('provider', event.target.value as BotProfileFields['provider'])}>
                      <option value="local-bot">本地启发式</option>
                      <option value="deepseek">DeepSeek</option>
                      <option value="openai-compatible">OpenAI-compatible</option>
                    </select>
                  </label>
                  <label>
                    模型
                    <input
                      value={draft.model ?? ''}
                      onChange={(event) => updateDraft('model', event.target.value || null)}
                      disabled={draft.provider === 'local-bot'}
                      placeholder="留空使用服务端默认"
                    />
                  </label>
                  <label>
                    难度
                    <select value={draft.difficulty} onChange={(event) => updateDraft('difficulty', event.target.value as BotProfileFields['difficulty'])}>
                      <option value="easy">入门</option>
                      <option value="normal">标准</option>
                      <option value="hard">强硬</option>
                    </select>
                  </label>
                  <label>
                    核心性格
                    <select value={draft.persona} onChange={(event) => updateDraft('persona', event.target.value as BotProfileFields['persona'])}>
                      <option value="steady">稳健</option>
                      <option value="guardian">护台</option>
                      <option value="bold">激进</option>
                      <option value="suspicious">多疑</option>
                      <option value="selfish">自利</option>
                    </select>
                  </label>
                </div>
                <label className="bot-editor-wide">
                  人设说明
                  <textarea value={draft.description} onChange={(event) => updateDraft('description', event.target.value)} />
                </label>
                <label className="bot-editor-wide">
                  性格标签（逗号分隔）
                  <input
                    value={draft.traits.join('，')}
                    onChange={(event) => updateDraft('traits', event.target.value.split(/[，,]/).map((item) => item.trim()).filter(Boolean))}
                  />
                </label>
                <label className="bot-editor-wide">
                  偏好（逗号分隔）
                  <input
                    value={draft.preferences.join('，')}
                    onChange={(event) => updateDraft('preferences', event.target.value.split(/[，,]/).map((item) => item.trim()).filter(Boolean))}
                  />
                </label>
                <label className="bot-editor-wide">
                  沟通风格
                  <textarea value={draft.communicationStyle} onChange={(event) => updateDraft('communicationStyle', event.target.value)} />
                </label>
                <label className="toggle-line bot-thinking-toggle">
                  <input type="checkbox" checked={draft.thinking} onChange={(event) => updateDraft('thinking', event.target.checked)} />
                  困难决策启用思考模式
                </label>
                <div className="bot-editor-actions">
                  <button className="primary-action" type="submit">保存全部设定</button>
                  {!pendingDelete ? (
                    <button className="secondary-action danger-action" type="button" onClick={() => setPendingDelete(true)}>删除这位 Bot</button>
                  ) : (
                    <button
                      className="primary-action danger-action"
                      type="button"
                      onClick={() => {
                        void deleteBot(selectedProfile.id).then((deleted) => {
                          if (deleted) setSelectedId(null);
                        });
                      }}
                    >
                      确认删除“{selectedProfile.name}”
                    </button>
                  )}
                </div>
              </form>

              <section className="bot-data-panel" aria-label="Bot 成长与消费">
                <div className="bot-stat-grid">
                  <article><span>等级 / 经验</span><strong>Lv.{botDashboard?.growth.level ?? 1}</strong><small>{botDashboard?.growth.xp ?? 0} XP</small></article>
                  <article><span>完成对局</span><strong>{botDashboard?.growth.games ?? 0}</strong><small>飞升 {botDashboard?.growth.ascensions ?? 0}</small></article>
                  <article><span>决策 / 发言</span><strong>{botDashboard?.growth.decisions ?? 0}</strong><small>{botDashboard?.growth.messages ?? 0} 条公开发言</small></article>
                  <article><span>预估消费</span><strong>${dollars.toFixed(6)}</strong><small>{botDashboard?.usage.totalTokens.toLocaleString('zh-CN') ?? 0} tokens</small></article>
                  <article><span>缓存命中</span><strong>{botDashboard?.usage.cacheHits ?? 0}</strong><small>未命中 {botDashboard?.usage.cacheMisses ?? 0}</small></article>
                  <article><span>回退 / 重试</span><strong>{botDashboard?.usage.fallback ?? 0}</strong><small>重试 {botDashboard?.usage.retryCount ?? 0}</small></article>
                </div>
                <div className="bot-memory-panel">
                  <header><strong>跨对局公开记忆</strong><span>最近 {botDashboard?.memories.length ?? 0} 条</span></header>
                  {botDashboard?.memories.length ? (
                    <ol>
                      {botDashboard.memories.map((memory) => (
                        <li key={memory.id}>
                          <p>{memory.content}</p>
                          <small>{new Date(memory.createdAt).toLocaleString('zh-CN')}</small>
                        </li>
                      ))}
                    </ol>
                  ) : <p className="info-strip">完成一局或参与公开谈判后，这里会形成不含其他玩家私密信息的摘要。</p>}
                </div>
              </section>
            </>
          ) : (
            <div className="empty-state bot-empty-state">
              <h3>从预设唤醒第一位 Bot 道友</h3>
              <p>预设创建后仍可完整修改名字、人设、性格、偏好、模型与沟通风格。</p>
            </div>
          )}
        </div>
      </section>

      <section className="bot-preset-section" aria-labelledby="bot-preset-title">
        <div className="section-head compact">
          <p className="eyebrow">快速创建</p>
          <h3 id="bot-preset-title">16 套可编辑预设</h3>
        </div>
        <div className="bot-preset-grid">
          {botPresets.map((preset, index) => (
            <article key={preset.id} className="bot-preset-card">
              <img
                src={characterCardPath(CHARACTERS[index % CHARACTERS.length]!.id)}
                alt=""
                aria-hidden="true"
              />
              <div>
                <p className="eyebrow">{preset.title}</p>
                <h4>{preset.name}</h4>
                <p>{preset.description}</p>
                <span>{preset.traits.join(' · ')}</span>
              </div>
              <button
                className="secondary-action"
                type="button"
                onClick={() => void createBot(preset.id).then((profile) => {
                  if (profile) setSelectedId(profile.id);
                })}
              >
                创建并编辑
              </button>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

function OnlineLobby() {
  const navigate = useNavigate();
  const room = useGameStore((state) => state.room);
  const view = useGameStore((state) => state.view);
  const session = useGameStore((state) => state.session);
  const setup = useGameStore((state) => state.setup);
  const botProfiles = useGameStore((state) => state.botProfiles);
  const refreshBots = useGameStore((state) => state.refreshBots);
  const updateSetup = useGameStore((state) => state.updateSetup);
  const createOnline = useGameStore((state) => state.createOnline);
  const joinOnline = useGameStore((state) => state.joinOnline);
  const setReady = useGameStore((state) => state.setReady);
  const startOnline = useGameStore((state) => state.startOnline);
  const addBot = useGameStore((state) => state.addBot);
  const removeBot = useGameStore((state) => state.removeBot);
  const swapSeat = useGameStore((state) => state.swapSeat);
  const transferHost = useGameStore((state) => state.transferHost);
  const takeOverDisconnected = useGameStore((state) => state.takeOverDisconnected);
  const [roomId, setRoomId] = useState(() => new URLSearchParams(window.location.search).get('code') ?? '');
  const [name, setName] = useState('过路修士');
  const [botProvider, setBotProvider] = useState<'local-bot' | 'deepseek' | 'openai-compatible'>('local-bot');
  const [botModel, setBotModel] = useState('');
  const [botDifficulty, setBotDifficulty] = useState<'easy' | 'normal' | 'hard'>('normal');
  const [botPersona, setBotPersona] = useState<'steady' | 'bold' | 'suspicious' | 'selfish' | 'guardian'>('steady');
  const [botProfileId, setBotProfileId] = useState('');
  const shareLink = room ? `${window.location.origin}/online?code=${encodeURIComponent(room.code)}` : '';
  const self = room?.seats.find((seat) => seat.id === session?.seatId);
  const isHost = Boolean(room && session && room.hostSeatId === session.seatId);
  useEffect(() => {
    void refreshBots();
  }, [refreshBots]);
  useEffect(() => {
    if (view && room?.status !== 'lobby') navigate(view.outcome ? '/outcome' : '/game');
  }, [navigate, room?.status, view]);
  return (
    <section className="panel-page">
      <div className="section-head">
        <p className="eyebrow">Socket.IO 房间</p>
        <h2>大厅 / 加入</h2>
      </div>
      <div className="setup-grid">
        <label>
          房主名
          <input value={setup.playerName} onChange={(event) => updateSetup({ playerName: event.target.value })} />
        </label>
        <label>
          最大席位
          <select value={setup.playerCount} onChange={(event) => updateSetup({ playerCount: Number(event.target.value) as 4 | 5 | 6 })}>
            <option value={4}>4</option>
            <option value={5}>5</option>
            <option value={6}>6</option>
          </select>
        </label>
        <button className="primary-action wide" type="button" onClick={() => void createOnline()}>创建房间</button>
      </div>
      <form
        className="setup-grid"
        onSubmit={(event) => {
          event.preventDefault();
          void joinOnline(roomId.trim(), name.trim());
        }}
      >
        <label>
          房间码
          <input required value={roomId} onChange={(event) => setRoomId(event.target.value.toUpperCase())} placeholder="例如 8Q4K7M" />
        </label>
        <label>
          显示名
          <input required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <button className="primary-action wide" type="submit">凭座位令牌加入</button>
      </form>
      {room ? (
        <section className="lobby-board" aria-label="房间席位">
          <div className="info-strip">房间码 {room.code} · 分享链接 {shareLink}</div>
          <div className="seat-list">
            {room.seats.map((seat, index) => (
              <article key={seat.id} className={seat.id === session?.seatId ? 'active' : ''}>
                <strong>{seat.name}</strong>
                <span>第 {index + 1} 席 · {seat.kind === 'bot' ? 'AI' : '真人'} · {seat.ready ? '已准备' : '未准备'} · {seat.connected ? '在线' : '离线'}</span>
                {seat.id === room.hostSeatId ? <small>房主</small> : null}
                {isHost && seat.id !== session?.seatId ? <button type="button" onClick={() => void swapSeat(seat.id)}>与我换座</button> : null}
                {isHost && seat.kind === 'bot' ? <button type="button" onClick={() => void removeBot(seat.id)}>移除 AI</button> : null}
                {isHost && seat.kind === 'human' && seat.id !== session?.seatId ? <button type="button" onClick={() => void transferHost(seat.id)}>移交房主</button> : null}
                {isHost && seat.kind === 'human' && !seat.connected ? <button type="button" onClick={() => void takeOverDisconnected(seat.id)}>Bot 临时接管</button> : null}
              </article>
            ))}
          </div>
          {isHost ? (
            <div className="setup-grid" aria-label="AI 席位配置">
              <label>
                长期 Bot 道友
                <select value={botProfileId} onChange={(event) => setBotProfileId(event.target.value)}>
                  <option value="">临时 Bot（使用下方配置）</option>
                  {botProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>{profile.name} · {profile.title}</option>
                  ))}
                </select>
              </label>
              <label>
                Provider
                <select disabled={Boolean(botProfileId)} value={botProvider} onChange={(event) => setBotProvider(event.target.value as typeof botProvider)}>
                  <option value="local-bot">本地启发式 Bot</option>
                  <option value="deepseek">DeepSeek</option>
                  <option value="openai-compatible">OpenAI-compatible</option>
                </select>
              </label>
              <label>
                模型
                <input value={botModel} onChange={(event) => setBotModel(event.target.value)} placeholder="留空使用服务端默认" disabled={Boolean(botProfileId) || botProvider === 'local-bot'} />
              </label>
              <label>
                难度
                <select disabled={Boolean(botProfileId)} value={botDifficulty} onChange={(event) => setBotDifficulty(event.target.value as typeof botDifficulty)}>
                  <option value="easy">简单</option>
                  <option value="normal">普通</option>
                  <option value="hard">困难 / 思考</option>
                </select>
              </label>
              <label>
                性格
                <select disabled={Boolean(botProfileId)} value={botPersona} onChange={(event) => setBotPersona(event.target.value as typeof botPersona)}>
                  <option value="steady">稳健</option>
                  <option value="guardian">守台</option>
                  <option value="bold">激进</option>
                  <option value="suspicious">多疑</option>
                  <option value="selfish">自利</option>
                </select>
              </label>
            </div>
          ) : null}
          <div className="hero-actions">
            <button className="secondary-action" type="button" onClick={() => void setReady(!self?.ready)}>{self?.ready ? '取消准备' : '准备'}</button>
            {isHost ? (
              <button
                className="secondary-action"
                type="button"
                onClick={() => {
                  const profile = botProfiles.find((candidate) => candidate.id === botProfileId);
                  void addBot(profile ? {
                    provider: profile.provider,
                    model: profile.model ?? undefined,
                    difficulty: profile.difficulty,
                    persona: profile.persona,
                    thinking: profile.thinking,
                    botProfileId: profile.id,
                  } : {
                    provider: botProvider,
                    model: botModel.trim() || undefined,
                    difficulty: botDifficulty,
                    persona: botPersona,
                    thinking: botDifficulty === 'hard',
                  });
                }}
              >
                添加 AI
              </button>
            ) : null}
            {isHost ? (
              <button
                className="primary-action"
                type="button"
                onClick={() => void startOnline().then((started) => {
                  if (started) void navigate('/game');
                })}
              >
                开始对局
              </button>
            ) : null}
          </div>
        </section>
      ) : <div className="info-strip">客户端会通过 REST 创建/加入房间，并使用 Socket.IO 重连、接收脱敏快照与公开聊天。</div>}
    </section>
  );
}

function GameTable() {
  const navigate = useNavigate();
  const view = useGameStore((state) => state.view);
  const activePanel = useGameStore((state) => state.activePanel);
  const setActivePanel = useGameStore((state) => state.setActivePanel);
  const chat = useGameStore((state) => state.chat);
  const actionDeadlineAt = useGameStore((state) => state.room?.actionDeadlineAt);
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => {
    if (view?.outcome) navigate('/outcome');
  }, [navigate, view?.outcome]);
  useEffect(() => {
    if (!drawerOpen) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [drawerOpen]);
  if (!view) {
    return (
      <section className="empty-state">
        <h2>尚未入局</h2>
        <Link className="primary-action" to="/solo">创建单人局</Link>
      </section>
    );
  }
  return (
    <section
      className="table-screen mofa-table-screen"
      aria-label="游戏桌面"
      style={artVariable('--table-art', ALTAR_ART)}
    >
      <section className="ritual-stage" aria-label="环坛对局">
        <CenterAltar view={view} actionDeadlineAt={actionDeadlineAt} />
        <Scoreboard view={view} />
      </section>
      <section className={`decision-sheet${view.phase === 'negotiation' ? ' is-negotiation' : ''}`} aria-label="本轮决策">
        {view.phase === 'negotiation' ? <ChatPanel embedded /> : <PlayerHand view={view} />}
        <ActionDock actions={view.legalActions} phaseLabel={view.phaseLabel} />
      </section>
      <button
        className="edge-drawer-tab edge-drawer-tab-log"
        type="button"
        aria-controls="game-side-drawer"
        aria-expanded={drawerOpen && activePanel === 'log'}
        onClick={() => {
          setActivePanel('log');
          setDrawerOpen(drawerOpen && activePanel === 'log' ? false : true);
        }}
      >
        <strong>记录</strong>
        <span>{Math.min(view.events.length, 99)}</span>
      </button>
      <button
        className="edge-drawer-tab edge-drawer-tab-chat"
        type="button"
        aria-controls="game-side-drawer"
        aria-expanded={drawerOpen && activePanel === 'chat'}
        onClick={() => {
          setActivePanel('chat');
          setDrawerOpen(drawerOpen && activePanel === 'chat' ? false : true);
        }}
      >
        <strong>会话</strong>
        <span>{Math.min(chat.length, 99)}</span>
      </button>
      {drawerOpen ? (
        <aside id="game-side-drawer" className="side-rail" aria-label={activePanel === 'log' ? '对局记录抽屉' : '公开会话抽屉'}>
          <header className="drawer-head">
            <div className="tab-row" role="tablist" aria-label="记录与会话">
              <button className={activePanel === 'log' ? 'active' : ''} type="button" onClick={() => setActivePanel('log')}>记录</button>
              <button className={activePanel === 'chat' ? 'active' : ''} type="button" onClick={() => setActivePanel('chat')}>会话</button>
            </div>
            <button className="drawer-close" type="button" onClick={() => setDrawerOpen(false)} aria-label="关闭侧边抽屉">关闭</button>
          </header>
          {activePanel === 'log' ? <EventLog view={view} /> : <ChatPanel />}
        </aside>
      ) : null}
    </section>
  );
}

function Scoreboard({ view }: { view: GameView }) {
  const self = view.players.find((player) => player.id === view.seatId);
  const players = [
    ...view.players.filter((player) => player.id !== view.seatId),
    ...(self ? [self] : []),
  ];
  return (
    <div className="scoreboard" aria-label="玩家公开状态">
      {players.map((player, index) => (
        <PlayerToken
          key={player.id}
          player={player}
          active={player.id === view.seatId}
          position={player.id === view.seatId ? 'self' : `seat-${index + 1}`}
        />
      ))}
    </div>
  );
}

function PlayerToken({ player, active, position }: { player: PublicPlayerView; active: boolean; position: string }) {
  const character = CHARACTER_BY_ID.get(player.characterId);
  const revealedChoice = player.revealedPlan?.action;
  return (
    <article className={`player-token ${active ? 'active' : ''}`} data-seat-position={position}>
      <div className="mofa-player-identity">
        <img
          src={characterPortraitPath(player.characterId)}
          alt={`${character?.name ?? player.characterId} 人物头像`}
          loading="lazy"
          className="mofa-player-portrait"
        />
        <div className="mofa-player-title">
          <strong>{player.name}</strong>
          <small>{character?.name ?? player.characterId}</small>
        </div>
      </div>
      <dl>
        <dt>灵</dt><dd>{player.spirit}</dd>
        <dt>修</dt><dd>{player.cultivation}</dd>
        <dt>德</dt><dd>{player.merit}</dd>
        <dt>手</dt><dd>{player.handCount}</dd>
      </dl>
      {player.equipment ? (
        <span className="mofa-equipment-chip" title={OPPORTUNITY_BY_ID.get(player.equipment)?.name ?? player.equipment}>
          <img src={cardArtPath(player.equipment)} alt="" aria-hidden="true" loading="lazy" />
          <span>{OPPORTUNITY_BY_ID.get(player.equipment)?.name ?? player.equipment}</span>
        </span>
      ) : null}
      {revealedChoice ? (
        <span
          className="lock locked"
          data-plan-choice={revealedChoice}
        >
          <img
            src={actionArtPath(revealedChoice)}
            alt=""
            aria-hidden="true"
            loading="lazy"
            className="mofa-revealed-plan-icon"
          />
          已揭 · {ACTION_NAMES[revealedChoice]}
        </span>
      ) : (
        <span className={player.planSubmitted ? 'lock locked' : 'lock'}>{player.planSubmitted ? '已锁' : '未锁'}</span>
      )}
    </article>
  );
}

function CenterAltar({ view, actionDeadlineAt }: { view: GameView; actionDeadlineAt?: string }) {
  const calamity = CALAMITY_BY_ID.get(view.currentCalamity);
  const seatDone = view.platform.seatProgress.filter((value, index) => value >= (view.platform.seatRequirements[index] ?? Infinity)).length;
  const [countdownNow, setCountdownNow] = useState(() => Date.now());
  useEffect(() => {
    if (!actionDeadlineAt) return undefined;
    const timer = window.setInterval(() => setCountdownNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [actionDeadlineAt]);
  const secondsRemaining = actionDeadlineAt
    ? Math.max(0, Math.ceil((Date.parse(actionDeadlineAt) - countdownNow) / 1_000))
    : null;
  return (
    <section className="altar" aria-label="中央玄坛">
      <div
        className="phase-orb mofa-phase-orb"
        style={artVariable('--phase-art', ALTAR_ART)}
      >
        <span>第 {view.round} 轮</span>
        <strong>{view.phaseLabel}</strong>
        <small>
          {secondsRemaining === null
            ? '离线无时限'
            : secondsRemaining > 0
              ? `剩余 ${secondsRemaining} 秒`
              : '等待自动处理'}
          {' · '}修订 {view.revision}
        </small>
      </div>
      <div className="altar-board">
        <article
          className="calamity-card zoomable mofa-calamity-card"
          tabIndex={0}
          style={artVariable('--calamity-art', cardArtPath(view.currentCalamity))}
        >
          <img
            src={cardArtPath(view.currentCalamity)}
            alt={`${calamity?.name ?? view.currentCalamity} 天劫牌`}
            loading="eager"
            className="mofa-calamity-art"
          />
          <div className="mofa-calamity-copy">
          <p className="eyebrow">{calamity?.stage ?? '天劫'}</p>
          <h2>{calamity?.name ?? view.currentCalamity}</h2>
          <p>{calamity?.effect ?? '等待天劫揭示。'}</p>
          <small>抗劫需求 {view.currentDemand}</small>
          </div>
        </article>
        <div className="platform-meter" aria-label="登仙台进度">
          <div className="main-progress">
            <label>主台 {view.platform.mainProgress}/{view.platform.mainRequired}</label>
            <progress value={view.platform.mainProgress} max={view.platform.mainRequired} />
          </div>
          <div className="seat-progress">
            <label>席位 {seatDone}/{view.platform.seatRequirements.length}</label>
            <div className="seat-meters">
              {view.platform.seatRequirements.map((required, index) => (
                <progress key={required + index} value={view.platform.seatProgress[index] ?? 0} max={required} aria-label={`席位 ${index + 1}`} />
              ))}
            </div>
          </div>
          <div className="cracks" aria-label={`裂痕 ${view.platform.cracks} 道`}>
            {[0, 1, 2].map((index) => <span key={index} className={index < view.platform.cracks ? 'lit' : ''} />)}
          </div>
        </div>
      </div>
    </section>
  );
}

function PlayerHand({ view }: { view: GameView }) {
  const selectedCardId = useGameStore((state) => state.selectedCardId);
  const selectCard = useGameStore((state) => state.selectCard);
  const fate = view.self ? FATE_BY_ID.get(view.self.fateId) : null;
  const selfPlayer = view.players.find((player) => player.id === view.seatId) ?? null;
  const selfCharacter = selfPlayer ? CHARACTER_BY_ID.get(selfPlayer.characterId) : null;
  const hand = view.self?.hand ?? [];
  const privateNotes = view.self?.privateNotes ?? [];
  const privateNotesSignature = privateNotes.join('\u0000');
  const privateCalamityId = calamityPreviewIdFromNotes(privateNotes);
  const privateCalamity = privateCalamityId ? CALAMITY_BY_ID.get(privateCalamityId) ?? null : null;
  const [privateIntelOpen, setPrivateIntelOpen] = useState(false);
  useEffect(() => {
    setPrivateIntelOpen(privateNotes.length > 0);
  }, [privateNotes.length, privateNotesSignature]);
  return (
    <section className={`hand-zone${hand.length === 0 ? ' is-empty-hand' : ''}`} aria-label="私有区域">
      <article
        className="secret-card zoomable mofa-self-card"
        tabIndex={0}
        data-character-id={selfPlayer?.characterId}
        style={selfPlayer ? artVariable('--character-art', characterCardPath(selfPlayer.characterId)) : undefined}
      >
        {selfPlayer ? (
          <img
            src={characterCardPath(selfPlayer.characterId)}
            alt={`${selfCharacter?.name ?? selfPlayer.characterId} 人物立绘`}
            loading="lazy"
            className="mofa-self-portrait"
          />
        ) : null}
        <div className="mofa-self-copy">
          <span className="lock locked">仅你可见</span>
          <h3>{selfCharacter?.name ?? '旁观席'}</h3>
          <p>{selfCharacter ? `${selfCharacter.ability.name}：${selfCharacter.ability.effect}` : '无人物能力'}</p>
          {selfPlayer ? (
            <dl className="private-stats">
              <div><dt>灵</dt><dd>{selfPlayer.spirit}</dd></div>
              <div><dt>修</dt><dd>{selfPlayer.cultivation}</dd></div>
              <div><dt>德</dt><dd>{selfPlayer.merit}</dd></div>
              <div><dt>手</dt><dd>{selfPlayer.handCount}</dd></div>
            </dl>
          ) : null}
          <div className="mofa-fate-summary">
            {view.self ? <img src={cardArtPath(view.self.fateId)} alt="" aria-hidden="true" loading="lazy" /> : null}
            <span>
              <strong>{fate?.name ?? '无私有天命'}</strong>
              <small>{fate ? `${fate.mainFate} · ${fate.obsession}` : '当前没有私有目标'}</small>
            </span>
          </div>
          {privateNotes.length > 0 ? (
            <button className="private-intel-toggle" type="button" onClick={() => setPrivateIntelOpen(true)}>
              查看私密天机 · {privateNotes.length}
            </button>
          ) : null}
        </div>
      </article>
      {privateIntelOpen && privateNotes.length > 0 ? (
        <aside className="private-intel-overlay" aria-label="私密天机">
          <header>
            <span>
              <strong>私密天机</strong>
              <small>仅你可见，不会进入公开谈判。</small>
            </span>
            <button type="button" onClick={() => setPrivateIntelOpen(false)}>记下并收起</button>
          </header>
          {privateCalamityId && privateCalamity ? (
            <article className="private-calamity-preview">
              <img
                src={cardArtPath(privateCalamityId)}
                alt={`${privateCalamity.name} 下一张天劫牌`}
                loading="eager"
              />
              <span>
                <small>窥天简 · 下一劫</small>
                <strong>{privateCalamity.name}</strong>
                <span>{privateCalamity.stage}</span>
                <p>{privateCalamity.effect}</p>
                <em>
                  抗劫需求 {privateCalamity.demand[view.players.length as 4 | 5 | 6]}
                </em>
              </span>
            </article>
          ) : null}
          {privateNotes.some((note) => !note.startsWith('窥天简：')) ? (
            <ul className="private-intel-notes">
              {privateNotes
                .filter((note) => !note.startsWith('窥天简：'))
                .map((note) => <li key={note}>{note}</li>)}
            </ul>
          ) : null}
        </aside>
      ) : null}
      {hand.length > 0 ? (
        <div className="cards">
          {hand.map((cardId) => {
            const card = OPPORTUNITY_BY_ID.get(cardId);
            return (
              <button
                key={cardId}
                className={`hand-card zoomable ${selectedCardId === cardId ? 'selected' : ''}`}
                type="button"
                onClick={() => selectCard(selectedCardId === cardId ? null : cardId)}
                aria-pressed={selectedCardId === cardId}
              >
                <img src={cardArtPath(cardId)} alt={`${card?.name ?? cardId}卡面`} loading="lazy" />
                <span className="hand-card-copy">
                  <strong>{card?.name ?? cardId}</strong>
                  <span>{card?.type ?? '机缘'}</span>
                  <small>{card?.effect ?? '未知效果'}</small>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function ActionDock({ actions, phaseLabel }: { actions: GameAction[]; phaseLabel: string }) {
  const submitAction = useGameStore((state) => state.submitAction);
  const actionPending = useGameStore((state) => state.actionPending);
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const grouped = useMemo(() => actions.reduce<Record<string, GameAction[]>>((acc, action) => {
    (acc[action.type] ??= []).push(action);
    return acc;
  }, {}), [actions]);
  const isSecretPlan = actions.length > 0 && actions.every((action) => action.type === 'SUBMIT_PLAN');
  const actionGroups = useMemo(() => {
    if (!isSecretPlan) return Object.entries(grouped);
    return ACTION_ORDER.flatMap((choice) => {
      const matching = actions.filter((action) => actionChoiceFromAction(action) === choice);
      return matching.length > 0 ? [[choice, matching] as const] : [];
    });
  }, [actions, grouped, isSecretPlan]);
  useEffect(() => {
    if (selectedActionId && !actions.some((action) => action.id === selectedActionId)) {
      setSelectedActionId(null);
    }
  }, [actions, selectedActionId]);
  const selectedAction = actions.find((action) => action.id === selectedActionId) ?? null;
  const performAction = (action: GameAction) => {
    if (actionPending) return;
    ritualAudio.pulse(action.type.includes('VOTE') || action.type.includes('PLAN') ? 'reveal' : 'action');
    void submitAction(action.id);
    setSelectedActionId(null);
  };
  return (
    <section
      className={`action-dock mofa-action-dock${isSecretPlan ? ' is-secret-plan' : ''}`}
      aria-label="合法动作"
      aria-busy={actionPending}
      style={artVariable('--action-dock-art', '/assets/upstream/web/04-每轮秘密四选一-720.webp')}
    >
      <header className="decision-heading">
        <span>{phaseLabel}</span>
        <strong>{actions.length > 0 ? (isSecretPlan ? '选择一项行动' : '请作出响应') : '等待其他席位'}</strong>
        <small>{isSecretPlan ? '选择后确认，本轮计划才会锁定。' : '当前只显示此刻可执行的动作。'}</small>
      </header>
      <div className="mofa-action-grid">
        {actions.length === 0 ? <p className="waiting-copy">其他修士正在落子。</p> : null}
        {actionGroups.map(([type, list]) => (
          <div key={type} className="action-group" data-action-group={type}>
            <h3>{isSecretPlan && isActionChoice(type) ? ACTION_NAMES[type] : actionTypeName(type)}</h3>
            {isSecretPlan && isActionChoice(type) ? (
              <article className="mofa-plan-card">
                <img
                  src={actionArtPath(type)}
                  alt={`${ACTION_NAMES[type]}行动图`}
                  loading="lazy"
                  className="mofa-action-art"
                />
                <div className="plan-action-options">
                  {list.slice(0, 18).map((action) => {
                    const selected = selectedActionId === action.id;
                    return (
                      <button
                        key={action.id}
                        className={`plan-action-option${selected ? ' selected' : ''}`}
                        type="button"
                        disabled={actionPending}
                        onClick={() => {
                          setSelectedActionId(action.id);
                          ritualAudio.pulse('reveal');
                        }}
                        aria-label={`${action.label}：${action.description}`}
                        aria-pressed={selected}
                      >
                        {action.label}
                      </button>
                    );
                  })}
                </div>
              </article>
            ) : (
              <div className={list.some((action) => actionCardId(action)) ? 'mofa-card-action-grid' : 'mofa-response-action-list'}>
                {list.slice(0, 18).map((action) => {
                  const choice = actionChoiceFromAction(action);
                  const cardId = actionCardId(action);
                  if (cardId) {
                    const card = OPPORTUNITY_BY_ID.get(cardId);
                    return (
                      <button
                        key={action.id}
                        className="mofa-card-action"
                        data-card-id={cardId}
                        type="button"
                        disabled={actionPending}
                        onClick={() => performAction(action)}
                        aria-label={`${action.label}：${action.description}`}
                      >
                        <img src={cardArtPath(cardId)} alt={`${card?.name ?? cardId}卡面`} loading="eager" />
                        <span>
                          <strong>{card?.name ?? cardId}</strong>
                          <small>{action.label}</small>
                        </span>
                      </button>
                    );
                  }
                  return (
                    <button
                      key={action.id}
                      className={choice ? 'mofa-action-button has-action-art' : 'mofa-action-button'}
                      data-action-choice={choice ?? undefined}
                      type="button"
                      disabled={actionPending}
                      onClick={() => performAction(action)}
                      aria-label={`${action.label}：${action.description}`}
                      style={choice ? artVariable('--action-art', actionArtPath(choice)) : undefined}
                    >
                      {choice ? (
                        <img
                          src={actionArtPath(choice)}
                          alt={`${ACTION_NAMES[choice]}行动图`}
                          loading="lazy"
                          className="mofa-action-art"
                        />
                      ) : null}
                      <strong>{action.label}</strong>
                      <small>{action.description}</small>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
      {isSecretPlan ? (
        <button
          className="decision-confirm"
          type="button"
          disabled={!selectedAction || actionPending}
          onClick={() => {
            if (selectedAction) performAction(selectedAction);
          }}
        >
          <strong>{actionPending ? '提交中…' : '确认行动'}</strong>
          <small>{actionPending ? '正在与仙台同步' : selectedAction?.label ?? '先选择一项计划'}</small>
        </button>
      ) : null}
    </section>
  );
}

function EventLog({ view }: { view: GameView }) {
  return (
    <ol className="event-log" aria-label="公开事件">
      {view.events.slice(-28).reverse().map((event) => (
        <li key={event.sequence}>
          <span>#{event.sequence}</span>
          <p>{event.publicText}</p>
        </li>
      ))}
    </ol>
  );
}

function ChatPanel({ embedded = false }: { embedded?: boolean }) {
  const chat = useGameStore((state) => state.chat);
  const session = useGameStore((state) => state.session);
  const chatMuted = useGameStore((state) => state.chatMuted);
  const setChatMuted = useGameStore((state) => state.setChatMuted);
  const sendChat = useGameStore((state) => state.sendChat);
  const [text, setText] = useState('');
  const chatLogRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const log = chatLogRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [chat]);
  const submit = (message: string) => {
    sendChat(message);
    setText('');
  };
  return (
    <div className={embedded ? 'chat-panel negotiation-workspace' : 'chat-panel'}>
      <div className="chat-toolbar">
        <span>
          <strong>公开谈判</strong>
          <small>{session ? 'Bot 将根据公开局势直接回应' : '离线 Bot 使用本地人设模板直接回应'}</small>
        </span>
        <label className="toggle-line">
          <input type="checkbox" checked={chatMuted} onChange={(event) => setChatMuted(event.target.checked)} />
          屏蔽聊天
        </label>
      </div>
      <div className="quick-promises">
        {['本轮我抗劫', '优先补主台', '我需要探索', '谁愿意合作？'].map((promise) => <button key={promise} type="button" onClick={() => submit(promise)}>{promise}</button>)}
      </div>
      {chatMuted ? (
        <p className="info-strip">聊天已屏蔽；共 {chat.length} 条公开消息。</p>
      ) : (
        <ol ref={chatLogRef} className="event-log">
          {chat.map((message) => (
            <li key={message.id}>
              <span>
                {message.name}
                {message.round ? ` · 第 ${message.round} 轮` : ''}
                {' · '}
                {new Date(message.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
              </span>
              <p>{message.message}</p>
            </li>
          ))}
        </ol>
      )}
      <form
        className="chat-input"
        onSubmit={(event) => {
          event.preventDefault();
          submit(text);
        }}
      >
        <input aria-label="聊天输入" placeholder="直接对 Bot 们公开发言…" maxLength={240} value={text} onChange={(event) => setText(event.target.value)} />
        <button type="submit" disabled={!text.trim()}>发送发言</button>
      </form>
    </div>
  );
}

function Tutorial() {
  const [openRuleIndex, setOpenRuleIndex] = useState<number | null>(null);
  const [glossaryQuery, setGlossaryQuery] = useState('');
  const closeRuleButtonRef = useRef<HTMLButtonElement>(null);
  const openRule = openRuleIndex === null ? null : RULE_IMAGES[openRuleIndex] ?? null;
  useEffect(() => {
    if (!openRule) return undefined;
    closeRuleButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenRuleIndex(null);
      if (event.key === 'ArrowRight') setOpenRuleIndex((index) => (index === null ? 0 : Math.min(RULE_IMAGES.length - 1, index + 1)));
      if (event.key === 'ArrowLeft') setOpenRuleIndex((index) => (index === null ? 0 : Math.max(0, index - 1)));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openRule]);
  return (
    <section
      className="panel-page tutorial mofa-tutorial"
      style={artVariable('--tutorial-art', '/assets/upstream/web/02-末法世界与共同目标-941.webp')}
    >
      <div className="section-head">
        <p className="eyebrow">规则教学</p>
        <h2>八轮天劫，有限席位</h2>
      </div>
      <p className="rules-digest">{RULES_DIGEST}</p>
      <div className="rule-grid">
        {RULE_IMAGES.map((image, index) => (
          <article key={image.large} className="rule-card">
            <button
              className="mofa-rule-zoom"
              type="button"
              onClick={() => setOpenRuleIndex(index)}
              aria-label={`放大${image.title}`}
            >
              <picture>
                <source srcSet={image.small} media="(max-width: 720px)" />
                <img src={image.large} alt={image.alt} loading="lazy" className="mofa-rule-image" />
              </picture>
            </button>
            <h3>{image.title}</h3>
          </article>
        ))}
      </div>
      <section className="rule-card rules-reference" aria-labelledby="round-flow-title">
        <h3 id="round-flow-title">完整回合流程</h3>
        <ol className="rule-flow">
          {RULE_FLOW.map(([title, description]) => (
            <li key={title}>
              <strong>{title}</strong>
              <span>{description}</span>
            </li>
          ))}
        </ol>
        <p className="info-strip">
          对局中的动作区只显示当前修订版可执行的合法动作；按钮下方文字就是“当前为何可操作”的规则说明。
        </p>
      </section>
      <section className="rule-card rules-reference" aria-labelledby="glossary-title">
        <h3 id="glossary-title">完整人物与卡牌词条</h3>
        <label>
          搜索词条
          <input
            type="search"
            value={glossaryQuery}
            onChange={(event) => setGlossaryQuery(event.target.value)}
            placeholder="输入 ID、名称、时机或效果"
          />
        </label>
        <RuleGlossary query={glossaryQuery} />
      </section>
      {openRule ? (
        <div
          className="mofa-rule-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`${openRule.title}完整规则图`}
          onClick={() => setOpenRuleIndex(null)}
        >
          <div
            className="rule-card mofa-rule-lightbox-card"
            onClick={(event) => event.stopPropagation()}
          >
            <picture>
              <source srcSet={openRule.small} media="(max-width: 720px)" />
              <img
                src={openRule.large}
                alt={openRule.alt}
                className="mofa-rule-lightbox-image"
              />
            </picture>
            <div className="hero-actions mofa-lightbox-actions">
              <button className="secondary-action" type="button" onClick={() => setOpenRuleIndex((index) => Math.max(0, (index ?? 0) - 1))}>上一张</button>
              <button className="secondary-action" type="button" onClick={() => setOpenRuleIndex((index) => Math.min(RULE_IMAGES.length - 1, (index ?? 0) + 1))}>下一张</button>
              <button ref={closeRuleButtonRef} className="primary-action" type="button" onClick={() => setOpenRuleIndex(null)}>关闭</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function RuleGlossary({ query }: { query: string }) {
  const normalized = query.trim().toLocaleLowerCase('zh-CN');
  const matches = (parts: Array<string | number>) =>
    !normalized || parts.join(' ').toLocaleLowerCase('zh-CN').includes(normalized);
  const characters = CHARACTERS.filter((item) => matches([
    item.id,
    item.name,
    item.passiveTrigger,
    item.passiveEffect,
    item.ability.name,
    item.ability.effect,
  ]));
  const opportunities = OPPORTUNITIES.filter((item) => matches([
    item.id,
    item.name,
    item.type,
    item.trigger,
    item.cost,
    item.effect,
    item.restriction,
  ]));
  const calamities = CALAMITIES.filter((item) => matches([
    item.id,
    item.name,
    item.stage,
    item.effect,
    item.notes,
  ]));
  const fates = FATES.filter((item) => matches([
    item.id,
    item.name,
    item.mainFate,
    item.obsession,
  ]));
  const total = characters.length + opportunities.length + calamities.length + fates.length;
  return (
    <div className="glossary-groups">
      <p className="rules-digest">找到 {total} 个词条；内容直接来自固定上游 v0.1 数据。</p>
      <details open={Boolean(normalized)}>
        <summary>人物与本命神通（{characters.length}）</summary>
        <div className="glossary-list">
          {characters.map((item) => (
            <article key={item.id}>
              <strong>{item.id} · {item.name} / {item.ability.name}</strong>
              <span>{item.passiveTrigger}：{item.passiveEffect}</span>
              <small>{item.ability.trigger}：{item.ability.effect}；{item.ability.restriction}</small>
            </article>
          ))}
        </div>
      </details>
      <details open={Boolean(normalized)}>
        <summary>机缘与法宝（{opportunities.length}）</summary>
        <div className="glossary-list">
          {opportunities.map((item) => (
            <article key={item.id}>
              <strong>{item.id} · {item.name} · {item.type}</strong>
              <span>{item.trigger} / {item.cost}</span>
              <small>{item.effect}；{item.restriction}</small>
            </article>
          ))}
        </div>
      </details>
      <details open={Boolean(normalized)}>
        <summary>天劫（{calamities.length}）</summary>
        <div className="glossary-list">
          {calamities.map((item) => (
            <article key={item.id}>
              <strong>{item.id} · {item.name} · {item.stage}</strong>
              <span>劫力 4/5/6 人：{item.demand[4]}/{item.demand[5]}/{item.demand[6]}</span>
              <small>{item.effect} {item.notes}</small>
            </article>
          ))}
        </div>
      </details>
      <details open={Boolean(normalized)}>
        <summary>秘密天命（{fates.length}）</summary>
        <div className="glossary-list">
          {fates.map((item) => (
            <article key={item.id}>
              <strong>{item.id} · {item.name}</strong>
              <span>主命：{item.mainFate}（+{item.mainReward}）</span>
              <small>执念：{item.obsession}（+{item.obsessionReward}）</small>
            </article>
          ))}
        </div>
      </details>
    </div>
  );
}

function Saves() {
  const serverSaves = useGameStore((state) => state.serverSaves);
  const localSaves = useGameStore((state) => state.localSaves);
  const refreshSaves = useGameStore((state) => state.refreshSaves);
  const saveLocalNamed = useGameStore((state) => state.saveLocalNamed);
  const loadLocalSave = useGameStore((state) => state.loadLocalSave);
  const deleteLocalSave = useGameStore((state) => state.deleteLocalSave);
  const exportLocalSave = useGameStore((state) => state.exportLocalSave);
  const importLocalSave = useGameStore((state) => state.importLocalSave);
  const localState = useGameStore((state) => state.localState);
  const [name, setName] = useState('本地存档');
  const [payload, setPayload] = useState('');
  useEffect(() => {
    void refreshSaves();
  }, [refreshSaves]);
  return (
    <section className="panel-page">
      <div className="section-head"><p className="eyebrow">恢复 / 导出</p><h2>存档</h2></div>
      <div className="setup-grid">
        <label>存档名 <input value={name} onChange={(event) => setName(event.target.value)} /></label>
        <button
          className="primary-action wide"
          type="button"
          disabled={!localState}
          onClick={() => saveLocalNamed(name)}
        >
          {localState ? '保存当前单人局' : '当前没有本地单人局'}
        </button>
      </div>
      <div className="list-stack">
        {localSaves.length === 0 ? <p className="info-strip">当前没有本地命名存档；最近单人局会自动保存。</p> : null}
        {localSaves.map((save) => (
          <article key={save.id}>
            <strong>{save.name}</strong>
            <span>第 {save.round} 轮 · {save.phaseLabel}</span>
            <small>{save.updatedAt}</small>
            <button type="button" onClick={() => loadLocalSave(save.id)}>载入</button>
            <button type="button" onClick={() => setPayload(exportLocalSave(save.id) ?? '')}>导出</button>
            <button type="button" onClick={() => deleteLocalSave(save.id)}>删除</button>
          </article>
        ))}
      </div>
      <textarea aria-label="导入导出存档" value={payload} onChange={(event) => setPayload(event.target.value)} placeholder="导出的 JSON 会显示在这里，也可粘贴 JSON 导入。" />
      <button className="secondary-action" type="button" onClick={() => importLocalSave(payload, true)}>导入 / 覆盖</button>
      <h3>服务端存档</h3>
      <div className="list-stack">
        {serverSaves.map((save) => <article key={save.id}><strong>{save.name}</strong><span>{save.mode ?? 'online'}</span><small>{save.updatedAt}</small></article>)}
      </div>
    </section>
  );
}

function Settings() {
  const muted = useGameStore((state) => state.muted);
  const volume = useGameStore((state) => state.volume);
  const reducedMotion = useGameStore((state) => state.reducedMotion);
  const setAudio = useGameStore((state) => state.setAudio);
  const providers = useGameStore((state) => state.providers);
  const refreshDiagnostics = useGameStore((state) => state.refreshDiagnostics);
  const [probeProvider, setProbeProvider] = useState<'deepseek' | 'openai-compatible'>('deepseek');
  const [probeModel, setProbeModel] = useState('');
  const [probeToken, setProbeToken] = useState('');
  const [probePending, setProbePending] = useState(false);
  const [probeResult, setProbeResult] = useState<ProviderTestResult | null>(null);
  const [probeError, setProbeError] = useState<string | null>(null);
  useEffect(() => {
    ritualAudio.setMuted(muted);
    ritualAudio.setVolume(volume);
    document.documentElement.dataset.reducedMotion = String(reducedMotion);
  }, [muted, reducedMotion, volume]);
  useEffect(() => {
    void refreshDiagnostics();
  }, [refreshDiagnostics]);
  const runProviderProbe = async () => {
    setProbePending(true);
    setProbeResult(null);
    setProbeError(null);
    try {
      const result = await clientApi.providerTest(probeToken.trim(), {
        provider: probeProvider,
        model: probeModel.trim() || undefined,
        thinking: false,
      });
      setProbeResult(result);
      await refreshDiagnostics();
    } catch (error) {
      setProbeError(error instanceof Error ? error.message : 'Provider 连通性测试失败');
    } finally {
      setProbeToken('');
      setProbePending(false);
    }
  };
  return (
    <section className="panel-page">
      <div className="section-head"><p className="eyebrow">无障碍 / Provider</p><h2>设置与诊断</h2></div>
      <div className="setup-grid">
        <label className="toggle-line"><input type="checkbox" checked={muted} onChange={(event) => setAudio({ muted: event.target.checked })} /> 总静音</label>
        <label>音量 <input type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => setAudio({ volume: Number(event.target.value) })} /></label>
        <label className="toggle-line"><input type="checkbox" checked={reducedMotion} onChange={(event) => setAudio({ reducedMotion: event.target.checked })} /> 减少动态效果</label>
      </div>
      <button className="secondary-action" type="button" onClick={() => void refreshDiagnostics()}>刷新 Provider 诊断</button>
      <div className="list-stack">
        {providers.map((provider) => <article key={provider.id}><strong>{provider.label}</strong><span>{provider.status}</span><small>{provider.message ?? provider.model}</small></article>)}
      </div>
      <section className="rule-card provider-probe" aria-labelledby="provider-probe-title">
        <div className="section-head compact">
          <p className="eyebrow">真实最小请求</p>
          <h3 id="provider-probe-title">Provider 连通性测试</h3>
        </div>
        <p className="rules-digest">
          输入服务器环境变量 <code>PROVIDER_TEST_TOKEN</code>，发起一次固定、低成本的合法动作选择。令牌只用于本次请求，不会写入浏览器存储；这里不要填写 DeepSeek API Key。
        </p>
        <div className="setup-grid">
          <label>
            Provider
            <select value={probeProvider} onChange={(event) => setProbeProvider(event.target.value as typeof probeProvider)}>
              <option value="deepseek">DeepSeek</option>
              <option value="openai-compatible">OpenAI-compatible</option>
            </select>
          </label>
          <label>
            模型（可选）
            <input value={probeModel} onChange={(event) => setProbeModel(event.target.value)} placeholder="留空使用服务端默认" />
          </label>
          <label>
            诊断管理员令牌
            <input
              type="password"
              autoComplete="off"
              value={probeToken}
              onChange={(event) => setProbeToken(event.target.value)}
              placeholder="PROVIDER_TEST_TOKEN"
            />
          </label>
          <button
            className="primary-action wide"
            type="button"
            disabled={probePending || probeToken.trim().length === 0}
            onClick={() => void runProviderProbe()}
          >
            {probePending ? '正在探测…' : '运行最小连通性测试'}
          </button>
        </div>
        {probeResult ? (
          <div className={`info-strip ${probeResult.ok ? '' : 'is-warning'}`} role="status">
            {probeResult.ok
              ? `${probeResult.requestedProvider} 已连通：${probeResult.model}，${probeResult.latencyMs}ms，${probeResult.requestMode} 模式。`
              : `${probeResult.requestedProvider} 未通过实连；本次已安全回退至 ${probeResult.provider}，没有阻塞对局。`}
          </div>
        ) : null}
        {probeError ? <div className="info-strip is-error" role="alert">{probeError}</div> : null}
      </section>
    </section>
  );
}

function Credits() {
  return (
    <section className="panel-page">
      <div className="section-head"><p className="eyebrow">制作信息</p><h2>Credits</h2></div>
      <div className="rule-card">
        <h3>原作与美术</h3>
        <p>
          桌游规则、卡表与原始视觉素材来自 XLT-6 的
          {' '}
          <a href="https://github.com/XLT-6/mofa-dengxiantai" target="_blank" rel="noreferrer">《末法登仙台》上游仓库</a>
          ，固定版本 <code>b7d214903fb10c7de20f399c3c5a7bf27d63cd0e</code>。
        </p>
        <p>上游内容按 MIT License 使用并保留版权声明；仓库内完整文本见 <code>vendor/mofa-dengxiantai/LICENSE</code> 与 <code>THIRD_PARTY_NOTICES.md</code>。</p>
      </div>
      <div className="rule-card">
        <h3>网页版实现</h3>
        <p>本客户端使用 React 19、TypeScript、Vite、Zustand、Express、Socket.IO 与 SQLite 构建。美术来源、裁切与 WebP 派生记录见 <code>docs/ASSET_MANIFEST.md</code>。</p>
      </div>
    </section>
  );
}

function Outcome() {
  const view = useGameStore((state) => state.view);
  return (
    <section className="panel-page outcome">
      <div className="section-head"><p className="eyebrow">终局</p><h2>飞升结算</h2></div>
      {view?.outcome ? <OutcomeDetail outcome={view.outcome} players={view.players} /> : <p>尚未产生终局。</p>}
      <Link className="primary-action" to="/solo">再开一局</Link>
    </section>
  );
}

function OutcomeDetail({ outcome, players }: { outcome: GameOutcome; players: PublicPlayerView[] }) {
  const stats = (
    <dl className="outcome-stats">
      <div><dt>终局轮次</dt><dd>第 {outcome.round} 轮</dd></div>
      <div><dt>雷击次数</dt><dd>{outcome.stats.lightningHits}</dd></div>
      <div><dt>阻止裂痕</dt><dd>{outcome.stats.cracksPrevented}</dd></div>
      <div><dt>机缘使用</dt><dd>{outcome.stats.cardsPlayed}</dd></div>
      <div><dt>修台 / 抗劫</dt><dd>{outcome.stats.actions.repair} / {outcome.stats.actions.resist}</dd></div>
      <div><dt>强行破界</dt><dd>{outcome.stats.forcedBreach ? '发生' : '未发生'}</dd></div>
    </dl>
  );
  if (outcome.kind === 'collective_failure') {
    return (
      <>
        <p className="defeat">
          仙台崩裂，所有修士败退。原因：
          {outcome.reason === 'third_crack' ? '第三道裂痕形成' : '第八轮结束仍未启动'}
        </p>
        {stats}
        <ol className="ranking">
          {players.map((player) => {
            const fate = FATE_BY_ID.get(outcome.revealedFates[player.id]!);
            return (
              <li key={player.id}>
                <strong>{player.name}</strong>
                <span>天命揭示：{fate?.name ?? outcome.revealedFates[player.id]}</span>
                <small>{fate?.mainFate}；执念：{fate?.obsession}</small>
              </li>
            );
          })}
        </ol>
      </>
    );
  }
  return (
    <>
      <p className="info-strip">开放 {outcome.openSeats} 个飞升席位 · {outcome.reason === 'vote' ? '密票启动' : '强行破界'}</p>
      {stats}
      <ol className="ranking">
        {outcome.ranking.map((row) => {
          const player = players.find((candidate) => candidate.id === row.seatId);
          const character = player ? CHARACTER_BY_ID.get(player.characterId) : null;
          const fate = FATE_BY_ID.get(row.fateId);
          return (
            <li key={row.seatId} className="mofa-ranking-row">
              {player ? (
                <img
                  src={characterPortraitPath(player.characterId)}
                  alt={`${character?.name ?? player.characterId} 结算头像`}
                  loading="lazy"
                  className="mofa-ranking-portrait"
                />
              ) : null}
              <strong>#{row.rank} {player?.name ?? row.seatId}</strong>
              <span>{character?.name ?? player?.characterId ?? row.seatId} · {fate?.name ?? row.fateId}</span>
              <span>功德 {row.printedMerit} + 天命 {row.fateBonus} = {row.finalMerit}</span>
              <span>修为 {row.cultivation} · 灵力 {row.spirit}</span>
              <span>{row.ascended ? '飞升' : '落选'}</span>
            </li>
          );
        })}
      </ol>
    </>
  );
}

function actionTypeName(type: string): string {
  const names: Record<string, string> = {
    PASS_WINDOW: '窗口',
    READY_NEGOTIATION: '谈判',
    SUBMIT_PLAN: '秘密计划',
    PLAY_CARD: '机缘',
    USE_ABILITY: '神通',
    CHOOSE_EXPLORE_CARD: '探索',
    PASS_REACTION: '响应',
    USE_REACTION: '反应牌',
    SUBMIT_VOTE: '投票',
    FORCE_BREACH: '破界',
    DECLINE_FORCE_BREACH: '放弃',
    DISCARD_CARD: '弃牌',
  };
  return names[type] ?? type;
}
