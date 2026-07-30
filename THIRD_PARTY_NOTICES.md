# Third Party Notices

This file records third-party source and direct npm package licenses observed in the current workspace.

## Upstream Game Source

Name: `XLT-6/mofa-dengxiantai`

Vendored commit: `b7d214903fb10c7de20f399c3c5a7bf27d63cd0e`

Vendored paths:

- `vendor/mofa-dengxiantai/source-docs/**`
- `vendor/mofa-dengxiantai/cards/**`
- `vendor/mofa-dengxiantai/LICENSE`
- `public/assets/upstream/raw/**`
- `public/assets/upstream/web/**`

License: MIT.

Copyright notice from upstream:

```text
Copyright (c) 2026 XLT-6
```

Upstream README states showcase images are AI-assisted prototype visuals for the current tabletop game's display and testing.

## Direct npm Dependencies

Versions below are resolved in the installed `node_modules` after `npm ci --ignore-scripts`.

| Package | Version | License |
|---|---:|---|
| `compression` | 1.8.1 | MIT |
| `express` | 5.2.1 | MIT |
| `helmet` | 8.3.0 | MIT |
| `react` | 19.2.8 | MIT |
| `react-dom` | 19.2.8 | MIT |
| `socket.io` | 4.8.3 | MIT |
| `socket.io-client` | 4.8.3 | MIT |
| `zod` | 4.4.3 | MIT |
| `zustand` | 5.0.14 | MIT |

## Direct Development Dependencies

| Package | Version | License |
|---|---:|---|
| `@eslint/js` | 10.0.1 | MIT |
| `@playwright/test` | 1.62.0 | Apache-2.0 |
| `@types/compression` | 1.8.1 | MIT |
| `@types/express` | 5.0.6 | MIT |
| `@types/node` | 24.13.3 | MIT |
| `@types/react` | 19.2.17 | MIT |
| `@types/react-dom` | 19.2.3 | MIT |
| `@types/supertest` | 6.0.3 | MIT |
| `@vitejs/plugin-react` | 6.0.5 | MIT |
| `concurrently` | 9.2.4 | MIT |
| `eslint` | 10.8.0 | MIT |
| `jsdom` | 26.1.0 | MIT |
| `supertest` | 7.2.2 | MIT |
| `tsup` | 8.5.1 | MIT |
| `tsx` | 4.23.1 | MIT |
| `typescript` | 5.9.3 | Apache-2.0 |
| `typescript-eslint` | 8.65.0 | MIT |
| `vite` | 8.2.0 | MIT |
| `vitest` | 3.2.7 | MIT |

## Transitive Dependencies

Transitive dependency notices are not expanded in this file. For a distributable release, generate a complete license inventory from the production lockfile and include license texts required by non-MIT packages.
