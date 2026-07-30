import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chooseAiMove, type AiMoveRequest } from '../../src/server/ai';
import { createGame } from '../../src/shared/game/engine';
import { getViewForSeat } from '../../src/shared/game/view';

const ENV_KEYS = [
  'DEEPSEEK_API_KEY',
  'DEEPSEEK_BETA_BASE_URL',
  'AI_TIMEOUT_MS',
  'AI_MAX_RETRIES',
  'AI_MAX_TOTAL_WAIT_MS',
  'AI_CIRCUIT_FAILURE_THRESHOLD',
] as const;

const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

function restoreEnvironment(): void {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function aiRequest(): AiMoveRequest {
  const state = createGame({
    mode: 'solo',
    seed: 701,
    seats: Array.from({ length: 4 }, (_, index) => ({
      id: `seat-${index + 1}`,
      name: `修士 ${index + 1}`,
      kind: 'bot' as const,
      ai: { provider: 'local-bot' as const, difficulty: 'normal' as const, persona: 'steady' as const },
    })),
  });
  const actorId = state.window!.order[state.window!.cursor]!;
  const view = getViewForSeat(state, actorId);
  return {
    seatConfig: {
      provider: 'deepseek',
      difficulty: 'normal',
      persona: 'steady',
      thinking: false,
    },
    view,
    legalActions: view.legalActions,
  };
}

function providerResponse(message: {
  content?: string | null;
  tool_calls?: Array<{ function: { arguments: string } }>;
}): Response {
  return new Response(JSON.stringify({ choices: [{ message }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  process.env.DEEPSEEK_API_KEY = 'test-only-key';
  process.env.DEEPSEEK_BETA_BASE_URL = `https://deepseek.test/${crypto.randomUUID()}`;
  process.env.AI_MAX_RETRIES = '0';
  process.env.AI_MAX_TOTAL_WAIT_MS = '100';
  process.env.AI_CIRCUIT_FAILURE_THRESHOLD = '20';
});

afterEach(() => {
  vi.unstubAllGlobals();
  restoreEnvironment();
});

describe('AI provider validation and fallback', () => {
  it('accepts a strict DeepSeek tool call only when it names a legal action', async () => {
    const request = aiRequest();
    const selected = request.legalActions[0]!;
    const fetchMock = vi.fn((_input: string | URL | Request, init?: RequestInit) => {
      expect(typeof init?.body).toBe('string');
      const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as {
        tools: Array<{ function: { strict?: boolean; parameters: { properties: { actionId: { enum: string[] } } } } }>;
      };
      expect(body.tools[0]!.function.strict).toBe(true);
      expect(body.tools[0]!.function.parameters.properties.actionId.enum).toContain(selected.id);
      return Promise.resolve(providerResponse({
        tool_calls: [{
          function: {
            arguments: JSON.stringify({ actionId: selected.id, reasoning: '工具调用选择。' }),
          },
        }],
      }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await chooseAiMove(request);
    expect(result).toMatchObject({ actionId: selected.id, usedFallback: false, provider: 'deepseek' });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('accepts JSON content when a compatible provider omits tool calls', async () => {
    const request = aiRequest();
    const selected = request.legalActions.at(-1)!;
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(providerResponse({
      content: JSON.stringify({ actionId: selected.id, reasoning: 'JSON 选择。' }),
    }))));

    const result = await chooseAiMove(request);
    expect(result).toMatchObject({ actionId: selected.id, usedFallback: false });
  });

  it.each([
    ['429 response', () => Promise.resolve(new Response('{}', { status: 429 }))],
    ['illegal action id', () => Promise.resolve(providerResponse({
      content: JSON.stringify({ actionId: 'forged-action', reasoning: '非法选择。' }),
    }))],
  ])('falls back to a legal action after %s', async (_name, responseFactory) => {
    const request = aiRequest();
    vi.stubGlobal('fetch', vi.fn(responseFactory));

    const result = await chooseAiMove(request);
    expect(result.usedFallback).toBe(true);
    expect(request.legalActions.map((action) => action.id)).toContain(result.actionId);
  });

  it('aborts at the configured timeout and falls back without blocking the room', async () => {
    process.env.AI_TIMEOUT_MS = '5';
    process.env.AI_MAX_TOTAL_WAIT_MS = '20';
    const request = aiRequest();
    vi.stubGlobal('fetch', vi.fn((_input: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      })));

    const startedAt = Date.now();
    const result = await chooseAiMove(request);
    expect(Date.now() - startedAt).toBeLessThan(250);
    expect(result.usedFallback).toBe(true);
    expect(request.legalActions.map((action) => action.id)).toContain(result.actionId);
  });
});
