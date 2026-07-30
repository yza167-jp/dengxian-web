# Legacy / 已被 V2 产品规格取代

> 本文件仅保留为历史设计记录。其“仅一名真人”“客户端权威”“无数据库/联机/存档”与“M0 后停下”等约束均已失效。当前唯一权威产品范围见 [`docs/PRODUCT_SPEC_V2.md`](docs/PRODUCT_SPEC_V2.md)。

# 《登仙台》网页版 —— Coding Agent 构建规格（历史版本）

> 目标：把 GitHub 仓库 `https://github.com/XLT-6/mofa-dengxiantai` 里的桌游，做成**在电脑浏览器里游玩**的单机网页版。**只有一名真人玩家（本机使用者）**，其余座位由 **DeepSeek 或任意 OpenAI 兼容大模型 API** 驱动。本文件是给 coding agent 通读、并据此从零开发到可运行成品的唯一权威文档。
>
> 阅读顺序：先读第 0 节（规则抽取，强制），再按第 11 节的里程碑顺序开发。**不要在没有完成第 0 节的情况下开始写游戏逻辑。**

---

## 0. Phase 0 —— 规则抽取（强制第一步，不可跳过）

你（agent）现在**无法假设**你已经知道这款桌游的规则。你必须先把仓库读透，把规则固化成机器可用的规格，之后所有代码都以这份规格为准。

### 0.1 要做的事

1. Clone / 打开仓库 `https://github.com/XLT-6/mofa-dengxiantai`，**逐个文件通读**：README、规则说明、卡表、数值表、图片说明、任何 `.md` / `.txt` / `.json` / `.csv` / 表格 / PDF。中文内容照读。
2. 产出 `docs/RULES.md`：用无歧义、可执行的语言重写完整规则。必须覆盖：
   - 玩家人数范围、胜负条件（例如"最先登仙者胜""达成某条件即结束"）。
   - 游戏的整体结构：回合 / 阶段 / 轮次的顺序。
   - 所有资源与状态量（如修为、灵气、生命、境界等级、金币等——以仓库实际为准）。
   - 所有卡牌 / 棋子 / 图块类型，及其**逐一**的效果、花费、触发时机、目标规则。
   - 每个阶段里玩家**可以做哪些动作**、每个动作的前置条件与结算方式。
   - 随机性来源（抽牌、掷骰、渡劫判定等）及其概率 / 数值。
   - 结束判定与计分 / 排名规则。
3. 产出 `src/game/config/*`：把上面所有**数值和卡牌数据**抽成数据（TypeScript 常量或 JSON），代码逻辑只读这些数据，不把具体数值硬编码进逻辑里。
4. 产出 `docs/OPEN_QUESTIONS.md`：任何规则含糊、缺失、自相矛盾之处，都列在这里，并写明"我采用了哪种最标准的解读、为什么"。**不要凭空发明规则；遇到空白就选桌游领域最通行的默认解法，并记录下来。**

### 0.2 硬性要求

- 若仓库某处规则与本规格的某个"示例假设"冲突，**一律以仓库为准**，本文件里出现的任何具体游戏机制都只是占位示例。
- `RULES.md` 完成后，先自检一遍："仅凭这份文档，一个没玩过的人能不能完整跑完一局并判出胜负？"不能，就补齐。

> 说明：本文件下文为了把架构讲清楚，会用"境界 / 修为 / 灵气 / 渡劫 / 登仙"这类修仙桌游的常见概念举例（仓库名 `登仙台` 提示这是修仙 / 飞升主题）。**这些只是举例，真实名称与机制以第 0 节抽取结果为准。**

---

## 1. 成品定义（Definition of Done）

一次成型的验收标准，全部满足才算完成：

1. 在一台装了 Node.js 的电脑上，`npm install` 后按 README 一条命令即可本地启动，浏览器打开即玩。
2. 开局界面可配置：玩家总数、每个 AI 座位使用的 provider / 模型 / 性格（persona）/ 难度。
3. 真人玩家通过界面操作完成自己的回合；AI 座位自动通过大模型 API 决策并行动，界面能看到 AI 的"思考"文本与所做动作。
4. 一局可以**从开始走到分出胜负**，胜负判定与仓库规则一致。
5. 提供**无需任何 API key 的离线自测模式**（所有座位用内置启发式 bot），能在命令行 headless 跑完整局并打印赢家——这是 agent 自我验证"游戏可完成"的手段。
6. 引擎有单元测试（合法动作、结算、胜负判定、AI 输出校验），`npm test` 通过。
7. 大模型 API key 只存在后端 / `.env`，**绝不出现在前端代码或浏览器网络请求的可见处**。
8. 关键代码有中文注释，`docs/` 下文档齐全。

---

## 2. 技术栈（除非有更强理由，按此选型）

| 层 | 选型 | 理由 |
|---|---|---|
| 语言 | TypeScript（前后端统一） | 类型安全，规则引擎可共享类型 |
| 前端 | React 18 + Vite + Tailwind CSS + Zustand | 快、轻、状态管理简单 |
| 后端 | Node.js + Express（或 Fastify）+ TypeScript | 只做两件事：托管前端 + 代理大模型调用 |
| 大模型 | OpenAI 兼容协议（DeepSeek 为默认 provider） | 一套代码适配多家 |
| 校验 | Zod | 校验 AI 返回、校验配置 |
| 测试 | Vitest | 引擎纯函数易测 |
| 打包运行 | 单仓库（monorepo 不必要），`concurrently` 同时起前后端，或 Express 直接托管 Vite 构建产物 | 一条命令启动 |

> 允许用等价替代（如 Fastify 换 Express、Pinia 类比 Zustand），但**必须保持"客户端持有引擎 + 后端只做薄代理"的核心架构**（见第 3 节），不要引入数据库、账号系统、复杂后端状态——这是单机单人对局，不需要。

---

## 3. 总体架构

**客户端权威引擎 + 后端薄代理（thin LLM proxy）。**

```
┌────────────────────────── 浏览器（前端）──────────────────────────┐
│  React UI  ├─ 开局配置 / 牌桌 / 手牌 / 对手公开区 / 日志 / AI思考   │
│            │                                                       │
│  GameEngine（纯 TS，确定性）                                        │
│   ├─ reduce(state, action) -> state                                │
│   ├─ getLegalActions(state, seatId) -> Action[]（已完全实例化）     │
│   ├─ getRedactedView(state, seatId) -> PlayerView（隐藏他人手牌）   │
│   └─ checkWinner(state) -> seatId | null                           │
│                                                                    │
│  TurnManager（回合循环）                                            │
│   ├─ 轮到真人 → 等 UI 输入                                          │
│   └─ 轮到 AI  → POST /api/ai-move（带该座位视图 + 合法动作列表）     │
└────────────────────────────────┬──────────────────────────────────┘
                                  │ HTTP（仅 AI 决策时调用）
┌─────────────────────────────── 后端（薄代理）──────────────────────┐
│  POST /api/ai-move                                                 │
│   ├─ 读 .env 里的 API key（前端永远拿不到 key）                     │
│   ├─ 组 prompt：系统提示(含persona) + 局面视图 + 合法动作清单        │
│   ├─ 调 OpenAI 兼容接口（JSON / function-calling 模式）             │
│   ├─ 用 Zod 校验返回，必须命中合法动作 id；失败重试1次              │
│   └─ 仍失败 → 用启发式 bot 兜底选一个合法动作，永不返回非法动作      │
│  GET  /api/health、GET /api/providers（列出可用 provider/模型）     │
└────────────────────────────────────────────────────────────────────┘
```

### 为什么这样分层

- **引擎放前端**：单机单人，无需服务器保存对局；引擎是纯函数，好测、好复现。
- **后端只做代理**：唯一职责是"藏好 key + 调模型 + 校验输出"。AI 决策时才有网络请求，其余全在本地。
- **AI 永不构造动作，只从合法动作里"选一个"**（见第 6 节）——这是让大模型稳定当桌游玩家的关键设计，从根上杜绝 AI 违规出牌。

---

## 4. 目录结构

```
dengxiantai-web/
├─ README.md                  # 安装与运行说明（面向最终用户）
├─ package.json               # 脚本：dev / build / start / test / sim
├─ .env.example               # 环境变量样板
├─ docs/
│  ├─ RULES.md                # 第0节产出：完整规则
│  ├─ OPEN_QUESTIONS.md       # 第0节产出：规则歧义与采用的解读
│  └─ ARCHITECTURE.md         # 简述实现，方便后续维护
├─ server/
│  ├─ index.ts                # Express 启动 + 托管前端构建产物
│  ├─ routes/aiMove.ts        # POST /api/ai-move
│  ├─ llm/provider.ts         # OpenAI 兼容 provider 抽象
│  ├─ llm/personas.ts         # AI 性格 / 难度定义
│  └─ llm/promptBuilder.ts    # 把局面视图+合法动作组装成 prompt
├─ src/                       # 前端 + 引擎（引擎为纯 TS，不依赖 React）
│  ├─ main.tsx / App.tsx
│  ├─ game/
│  │  ├─ types.ts             # GameState / Action / PlayerView 等类型
│  │  ├─ config/              # 第0节产出：卡表、境界、数值（数据）
│  │  ├─ engine.ts            # reduce / getLegalActions / checkWinner
│  │  ├─ view.ts              # getRedactedView（按座位脱敏）
│  │  ├─ rng.ts               # 可注入种子的随机（保证可复现/可测）
│  │  ├─ turnManager.ts       # 回合循环，串起真人与 AI
│  │  └─ heuristicBot.ts      # 无需 API 的启发式 bot（兜底+自测）
│  ├─ state/store.ts          # Zustand：UI 侧状态
│  ├─ ai/aiClient.ts          # 前端调用 /api/ai-move 的封装
│  └─ ui/                     # 组件：SetupScreen / Board / Hand / Log ...
├─ tests/                     # Vitest：引擎/合法动作/胜负/AI校验
└─ scripts/
   └─ simulate.ts             # headless 模拟一整局（全 bot），打印赢家
```

---

## 5. 游戏引擎规格（`src/game/`）

### 5.1 数据模型（`types.ts`，字段名以第 0 节实际规则为准）

```ts
type SeatId = string;              // 座位标识

interface Seat {
  id: SeatId;
  name: string;
  kind: 'human' | 'ai';
  // 该玩家的私有区（手牌等，别人看不到）+ 公开区（境界/资源等）
  hand: Card[];
  publicState: Record<string, unknown>; // 如 { realm, qi, hp, artifacts }
}

interface GameState {
  seats: Seat[];
  turnOrder: SeatId[];
  currentSeat: SeatId;
  phase: string;                   // 阶段机名，以规则为准
  round: number;
  sharedZones: Record<string, Card[]>; // 牌堆/弃牌/公共区
  rngSeed: number;                 // 可复现
  log: GameEvent[];                // 结构化事件流，UI 与 AI 都读它
  winner: SeatId | null;
}

// 关键：Action 是"已完全实例化、可直接结算"的动作，带展示信息
interface Action {
  id: string;                      // 唯一 id，AI 只需回传这个 id
  type: string;                    // 如 'PLAY_CARD' | 'CULTIVATE' | 'PASS'
  payload: Record<string, unknown>;// 目标、卡、数量等，已定死
  label: string;                   // 给人/AI 看的简短中文描述
  description?: string;            // 该动作的后果说明（可选，帮 AI 决策）
}
```

### 5.2 引擎必须导出的纯函数

- `createInitialState(config): GameState` —— 按玩家配置发牌、定序、设初值（用可注入的 seeded RNG）。
- `getLegalActions(state, seatId): Action[]` —— 返回当前该座位**所有合法且已实例化**的动作。
  - **这是全项目最重要的函数。** 动作空间小就直接枚举（例如"打出手牌 X、目标玩家 Y"生成为一个个具体 Action）。若某类动作参数组合过大（罕见），才退化为"带参数的结构化动作 + 严格校验"，并在 `description` 里说明参数取值范围。
  - 必须总是至少包含一个可执行动作（如 `PASS` / 结束回合），避免死锁。
- `reduce(state, action): GameState` —— 纯函数结算一个动作，返回新状态并追加 `log` 事件。非法动作应抛错（正常流程里不会走到，因为动作都来自 `getLegalActions`）。
- `getRedactedView(state, seatId): PlayerView` —— 按座位脱敏：**只暴露该座位自己的手牌 + 全部公开信息**，隐藏其他人手牌/牌堆顶等。**AI 和真人拿到的信息量必须对等，保证公平。**
- `checkWinner(state): SeatId | null` —— 胜负判定（如"最先登仙"）。
- RNG（`rng.ts`）必须是种子化的，测试可固定种子复现；对局默认用随机种子。

### 5.3 回合循环（`turnManager.ts`）

一个可 await 的循环：
1. `checkWinner`，非空则结束并展示结果。
2. 取 `currentSeat`：
   - `human` → 把 `getLegalActions` 交给 UI，等待玩家选择（含多步动作：选牌→选目标，UI 层引导，但最终提交的是一个已实例化 Action 的 id）。
   - `ai` → 调 `aiClient.decide(view, legalActions, seatConfig)` 拿到一个合法动作，短暂延时后应用（延时是为观感 + 降频，避免打爆 API）。
3. `reduce` 应用动作，推进阶段 / 换手，回到 1。

---

## 6. AI 玩家子系统（本项目成败的核心）

### 6.1 铁律：AI 只做"选择题"，不做"填空题"

后端把该座位的 `getLegalActions` 结果（每个动作有 `id/label/description`）连同脱敏局面一起交给大模型，**要求它只回一个 `actionId`**（外加一段 reasoning）。模型永远不构造动作、不填参数、不可能出非法牌。校验命中合法 `id` 才采纳。

> 若个别动作确需模型填参数（大动作空间的退化情形），用 function-calling 的 JSON schema 约束，并在后端用 Zod 校验后再交给 `reduce`；校验失败按 6.4 兜底。

### 6.2 请求/响应契约（前端 → `POST /api/ai-move`）

请求体：
```jsonc
{
  "seatConfig": { "provider": "deepseek", "model": "deepseek-chat",
                  "persona": "steady", "difficulty": "normal" },
  "view": { /* getRedactedView 的结果：该 AI 自己的手牌 + 公开局面 + log 摘要 */ },
  "legalActions": [ { "id": "a1", "label": "...", "description": "..." }, ... ],
  "rulesDigest": "从 RULES.md 提炼的规则要点（简短，供模型理解游戏目标）"
}
```
响应体：
```jsonc
{ "actionId": "a3", "reasoning": "为什么选它（中文，展示给真人看）",
  "provider": "deepseek", "usedFallback": false }
```

### 6.3 Prompt 组装（`server/llm/promptBuilder.ts`）

- **System**：说明"你是这款桌游的一名玩家，目标是<胜负条件>；你必须且只能从给定的合法动作里选一个，用 JSON 返回 `{actionId, reasoning}`，不要输出其它内容"。附上 `rulesDigest` 与该座位的 persona 风格。
- **User**：局面视图（自己的手牌、各家公开状态、当前阶段、最近若干条 log）+ 合法动作清单（编号 + label + description）。
- 要求 JSON 输出（DeepSeek/OpenAI 支持 `response_format: {type:"json_object"}`；能用 function/tool calling 更稳）。
- 控制成本：`max_tokens` 设小上限、默认温度中等、默认用便宜模型；`log` 只传摘要不传全量。

### 6.4 健壮性（后端 `aiMove.ts`）

1. 调模型 → 解析 JSON → Zod 校验 → 断言 `actionId ∈ legalActions`。
2. 失败（超时/非法 JSON/非法 id）→ 把错误信息回喂，**重试 1 次**。
3. 仍失败 → 调**启发式 bot** 选一个合法动作，`usedFallback:true`。**后端在任何情况下都必须返回一个合法动作**，绝不让对局卡死。
4. 全程超时保护（如 20s）、错误不外泄 key、把 prompt/response 落到服务端日志便于调试。

### 6.5 Provider 抽象（`server/llm/provider.ts`）

- 统一走 OpenAI 兼容协议：可配置 `baseURL`、`model`、`apiKey`。
- 内置预设：
  - `deepseek`（默认）：`baseURL=https://api.deepseek.com`，模型如 `deepseek-chat` / `deepseek-reasoner`。**开发时到 DeepSeek 官方文档确认当前 base URL 与模型名**，写进 `.env.example` 注释。
  - `openai`、`openai-compatible`（用户自填 baseURL，适配任意兼容服务，如本地 Ollama、硅基流动、Moonshot 等）。
  - `local-bot`（不调任何 API，直接用启发式 bot）——保证没有 key 也能玩、能测。
- key 从 `.env` 读，按 provider 分别配置。

### 6.6 Persona 与难度（`server/llm/personas.ts`）

- Persona 只改**系统提示的风格描述**（如"稳健保守""激进冒险""爱针对领先者"），用于对局趣味，不改规则。
- 难度可通过：是否使用 reasoning 型模型、是否在 prompt 里附带对手动作提示、温度高低来区分。保持实现简单即可。

### 6.7 启发式 Bot（`heuristicBot.ts`）

- 输入 `legalActions` 与局面，用一个朴素评分函数（朝胜负条件贪心，比如优先推进境界/攒资源/在能赢时终结）选最高分动作。
- 三重用途：AI 兜底、离线无 key 游玩、headless 自测。**必须能独立跑完整局。**

---

## 7. 后端 API 规格

- `POST /api/ai-move` —— 见 6.2 / 6.4。
- `GET  /api/providers` —— 返回可用 provider 列表与其默认模型，供开局界面下拉选择（不含 key）。
- `GET  /api/health` —— 探活。
- 生产模式下 Express 同时托管 `vite build` 产物（`dist/`），做到"一个进程、一个端口、一条命令"。
- CORS：开发期允许 Vite dev server；生产同源无需 CORS。

---

## 8. 前端规格（`src/ui/`）

用 Tailwind，界面语言中文，修仙 / 登仙主题的清爽视觉（不必华丽，先把可玩性和信息清晰度做扎实；配色可用水墨 / 云纹意象但保持可读性）。

**屏幕与组件：**
1. `SetupScreen`：选玩家总数；为每个 AI 座位选 provider / 模型 / persona / 难度；给每个座位起名；开始按钮。可放"离线 bot 模式"一键开局。
2. `Board`：牌桌主视图。
   - 顶部/环绕：各对手的**公开区**（境界、资源、已亮出的法宝等）与当前手牌数（背面）。
   - 中央：公共区 / 牌堆 / 弃牌 / 当前事件。
   - 底部：真人玩家自己的手牌与状态面板。
   - 明确的"当前轮到谁 / 当前阶段"指示。
3. `Hand` 与动作交互：真人回合时，把 `getLegalActions` 转成可点操作；多步动作（选牌→选目标→确认）用引导式高亮，最终提交一个已实例化 Action。非法操作在 UI 层就点不了。
4. `ActionLog`：把 `state.log` 渲染成人类可读的事件流（谁做了什么、结算结果）。
5. `AiThoughts`：显示每个 AI 座位本回合的 `reasoning`（"AI 的思考"气泡）——既有趣又便于调试；标注是否 `usedFallback`。
6. `GameOverModal`：展示赢家与最终排名 / 计分。
7. 全局：加载态（AI 决策时的等待动画）、错误提示（API 失败但已兜底时温和提示）。

**状态管理**：Zustand 持有 `GameState` 与 UI 交互态；引擎产出的新 state 驱动 UI 重渲染。AI 决策的等待/思考文本也进 store。

---

## 9. 配置与密钥

`.env.example`（agent 需生成，含注释）：
```
# 默认 provider
AI_DEFAULT_PROVIDER=deepseek

# DeepSeek（到官方文档确认当前 base url 与模型名后填写）
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat

# OpenAI 或任意兼容服务（可留空）
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini

PORT=8787
```
- key 只在后端读取。前端一律通过 `/api/*` 间接使用模型，**任何情况下 key 不进浏览器**。
- 没有任何 key 时，`local-bot` provider 必须可用，保证游戏能玩、能测。

---

## 10. 测试与自验证

1. **单元测试（Vitest）**：`createInitialState` 正确性、`getLegalActions` 在各阶段不为空且全合法、`reduce` 关键动作结算正确、`checkWinner` 边界、AI 返回校验（合法/非法/超时兜底）、`getRedactedView` 确实隐藏了他人手牌。
2. **Headless 模拟（`scripts/simulate.ts`，`npm run sim`）**：全部座位用启发式 bot，固定种子跑完整局，断言"必然在有限回合内产生赢家、过程无异常、无非法动作"。可循环跑 N 局统计平均回合数 / 胜率分布，用来发现规则死循环或失衡。**这是 agent 证明"游戏可完成"的关键手段，开发中反复运行。**
3. 手动冒烟：`npm run dev`，人机各一，走完一局。

---

## 11. 建议构建顺序（里程碑）

1. **M0 规则抽取**：完成 `docs/RULES.md`、`docs/OPEN_QUESTIONS.md`、`src/game/config/*`。（第 0 节）
2. **M1 引擎**：`types` → `config` → `rng` → `createInitialState` / `getLegalActions` / `reduce` / `checkWinner` / `getRedactedView`。配套单测。
3. **M2 启发式 bot + headless 模拟**：写 `heuristicBot` 和 `scripts/simulate.ts`，跑通"全 bot 一局分胜负"。**此步不过，不许往下走**——它证明规则实现闭环。
4. **M3 后端代理**：`provider` / `promptBuilder` / `personas` / `aiMove` 路由 + 校验 + 兜底 + `local-bot`。用 DeepSeek 或 `local-bot` 单测 `/api/ai-move`。
5. **M4 前端**：`SetupScreen` → `Board` / `Hand` / `ActionLog` / `AiThoughts` → `turnManager` 串起人机循环 → `GameOverModal`。
6. **M5 收尾**：`.env.example`、README（安装/运行/配置 key/离线模式）、`docs/ARCHITECTURE.md`、`npm test` 全绿、`npm run sim` 稳定分胜负、一条命令启动、人机各一手动跑通一局。

每个里程碑结束后自检对应验收点（第 1 节）。

---

## 12. 护栏（务必遵守）

- **不要发明规则**：一切以仓库为准；空白处取桌游最通行默认解，并记进 `OPEN_QUESTIONS.md`。
- **规则数据化**：数值和卡牌进 `config`，逻辑只读数据，方便后续按真实规则改。
- **AI 只选合法动作**：绝不让模型自由构造动作；后端始终返回合法动作，绝不卡死对局。
- **信息公平**：AI 与真人拿到的信息量对等，AI 看不到他人手牌。
- **密钥安全**：key 只在后端 / `.env`。
- **可离线**：没有 API key 也要能用 `local-bot` 玩和测。
- **保持简单**：不加数据库、账号、联机对战、复杂后端状态——这是单机单人对 AI。
- **中文界面 + 中文注释 + 完整文档**。

---

## 13. 交接检查清单（agent 完工前逐条打勾）

- [ ] `docs/RULES.md` 可让新手照着独立跑完一局并判胜负
- [ ] `docs/OPEN_QUESTIONS.md` 记录了所有规则歧义与采用的解读
- [ ] `npm install && <一条启动命令>` 后浏览器可直接开玩
- [ ] 开局可配置人数 / 各 AI 座位的 provider·模型·persona·难度
- [ ] 人机对局能从头走到分胜负，判定与规则一致
- [ ] 界面能看到 AI 的思考文本与所做动作
- [ ] `npm run sim` 全 bot 稳定分出赢家、无非法动作
- [ ] `npm test` 全绿
- [ ] 无 key 时 `local-bot` 模式可玩可测
- [ ] key 不出现在任何前端代码 / 浏览器请求
- [ ] README 覆盖安装、运行、配置 key、离线模式、常见问题
