import { setTimeout as sleep } from 'node:timers/promises';
import { z } from 'zod';
import type { AiSeatConfig, GameAction, GameView } from '../shared/game/types';

const aiResponseSchema = z.object({
  actionId: z.string(),
  reasoning: z.string().min(1).max(800).default('已选择一个合法动作。'),
});

const providerResponseSchema = z.object({
  choices: z.array(z.object({
    message: z.object({
      content: z.string().nullable().optional(),
      tool_calls: z.array(z.object({
        function: z.object({
          arguments: z.string(),
        }),
      })).optional(),
    }),
  })).min(1),
  usage: z.object({
    prompt_tokens: z.number().int().min(0).optional(),
    completion_tokens: z.number().int().min(0).optional(),
    total_tokens: z.number().int().min(0).optional(),
  }).optional(),
});

export interface AiMoveRequest {
  seatConfig: AiSeatConfig;
  view: GameView;
  legalActions: GameAction[];
  rulesDigest?: string;
}

export interface AiMoveResponse {
  actionId: string;
  reasoning: string;
  provider: AiSeatConfig['provider'];
  usedFallback: boolean;
  model: string;
  requestedModel: string;
  latencyMs: number;
  retryCount: number;
  requestMode: ProviderRequestMode | 'local';
  tokenUsage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

const circuits = new Map<string, { failures: number; openedUntil: number }>();
type ProviderRequestMode = 'tool' | 'json';
interface AttemptDiagnostics {
  retryCount: number;
}

class ProviderHttpError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfterMs: number | null,
  ) {
    super(`provider http ${status}`);
  }
}

class ProviderOutputError extends Error {}

export function listProviders() {
  return [
    {
      id: 'local-bot',
      label: '本地启发式 Bot',
      models: ['heuristic-v1'],
      model: 'heuristic-v1',
      available: true,
      status: 'available' as const,
      message: '无需 API Key，始终可用。',
    },
    {
      id: 'deepseek',
      label: 'DeepSeek',
      models: Array.from(new Set([
        process.env.DEEPSEEK_DEFAULT_MODEL ?? 'deepseek-v4-flash',
        process.env.DEEPSEEK_PRO_MODEL ?? 'deepseek-v4-pro',
      ])),
      model: process.env.DEEPSEEK_DEFAULT_MODEL ?? 'deepseek-v4-flash',
      available: Boolean(process.env.DEEPSEEK_API_KEY),
      status: process.env.DEEPSEEK_API_KEY ? 'available' as const : 'missing-key' as const,
      message: process.env.DEEPSEEK_API_KEY ? '服务端已配置密钥。' : '未配置服务端密钥，将自动回退。',
    },
    {
      id: 'openai-compatible',
      label: 'OpenAI 兼容',
      models: [process.env.OPENAI_COMPATIBLE_DEFAULT_MODEL ?? process.env.OPENAI_MODEL ?? 'gpt-4o-mini'],
      model: process.env.OPENAI_COMPATIBLE_DEFAULT_MODEL ?? process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
      available: Boolean(process.env.OPENAI_API_KEY || process.env.OPENAI_COMPATIBLE_API_KEY),
      status: process.env.OPENAI_API_KEY || process.env.OPENAI_COMPATIBLE_API_KEY
        ? 'available' as const
        : 'missing-key' as const,
      message: process.env.OPENAI_API_KEY || process.env.OPENAI_COMPATIBLE_API_KEY
        ? '服务端已配置兼容端点。'
        : '未配置兼容端点与 Key。',
    },
  ];
}

function localDecision(
  request: AiMoveRequest,
  reason: string,
  usedFallback: boolean,
  requestedModel: string,
  retryCount: number,
  startedAt: number,
): AiMoveResponse {
  const legal = request.legalActions[0]!;
  return {
    actionId: legal.id,
    reasoning: `${reason} 选择“${legal.label}”。`,
    provider: 'local-bot',
    usedFallback,
    model: 'heuristic-v1',
    requestedModel,
    latencyMs: Date.now() - startedAt,
    retryCount,
    requestMode: 'local',
  };
}

function providerConfig(config: AiSeatConfig, mode: ProviderRequestMode) {
  if (config.provider === 'deepseek') {
    return {
      key: process.env.DEEPSEEK_API_KEY,
      baseUrl: mode === 'tool'
        ? process.env.DEEPSEEK_BETA_BASE_URL ?? 'https://api.deepseek.com/beta'
        : process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com',
      model: config.model ?? process.env.DEEPSEEK_DEFAULT_MODEL ?? 'deepseek-v4-flash',
    };
  }
  return {
    key: process.env.OPENAI_COMPATIBLE_API_KEY ?? process.env.OPENAI_API_KEY,
    baseUrl: process.env.OPENAI_COMPATIBLE_BASE_URL ?? process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
    model: config.model ?? process.env.OPENAI_COMPATIBLE_DEFAULT_MODEL ?? process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
  };
}

function buildMessages(request: AiMoveRequest, mode: ProviderRequestMode) {
  const legal = request.legalActions.map((action) => ({
    id: action.id,
    label: action.label,
    description: action.description,
    payload: action.payload,
  }));
  return [
    {
      role: 'system',
      content: [
        '你是《末法登仙台》的一名玩家。',
        '必须且只能选择给定 legalActions 中的一个 id。',
        mode === 'tool'
          ? '必须通过 choose_action 工具返回选择。'
          : '只输出 JSON：{"actionId":"...","reasoning":"..."}，不要输出 Markdown。',
        'reasoning 只能引用公开局势；严禁提及自己的手牌、天命、未揭晓计划、密票或其他私密字段。',
        `性格=${request.seatConfig.persona}，难度=${request.seatConfig.difficulty}。`,
        request.rulesDigest ? `规则摘要：${request.rulesDigest}` : '',
      ].filter(Boolean).join('\n'),
    },
    {
      role: 'user',
      content: JSON.stringify({
        view: request.view,
        legalActions: legal,
      }),
    },
  ];
}

function extractJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('model returned non-json content');
    return JSON.parse(match[0]);
  }
}

function numericEnv(name: string, fallbackValue: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallbackValue;
}

function retryAfterMs(response: Response): number | null {
  const value = response.headers.get('retry-after');
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

function isToolUnsupported(error: unknown): boolean {
  return error instanceof ProviderHttpError &&
    [400, 404, 405, 415, 422].includes(error.status);
}

function isTransientProviderError(error: unknown): boolean {
  if (error instanceof ProviderOutputError) return true;
  if (error instanceof ProviderHttpError) {
    return error.status === 408 || error.status === 429 || error.status >= 500;
  }
  return error instanceof TypeError ||
    (error instanceof Error && error.name === 'AbortError');
}

async function requestProvider(
  request: AiMoveRequest,
  mode: ProviderRequestMode,
  deadline: number,
  diagnostics: AttemptDiagnostics,
  startedAt: number,
): Promise<AiMoveResponse> {
  const cfg = providerConfig(request.seatConfig, mode);
  if (!cfg.key) throw new Error('provider api key is not configured');
  if (Date.now() >= deadline) throw new Error('provider total wait limit exceeded');

  const controller = new AbortController();
  const timeoutMs = Math.min(numericEnv('AI_TIMEOUT_MS', 12_000), Math.max(1, deadline - Date.now()));
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const isDeepSeek = request.seatConfig.provider === 'deepseek';
    const response = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${cfg.key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: buildMessages(request, mode),
        temperature: request.seatConfig.difficulty === 'hard' ? 0.35 : 0.55,
        max_tokens: 500,
        ...(isDeepSeek ? {
          thinking: { type: request.seatConfig.thinking ? 'enabled' : 'disabled' },
        } : {}),
        response_format: { type: 'json_object' },
        ...(mode === 'tool' ? {
          tools: [{
            type: 'function',
            function: {
              name: 'choose_action',
              description: 'Choose one legal action id.',
              ...(isDeepSeek ? { strict: true } : {}),
              parameters: {
                type: 'object',
                additionalProperties: false,
                required: ['actionId', 'reasoning'],
                properties: {
                  actionId: { type: 'string', enum: request.legalActions.map((action) => action.id) },
                  reasoning: { type: 'string' },
                },
              },
            },
          }],
          tool_choice: { type: 'function', function: { name: 'choose_action' } },
        } : {}),
      }),
    });
    if (!response.ok) {
      throw new ProviderHttpError(response.status, retryAfterMs(response));
    }
    try {
      const raw = providerResponseSchema.parse(await response.json());
      const message = raw.choices[0]!.message;
      const toolArgs = message.tool_calls?.[0]?.function.arguments;
      const parsed = aiResponseSchema.parse(
        toolArgs
          ? JSON.parse(toolArgs) as unknown
          : extractJson(message.content ?? '{}'),
      );
      if (!request.legalActions.some((action) => action.id === parsed.actionId)) {
        throw new ProviderOutputError('model chose illegal action');
      }
      return {
        actionId: parsed.actionId,
        reasoning: parsed.reasoning,
        provider: request.seatConfig.provider,
        usedFallback: false,
        model: cfg.model,
        requestedModel: cfg.model,
        latencyMs: Date.now() - startedAt,
        retryCount: diagnostics.retryCount,
        requestMode: mode,
        tokenUsage: raw.usage ? {
          promptTokens: raw.usage.prompt_tokens,
          completionTokens: raw.usage.completion_tokens,
          totalTokens: raw.usage.total_tokens,
        } : undefined,
      };
    } catch (error) {
      if (error instanceof ProviderOutputError) throw error;
      throw new ProviderOutputError(error instanceof Error ? error.message : 'invalid provider output');
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function requestWithRetries(
  request: AiMoveRequest,
  mode: ProviderRequestMode,
  attempt: number,
  deadline: number,
  diagnostics: AttemptDiagnostics,
  startedAt: number,
): Promise<AiMoveResponse> {
  try {
    return await requestProvider(request, mode, deadline, diagnostics, startedAt);
  } catch (error) {
    const maxRetries = Math.floor(numericEnv('AI_MAX_RETRIES', 2));
    if (!isTransientProviderError(error) || attempt >= maxRetries || Date.now() >= deadline) {
      throw error;
    }
    const requestedDelay = error instanceof ProviderHttpError && error.retryAfterMs !== null
      ? error.retryAfterMs
      : 120 * 2 ** attempt + Math.floor(Math.random() * 120);
    const delay = Math.min(requestedDelay, Math.max(0, deadline - Date.now()));
    if (delay > 0) await sleep(delay);
    diagnostics.retryCount += 1;
    return requestWithRetries(request, mode, attempt + 1, deadline, diagnostics, startedAt);
  }
}

async function callOpenAiCompatible(
  request: AiMoveRequest,
  deadline: number,
  diagnostics: AttemptDiagnostics,
  startedAt: number,
): Promise<AiMoveResponse> {
  const toolConfig = providerConfig(request.seatConfig, 'tool');
  const jsonConfig = providerConfig(request.seatConfig, 'json');
  const circuitKey = [
    request.seatConfig.provider,
    toolConfig.baseUrl,
    jsonConfig.baseUrl,
  ].join(':');
  const circuit = circuits.get(circuitKey);
  if (circuit && circuit.openedUntil > Date.now()) throw new Error('provider circuit is open');
  try {
    let result: AiMoveResponse;
    try {
      result = await requestWithRetries(request, 'tool', 0, deadline, diagnostics, startedAt);
    } catch (error) {
      if (!isToolUnsupported(error)) throw error;
      result = await requestWithRetries(request, 'json', 0, deadline, diagnostics, startedAt);
    }
    circuits.set(circuitKey, { failures: 0, openedUntil: 0 });
    return result;
  } catch (error) {
    const current = circuits.get(circuitKey) ?? { failures: 0, openedUntil: 0 };
    const failures = current.failures + 1;
    const circuitThreshold = Math.max(1, numericEnv('AI_CIRCUIT_FAILURE_THRESHOLD', 4));
    circuits.set(circuitKey, {
      failures,
      openedUntil: failures >= circuitThreshold
        ? Date.now() + numericEnv('AI_CIRCUIT_RESET_MS', 60_000)
        : 0,
    });
    throw error;
  }
}

export async function chooseAiMove(request: AiMoveRequest): Promise<AiMoveResponse> {
  const startedAt = Date.now();
  const diagnostics: AttemptDiagnostics = { retryCount: 0 };
  const requestedModel = request.seatConfig.provider === 'local-bot'
    ? 'heuristic-v1'
    : providerConfig(request.seatConfig, 'tool').model;
  if (request.seatConfig.provider === 'local-bot') {
    return localDecision(
      request,
      '本地启发式决策。',
      false,
      requestedModel,
      diagnostics.retryCount,
      startedAt,
    );
  }
  try {
    return await callOpenAiCompatible(
      request,
      Date.now() + numericEnv('AI_MAX_TOTAL_WAIT_MS', 28_000),
      diagnostics,
      startedAt,
    );
  } catch {
    return localDecision(
      request,
      '外部模型不可用，已使用本地启发式决策。',
      true,
      requestedModel,
      diagnostics.retryCount,
      startedAt,
    );
  }
}
