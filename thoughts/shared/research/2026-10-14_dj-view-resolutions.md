---
date: 2026-10-14
topic: DJ view fit on common screen resolutions (DJ-VIEW-RESOLUTIONS census)
tags: [dj, layout, responsive, resolutions, touch]
status: draft
---

# DJ view on common resolutions — census

Task: DJ-VIEW-RESOLUTIONS (owner 2026-10-14), phase 1 research. No code changed.

## How the numbers were obtained

- **Computed** from the code at `42c43f225`, then **calibrated against the owner's
  screenshot** `~/Pictures/claude-inbox/CleanShot 2026-10-14 at 17.21.28@2x.png`
  (3316x1826 device px = **1658x913 CSS viewport**, 3 decks, Deck C scratch-only,
  visualizer mode, Auto DJ on). Heights read off that screenshot are marked *(shot)*.
- Not measured in a live browser: the MCP had no browser connected, and no tab was
  opened (one-tab rule). Every per-resolution row below is a **computation**, not a
  measurement. Confirm with `get_ui_state`/a layout probe at each size before the plan
  is final.
- Browser chrome assumed 100 px (the owner's 80-120 px range, midpoint); +/-20 px moves
  every "row height" below by the same amount.

## The layout as it is

Vertical stack inside `AppLayout` (`h-screen`, `overflow-hidden`):

| Band | Source | Height (CSS px) |
|---|---|---|
| NavBar | `src/components/layout/NavBar.tsx:134` (`px-4 py-2`, `text-lg` title) | ~44 *(shot)* |
| DJ top bar | `src/components/dj/DJView.tsx:415` (`overflow-x-auto scrollbar-hidden`) | ~45 *(shot)* |
| Stacked waveforms A + B | `src/components/dj/DeckAudioWaveform.tsx:324` (`h-16` each) via `DJView.tsx:547-548` | 129 *(shot)* |
| Main grid padding | `DJView.tsx:566` (`p-2`) | 16 |
| StatusBar | `src/components/layout/StatusBar.tsx:515` (`py-1.5`) | ~30 *(shot)* |
| **Total fixed chrome** | | **~263** *(shot: 913 - 650 row)* |

Main grid row height = viewport height - 263.

Columns: `DJView.tsx:568-569` — `grid-cols-[1fr_400px_1fr]` (2 decks) /
`grid-cols-[1fr_400px_1fr_1fr]` (3 decks), `gap-2`, `p-2`. Every cell is
`min-h-0 min-w-0 overflow-hidden` (`DJView.tsx:588-606`), so anything that does not
fit is **silently clipped at the bottom/right — never scrolled**.

- Deck width (2 decks) = (W - 432) / 2. Deck width (3 decks) = (W - 440) / 3.
- Mixer column = 400 px always, whatever the deck count.

### Deck column (`src/components/dj/DJDeck.tsx:396-486`)

`flex flex-col gap-2 p-3 overflow-hidden`. **Only one child flexes** — the pattern /
visualizer / vinyl area (`DJDeck.tsx:456`, `flex-1 min-h-0`). Every other band is
fixed:

| Band | Fixed constant | Height |
|---|---|---|
| Padding + border | `DJDeck.tsx:398` `p-3` | 26 |
| Header: label + scopes + track info, beside the platter | scopes `size={64}` `DJDeck.tsx:433`; platter `SIZE = 96` `DeckTurntable.tsx:27`; BPM `text-2xl` `DeckTrackInfo.tsx:165` | ~178 *(shot)* |
| Deck C only: Scratch Fader + Slip lanes | `DeckCScratchLanes.tsx:39-48` | ~41 + gap *(shot)* |
| Transport + Nudge | `h-10 min-w-10` x6, `DeckTransport.tsx:70,90,107,126`, `DeckNudge.tsx:40,58` | 40 (88 when it wraps) |
| Lower panel (tab strip + body) | body `h-44` (176 px) `DeckPanelTabs.tsx:47` — fixed **by design** (comment `:10-12`: switching tabs must not resize the pattern view) | ~206 |
| Pitch slider | beside the flex area, `width: 32` `DeckPitchSlider.tsx:162`, handle 24 | — |

Fixed total for a track deck (A/B): **~472 px** *(shot: 650 row - 178 pattern area)*.
Track-loaded Deck C: ~520. Pattern area = row height - 472 (Deck C: - 520).

Transport row needs 4x40 + 3x8 + 8 + 2x40 + 4 = **276 px** of inner width; below that it
wraps to two rows (+48 px height).

### Deck C scratch-only (`src/components/dj/DeckCScratchOnly.tsx:24-50`)

Header (BPM + platter 96) ~95 *(shot)*, lanes ~41, record selector ~28, then the
scratch pad grid `repeat(auto-fill, minmax(84px, 1fr))` (`DeckScratch.tsx:143`) holding
**19 pads** (counted from the `PATTERN_SLOTS` builder, `src/engine/dj/DJScratchEngine.ts:83-134`).
The grid has no fixed height and no scroll, so its tail is clipped by the deck's
`overflow-hidden`. Columns: inner width 254 -> 2 cols (10 rows), 283-347 -> 3 cols
(7 rows), >= 348 -> 4 cols (5 rows). At 4 cols the whole deck needs ~400 px *(shot)*;
3 cols ~490; 2 cols ~610 (computed, pad row ~38 px incl. two-line labels).

### Mixer column (`src/components/dj/DJMixer.tsx:38-158`)

`flex flex-col h-full`, **no overflow handling and no shrinkable child**: content
taller than the column is clipped by the grid cell. Fixed parts:

| Row | Constant | Height |
|---|---|---|
| Filter + 3 EQ knobs per deck | `Knob` `sm` = 40 px `src/components/controls/Knob.tsx:152`; kill button `w-4 h-4` `MixerEQ.tsx:92`; fader min `TRACK_HEIGHT = 80` `MixerChannelStrip.tsx:23` | ~228 *(shot)* |
| Crossfader + curve buttons | `height: 24` `MixerCrossfader.tsx:62` | ~62 *(shot)* |
| Camelot wheel + key readout | `size = 108` `CamelotWheel.tsx:81` | ~162 *(shot)* |
| Transition buttons | `h-7` `MixerTransition.tsx:87-144` | ~33 |
| FX WET (only while the dub bus is on) | `DJMixer.tsx:106` | ~24 |
| Master + Cue | `Knob sm` `MixerMaster.tsx:102,184`, `MixerCueSection.tsx:74` | ~100 (estimated: clipped in the shot) |
| Broadcast toggle | `DJMixer.tsx:132` | ~30 |
| Padding, borders, gaps | `p-2 gap-2` + `pb-2` per row | ~60 |
| **Total** | | **~700-720** (computed; the shot at a 650 row already loses the Broadcast row and the bottom of Master/Cue) |

Width actually used: ~224 px with 2 decks, ~338 px with 3 decks (computed from knob
columns 58, strips 28, VU 12 each, `gap-1.5`). The 400 px column wastes ~160 px with 2
decks.

### DJ top bar (`DJView.tsx:415-488`)

`flex-nowrap` inside `overflow-x-auto scrollbar-hidden`: buttons past the right edge
are reachable only by a horizontal scroll gesture with no visible scrollbar. Content
width with Auto DJ on + MIX NOW + a playlist name: **~1490 px** *(shot)*. Shorter
without Auto DJ (not measured).

## Census: resolution x deck count

Row = viewport height (screen - 100 browser chrome) - 263. Pattern = row - 472.
"Usable" pattern view assumed >= 160 px (~10 tracker rows; the shot shows ~8 rows at
178 px) — owner decision D1. All values computed.

| Screen (CSS) | Viewport H | Row H | Decks | Deck W | Pattern area | Mixer (needs ~710) | Other |
|---|---|---|---|---|---|---|---|
| 1280x720 | 620 | 357 | 2 | 424 | **-115: gone, lower panel clipped 115 px** | **clipped ~350: Camelot half, transition, master, cue, broadcast lost** | top bar clips (~210 px hidden) |
| 1280x720 | 620 | 357 | 3 | 280 | **-163 (transport wraps): gone, panel clipped 163** ; Deck C scratch-only: pads clipped ~250 (2 cols) | same | scopes shrink to 24 px (4 ch) / 10 px (8 ch); track name truncates hard |
| 1366x768 | 668 | 405 | 2 | 467 | **-67: gone, panel clipped 67** | **clipped ~305** | top bar clips (~125 hidden) |
| 1366x768 | 668 | 405 | 3 | 309 | **-115 (transport wraps)** ; Deck C pads clipped ~85 (3 cols) | **clipped ~305** | scopes ~31 px (4 ch) |
| 1536x864 | 764 | 501 | 2 | 552 | **29: unusable** | **clipped ~210** | top bar borderline |
| 1536x864 | 764 | 501 | 3 | 365 | **29** ; Deck C fits barely (3 cols) | **clipped ~210** | |
| 1440x900 | 800 | 537 | 2 | 504 | **65: unusable** | **clipped ~175** | top bar clips (~60 hidden) |
| 1440x900 | 800 | 537 | 3 | 333 | **65** ; Deck C fits (3 cols) | **clipped ~175** | |
| 1512x982 (MBP 14) | 882 | 619 | 2 | 540 | **147: below usable** | **clipped ~90 (broadcast + part of master/cue)** | |
| 1512x982 | 882 | 619 | 3 | 357 | **147** ; Deck C with a track: 99 | **clipped ~90** | |
| 1920x1080 | 980 | 717 | 2 | 744 | 245 OK | borderline OK; clipped ~15 when the dub bus is on (FX WET row) | |
| 1920x1080 | 980 | 717 | 3 | 493 | 245 OK ; Deck C with a track 197 | same | |
| 1728x1117 (MBP 16) | 1017 | 754 | 2 | 648 | 282 OK | OK | |
| 1728x1117 | 1017 | 754 | 3 | 429 | 282 OK | OK | |
| 2560x1440 | 1340 | 1077 | 2 | 1064 | 605 | OK, ~370 px empty | under-uses space: vinyl capped at 628x505 (`DeckCssTurntable.css:32-33`), scopes 64 and platter 96 tiny on a 1064 px deck, panel stays 176 |
| 2560x1440 | 1340 | 1077 | 3 | 707 | 605 | OK | same |
| Owner's window 1658x913 *(shot)* | 913 | 650 | 3 | 406 | 178 | **clipped (broadcast row + bottom of master/cue gone)** | matches the complaint |

Summary: **6 of 8 resolutions fail vertically** (both deck counts): 1280x720,
1366x768, 1536x864 and 1440x900 lose the pattern view entirely and clip the deck
panel and the mixer; 1512x982 is below usable; 1920x1080 is borderline. Width only
fails with 3 decks at 1280/1366 (squeezed scopes, wrapping transport) and the top bar
at <= ~1500 px. 2560x1440 works but wastes space.

## Root causes, by number of failures

1. **The deck is a stack of fixed bands with one flex child** (`DJDeck.tsx:456`).
   ~472 px fixed; the pattern view absorbs every shortfall, reaches 0, then the
   lower panel is clipped by `overflow-hidden`. Biggest single constant: the 176 px
   panel body `h-44` (`DeckPanelTabs.tsx:47`), then the ~178 px header (64 px scopes
   `DJDeck.tsx:433` + 96 px platter `DeckTurntable.tsx:27` + track info). Causes the
   pattern failures in 12 of 16 cells.
2. **The mixer needs ~710 px and cannot shrink or scroll** (`DJMixer.tsx:38-43`).
   Contributors: Camelot wheel 108 + labels (~162), four 40 px knobs per deck (~228),
   master/cue (~100), broadcast (~30). Fails 10 of 16 cells, including the owner's
   own window.
3. **~263 px of fixed vertical chrome** before the grid: two 64 px waveforms
   (`DeckAudioWaveform.tsx:324`), the NavBar (still shown in DJ — `AppLayout.tsx:55-60`
   hides it only for VJ), the DJ top bar and the StatusBar. On 720p that is 42 % of
   the viewport.
4. **The mixer column is a fixed 400 px** (`DJView.tsx:568-569`) while its content
   uses ~224 (2 decks) / ~338 (3 decks); every deck column pays for it — the main
   cause of the 3-deck width squeeze at 1280/1366.
5. **Deck C always gets an equal `1fr`**, even scratch-only, where it needs less width
   than a track deck (`DJView.tsx:568`).
6. **Top bar is one non-wrapping row** with a hidden scrollbar (`DJView.tsx:415-416`).
7. Nothing in `src/components/dj/` reads `useBreakpoint` or any size signal for layout
   (grep for `useBreakpoint|isPhone|useResponsive` in `src/components/dj`: no hits);
   the grid template is one hard-coded string per deck count.

## Existing helpers to reuse

- `src/hooks/useBreakpoint.ts` — single source for **width** thresholds
  (`BREAKPOINTS` `:67-74`, mirrored in `tailwind.config.js` `screens`); exposes
  `width`, `height`, `isShortViewport` (height < sm), `isCoarsePointer`, `isPhone` (D1:
  coarse pointer AND short edge < 640). Guard test
  `src/hooks/__tests__/useBreakpoint.test.tsx:288` forbids width comparisons and
  `max-width` media queries anywhere else. It covers widths only — a DJ **height**
  tier has no home yet; it should be added to this file (decision, not a loophole).
- Container queries already in use: `src/components/dj/DeckCssTurntable.css:19-45`
  (`container-type: size`, `cqw/cqh` object-fit-contain). Pattern for platter,
  waveform and pad sizing from the cell's own size.
- ResizeObserver sizing already in: `DeckScopes.tsx` `deckScopeSize(size, channels,
  rowWidth)` `:39-45` (from 42c43f225), `DeckAudioWaveform.tsx:198`,
  `DeckTrackOverview.tsx:135`, `DeckPitchSlider.tsx:39`.
- Fit-scale: `fitAndStretchChannelWidths` `src/components/tracker/channelLayout.ts:154`,
  published as `useUIStore.trackerFitScale` (`src/stores/useUIStore.ts:54,378`,
  `PatternEditorCanvas.tsx:484-485`). Tracker-only; the DJ pattern view uses
  `ReadOnlyPatternCanvas` (`DeckPatternDisplay.tsx:18,216`).
- `padGridSpan.ts` (3dbd8244d) — full-width pad rows; already width-adaptive.
- `AppLayout.tsx:51-60` `isFullscreenView` — the switch that hides the NavBar for VJ.

## Candidate approaches

**A. Fit-scale the whole DJ view.** Lay the view out at a design size (e.g. the owner's
1658x650 grid) and scale it with CSS `zoom` from a ResizeObserver, like
`trackerFitScale`. Cost: small (one observer, one wrapper; pointer maths in
platter/waveform/fader drags must be checked under `zoom`). Fails to cover: at
1280x720 the factor is ~0.55, so 10 px labels render at ~5.5 px and 40 px buttons at
22 px — unreadable and below touch size; it wastes 2560x1440 (or blows everything up);
it gives DJ-VIEW-TOUCH nothing, since a phone needs a different composition, not a
smaller one.

**B. One DJ layout source computed from the grid's own size (recommended).** A pure
function `djLayout({ width, height, deckCount, deckCScratchOnly, coarsePointer })`
returns a tier: column template (mixer width from its content, ~240/~350, not 400;
scratch-only Deck C narrower), waveform height (64 -> 40 -> overview only), header
mode (platter beside scopes vs. platter hidden/compact, scope size), lower-panel mode
(176 px body vs. tab strip + body that only opens on demand / overlays the pattern
view), and mixer sections by priority (knobs + faders + crossfader always; Camelot,
transition, broadcast collapse into a compact row or a popover at short heights).
Thresholds live in `useBreakpoint.ts` (add a height scale next to `BREAKPOINTS`);
components read the tier from one hook and keep their own `ResizeObserver` /
container-query sizing inside the tier. Cost: medium-high — every fixed constant
listed above becomes a tier input; mixer and deck need priority sections; one pure
function with a table-driven test over all 16 cells, plus one reachability test that
mounts DJView at a size and asserts no clipped control (sentinel: `scrollHeight <=
clientHeight` per column). Fails to cover: some cells (3 decks on 1280x720) still
cannot show everything at once — which controls go behind a tap is an owner call
(D2/D3); per-tier design work is needed before code.

**C. Let columns scroll.** `overflow-y-auto` on the deck and mixer cells, min heights on
the pattern view. Cost: tiny. Fails to cover: mid-set the DJ has to scroll to reach
the crossfader, master or pads; the pattern view still loses to fixed bands; nothing
for touch. A band-aid over root causes 1-4 — not proposed for shipping, listed only as
the comparison point.

**Recommendation: B.** It is the only option that fixes the root causes (fixed bands,
non-shrinking mixer, fixed 400 px column) instead of hiding them, and the same
`djLayout` tier is exactly what DJ-VIEW-TOUCH needs.

## What the one layout source must allow for DJ-VIEW-TOUCH

- Take `isCoarsePointer` / `isPhone` (from `useBreakpoint`) as inputs, not only size:
  an iPad landscape (1024x768, coarse) and a 1024x768 mouse window need different
  hit sizes, the same columns.
- Allow a **composition** change, not just sizes: phone portrait = one deck + mixer
  strip with a deck switcher; phone landscape (844x390) = two decks without the lower
  panel. The tier must be able to say "deck A only", not just "narrower".
- Minimum hit sizes per pointer: today the kill buttons are 16 px (`MixerEQ.tsx:92`),
  VU/fader thumbs 24x12 (`MixerChannelStrip.tsx:24-25`) — fine for a mouse, too small
  for a finger (~44 px).
- No hover-only reveals in any collapsed section (popovers must open by tap).
- NavBar is already replaced on phones (`AppLayout.tsx:55-60`, `MobileMenu`); the
  DJ top bar has no phone variant yet.

## Open owner decisions

- **D1 Minimum usable pattern view**: 160 px (~10 rows) / 120 px / "the pattern view may
  disappear on the smallest tier".
- **D2 What gives way first on short screens** (order them): waveforms shrink
  (64 -> 40 or overview only) / deck lower panel collapses to tabs-on-demand / mixer
  Camelot + transition + broadcast go into a popover / NavBar hidden in DJ view (like VJ).
- **D3 Three decks on <= 1366 px wide**: mixer narrows to its content / scratch-only
  Deck C becomes a narrower column / Deck C becomes a drawer or overlay.
- **D4 2560x1440**: grow controls (platter, scopes, panel) to use the space / keep
  sizes and leave room / larger pattern view only.
- **D5 Touch**: same tiers with bigger hit sizes / a separate phone composition (one
  deck at a time).

## Found while looking

- `MixerEQ.tsx:31,83` — `deckNum = deckId === 'A' ? '1' : '2'`: Deck C's EQ/filter
  tooltips say "Deck 2".
- The stacked waveform strip shows A and B only (`DJView.tsx:547-548`); Deck C with a
  track has no waveform.

## Outcome (2026-10-14)

Implemented per `thoughts/shared/plans/2026-10-14-dj-view-resolutions.md` (commits bdaf1d309 MCP fit
instrument, 4185eb6f9 AnchoredPopover, b0cfd9082 layout source and all consumers, calibration commit
in the plan ledger). The real-Chrome sweep passes 20 of 20 cells. Measured numbers differ from this
research's budgets (Master + Cue 200 px, not 100; analysed track header 163 px; Camelot row 164 px):
see the plan's Calibration section.
