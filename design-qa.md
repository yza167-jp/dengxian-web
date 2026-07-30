# Design QA — 上游美术全面接入

final result: passed

## 2026-07-30 — 环坛式对局终验

### Comparison target

- Source visual truth: `/Users/dionysus/.codex/generated_images/019fb2e3-d753-75a3-aaed-ad0b82495fc9/call_oKHGSb3wxfeDPGa9ulDZWmSD.png` — 1487 × 1058 px.
- Rendered implementation: `tmp/product-design-qa/ring-table-final-v8.jpeg` — 1260 × 768 px, captured from the user-selected Safari browser.
- Combined comparison input: `tmp/product-design-qa/comparison-final-v2.png` — 2454 × 720 px.
- Viewport normalization: the Safari page region was cropped to 1259 × 629 px after removing 139 px of browser chrome and retaining one-pixel crop compatibility; source and implementation were then independently aspect-fit to 720 px height and placed side by side at 1× screenshot density.
- Browser scale: the Safari capture visibly uses a reduced page scale relative to CSS pixels; the approximate 80% value is inferred from the rendered dimensions, not read from browser settings.
- State: six-player local game, round 1 secret plan, “修台 2” selected, confirmation enabled, record/chat drawers collapsed.

The full 2310 × 720 comparison keeps the altar, all six player seats, private information, four action families, selected amount, and confirmation control readable, so no additional focused crop was necessary.

### Fidelity verdict

- Typography: compact Kai/Song-style Chinese hierarchy remains legible at the real Safari window height; phase, calamity, player, action, and private-state labels preserve distinct weights and sizes.
- Spacing and layout: the altar owns the primary field; six seats ring the stage without collision; the decision sheet has a stable private column plus action column; record and chat remain secondary edge drawers.
- Colors and tokens: ink black, aged gold, jade, cinnabar, and lightning violet stay consistent with the upstream art and the selected reference.
- Image quality and assets: the stage, character portraits/cards, action illustrations, and table texture all reuse vendored upstream art. No placeholder art, emoji, CSS drawing, or runtime hotlink was introduced.
- Copy and content: the central calamity, progress tracks, private fate, action families, investment amounts, and confirmation wording all come from the live rules view rather than decorative mock content.
- Interaction: Safari manual play verified response-window progression, negotiation lock, secret-plan selection, two-step confirmation, record drawer open/close, and Escape dismissal.
- Responsive and accessibility: the compact player cards intentionally replace the reference’s oversized circular medallions so six seats and their numeric state remain readable in a low-height desktop window. Buttons expose selected state, drawers expose expanded/collapsed state, and the page retains semantic labels and keyboard dismissal.

### Iteration history

- Iteration 1, score 67: rejected the pale world-map stage and clipped actions.
- Iteration 2, score 84: restored the full altar artwork; action choices still clipped.
- Iteration 3, score 89: fixed action visibility; private-area composition remained weak.
- Iterations 4–8, score 91: refined decision-sheet density and isolated the apparent empty-space problem.
- Iteration 9: Safari evidence exposed the actual cause—an inherited `grid-column: 1 / -1` rule made the secret-action dock overlap the private column.
- Iteration 10, score 94: the two desktop decision columns became independent and all key controls were visible.
- Iteration 11, score 92: static review found that the high-specificity desktop fix could override the 760 px single-column rule.
- Iteration 12, score 94, passed: the narrow-screen override now has matching specificity; a fresh six-player Safari game confirmed the desktop state remains complete and stable.

### Remaining intentional differences

- Player seats use compact rectangular status cards instead of large circular medallions to preserve six-player numeric readability.
- The implementation shows all four legal action families and embeds amount selection inside each action card; the reference depicts three larger cards plus a separate status column.

Final result for the ring-table match layout: passed.

## Comparison target

- Source visual truth:
  - `public/assets/upstream/raw/01-封面招募.png` — 941 × 1672 px
  - `public/assets/upstream/raw/04-每轮秘密四选一.png` — 941 × 1672 px
  - `public/assets/upstream/characters/R01-card.webp` — 600 × 900 px
- Rendered implementation:
  - `docs/screenshots/art-v2-main-menu.png` — 1280 × 720 px
  - `docs/screenshots/art-v2-secret-plan.png` — 1280 × 720 px
  - `docs/screenshots/art-v2-solo-full.png` — 1280 × 1120 px
  - `docs/screenshots/art-v2-tutorial.png` — 1280 × 720 px
  - `docs/screenshots/art-v2-mobile-home.png` — 390 × 844 px
- Combined comparison input: `docs/screenshots/art-v2-qa-comparison.png` — 1800 × 1425 px.
- Density normalization: source panels were aspect-fit into 600 × 900 cells; implementation panels were aspect-fit into 600 × 525 cells on the same comparison canvas. Browser captures used CSS viewports matching their pixel dimensions at device scale 1.
- State: desktop main menu, first-round secret plan, complete solo character gallery, tutorial overview, and mobile main menu.

The source is a set of vertical promotional and card illustrations rather than a page mock. The comparison therefore judges preservation of its ink-wash, thunder, parchment, gold-line, cinnabar, altar, character-card, and four-action visual system in a functional responsive web product.

## Full-view evidence

- The main menu uses the responsive upstream cover as the full-bleed visual field, keeping the altar and character composition visible behind a restrained ink panel.
- The first-round table uses the derived altar crop, seven source character-card artworks, circular portrait crops, and the four source action-card crops.
- The secret-plan state presents cultivation, repair, resistance, and exploration as four simultaneous columns at 1280 × 720 instead of hiding them in a narrow scroll lane.
- The solo setup exposes all seven complete upstream character cards with the generated game data’s names and abilities.
- The tutorial retains the three complete long-form source posters and provides an accessible full-image lightbox.

## Focused evidence

- Mobile home (`390 × 844`): the 720 px responsive cover loads, the six-character title stays on one line, horizontal overflow is zero, navigation wraps cleanly, and the primary action remains above the fold.
- Secret-plan region: four action groups each occupy about 298 px in a 1239 px dock; all four source-derived art treatments are simultaneously visible.
- Character gallery: seven cards are present; the first six are visible in the 1280 px row and the seventh remains available by horizontal gallery scrolling.
- Tutorial lightbox: opens as a named modal dialog, focuses the close button, supports left/right navigation, and closes with Escape.
- No extra focused crop was required for icons because the interface deliberately uses text labels and upstream raster art rather than substituting custom icons or SVG illustrations.

## Required fidelity surfaces

- Fonts and typography: headings and brand use a Kai-style Chinese stack; body copy keeps a high-readability Song/serif stack. Hierarchy, wrapping, line height, and truncation were checked on desktop and mobile.
- Spacing and layout rhythm: desktop table fits 1280 × 720 in three rows; secret-plan actions span the table width; the 1024 px and 680 px breakpoints collapse to one/two columns without overlapping persistent controls.
- Colors and visual tokens: ink black, parchment, aged gold, cinnabar, jade, and lightning violet are mapped to CSS tokens. Surfaces use solid/semitransparent source-aligned treatments without fabricated gradient artwork.
- Image quality and asset fidelity: source raster art is used directly or through documented lossless crops and WebP derivatives. No upstream illustration, logo, character, or action art is replaced with emoji, CSS drawing, placeholder geometry, or custom SVG.
- Copy and content: page copy stays within the game’s cooperative-repair/competitive-ascension premise. Visible names, abilities, phases, calamities, and actions come from the actual rules data.

## Accessibility and interaction evidence

- Meaningful alt text exists for tutorial posters, character portraits, full character art, and action art; decorative revealed-plan thumbnails are hidden from assistive technology.
- Focus-visible styling is retained, controls use semantic links/buttons/labels, reduced-motion preferences are honored, and the tutorial dialog supports keyboard dismissal.
- Browser interaction verified: enter solo setup, start a local game, skip both response windows, lock negotiation, reach the four-choice plan, open the tutorial lightbox, and close it with Escape.
- Browser console warnings/errors checked: none.

## Comparison history

### Iteration 1 — blocked, score 54

- Finding: mobile title wrapped as an orphan final character and produced a small horizontal overflow.
  - Fix: reduced and locked the mobile display title, constrained the hero panel, and rechecked `scrollWidth === innerWidth`.
  - Post-fix evidence: `docs/screenshots/art-v2-mobile-home.png`.
- Finding: the four secret choices were compressed into one narrow vertical group.
  - Fix: grouped legal plans by their four source action types and made the desktop secret-plan dock span all four columns.
  - Post-fix evidence: `docs/screenshots/art-v2-secret-plan.png`.
- Finding: the comparison did not show the implemented full character-card surface.
  - Fix: captured the complete seven-card gallery and included it in the normalized comparison.
  - Post-fix evidence: `docs/screenshots/art-v2-solo-full.png` and `docs/screenshots/art-v2-qa-comparison.png`.
- Finding: display typography read as generic web serif.
  - Fix: assigned a Kai-style Chinese display stack while retaining readable serif body text.
  - Post-fix evidence: all iteration-2 screenshots.

### Iteration 2 — passed, score 92

- No actionable P0, P1, or P2 findings remain.
- P3: the mobile footer intentionally keeps the long rule digest to one truncated status line.
- P3: tutorial poster cards preserve their source aspect ratio, so the complete posters require vertical scrolling or the lightbox.
