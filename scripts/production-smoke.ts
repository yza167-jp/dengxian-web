import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const STARTUP_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 150;
const SECRET_SENTINELS = [
  'smoke-deepseek-secret-must-not-leak',
  'smoke-compatible-secret-must-not-leak',
  'smoke-provider-token-must-not-leak',
];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function reservePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Unable to reserve a production smoke port'));
        return;
      }
      server.close((error) => {
        if (error) reject(error);
        else resolve(address.port);
      });
    });
  });
}

async function stopProcess(child: ReturnType<typeof spawn>): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  const stopped = await Promise.race([
    new Promise<boolean>((resolve) => child.once('exit', () => resolve(true))),
    delay(3_000).then(() => false),
  ]);
  if (!stopped && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await new Promise<void>((resolve) => child.once('exit', () => resolve()));
  }
}

async function waitForHealth(
  baseUrl: string,
  child: ReturnType<typeof spawn>,
  logs: string[],
): Promise<Response> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  let lastError = null;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Production server exited before health check.\n${logs.join('')}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return response;
      lastError = new Error(`Health returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(POLL_INTERVAL_MS);
  }
  throw new Error(
    `Production server did not become healthy within ${STARTUP_TIMEOUT_MS}ms: ${
      lastError instanceof Error ? lastError.message : 'unknown error'
    }\n${logs.join('')}`,
  );
}

const tempDirectory = await mkdtemp(join(tmpdir(), 'dengxian-production-smoke-'));
const port = await reservePort();
const baseUrl = `http://127.0.0.1:${port}`;
const logs: string[] = [];
const child = spawn(process.execPath, ['dist/server/index.js'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(port),
    PUBLIC_ORIGIN: baseUrl,
    DATABASE_PATH: join(tempDirectory, 'smoke.sqlite'),
    DEEPSEEK_API_KEY: SECRET_SENTINELS[0],
    OPENAI_COMPATIBLE_API_KEY: SECRET_SENTINELS[1],
    PROVIDER_TEST_TOKEN: SECRET_SENTINELS[2],
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
child.stdout?.on('data', (chunk: Buffer) => logs.push(chunk.toString()));
child.stderr?.on('data', (chunk: Buffer) => logs.push(chunk.toString()));

try {
  const healthResponse = await waitForHealth(baseUrl, child, logs);
  const health = await healthResponse.json() as {
    ok?: unknown;
    service?: unknown;
    node?: unknown;
  };
  assert(health.ok === true, 'Health payload did not report ok=true');
  assert(health.service === 'dengxiantai-server', 'Health payload reported the wrong service');

  const homeResponse = await fetch(`${baseUrl}/`);
  const home = await homeResponse.text();
  assert(homeResponse.ok, `Production homepage returned HTTP ${homeResponse.status}`);
  assert(home.includes('<div id="root"></div>'), 'Production homepage is missing the React root');

  const providersResponse = await fetch(`${baseUrl}/api/providers`);
  const providersText = await providersResponse.text();
  assert(providersResponse.ok, `Provider metadata returned HTTP ${providersResponse.status}`);
  const providerPayload = JSON.parse(providersText) as {
    providers?: Array<{ id?: unknown; status?: unknown }>;
  };
  const providers = providerPayload.providers;
  assert(Array.isArray(providers), 'Provider metadata is missing its providers array');
  assert(
    providers.some((provider) => provider.id === 'local-bot' && provider.status === 'available'),
    'Provider metadata does not advertise the local fallback',
  );

  const cardResponse = await fetch(`${baseUrl}/assets/upstream/cards/T01.webp`);
  const cardBytes = await cardResponse.arrayBuffer();
  assert(cardResponse.ok, `Upstream card art returned HTTP ${cardResponse.status}`);
  assert(
    cardResponse.headers.get('content-type')?.includes('image/webp'),
    'Upstream card art has the wrong content type',
  );
  assert(cardBytes.byteLength > 1_000, 'Upstream card art response is unexpectedly small');

  const publicPayload = `${home}\n${providersText}`;
  for (const secret of SECRET_SENTINELS) {
    assert(!publicPayload.includes(secret), `Server secret leaked into a public response: ${secret}`);
  }

  console.log(JSON.stringify({
    ok: true,
    health,
    homepageStatus: homeResponse.status,
    providersStatus: providersResponse.status,
    upstreamCardStatus: cardResponse.status,
    upstreamCardBytes: cardBytes.byteLength,
  }, null, 2));
} finally {
  await stopProcess(child);
  await rm(tempDirectory, { recursive: true, force: true });
}
