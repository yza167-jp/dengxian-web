# 《末法登仙台》网页版

这是上游纸面桌游 `XLT-6/mofa-dengxiantai@b7d214903fb10c7de20f399c3c5a7bf27d63cd0e` 的可游玩中文网页实现：一名玩家可与 3–5 个本地 Bot 离线对局，也可选择 DeepSeek/兼容 Provider 自动创建服务端权威私房；多人模式使用 4–6 人 Socket.IO 房间。

已实现：

- 确定性 TypeScript 规则引擎、92 条上游卡表同步与全部人物/天命/机缘/天劫内容。
- 秘密计划、同时揭晓、谈判、窗口响应、闪电/裂痕、破界表决与飞升结算。
- 本地无 Key Bot，以及仅在服务端运行的 DeepSeek V4 / OpenAI-compatible 适配器；外部调用失败自动回退合法启发式动作。
- 16 套可编辑 Bot 预设、长期 Bot 增删改查、跨对局公开记忆与成长，以及按 Bot 汇总的 token、缓存、重试和预估金额面板。
- 按座位脱敏的联机快照、哈希座位令牌、断线重连、自由公开发言、Bot 人设回应与快速承诺。
- SQLite 房间恢复和房主作用域的在线检查点；浏览器本地自动/命名存档支持载入、覆盖、导入、导出、删除。
- 中文桌面优先 UI、首次指引、完整人物/卡牌词条、设置、天命结算、响应式布局、Docker 与 Playwright 发布测试。

规则裁定见 [docs/RULES.md](docs/RULES.md) 与 [docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md)，架构见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)，验证证据见 [docs/TEST_REPORT.md](docs/TEST_REPORT.md)。

## 运行要求

- Node.js `>=24.0.0`（使用内置 `node:sqlite`）
- npm `>=11`
- Playwright Chromium（仅浏览器测试需要）

## 本地开发

```bash
npm ci
cp .env.example .env
npm run dev
```

开发脚本会自动读取本地 `.env`；开发地址为 `http://localhost:5173`，Vite 会将 API 和 Socket.IO 代理到 `http://127.0.0.1:8787`。安装浏览器测试运行时：

```bash
npx playwright install chromium
```

## 最快试玩

启动后打开 `http://localhost:5173`：

1. 点“开始单人局”。
2. 可先进入“Bot 道友”，从 16 套预设创建长期 Bot；修改其 Provider、人设、性格、偏好和沟通风格。要使用 DeepSeek，将 Provider 选为 `DeepSeek`，模型留空即可使用服务端默认的 `deepseek-v4-flash`。
3. 回到“单人”，选择 4–6 人、自己的角色，并为每个 Bot 席位指定刚创建的长期 Bot；页面下方可浏览七张上游人物卡。
4. 点“入坛开局”。前两个响应窗口没有要出的牌时点“跳过”；到“公开谈判”后可自由输入发言，Bot 会结合公开局势、人设和跨局记忆回应，再点“锁定谈判准备”。
5. 在同屏四张上游美术行动卡中秘密选择“修炼 / 修台 / 抗劫 / 探索”；需要投入的行动可选 1–3 灵力。选择探索后会以独立卡面展示抽到的机缘，直接点击想保留的牌。
6. 目标是在天劫与裂痕压垮仙台前共同修满主台与席位，同时把自己的修为、功德与天命条件经营到足以争夺有限飞升席位。

试玩时建议先走一轮“修台”或“抗劫”熟悉公共贡献，再试“探索”看机缘牌。返回“Bot 道友”可查看每位 Bot 的决策、公开发言、经验、跨局记忆、token 与预估消费。游戏会自动保存最近的单人局；主菜单可直接续玩，存档页可命名、导出和重新载入。

联机试玩从“联机”创建房间，分享六位房间码；房主也可以补入 Bot。所有真人准备后由房主开局。

## 生产构建

```bash
npm run build
npm start
```

一个 Node 进程在 `PORT`（默认 `8787`）同时提供 `dist/client`、REST API 和 Socket.IO。健康检查：

```bash
curl http://127.0.0.1:8787/api/health
```

## 环境变量

复制 `.env.example` 为 `.env`。关键变量：

| 变量 | 用途 | 默认值 |
|---|---|---|
| `PORT` | HTTP / Socket.IO 端口 | `8787` |
| `DATABASE_PATH` | SQLite 文件 | `./data/dengxian.sqlite` |
| `PUBLIC_ORIGIN` | 对外访问源 | `http://localhost:8787` |
| `SESSION_TOKEN_TTL_DAYS` | 座位重连令牌的服务端有效期 | `30` |
| `ACTION_TIMEOUT_MS` | 在线动作倒计时；超时后服务端执行安全默认动作 | `90000` |
| `DISCONNECT_GRACE_MS` | 断线后允许房主启用临时 Bot 的宽限期 | `120000` |
| `DEEPSEEK_API_KEY` | DeepSeek 服务端密钥 | 空 |
| `DEEPSEEK_BASE_URL` | DeepSeek OpenAI-compatible 地址 | `https://api.deepseek.com` |
| `DEEPSEEK_BETA_BASE_URL` | 严格工具调用 beta 地址 | `https://api.deepseek.com/beta` |
| `DEEPSEEK_DEFAULT_MODEL` | 常规 Bot 默认模型 | `deepseek-v4-flash` |
| `DEEPSEEK_PRO_MODEL` | 高难度/思考模式模型 | `deepseek-v4-pro` |
| `OPENAI_COMPATIBLE_*` | 可选的服务端兼容 Provider | 空 |
| `PROVIDER_TEST_TOKEN` | 管理员 Provider 连通性测试令牌；空则禁用测试接口 | 空 |

密钥、任意 Provider 地址和模型原始推理不会发送到浏览器或写入公开聊天。没有 Key 时所有流程仍可由 `local-bot` 完整运行。

## Docker / 局域网

```bash
cp .env.example .env
docker compose up --build
```

数据卷 `dengxian-data` 挂载到 `/app/data`。局域网发布时将 `PUBLIC_ORIGIN` 改为 `http://<主机局域网IP>:8787`，并只开放需要的端口。

## 质量门

```bash
npm run verify
```

该命令依次执行上游同步、依赖审计、类型检查、lint、Vitest、120 局 4/5/6 人模拟、生产构建和 Playwright E2E。Playwright 默认在独立的 `8797` 端口启动生产服务，避免与 `npm run dev` 使用的 `8787` API 服务冲突；可通过 `E2E_PORT` 覆盖。也可单独运行：

```bash
npm run typecheck
npm run lint
npm test
npm run sim
npm run build
npm run test:e2e
```

## 截图

- [1024×768 主菜单](docs/screenshots/menu-1024x768.png)
- [1280×720 教程](docs/screenshots/tutorial-1280x720.png)
- [1440×900 游戏桌](docs/screenshots/table-1440x900.png)
- [1920×1080 存档](docs/screenshots/saves-1920x1080.png)
- [上游美术与实现对照](docs/screenshots/art-v2-qa-comparison.png)
- [1280×720 秘密四选一](docs/screenshots/art-v2-secret-plan.png)
- [七人物卡画廊](docs/screenshots/art-v2-solo-full.png)
- [Safari：Bot 公开谈判](docs/screenshots/safari-bot-negotiation.jpg)
- [Safari：放大后的秘密计划控制](docs/screenshots/safari-secret-plan.jpg)
- [Safari：独立机缘卡牌选择](docs/screenshots/safari-opportunity-gallery.jpg)
- [Safari：DeepSeek Bot 成长与消费](docs/screenshots/safari-deepseek-bot-dashboard.jpg)
- [Safari：DeepSeek 最小连通性探针](docs/screenshots/safari-provider-probe.jpg)

## 上游与许可

上游规则、CSV 和展示图按 MIT 许可固定在上述 commit；详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 与 [docs/ASSET_MANIFEST.md](docs/ASSET_MANIFEST.md)。本仓库自身未另行声明许可证。
