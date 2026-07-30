# AI Provider Contract

Status: provider contract and current implementation boundary.

## Providers

| Provider | Purpose | Current implementation |
|---|---|---|
| `local-bot` | Offline fallback and no-key solo play | Implemented in `src/shared/game/bot.ts` |
| `deepseek` | Server-side DeepSeek OpenAI-compatible calls | Implemented in `src/server/ai.ts`; unkeyed tests verify fallback |
| `openai-compatible` | Server-controlled compatible endpoint | Implemented in `src/server/ai.ts`; unkeyed tests verify fallback |

## Environment

Provider keys and base URLs must remain server-only.

```env
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_BETA_BASE_URL=https://api.deepseek.com/beta
DEEPSEEK_DEFAULT_MODEL=deepseek-v4-flash
DEEPSEEK_PRO_MODEL=deepseek-v4-pro

OPENAI_COMPATIBLE_API_KEY=
OPENAI_COMPATIBLE_BASE_URL=
OPENAI_COMPATIBLE_DEFAULT_MODEL=
PROVIDER_TEST_TOKEN=
```

`local-bot` does not require any environment variable.

`POST /api/provider-test` is disabled unless `PROVIDER_TEST_TOKEN` is set and requires the same value in `x-provider-test-token`. There is no public arbitrary AI-completion endpoint, preventing browser clients from spending configured provider credit.

## Decision Contract

AI must only choose from already-instantiated legal actions:

```ts
interface AiDecision {
  actionId: string;
  publicRationale: string;
  provider: 'local-bot' | 'deepseek' | 'openai-compatible';
  usedFallback: boolean;
}
```

Validation sequence for external providers:

1. Build a seat-redacted view with `getViewForSeat`.
2. Send public state, that seat's private state, recent event summaries, and the legal action enum.
3. Require a structured response containing only one `actionId` plus short public rationale.
4. Validate the response shape.
5. Reject any `actionId` not present in the legal actions returned for the same revision.
6. Retry within `AI_MAX_RETRIES` and `AI_MAX_TOTAL_WAIT_MS`.
7. Fall back immediately after timeout, invalid JSON, invalid action, provider error, or circuit breaker open.

## Prompt Boundaries

External prompts must not include:

- API keys;
- other seats' hidden hands;
- other seats' fates;
- unrevealed plans;
- unrevealed votes;
- full raw private event logs for other seats.

Logs must not persist full prompts, raw reasoning content, or other players' hidden state.

## Current Local Bot And Fallback

`src/shared/game/bot.ts` scores legal actions using state/view heuristics and deterministic noise. It is used by:

- `src/client/store/gameStore.ts` solo mode auto-advance;
- `scripts/simulate.ts`;
- `tests/game/engine.test.ts`.

Room automation computes a legal heuristic decision first. External providers may replace its action only when the returned ID remains in the same revision's legal action set; all provider failures retain the heuristic action.

Verified behavior:

- `npm test` passed 36 tests, including strict tool-call, JSON, timeout, 429, illegal-action, no-key fallback, and non-exposure of `reasoning_content`.
- `npm run sim` passed 120 all-bot games across 4, 5, and 6 players.

## Live-call boundary

- No live DeepSeek or OpenAI-compatible keyed request was tested in this pass.
- No key was available in the verification environment, so no real billed request was issued.
- Defaults were checked against current official DeepSeek documentation on 2026-07-30; recheck model availability before deployment because provider names are time-sensitive.
