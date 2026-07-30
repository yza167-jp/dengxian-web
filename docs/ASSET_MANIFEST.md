# Asset Manifest

Upstream source: `XLT-6/mofa-dengxiantai@b7d214903fb10c7de20f399c3c5a7bf27d63cd0e`.

License: upstream MIT license in `vendor/mofa-dengxiantai/LICENSE`. Upstream README states showcase images are AI-assisted prototype visuals for current game display and testing.

## Vendored Raw Images

| Path | Size | Dimensions | Purpose |
|---|---:|---:|---|
| `public/assets/upstream/raw/01-封面招募.png` | 3.1M | 941x1672 | Main menu hero and cover reference |
| `public/assets/upstream/raw/02-末法世界与共同目标.png` | 3.0M | 941x1672 | Tutorial/rule visual source |
| `public/assets/upstream/raw/03-共同修台争夺飞升.png` | 3.2M | 941x1672 | Tutorial/rule visual source |
| `public/assets/upstream/raw/04-每轮秘密四选一.png` | 3.1M | 941x1672 | Tutorial/rule visual source |

## Optimized Web Images

| Path | Size | Dimensions | Purpose |
|---|---:|---:|---|
| `public/assets/upstream/web/01-封面招募-720.webp` | 228K | 720x1280 | Smaller cover/hero candidate |
| `public/assets/upstream/web/01-封面招募-941.webp` | 440K | 941x1672 | Current main menu hero |
| `public/assets/upstream/web/02-末法世界与共同目标-720.webp` | 212K | 720x1280 | Smaller tutorial candidate |
| `public/assets/upstream/web/02-末法世界与共同目标-941.webp` | 400K | 941x1672 | Current tutorial image |
| `public/assets/upstream/web/03-共同修台争夺飞升-720.webp` | 240K | 720x1280 | Smaller tutorial candidate |
| `public/assets/upstream/web/03-共同修台争夺飞升-941.webp` | 456K | 941x1672 | Current tutorial image |
| `public/assets/upstream/web/04-每轮秘密四选一-720.webp` | 232K | 720x1280 | Smaller tutorial candidate |
| `public/assets/upstream/web/04-每轮秘密四选一-941.webp` | 432K | 941x1672 | Current tutorial image |

## Generated Release Image

| Path | Dimensions | Purpose | Provenance |
|---|---:|---|---|
| `public/og.png` | 1672x941 | Open Graph / Twitter social preview | Generated for this web release with OpenAI ImageGen from a bespoke dark-xianxia tabletop prompt; title and claims were visually checked |

## Upstream Documents

Vendored markdown:

- `vendor/mofa-dengxiantai/source-docs/README.md`
- `vendor/mofa-dengxiantai/source-docs/00-design-brief.md`
- `vendor/mofa-dengxiantai/source-docs/01-rulebook.md`
- `vendor/mofa-dengxiantai/source-docs/02-build-guide.md`
- `vendor/mofa-dengxiantai/source-docs/03-paper-review.md`
- `vendor/mofa-dengxiantai/source-docs/04-playtest-report.md`

Vendored CSV:

- `vendor/mofa-dengxiantai/cards/characters.csv`
- `vendor/mofa-dengxiantai/cards/opportunity-cards.csv`
- `vendor/mofa-dengxiantai/cards/calamity-cards.csv`
- `vendor/mofa-dengxiantai/cards/fate-cards.csv`

PDFs inspected but not vendored:

- `docs/末法登仙台_玩法介绍册_v0.3_新增背景与牌例.pdf`
- `output/pdf/末法登仙台_打印即玩套件_v0.1.pdf`

Reason: the current vendored tree contains markdown and CSV source material, not the generated PDF binaries. The README in upstream source-docs links those PDFs as distributable artifacts, but this web repo uses source docs plus raw/web images for implementation traceability and avoids storing generated PDF binaries unless a release packaging step requires them.

## Generation

`npm run sync:upstream` reads the vendored CSV files and writes `src/shared/data/upstream.generated.ts`. The command verifies row counts:

- 14 character rows, including 7 character cards and 7 ultimate rows;
- 48 opportunity rows;
- 18 calamity rows;
- 12 fate rows.
