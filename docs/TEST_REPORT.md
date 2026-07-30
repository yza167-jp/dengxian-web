# 发布验证报告

验证环境：macOS arm64，Node `v24.1.0`，npm `11.18.0`，Chromium Headless Shell。规则数据固定为上游 `b7d214903fb10c7de20f399c3c5a7bf27d63cd0e`。

## 自动化结果

| 检查 | 结果 | 证据 |
|---|---|---|
| `npm audit` | Pass | 0 vulnerabilities |
| `npm run typecheck` | Pass | TypeScript 无错误 |
| `npm run lint` | Pass | ESLint 0 warnings / 0 errors |
| `npm test` | Pass | 5 files，36 tests |
| `npm run sim` | Pass | 120/120 合法终局；4/5/6 人各 40 局 |
| `npm run build` | Pass | Vite client + `dist/server/index.js` + replay verifier |
| `npm start` smoke | Pass | `/api/health` 与生产首页均返回 200 |
| `npm run test:e2e` | Pass | Chromium 8/8 |
| `npm run verify` | Pass | 上述门按发布顺序全绿 |
| `docker compose config --quiet` | Pass | `.env.example` 临时复制后配置可解析 |
| `docker build` | Not run | Docker CLI 可用但本机 daemon 未启动 |

120 局模拟结果：665 个总轮次，平均 5.54 轮，所有动作均来自当前修订的合法动作集合，所有对局在有界步数内终止。本次固定策略样本全部飞升，不应将该比率解释为平衡性或真人胜率结论。

## 浏览器覆盖

Playwright 覆盖：

1. 本地单人开局并推进至少一整轮。
2. 一局完整本地 Bot 对局并显示合法终局结算。
3. 最近单人局续玩。
4. 命名存档、导出、删除、导入、覆盖与载入。
5. 两个独立浏览器上下文创建/加入同一房间，加入两个 Bot，双方准备、开局并推进一整轮；访客刷新后凭会话令牌回到原座位。
6. 教程与未结局状态下的结局路由。
7. 1024×768、1280×720、1440×900、1920×1080 四档截图。

截图位于 `docs/screenshots/`。视觉复核确认页面非空、正文可读、主导航与核心动作可见；1440×900 游戏桌的玩家状态行高度已在截图复核后加大，避免锁定标签侵入中央区。

## 隐私与服务端权威

服务端测试验证：

- 公共房间和未认证快照不包含 `gameState`、`initialConfig`、`actionIds`、`tokenHash`、其他玩家手牌/天命/秘密计划。
- Socket.IO 为每个已认证座位生成独立脱敏快照。
- 命令按 `commandId` 幂等并校验 `baseRevision` 与合法动作 ID。
- 在线存档只允许房主按本房间列出、创建、覆盖和删除，API 只返回元数据；权威房间快照不会作为下载内容公开。
- SQLite 文件关闭并重新打开后，进行中的房间、修订号和原座位令牌可恢复。
- 断线宽限后房主可让本地 Bot 临时接管；原会话令牌重连时恢复真人控制。
- DeepSeek 严格 tool call、JSON 回退、超时、HTTP 429、非法 actionId 和无 Key 场景均受 mock 测试覆盖；失败自动回退且不暴露 `reasoning_content`。

## Provider 实测边界

本轮环境未配置 `DEEPSEEK_API_KEY` 或 `OPENAI_COMPATIBLE_API_KEY`，因此没有产生真实计费请求。已验证无 Key 诊断、失败回退、合法动作约束、超时/重试/熔断代码路径与服务端密钥边界。上线前若配置 Key，应在目标网络执行一次 `/api/provider-test` 冒烟并确认模型名仍受官方 API 支持。

## 已知平台提示

Node 24 当前会为 `node:sqlite` 打印 ExperimentalWarning；数据库 API 在本项目所需范围内通过单测、生产启动和 E2E。该提示不是测试失败，但升级 Node 时应重新运行迁移与恢复测试。

本机 Docker daemon 未运行，因此没有声称镜像已实际构建；Dockerfile 与 Compose 配置均已做静态/配置预检，目标环境仍应执行一次 `docker compose up --build`。
