# Deployment

Status: verified production deployment contract.

## Production Target

The target deployment is one Node 24 process that serves:

- static client assets from `dist/client`;
- REST API under `/api`;
- Socket.IO under `/socket.io`;
- persistent data under `/app/data` in Docker.

The intended public port is `8787`.

## Local Production Commands

```bash
npm ci --ignore-scripts
npm run build
npm start
```

Verified: install, build, production start, `/api/health`, and static client delivery pass.

## Docker

```bash
cp .env.example .env
docker compose up --build
```

`docker-compose.yml` maps host `8787` to container `8787` and mounts the named volume `dengxian-data` at `/app/data`.

Create `.env` before Compose because `docker-compose.yml` deliberately uses `env_file: .env`. The same `npm run build` and `npm start` contract used by the verified local production smoke is used in the image.

The runtime image drops root privileges before startup and exposes an image-level health check against `/api/health`. A named volume created from the image inherits write access for the bundled `node` user; operators mounting an existing host directory must grant that directory write access to the container user.

## LAN

Use:

```env
PORT=8787
PUBLIC_ORIGIN=http://<host-lan-ip>:8787
```

Then open:

```text
http://<host-lan-ip>:8787
```

The production process binds port `8787`; configure the host firewall and reverse proxy for the intended trust boundary.

## Required Preflight Before Real Deployment

Run and require all green:

```bash
npm run typecheck
npm run lint
npm test
npm run sim
npm run build
npm run test:e2e
```

Current verification evidence is listed in [TEST_REPORT.md](TEST_REPORT.md).

## Data And Secrets

- Mount `DATABASE_PATH` or `/app/data` on durable storage.
- Keep `DEEPSEEK_API_KEY` and `OPENAI_COMPATIBLE_API_KEY` server-side only.
- Do not allow clients to submit arbitrary provider base URLs.
- Do not log raw prompts, raw reasoning, seat tokens, or hidden private state.

## Rollback

Redeploy the previous passing image or commit and preserve the `dengxian-data` volume. Back up the SQLite file before any future schema migration.
