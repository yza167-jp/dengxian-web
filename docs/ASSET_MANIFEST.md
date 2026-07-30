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
| `public/assets/upstream/web/01-封面招募-720.webp` | 228K | 720x1280 | Responsive mobile cover/hero source |
| `public/assets/upstream/web/01-封面招募-941.webp` | 440K | 941x1672 | Current main menu hero |
| `public/assets/upstream/web/02-末法世界与共同目标-720.webp` | 212K | 720x1280 | Responsive mobile tutorial source |
| `public/assets/upstream/web/02-末法世界与共同目标-941.webp` | 400K | 941x1672 | Current tutorial image |
| `public/assets/upstream/web/03-共同修台争夺飞升-720.webp` | 240K | 720x1280 | Responsive mobile tutorial source |
| `public/assets/upstream/web/03-共同修台争夺飞升-941.webp` | 456K | 941x1672 | Current tutorial image |
| `public/assets/upstream/web/04-每轮秘密四选一-720.webp` | 232K | 720x1280 | Responsive mobile tutorial and action-dock source |
| `public/assets/upstream/web/04-每轮秘密四选一-941.webp` | 432K | 941x1672 | Current tutorial image |

## Extracted Character Cards

Source: embedded raster images in upstream `docs/末法登仙台_玩法介绍册_v0.3_新增背景与牌例.pdf` at commit `b7d214903fb10c7de20f399c3c5a7bf27d63cd0e`. The PDF itself is not vendored, but the extracted web assets below are derived from its page 14-17 character-card images. Extraction used Poppler `pdfimages`; source embedded images were 1000x1500 JPEG rasters in R01-R07 order.

| Path | Size | Dimensions | Purpose |
|---|---:|---:|---|
| `public/assets/upstream/characters/R01-card.webp` | 145K | 600x900 | Full 剑修 card art for solo character preview and private character detail |
| `public/assets/upstream/characters/R02-card.webp` | 134K | 600x900 | Full 丹修 card art for solo character preview and private character detail |
| `public/assets/upstream/characters/R03-card.webp` | 146K | 600x900 | Full 符修 card art for solo character preview and private character detail |
| `public/assets/upstream/characters/R04-card.webp` | 161K | 600x900 | Full 阵修 card art for solo character preview and private character detail |
| `public/assets/upstream/characters/R05-card.webp` | 160K | 600x900 | Full 法修 card art for solo character preview and private character detail |
| `public/assets/upstream/characters/R06-card.webp` | 152K | 600x900 | Full 体修 card art for solo character preview and private character detail |
| `public/assets/upstream/characters/R07-card.webp` | 140K | 600x900 | Full 邪修 card art for solo character preview and private character detail |

## Extracted Character Portraits

Source: measured square crops from the extracted full character-card rasters above. Each 320x320 WebP crop was visually inspected to keep the face or focal figure readable in compact player tokens and settlement rows.

| Path | Size | Dimensions | Purpose |
|---|---:|---:|---|
| `public/assets/upstream/characters/R01-portrait.webp` | 36K | 320x320 | 剑修 player-token and settlement portrait |
| `public/assets/upstream/characters/R02-portrait.webp` | 35K | 320x320 | 丹修 player-token and settlement portrait |
| `public/assets/upstream/characters/R03-portrait.webp` | 39K | 320x320 | 符修 player-token and settlement portrait |
| `public/assets/upstream/characters/R04-portrait.webp` | 38K | 320x320 | 阵修 player-token and settlement portrait |
| `public/assets/upstream/characters/R05-portrait.webp` | 42K | 320x320 | 法修 player-token and settlement portrait |
| `public/assets/upstream/characters/R06-portrait.webp` | 40K | 320x320 | 体修 player-token and settlement portrait |
| `public/assets/upstream/characters/R07-portrait.webp` | 35K | 320x320 | 邪修 player-token and settlement portrait |

## Extracted Action Cards

Source: measured crops from `public/assets/upstream/raw/04-每轮秘密四选一.png`. The source panel is 941x1672; the four card crops use x/y/w/h boundaries `(29,260,418,580)`, `(498,260,418,580)`, `(29,868,418,580)`, and `(498,868,418,580)` before resizing to 360x500 WebP. Each crop was visually inspected for full border and readable action text.

| Path | Size | Dimensions | Purpose |
|---|---:|---:|---|
| `public/assets/upstream/actions/cultivate.webp` | 51K | 360x500 | Secret-plan 修炼 button and revealed-plan icon source |
| `public/assets/upstream/actions/repair.webp` | 53K | 360x500 | Secret-plan 修台 button and revealed-plan icon source |
| `public/assets/upstream/actions/resist.webp` | 50K | 360x500 | Secret-plan 抗劫 button and revealed-plan icon source |
| `public/assets/upstream/actions/explore.webp` | 56K | 360x500 | Secret-plan 探索 button and explore action source |

## Extracted Table And Social Art

| Path | Size | Dimensions | Provenance | Purpose |
|---|---:|---:|---|---|
| `public/assets/upstream/table/altar.webp` | 92K | 941x352 | Crop `(0,1320,941,352)` from `public/assets/upstream/raw/03-共同修台争夺飞升.png`; first crop was rejected because it included explanatory text | Central table backdrop, phase orb, and calamity-card texture |
| `public/assets/upstream/social/cover-og-1200x630.webp` | 135K | 1200x630 | Crop `(0,60,941,494)` from `public/assets/upstream/raw/01-封面招募.png`, resized to 1200x630 | Upstream-derived social preview metadata image; `public/og.png` is preserved as the older generated preview rather than overwritten |

## Generated Release Image

| Path | Dimensions | Purpose | Provenance |
|---|---:|---|---|
| `public/og.png` | 1672x941 | Preserved legacy social-preview fallback; current metadata uses the upstream-derived 1200x630 WebP | Generated for this web release with OpenAI ImageGen from a bespoke dark-xianxia tabletop prompt; title and claims were visually checked |

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

Reason: the current vendored tree contains markdown and CSV source material, not the generated PDF binaries. The README in upstream source-docs links those PDFs as distributable artifacts. This web repo now uses source docs, raw/web showcase images, and extracted web-ready derivatives from the upstream gameplay PDF for runtime presentation while avoiding storage of the full generated PDF binary unless a release packaging step requires it.

## Generation

`npm run sync:upstream` reads the vendored CSV files and writes `src/shared/data/upstream.generated.ts`. The command verifies row counts:

- 14 character rows, including 7 character cards and 7 ultimate rows;
- 48 opportunity rows;
- 18 calamity rows;
- 12 fate rows.
