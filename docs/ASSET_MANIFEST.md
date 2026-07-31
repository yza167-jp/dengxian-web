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

## Extracted Opportunity And Equipment Cards

Source: PDF-native crops from upstream `output/pdf/末法登仙台_打印即玩套件_v0.1.pdf` pages 23-28. Extraction used `scripts/extract-upstream-card-art.py`, matching the upstream ReportLab layout constants: 63x88mm cards, A4 page size `595.276x841.89pt`, centered 3x3 grid, and crop boxes in PDF points from the lower-left page origin. WebP assets were rendered at 300 DPI with `pdftoppm` and converted with `cwebp -q 88`; representative crops `C01`, `E01`, and `E16` were visually inspected for full border, readable text, and correct disposable/equipment coloring.

| Path | Size | Dimensions | PDF page / slot | Purpose |
|---|---:|---:|---|---|
| `public/assets/upstream/cards/C01.webp` | 20K | 745x1040 | page 23, slot 1 | Full 聚灵丹 一次性丹药 card art |
| `public/assets/upstream/cards/C02.webp` | 26K | 745x1040 | page 23, slot 2 | Full 破境丹 一次性丹药 card art |
| `public/assets/upstream/cards/C03.webp` | 23K | 745x1040 | page 23, slot 3 | Full 回气散 一次性丹药 card art |
| `public/assets/upstream/cards/C04.webp` | 22K | 745x1040 | page 23, slot 4 | Full 清心露 一次性丹药 card art |
| `public/assets/upstream/cards/C05.webp` | 24K | 745x1040 | page 23, slot 5 | Full 引雷符 一次性符箓 card art |
| `public/assets/upstream/cards/C06.webp` | 26K | 745x1040 | page 23, slot 6 | Full 避雷符 一次性符箓 card art |
| `public/assets/upstream/cards/C07.webp` | 24K | 745x1040 | page 23, slot 7 | Full 补天石 一次性奇物 card art |
| `public/assets/upstream/cards/C08.webp` | 24K | 745x1040 | page 23, slot 8 | Full 护阵符 一次性符箓 card art |
| `public/assets/upstream/cards/C09.webp` | 28K | 745x1040 | page 23, slot 9 | Full 缩地诀 一次性秘术 card art |
| `public/assets/upstream/cards/C10.webp` | 24K | 745x1040 | page 24, slot 1 | Full 归元诀 一次性秘术 card art |
| `public/assets/upstream/cards/C11.webp` | 25K | 745x1040 | page 24, slot 2 | Full 天机简 一次性奇物 card art |
| `public/assets/upstream/cards/C12.webp` | 25K | 745x1040 | page 24, slot 3 | Full 双生莲 一次性灵植 card art |
| `public/assets/upstream/cards/C13.webp` | 26K | 745x1040 | page 24, slot 4 | Full 窃灵手 一次性秘术 card art |
| `public/assets/upstream/cards/C14.webp` | 25K | 745x1040 | page 24, slot 5 | Full 乱阵钉 一次性暗器 card art |
| `public/assets/upstream/cards/C15.webp` | 29K | 745x1040 | page 24, slot 6 | Full 借劫符 一次性邪符 card art |
| `public/assets/upstream/cards/C16.webp` | 25K | 745x1040 | page 24, slot 7 | Full 观因镜 一次性奇物 card art |
| `public/assets/upstream/cards/E01.webp` | 26K | 745x1040 | page 24, slot 8 | Full 聚灵葫芦 持续法宝 card art |
| `public/assets/upstream/cards/E02.webp` | 25K | 745x1040 | page 24, slot 9 | Full 玄龟甲 持续法宝 card art |
| `public/assets/upstream/cards/E03.webp` | 24K | 745x1040 | page 25, slot 1 | Full 青冥剑 持续法宝 card art |
| `public/assets/upstream/cards/E04.webp` | 24K | 745x1040 | page 25, slot 2 | Full 阵纹尺 持续法宝 card art |
| `public/assets/upstream/cards/E05.webp` | 24K | 745x1040 | page 25, slot 3 | Full 乾坤袋 持续法宝 card art |
| `public/assets/upstream/cards/E06.webp` | 23K | 745x1040 | page 25, slot 4 | Full 归元珠 持续法宝 card art |
| `public/assets/upstream/cards/E07.webp` | 25K | 745x1040 | page 25, slot 5 | Full 夺灵幡 持续法宝 card art |
| `public/assets/upstream/cards/E08.webp` | 27K | 745x1040 | page 25, slot 6 | Full 照影镜 持续法宝 card art |
| `public/assets/upstream/cards/C17.webp` | 29K | 745x1040 | page 25, slot 7 | Full 灵髓丹 一次性丹药 card art |
| `public/assets/upstream/cards/C18.webp` | 26K | 745x1040 | page 25, slot 8 | Full 定神丹 一次性丹药 card art |
| `public/assets/upstream/cards/C19.webp` | 23K | 745x1040 | page 25, slot 9 | Full 换骨丹 一次性丹药 card art |
| `public/assets/upstream/cards/C20.webp` | 31K | 745x1040 | page 26, slot 1 | Full 假死丹 一次性丹药 card art |
| `public/assets/upstream/cards/C21.webp` | 30K | 745x1040 | page 26, slot 2 | Full 同心符 一次性符箓 card art |
| `public/assets/upstream/cards/C22.webp` | 25K | 745x1040 | page 26, slot 3 | Full 渡厄符 一次性符箓 card art |
| `public/assets/upstream/cards/C23.webp` | 30K | 745x1040 | page 26, slot 4 | Full 藏锋符 一次性符箓 card art |
| `public/assets/upstream/cards/C24.webp` | 28K | 745x1040 | page 26, slot 5 | Full 封灵符 一次性符箓 card art |
| `public/assets/upstream/cards/C25.webp` | 25K | 745x1040 | page 26, slot 6 | Full 窥天简 一次性奇物 card art |
| `public/assets/upstream/cards/C26.webp` | 27K | 745x1040 | page 26, slot 7 | Full 探云尺 一次性奇物 card art |
| `public/assets/upstream/cards/C27.webp` | 31K | 745x1040 | page 26, slot 8 | Full 燃灵诀 一次性秘术 card art |
| `public/assets/upstream/cards/C28.webp` | 30K | 745x1040 | page 26, slot 9 | Full 借功诀 一次性秘术 card art |
| `public/assets/upstream/cards/C29.webp` | 26K | 745x1040 | page 27, slot 1 | Full 逆行诀 一次性秘术 card art |
| `public/assets/upstream/cards/C30.webp` | 24K | 745x1040 | page 27, slot 2 | Full 禁宝咒 一次性秘术 card art |
| `public/assets/upstream/cards/C31.webp` | 28K | 745x1040 | page 27, slot 3 | Full 寄雷咒 一次性秘术 card art |
| `public/assets/upstream/cards/C32.webp` | 32K | 745x1040 | page 27, slot 4 | Full 牵机索 一次性奇物 card art |
| `public/assets/upstream/cards/E09.webp` | 25K | 745x1040 | page 27, slot 5 | Full 悟道蒲团 持续法宝 card art |
| `public/assets/upstream/cards/E10.webp` | 27K | 745x1040 | page 27, slot 6 | Full 功德碑 持续法宝 card art |
| `public/assets/upstream/cards/E11.webp` | 28K | 745x1040 | page 27, slot 7 | Full 遁天梭 持续法宝 card art |
| `public/assets/upstream/cards/E12.webp` | 26K | 745x1040 | page 27, slot 8 | Full 观星盘 持续法宝 card art |
| `public/assets/upstream/cards/E13.webp` | 21K | 745x1040 | page 27, slot 9 | Full 寻宝鼠 持续法宝 card art |
| `public/assets/upstream/cards/E14.webp` | 30K | 745x1040 | page 28, slot 1 | Full 镇魂铃 持续法宝 card art |
| `public/assets/upstream/cards/E15.webp` | 23K | 745x1040 | page 28, slot 2 | Full 山河图 持续法宝 card art |
| `public/assets/upstream/cards/E16.webp` | 31K | 745x1040 | page 28, slot 3 | Full 天罗伞 持续法宝 card art |

## Extracted Calamity And Fate Cards

The same deterministic extraction script covers the remaining print-and-play decks. Calamities come from PDF pages 29-30 in `T01`-`T18` CSV order; secret fates come from pages 31-32 in `F01`-`F12` order. All 30 assets use the same measured 63x88mm crop, 300 DPI render, and 745x1040 WebP output as the opportunity deck.

| Path range | Count | Dimensions | Purpose |
|---|---:|---:|---|
| `public/assets/upstream/cards/T01.webp` … `T18.webp` | 18 | 745x1040 | Full upstream 天劫 card faces in the central altar and glossary |
| `public/assets/upstream/cards/F01.webp` … `F12.webp` | 12 | 745x1040 | Full upstream 秘密天命 card faces in the private player area and settlement |

The runtime card-art directory therefore contains 78 complete upstream card faces: 32 consumable opportunities, 16 equipment cards, 18 calamities, and 12 secret fates.

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
