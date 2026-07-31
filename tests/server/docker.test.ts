import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dockerfile = readFileSync(new URL('../../Dockerfile', import.meta.url), 'utf8');
const compose = readFileSync(new URL('../../docker-compose.yml', import.meta.url), 'utf8');
const dockerignore = readFileSync(new URL('../../.dockerignore', import.meta.url), 'utf8');
const ciWorkflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');

describe('Docker release contract', () => {
  it('runs the production server as a non-root user with an HTTP health check', () => {
    const runtime = dockerfile.slice(dockerfile.indexOf(' AS runtime'));
    expect(runtime).toContain('RUN npm ci --omit=dev');
    expect(runtime).toContain('USER node');
    expect(runtime).toContain('HEALTHCHECK');
    expect(runtime).toContain('/api/health');
    expect(runtime).toContain('CMD ["node", "dist/server/index.js"]');
  });

  it('publishes the server port and keeps SQLite data on the named volume', () => {
    expect(dockerfile).toContain('EXPOSE 8787');
    expect(dockerfile).toContain('VOLUME ["/app/data"]');
    expect(compose).toContain('"8787:8787"');
    expect(compose).toContain('dengxian-data:/app/data');
    expect(compose).toContain('env_file:');
  });

  it('keeps local secrets and generated dependencies out of the build context', () => {
    const ignored = new Set(dockerignore.split(/\r?\n/).map((line) => line.trim()));
    expect(ignored.has('.env')).toBe(true);
    expect(ignored.has('node_modules')).toBe(true);
    expect(ignored.has('dist')).toBe(true);
    expect(ignored.has('.git')).toBe(true);
  });

  it('builds and boots the real image in CI before treating it as releasable', () => {
    expect(ciWorkflow).toContain('docker-release-smoke:');
    expect(ciWorkflow).toContain('docker build --tag');
    expect(ciWorkflow).toContain('docker run --detach');
    expect(ciWorkflow).toContain("{{.State.Health.Status}}");
    expect(ciWorkflow).toContain('/api/health');
    expect(ciWorkflow).toContain('/assets/upstream/cards/T01.webp');
    expect(ciWorkflow).toContain('docker rm --force dengxian-web-smoke');
  });
});
