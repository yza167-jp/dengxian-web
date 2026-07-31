# 发布验证报告

验证环境：macOS arm64，Node `v24.1.0`，npm `11.18.0`，Safari 实机窗口。规则数据固定为上游 `b7d214903fb10c7de20f399c3c5a7bf27d63cd0e`。

## 自动化结果

| 检查 | 结果 | 证据 |
|---|---|---|
| `npm audit` | Pass | 0 vulnerabilities |
| `npm run typecheck` | Pass | TypeScript 无错误 |
| `npm run lint` | Pass | ESLint 0 warnings / 0 errors |
| `npm test` | Pass | 6 files，74 tests |
| `npm run sim` | Pass | 120/120 合法终局；4/5/6 人各 40 局 |
| `npm run build` | Pass | Vite client + `dist/server/index.js` + replay verifier |
| `npm start` smoke | Pass | `/api/health` 与生产首页均返回 200 |
| `npm run test:e2e` | Historical pass | Chromium 16/16；本轮按用户指定只做 Safari 视觉验收，未重跑 Playwright |
| `npm run verify` | Not rerun as a bundle | 本轮独立执行并通过 typecheck、lint、Vitest、模拟与构建；未重跑 `npm audit` / Playwright |
| `docker compose config --quiet` | Pass | `.env.example` 临时复制后配置可解析 |
| `docker build` | Not run | Docker CLI 可用但本机 daemon 未启动 |

120 局模拟结果：664 个总轮次，平均 5.53 轮，所有动作均来自当前修订的合法动作集合，所有对局在有界步数内终止。本次固定策略样本全部飞升，不应将该比率解释为平衡性或真人胜率结论。

## 浏览器覆盖

Playwright 覆盖：

1. 上游封面在主菜单按桌面/移动视口响应式加载。
2. 教程三张上游规则图具备有意义的可访问名称和可打开的灯箱。
3. 每个玩家公开席位加载对应人物头像图。
4. 四个秘密计划按钮加载对应行动卡图，且渲染资产没有 4xx 或 broken image。
5. 本地单人开局并推进至少一整轮。
6. 一局完整本地 Bot 对局并显示合法终局结算。
7. DeepSeek 单人配置自动建立服务端权威私房；无 Key 时显示本地 Bot 接管且不阻塞。
8. 最近单人局续玩。
9. 对局记录与公开会话使用可关闭的两侧抽屉，关闭后不会继续遮挡桌面。
10. 命名存档、导出、删除、导入、覆盖与载入。
11. 两个独立浏览器上下文创建/加入同一房间，加入两个 Bot，双方准备、开局并推进一整轮；访客刷新后凭会话令牌回到原座位。
12. 教程与未结局状态下的结局路由。
13. 1024×768、1280×720、1440×900、1920×1080 四档截图。

截图位于 `docs/screenshots/`。常规 release 截图为 `menu-1024x768.png`、`tutorial-1280x720.png`、`table-1440x900.png`、`saves-1920x1080.png`；本轮额外保留 `safari-*.jpg` 作为 Safari 实机证据。视觉复核确认页面非空、正文可读、主导航与核心动作可见，且人物头像、天劫牌、行动卡、探索机缘牌和中央仙台背景均已加载。

本轮 Safari 连续试玩四轮，覆盖：

1. 从 16 套预设创建三位长期 Bot，并把其中一位切换到 DeepSeek。
2. 将三位长期 Bot 逐席加入服务端权威单人局。
3. 在公开谈判中自由输入中文分工，收到 DeepSeek Bot 与本地 Bot 的公开回应；新消息会自动滚到可见区域。
4. 秘密计划的 1–3 灵力按钮不小于 44px，四张行动卡与确认按钮保持同屏。
5. 连续两次主动选择探索，第二次确认抽到的三张机缘以独立上游卡面横向展示并可直接点击保留。
6. 返回 Bot 面板后确认 DeepSeek Bot 的决策、发言、经验、缓存命中、token、预估金额和四条公开记忆均已更新。
7. 后续在 Safari 响应式设计模式复核 1024×768 与 1280×720：秘密行动图完整显示、不裁切卡名；单张机缘/法宝响应不再撑满大底板，三张探索牌保持居中的定宽卡牌画廊。退出响应式模式后又从新局第一轮重新走到探索，并刷新 `safari-opportunity-gallery.jpg` 作为正常 Safari 窗口证据。

## 隐私与服务端权威

服务端测试验证：

- 公共房间和未认证快照不包含 `gameState`、`initialConfig`、`actionIds`、`tokenHash`、其他玩家手牌/天命/秘密计划。
- Socket.IO 为每个已认证座位生成独立脱敏快照。
- 命令按 `commandId` 幂等并校验 `baseRevision` 与合法动作 ID。
- 命令缓存只在席位认证后读取，且绑定原始 seat/revision/action；伪造 token 或复用 ID 改载荷不能取得缓存私密快照。
- 人类动作后的房间迁移与 `pending` 命令记录在同一 SQLite 事务提交；模拟在最终响应缓存前崩溃后，以同一 `commandId` 重试不会重复应用动作。
- 回放 JSON 在重建前严格校验 schemaVersion、固定上游 SHA、初始席位配置、动作 ID 数组和最终 SHA-256；错误版本、畸形哈希与重复座位会被拒绝。
- 回气散在雷击失去灵力后进入显式可选响应，不会自动消耗；借功诀只枚举本轮修台/抗劫结算中实际产生有效贡献的其他玩家。
- 在线存档只允许房主按本房间列出、创建、覆盖和删除，API 只返回元数据；权威房间快照不会作为下载内容公开。
- SQLite 文件关闭并重新打开后，进行中的房间、修订号和原座位令牌可恢复；服务重启先把真人标记离线，凭 token 重连后才恢复在线。旧状态缺少新增的雷击响应/有效贡献字段时会补入安全默认值，旧版本遗留的重复人物房间会确定性修复且同步房间与初始配置，而新建和导入仍严格拒绝重复人物。
- 断线宽限后房主可让本地 Bot 临时接管；原会话令牌重连时恢复真人控制。
- 房主可在开局前交换自己与目标席位的顺序；双方身份令牌与房主权限保持绑定，不随视觉位置互换。
- 座位令牌只存哈希并受 `SESSION_TOKEN_TTL_DAYS` 控制；过期令牌无法认证，过期时间不进入公开房间快照。
- 在线动作截止时间与修订号一同持久化；超时会执行合法的安全默认动作、写入事件与动作账本，并为下一待决状态生成新截止时间。
- DeepSeek 严格 tool call、工具拒绝后的 JSON-only 请求、超时、HTTP 429/`Retry-After`、非重试 401、非法 actionId 和无 Key 场景均受 mock 测试覆盖；失败自动回退，模型自由文本不会进入公共聊天。
- AI 结构化诊断记录 provider、实际与请求模型、延迟、token usage、重试、request mode 和 fallback；测试断言日志中没有 prompt、API Key 或模型 reasoning。

## Provider 实测边界

本轮通过仅服务端读取的本地 `.env` 配置 DeepSeek，并完成真实最小请求：`deepseek-v4-flash` 返回合法 JSON 动作，未触发本地回退；延迟 1740ms，827 输入 tokens、34 输出 tokens、861 总 tokens，按当前价格估算为 126 USD micros。随后 Safari 实机对局验证了 DeepSeek 的公开中文回应、结构化决策、用量累计与跨局公开记忆。

密钥没有进入浏览器、Git、截图、公开聊天或测试输出；本地 `.env` 被 `.gitignore` 排除并设为仅当前用户可读写。由于密钥曾由用户直接粘贴到会话中，完成验收后仍建议在 DeepSeek 控制台轮换。

## 已知平台提示

Node 24 当前会为 `node:sqlite` 打印 ExperimentalWarning；数据库 API 在本项目所需范围内通过单测、生产启动和 E2E。该提示不是测试失败，但升级 Node 时应重新运行迁移与恢复测试。

本机 Docker daemon 未运行，因此没有声称镜像已实际构建；Dockerfile 与 Compose 配置均已做静态/配置预检，目标环境仍应执行一次 `docker compose up --build`。
