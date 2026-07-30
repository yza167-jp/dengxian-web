import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, NavLink, Route, Routes, useNavigate } from '../router';
import { CALAMITY_BY_ID, CHARACTER_BY_ID, CHARACTERS, FATE_BY_ID, OPPORTUNITY_BY_ID, RULES_DIGEST } from '../../shared/data/content';
import type { ActionChoice, CharacterId, GameAction, GameOutcome, GameView, PublicPlayerView } from '../../shared/game/types';
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

function characterCardPath(id: CharacterId): string {
  return CHARACTER_ART[id].card;
}

function characterPortraitPath(id: CharacterId): string {
  return CHARACTER_ART[id].portrait;
}

function actionArtPath(choice: ActionChoice): string {
  return ACTION_ART[choice];
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
          <NavLink to="/online">联机</NavLink>
          <NavLink to="/tutorial">规则</NavLink>
          <NavLink to="/saves">存档</NavLink>
          <NavLink to="/settings">设置</NavLink>
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
      window.sessionStorage.getItem('dengxiantai.onlineSession')
    ) {
      void reconnectOnline();
    }
  }, [reconnectOnline, session]);
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<MainMenu />} />
        <Route path="/solo" element={<SoloSetup />} />
        <Route path="/online" element={<OnlineLobby />} />
        <Route path="/game" element={<GameTable />} />
        <Route path="/tutorial" element={<Tutorial />} />
        <Route path="/saves" element={<Saves />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/credits" element={<Credits />} />
        <Route path="/outcome" element={<Outcome />} />
      </Routes>
    </Shell>
  );
}

function MainMenu() {
  const navigate = useNavigate();
  const continueRecentSolo = useGameStore((state) => state.continueRecentSolo);
  const reconnectOnline = useGameStore((state) => state.reconnectOnline);
  const localSaves = useGameStore((state) => state.localSaves);
  const loadLocalSave = useGameStore((state) => state.loadLocalSave);
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
          <Link className="secondary-action" to="/tutorial">查看规则</Link>
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
  const updateSetup = useGameStore((state) => state.updateSetup);
  const startSolo = useGameStore((state) => state.startSolo);
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
      <section className="rule-card mofa-character-gallery" aria-label="上游人物卡预览">
        <h3>七名修士人物卡</h3>
        <p className="rules-digest">单人局仍按规则自动分配角色；这里展示上游介绍册中的人物美术与神通文本。</p>
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
          startSolo();
          void navigate('/game');
        }}
      >
        入坛开局
      </button>
    </section>
  );
}

function OnlineLobby() {
  const navigate = useNavigate();
  const room = useGameStore((state) => state.room);
  const view = useGameStore((state) => state.view);
  const session = useGameStore((state) => state.session);
  const setup = useGameStore((state) => state.setup);
  const updateSetup = useGameStore((state) => state.updateSetup);
  const createOnline = useGameStore((state) => state.createOnline);
  const joinOnline = useGameStore((state) => state.joinOnline);
  const setReady = useGameStore((state) => state.setReady);
  const startOnline = useGameStore((state) => state.startOnline);
  const addBot = useGameStore((state) => state.addBot);
  const removeBot = useGameStore((state) => state.removeBot);
  const transferHost = useGameStore((state) => state.transferHost);
  const takeOverDisconnected = useGameStore((state) => state.takeOverDisconnected);
  const [roomId, setRoomId] = useState(() => new URLSearchParams(window.location.search).get('code') ?? '');
  const [name, setName] = useState('过路修士');
  const [botProvider, setBotProvider] = useState<'local-bot' | 'deepseek' | 'openai-compatible'>('local-bot');
  const [botModel, setBotModel] = useState('');
  const [botDifficulty, setBotDifficulty] = useState<'easy' | 'normal' | 'hard'>('normal');
  const [botPersona, setBotPersona] = useState<'steady' | 'bold' | 'suspicious' | 'selfish' | 'guardian'>('steady');
  const shareLink = room ? `${window.location.origin}/online?code=${encodeURIComponent(room.code)}` : '';
  const self = room?.seats.find((seat) => seat.id === session?.seatId);
  const isHost = Boolean(room && session && room.hostSeatId === session.seatId);
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
            {room.seats.map((seat) => (
              <article key={seat.id} className={seat.id === session?.seatId ? 'active' : ''}>
                <strong>{seat.name}</strong>
                <span>{seat.kind === 'bot' ? 'AI' : '真人'} · {seat.ready ? '已准备' : '未准备'} · {seat.connected ? '在线' : '离线'}</span>
                {seat.id === room.hostSeatId ? <small>房主</small> : null}
                {isHost && seat.kind === 'bot' ? <button type="button" onClick={() => void removeBot(seat.id)}>移除 AI</button> : null}
                {isHost && seat.kind === 'human' && seat.id !== session?.seatId ? <button type="button" onClick={() => void transferHost(seat.id)}>移交房主</button> : null}
                {isHost && seat.kind === 'human' && !seat.connected ? <button type="button" onClick={() => void takeOverDisconnected(seat.id)}>Bot 临时接管</button> : null}
              </article>
            ))}
          </div>
          {isHost ? (
            <div className="setup-grid" aria-label="AI 席位配置">
              <label>
                Provider
                <select value={botProvider} onChange={(event) => setBotProvider(event.target.value as typeof botProvider)}>
                  <option value="local-bot">本地启发式 Bot</option>
                  <option value="deepseek">DeepSeek</option>
                  <option value="openai-compatible">OpenAI-compatible</option>
                </select>
              </label>
              <label>
                模型
                <input value={botModel} onChange={(event) => setBotModel(event.target.value)} placeholder="留空使用服务端默认" disabled={botProvider === 'local-bot'} />
              </label>
              <label>
                难度
                <select value={botDifficulty} onChange={(event) => setBotDifficulty(event.target.value as typeof botDifficulty)}>
                  <option value="easy">简单</option>
                  <option value="normal">普通</option>
                  <option value="hard">困难 / 思考</option>
                </select>
              </label>
              <label>
                性格
                <select value={botPersona} onChange={(event) => setBotPersona(event.target.value as typeof botPersona)}>
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
                onClick={() => void addBot({
                  provider: botProvider,
                  model: botModel.trim() || undefined,
                  difficulty: botDifficulty,
                  persona: botPersona,
                  thinking: botDifficulty === 'hard',
                })}
              >
                添加 AI
              </button>
            ) : null}
            {isHost ? <button className="primary-action" type="button" onClick={() => void startOnline().then(() => { void navigate('/game'); })}>开始对局</button> : null}
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
  useEffect(() => {
    if (view?.outcome) navigate('/outcome');
  }, [navigate, view?.outcome]);
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
      <Scoreboard view={view} />
      <CenterAltar view={view} />
      <PlayerHand view={view} />
      <ActionDock actions={view.legalActions} />
      <aside className="side-rail">
        <div className="tab-row" role="tablist" aria-label="日志与聊天">
          <button className={activePanel === 'log' ? 'active' : ''} type="button" onClick={() => setActivePanel('log')}>日志</button>
          <button className={activePanel === 'chat' ? 'active' : ''} type="button" onClick={() => setActivePanel('chat')}>聊天</button>
        </div>
        {activePanel === 'log' ? <EventLog view={view} /> : <ChatPanel />}
      </aside>
    </section>
  );
}

function Scoreboard({ view }: { view: GameView }) {
  return (
    <div className="scoreboard" aria-label="玩家公开状态">
      {view.players.map((player) => (
        <PlayerToken key={player.id} player={player} active={player.id === view.seatId} />
      ))}
    </div>
  );
}

function PlayerToken({ player, active }: { player: PublicPlayerView; active: boolean }) {
  const character = CHARACTER_BY_ID.get(player.characterId);
  const revealedChoice = player.revealedPlan?.action;
  return (
    <article className={`player-token ${active ? 'active' : ''}`}>
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

function CenterAltar({ view }: { view: GameView }) {
  const calamity = CALAMITY_BY_ID.get(view.currentCalamity);
  const seatDone = view.platform.seatProgress.filter((value, index) => value >= (view.platform.seatRequirements[index] ?? Infinity)).length;
  return (
    <section className="altar" aria-label="中央玄坛">
      <div
        className="phase-orb mofa-phase-orb"
        style={artVariable('--phase-art', ALTAR_ART)}
      >
        <span>第 {view.round} 轮</span>
        <strong>{view.phaseLabel}</strong>
        <small>修订 {view.revision}</small>
      </div>
      <article
        className="calamity-card zoomable mofa-calamity-card"
        tabIndex={0}
        style={artVariable('--calamity-art', ALTAR_ART)}
      >
        <p className="eyebrow">{calamity?.stage ?? '天劫'}</p>
        <h2>{calamity?.name ?? view.currentCalamity}</h2>
        <p>{calamity?.effect ?? '等待天劫揭示。'}</p>
        <small>抗劫需求 {view.currentDemand}</small>
      </article>
      <div className="platform-meter" aria-label="登仙台进度">
        <label>主台 {view.platform.mainProgress}/{view.platform.mainRequired}</label>
        <progress value={view.platform.mainProgress} max={view.platform.mainRequired} />
        <label>席位 {seatDone}/{view.platform.seatRequirements.length}</label>
        <div className="seat-meters">
          {view.platform.seatRequirements.map((required, index) => (
            <progress key={required + index} value={view.platform.seatProgress[index] ?? 0} max={required} aria-label={`席位 ${index + 1}`} />
          ))}
        </div>
        <div className="cracks" aria-label={`裂痕 ${view.platform.cracks} 道`}>
          {[0, 1, 2].map((index) => <span key={index} className={index < view.platform.cracks ? 'lit' : ''} />)}
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
  return (
    <section className="hand-zone" aria-label="私有区域">
      <article
        className="secret-card zoomable mofa-self-card"
        tabIndex={0}
        data-character-id={selfPlayer?.characterId}
        style={selfPlayer ? artVariable('--character-art', characterCardPath(selfPlayer.characterId)) : undefined}
      >
        <span className="lock locked">天命密封</span>
        {selfPlayer ? (
          <img
            src={characterCardPath(selfPlayer.characterId)}
            alt={`${selfCharacter?.name ?? selfPlayer.characterId} 人物立绘`}
            loading="lazy"
            className="mofa-self-portrait"
          />
        ) : null}
        {selfCharacter ? (
          <>
            <h3>{selfCharacter.name}</h3>
            <p>{selfCharacter.ability.name}：{selfCharacter.ability.effect}</p>
          </>
        ) : null}
        <h3>{fate?.name ?? '旁观席'}</h3>
        <p>{fate ? `${fate.mainFate}（${fate.mainReward}）` : '无私有天命'}</p>
        <p>{fate ? `${fate.obsession}（${fate.obsessionReward}）` : ''}</p>
      </article>
      <div className="cards">
        {(view.self?.hand ?? []).map((cardId) => {
          const card = OPPORTUNITY_BY_ID.get(cardId);
          return (
            <button
              key={cardId}
              className={`hand-card zoomable ${selectedCardId === cardId ? 'selected' : ''}`}
              type="button"
              onClick={() => selectCard(selectedCardId === cardId ? null : cardId)}
              aria-pressed={selectedCardId === cardId}
            >
              <strong>{card?.name ?? cardId}</strong>
              <span>{card?.type ?? '机缘'}</span>
              <small>{card?.effect ?? '未知效果'}</small>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ActionDock({ actions }: { actions: GameAction[] }) {
  const submitAction = useGameStore((state) => state.submitAction);
  const grouped = useMemo(() => actions.reduce<Record<string, GameAction[]>>((acc, action) => {
    (acc[action.type] ??= []).push(action);
    return acc;
  }, {}), [actions]);
  const isSecretPlan = actions.length > 0 && actions.every((action) => actionChoiceFromAction(action));
  const actionGroups = useMemo(() => {
    if (!isSecretPlan) return Object.entries(grouped);
    return ACTION_ORDER.flatMap((choice) => {
      const matching = actions.filter((action) => actionChoiceFromAction(action) === choice);
      return matching.length > 0 ? [[choice, matching] as const] : [];
    });
  }, [actions, grouped, isSecretPlan]);
  return (
    <section
      className={`action-dock mofa-action-dock${isSecretPlan ? ' is-secret-plan' : ''}`}
      aria-label="合法动作"
      style={artVariable('--action-dock-art', '/assets/upstream/web/04-每轮秘密四选一-720.webp')}
    >
      {actions.length === 0 ? <p>等待其他席位锁定或响应。</p> : null}
      {actionGroups.map(([type, list]) => (
        <div key={type} className="action-group" data-action-group={type}>
          <h3>{isSecretPlan && isActionChoice(type) ? ACTION_NAMES[type] : actionTypeName(type)}</h3>
          {list.slice(0, 18).map((action) => {
            const choice = actionChoiceFromAction(action);
            return (
              <button
                key={action.id}
                className={choice ? 'mofa-action-button has-action-art' : 'mofa-action-button'}
                data-action-choice={choice ?? undefined}
                type="button"
                onClick={() => {
                  ritualAudio.pulse(action.type.includes('VOTE') || action.type.includes('PLAN') ? 'reveal' : 'action');
                  void submitAction(action.id);
                }}
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
      ))}
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

function ChatPanel() {
  const chat = useGameStore((state) => state.chat);
  const sendChat = useGameStore((state) => state.sendChat);
  const [text, setText] = useState('');
  const submit = (message: string) => {
    sendChat(message);
    setText('');
  };
  return (
    <div className="chat-panel">
      <div className="quick-promises">
        {['本轮我抗劫', '优先补主台', '我需要探索', '准备启动'].map((promise) => <button key={promise} type="button" onClick={() => submit(promise)}>{promise}</button>)}
      </div>
      <ol className="event-log">
        {chat.map((message) => <li key={message.id}><span>{message.name}</span><p>{message.message}</p></li>)}
      </ol>
      <form
        className="chat-input"
        onSubmit={(event) => {
          event.preventDefault();
          submit(text);
        }}
      >
        <input aria-label="聊天输入" placeholder="输入公开谈判消息" maxLength={120} value={text} onChange={(event) => setText(event.target.value)} />
        <button type="submit">发送</button>
      </form>
    </div>
  );
}

function Tutorial() {
  const [openRuleIndex, setOpenRuleIndex] = useState<number | null>(null);
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

function Saves() {
  const serverSaves = useGameStore((state) => state.serverSaves);
  const localSaves = useGameStore((state) => state.localSaves);
  const refreshSaves = useGameStore((state) => state.refreshSaves);
  const saveLocalNamed = useGameStore((state) => state.saveLocalNamed);
  const loadLocalSave = useGameStore((state) => state.loadLocalSave);
  const deleteLocalSave = useGameStore((state) => state.deleteLocalSave);
  const exportLocalSave = useGameStore((state) => state.exportLocalSave);
  const importLocalSave = useGameStore((state) => state.importLocalSave);
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
        <button className="primary-action wide" type="button" onClick={() => saveLocalNamed(name)}>保存当前单人局</button>
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
  useEffect(() => {
    ritualAudio.setMuted(muted);
    ritualAudio.setVolume(volume);
    document.documentElement.dataset.reducedMotion = String(reducedMotion);
  }, [muted, reducedMotion, volume]);
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
    </section>
  );
}

function Credits() {
  return (
    <section className="panel-page">
      <div className="section-head"><p className="eyebrow">制作信息</p><h2>Credits</h2></div>
      <p>规则与素材来自上游《末法登仙台》公开资料；本客户端使用 React 19、Vite、Zustand 与 Socket.IO Client 构建。</p>
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
  if (outcome.kind === 'collective_failure') {
    return <p className="defeat">仙台崩裂，所有修士败退。原因：{outcome.reason}</p>;
  }
  return (
    <ol className="ranking">
      {outcome.ranking.map((row) => {
        const player = players.find((candidate) => candidate.id === row.seatId);
        const character = player ? CHARACTER_BY_ID.get(player.characterId) : null;
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
            <span>{character?.name ?? player?.characterId ?? row.seatId}</span>
            <span>最终功德 {row.finalMerit}</span>
            <span>{row.ascended ? '飞升' : '落选'}</span>
          </li>
        );
      })}
    </ol>
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
