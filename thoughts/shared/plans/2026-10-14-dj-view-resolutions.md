---
date: 2026-10-14
topic: DJ view fits every common resolution - one layout source (DJ-VIEW-RESOLUTIONS phase 2 plan)
tags: [dj, layout, responsive, resolutions, plan]
status: implemented
---

# DJ view on common resolutions - plan

Input: research `thoughts/shared/research/2026-10-14_dj-view-resolutions.md` (9311c1bb2).
Approach B from that research: one pure layout function, components consume it.

## Owner decisions (2026-10-14, final - do not re-ask)

- **D1** The pattern view may disappear on the smallest screens.
- **D2** All four give way on short screens: deck lower panel (`DeckPanelTabs` `h-44`)
  opens on demand; mixer extras (Camelot wheel, transition, broadcast) move into a
  popover; waveforms shrink; NavBar hidden in DJ view (like VJ).
- **D3** The mixer column narrows to its content instead of the fixed 400 px
  (`DJView.tsx:568-569`) - required for 3 decks at <= 1366 wide.
- **D4** 2560x1440 grows controls.
- **D5** Touch NOT decided. The layout source takes a pointer-type input; nothing
  touch-specific is built.

## Decisions made in this plan (implementation defaults, not owner calls)

- **Give-way order** (each step applies only to the region that still does not fit):
  NavBar hidden (always, in DJ view) -> mixer extras to popover (mixer only) ->
  waveforms 64 -> 40 px (both) -> deck lower panel on demand (decks only) -> compact
  (decks + mixer: tighter gaps, `xs` mixer knobs, 64 px platter, 40 px scopes, 32 px
  transport buttons; pattern view may now vanish, D1). Reason: a 40 px waveform still
  shows the overview (16) and a 24 px zoom window, so it costs the performer less
  than hiding the pad panel.
- **Measured, not window-derived.** The solver input is the DJ view's own root box
  minus the measured top-bar height (ResizeObserver), so browser chrome, StatusBar and
  a wrapping top bar are accounted for without assumptions.
- **Top bar wraps** (`flex-wrap`, no hidden horizontal scroll). The view switcher,
  Settings and DJ Sets move from the NavBar into it (VJ already carries its own view
  switcher, `VJView.tsx:416`). Collab and Sign-in stay reachable from other views -
  the same as VJ today.
- **Mixer column is `auto`** (content width) at every size, not only 3 decks <= 1366:
  the 400 px column wastes ~160 px with 2 decks too (research root cause 4).
- **Lower panel "on demand"** = tab strip stays; the body opens as an overlay over the
  pattern area when a tab is clicked, closes on clicking the open tab again or Escape.
  An overlay keeps the `DeckPanelTabs.tsx:10-12` invariant (opening a tab never
  resizes the pattern view).
- **Scratch-only Deck C pad grid** becomes its own bounded region that scrolls inside
  (same as the panel body today) - the deck column itself never scrolls.
- **Floor**: below the smallest size the solver can fit (smaller than every target
  resolution), the DJ view root gets `overflow-y-auto` with the solved minimum height.
  The table test asserts no target cell reaches the floor.
- **Deck C waveform** (found bug): in scope - one line plus budget; the strip shows a
  waveform for each deck that has peaks (`DeckAudioWaveform` already returns null
  without peaks). The SYNCED badge stays on the A/B boundary.
- **Deck number tooltips** (found bug): broader than reported - the same
  `deckId === 'A' ? '1' : '2'` is in `MixerEQ.tsx:31,83`, `MixerFilter.tsx:36`,
  `MixerChannelStrip.tsx:88`, `MixerVUMeter.tsx:107` (counted by grep for the
  expression across `src/`; `DJDeck.tsx:391` has the correct 3-way form). One helper
  `deckNumber()` in `src/lib/deckIdentity.ts`, used by all six sites.
- **D5 hook**: `djLayout` takes `pointer: 'fine' | 'coarse'` from `useBreakpoint`'s
  `isCoarsePointer` and returns it unchanged; it moves no size today. Written exemption
  in code (NO-KNOB rule): "D5 undecided - consumed by DJ-VIEW-TOUCH".

## Architecture

```
useBreakpoint.ts  BREAKPOINTS (width) + DJ_LAYOUT_LIMITS (DJ thresholds)   <- decisions
src/lib/dj/djLayout.ts  DJ_SIZES (every px a DJ band renders with)          <- measurements
                        djLayout(input) -> DjLayout (pure, table-tested)
src/hooks/dj/useDJLayout.ts  ResizeObserver(root, topBar) + store reads -> djLayout()
DJView  -> <DJLayoutContext.Provider value={layout}>
           DJDeck / DeckPanelTabs / DeckScopes / DeckTurntable / DeckTransport /
           DeckNudge / DeckAudioWaveform / DJMixer / MixerEQ ... read useDJLayoutContext()
```

Components keep their existing intra-band sizing (DeckScopes row-width fit from
42c43f225, container queries in `DeckCssTurntable.css`, `padGridSpan.ts`); the layout
only picks the band's mode and base size.

## Checklist (32 items) - tick here as they land, report the running count

Phase 0 - calibrate + real-browser instrument
- [x] DJVR-01 Calibrate band heights in real Chrome (read-only probe)  -> (calibration section above; measured 2026-10-14)
- [x] DJVR-02 MCP tool `get_dj_layout_fit` (bridge handler + server tool)  -> bdaf1d309
- [x] DJVR-03 MCP tool `set_dj_layout_frame` (debug frame at an exact size)  -> bdaf1d309
- [x] DJVR-04 Validate the instrument on a known-clipped and a known-fitting case  -> bdaf1d309 (frame 1280x620: mixer clipped 772/561; 2560x1340: nothing clipped)

Phase 1 - the layout source
- [x] DJVR-05 `DJ_LAYOUT_LIMITS` in `useBreakpoint.ts`  -> b0cfd9082
- [x] DJVR-06 `src/lib/dj/djLayout.ts`: `DJ_SIZES`, types, `djLayout()` solver  -> b0cfd9082
- [x] DJVR-07 Table test: 8 resolutions x 2/3 decks (+ Deck C kinds, dub on/off)  -> b0cfd9082
- [x] DJVR-08 Guard test extended: DJ size thresholds only in `useBreakpoint.ts`  -> b0cfd9082
- [x] DJVR-09 `useDJLayout` hook + `DJLayoutContext`  -> b0cfd9082
- [x] DJVR-10 DJView: root/top-bar refs, provider, grid template from layout, data attrs  -> b0cfd9082
- [x] DJVR-11 NavBar hidden in DJ view (`AppLayout.tsx:51`)  -> b0cfd9082
- [x] DJVR-12 Top bar: view switcher, Settings, DJ Sets moved in; `flex-wrap`  -> b0cfd9082
- [x] DJVR-13 Floor: root `overflow-y-auto` + min height only when `layout.floor`  -> b0cfd9082

Phase 2 - mixer
- [x] DJVR-14 Mixer column `auto` (content width), DJMixer `w-fit`  -> b0cfd9082
- [x] DJVR-15 Extract `AnchoredPopover` from the Auto DJ dropdown (`DJView.tsx:494-506`), Auto DJ uses it  -> 4185eb6f9
- [x] DJVR-16 `DJMixerExtras` popover: Camelot, transition, broadcast; trigger in crossfader row  -> b0cfd9082
- [x] DJVR-17 Knob `xs` size (32 px) + mixer compact spacing  -> b0cfd9082
- [x] DJVR-18 `deckNumber()` helper; six sites; Deck C tooltips say "Deck 3"  -> b0cfd9082

Phase 3 - decks + waveforms
- [x] DJVR-19 Waveform height from layout (`DeckAudioWaveform.tsx:324` `h-16`)  -> b0cfd9082
- [x] DJVR-20 Deck C waveform in the strip; SYNCED badge on the A/B boundary  -> b0cfd9082
- [x] DJVR-21 `DeckPanelTabs` mode `docked | onDemand` + `deckPanelOpen` store field  -> b0cfd9082
- [x] DJVR-22 Compact deck header: platter size prop (`DeckTurntable.tsx:27`, worker `resize`), scope base size  -> b0cfd9082
- [x] DJVR-23 Compact transport/nudge button size (`DeckTransport.tsx`, `DeckNudge.tsx`)  -> b0cfd9082
- [x] DJVR-24 Pattern area hidden below `patternMinPx` (no sliver)  -> b0cfd9082
- [x] DJVR-25 Scratch-only Deck C pad grid as a bounded scrolling region  -> b0cfd9082
- [x] DJVR-26 Compact deck spacing (`gap-2 p-3` -> layout values)  -> b0cfd9082

Phase 4 - large screens (D4)
- [x] DJVR-27 `large` tier: platter 144, scopes 96, mixer knobs `md`, waveforms 80, panel body 240, Camelot 140  -> b0cfd9082

Phase 5 - reachability + verification
- [x] DJVR-28 THE reachability test: DJView mounted at 16 cells  -> b0cfd9082
- [x] DJVR-29 Real-Chrome sweep of 16 cells via `set_dj_layout_frame` + `get_dj_layout_fit`, verdicts recorded  -> a7bd95561; 20 of 20 cells PASS (16 + Deck C track x2 + dub bus on x2), verdicts in test-data/dj-layout-fit.json (gitignored, local); tools/dj-layout-sweep.ts
- [x] DJVR-30 Type-check, lint, targeted tests  -> type-check clean, eslint clean on touched files, targeted vitest green
- [x] DJVR-31 Owner manual check list handed over (Blocked on me)  -> in the run report; the checks themselves are the owner's (section 'Manual owner check')
- [x] DJVR-32 Research doc + todos ledger updated with outcome and commits  -> research doc Outcome section; thoughts/spot/todos.md

## Calibration (DJVR-01, measured in real Chrome 2026-10-14, owner's tab, read-only)

Frame sizes via `set_dj_layout_frame`; every number is a band's `offsetHeight` / region width in CSS px.

| Band | Measured | Plan guess | Note |
|---|---|---|---|
| Deck header (title + scopes 64 + track info) | 140 (= 76 + scope) | 178 | platter 96 sits beside it, never drives it |
| Deck overview bar | 24 | - | hidden when the deck has a waveform |
| Transport row | 40 (88 wrapped) | 40 | wraps below deck inner width 276 |
| Tab strip / docked panel (strip + 4 + body 176) | 26 / 206 | 28 / - | |
| Deck C lanes | 44 | 41 | |
| Deck C scratch-only header | 71 text column (96 with platter 96) | 95 | hint line truncates now |
| Mixer knob rows (sm / xs / md) | 245 / 207 / 315 | 228 / 190 / 300 | |
| Crossfader (stacked / curve beside slider) | 65 / 40 | 62 | compact moves the curve selector beside the slider |
| Camelot row (108 / 140 wheel) | 148 / 180 | 162 | |
| Transition | 37 | 33 | |
| FX WET | 29 | 24 | |
| Master + Cue (regular / md / compact grid) | 200 / 236 / 89 | 100 | the plan's 100 was not reachable without a compact layout: compact puts Master and Cue in grids |
| Broadcast | 31 | 30 | |
| Mixer column width, 2 decks (regular / compact) | 282 / 309 | 400 fixed | `auto` column |
| Mixer column width, 3 decks (regular / compact) | 416 / 383 | 400 fixed | |
| Top bar | 43 (>= 1600 wide), 75 (1440-1536), 79 (<= 1366) | 45 / 80 | wraps below ~1580 px |

Deviations recorded while building (all implementation, none an owner decision):

- **Hidden tab.** The owner's tab was in the background for the whole run: a hidden tab delivers
  no ResizeObserver callbacks. `measureDjLayoutNow()` (`djLayoutFit.ts`) fires a window event the
  layout hook listens to; `set_dj_layout_frame` and `get_dj_layout_fit` call it. In a visible tab
  the ResizeObserver does the same job. Components with their own ResizeObserver (DeckScopes row fit,
  waveform worker) were therefore NOT re-fitted during the sweep.
- **Frame = the DJ root box.** `set_dj_layout_frame` sets the DJ root to exactly `width x height`; the
  sweep passes `screen - 100 browser - 30 status bar` itself (the root is measured, not the window).
- **Waveforms are budgeted for every active deck**, whether or not a track has loaded. Plan: "decks that
  have peaks". Loading a track must not make the mixer fold its extras away mid-set.
- **Short waveform 42 px, not 40**: heights include the 1 px border; 42 leaves the 16 px overview plus
  a 24 px zoom window.
- **FX WET** joins the extras popover once the layout is `compact` (it stays inline above that): at
  1280x720 with three decks, dub on, the mixer does not fit otherwise.
- **Compact mixer** needed three component changes the plan did not list: Master and Cue as grids
  (`MixerMaster`, `MixerCueSection`), the crossfader curve selector beside the slider
  (`MixerCrossfader`), and a dense tab strip (`TabStrip dense`).
- **Settings** is a local modal in the NavBar (no store action to call): the DJ view renders its own
  `SettingsModal` with its own open flag.
- Vinyl mode: `--tt-max` (628 px, 1256 px in the large tier) replaces the fixed 628 px cap.

### Ledger: 32 of 32 items done (2026-10-14). Open for the owner only: the manual check below.

Sweep outcome (real Chrome, hidden tab, frame = DJ root box): 1280x720 and 1366x768 -> compact (all four steps);
1440x900, 1536x864 -> regular or compact depending on decks, popover + short waveforms + panel on demand;
1512x982, 1728x1117, 1920x1080 -> regular with popover (some short waveforms); 2560x1440 -> large, no steps.
Dub bus on at 1280x720 (2 and 3 decks) also passes (FX WET moves into the popover in compact).
Known limit: all sweep cells ran with the owner's tab in the background (see Calibration deviations), so
DeckScopes row-fit (its own ResizeObserver) was not exercised: owner check 3 covers it.

## Phase 0 - calibrate and build the real-browser instrument

jsdom has no layout, so "nothing clipped" can only be proven in a real browser. The
budget constants in the research are partly screenshot readings; they are measured
before they are frozen.

**DJVR-01 Calibrate.** With the owner's tab connected (no own tab - one-tab rule),
read-only `evaluate_script` probe in DJ view, 2 and 3 decks, Deck C scratch-only and
with a track: `getBoundingClientRect().height` of each band - deck header row, Deck C
lanes, transport row (wrapped and not), tab strip, panel body, mixer rows 1-5, top bar,
each waveform - and the mixer's content width at 2 and 3 decks. Record the numbers in
this plan under "Calibration" (new section) before DJVR-06 freezes them in `DJ_SIZES`.
Read-only: no imports of engine modules in the probe (memory: live probes are read-only).

**DJVR-02 `get_dj_layout_fit`.** Extend the MCP, do not hack around it.
- `src/bridge/handlers/readHandlers.ts`: new `getDJLayoutFit()` - returns
  `{ tier, steps, input, columns: [{ region, clientHeight, scrollHeight, clientWidth,
  scrollWidth, clipped }], bands: [{ band, budgeted, actual }] }` by walking
  `[data-dj-region]` and `[data-dj-band]` elements; `clipped = scrollHeight >
  clientHeight + 1 || scrollWidth > clientWidth + 1`. The scrolling panel body and the
  scratch pad region are excluded by `data-dj-scrolls` (they scroll by design).
- `src/bridge/MCPBridge.ts`: register `get_dj_layout_fit: getDJLayoutFit`.
- `server/src/mcp/mcpServer.ts`: `server.tool('get_dj_layout_fit', ...)` next to
  `get_ui_state` (`:1022`), plus the help entry at `:2164`.

**DJVR-03 `set_dj_layout_frame`.** `{ width, height, zoom? } | null`. Sets
`useUIStore.djLayoutFrame` (not persisted). When set, DJView renders inside a box of
exactly `width x (height - measured StatusBar)` CSS px, scaled with CSS `zoom` so a
2560x1440 frame fits the owner's window. Layout sizes inside are unaffected by `zoom`
(scrollHeight/clientHeight are in the box's own CSS px), and DJView sizes from its own
root, so the frame exercises the same code path as a real window. Server tool + bridge
handler as in DJVR-02. Cleared on `set_dj_layout_frame null` and on view switch.

**DJVR-04 Validate the instrument** (protocol section 3). Before quoting it: at today's
code (before Phase 1) frame 1280x620 must report the mixer and decks `clipped: true`
(research: mixer clipped ~350); frame 2560x1340 must report every column
`clipped: false`. If either verdict is wrong, fix the probe first.

Automated: `npm run type-check`; unit test for `getDJLayoutFit` on a hand-built DOM
with stubbed `scrollHeight`/`clientHeight` (one clipped, one not, one `data-dj-scrolls`).
Success: both known cases give the expected verdict in real Chrome.

## Phase 1 - the layout source

**DJVR-05** `src/hooks/useBreakpoint.ts`, next to `BREAKPOINTS`:

```ts
/**
 * DJ view thresholds (DJ-VIEW-RESOLUTIONS). Decisions, not measurements: the band
 * sizes these are compared against live in DJ_SIZES (src/lib/dj/djLayout.ts).
 */
export const DJ_LAYOUT_LIMITS = {
  /** D1: below this the pattern view is hidden instead of drawn as a sliver (~10 rows). */
  patternMinPx: 160,
  /** D4: a deck at least this wide AND a row at least largeRowPx tall gets the large tier. */
  largeDeckWidthPx: 640,
  largeRowPx: 900,
} as const;
```

**DJVR-06** `src/lib/dj/djLayout.ts` (new). Every px a DJ band renders with lives in
`DJ_SIZES`; components import from here instead of literals (`h-16`, `h-44`,
`SIZE = 96`, `size={64}`, `size="sm"`, `h-10`). Values below are the research's and
are replaced by DJVR-01's calibration.

```ts
import { DJ_LAYOUT_LIMITS } from '@hooks/useBreakpoint';

export type DjPointer = 'fine' | 'coarse';
export type DjScale = 'large' | 'regular' | 'compact';
export type DjStep = 'mixerExtrasPopover' | 'shortWaveforms' | 'deckPanelOnDemand' | 'compact';

export const DJ_SIZES = {
  waveform:   { large: 80, regular: 64, short: 40 },
  platter:    { large: 144, regular: 96, compact: 64 },
  scope:      { large: 96, regular: 64, compact: 40 },
  mixerKnob:  { large: 'md', regular: 'sm', compact: 'xs' } as const,
  transportButton: { large: 40, regular: 40, compact: 32 },
  panelBody:  { large: 240, regular: 176 },
  tabStrip: 28,
  deckHeader: { large: 230, regular: 178, compact: 130 },  // calibrated in DJVR-01
  deckCLanes: 41,
  deckGap:    { large: 8, regular: 8, compact: 4 },
  deckPad:    26,
  mixer: {
    knobRows:   { large: 300, regular: 228, compact: 190 },
    crossfader: 62, camelot: 162, transition: 33, fxWet: 24,
    masterCue:  { large: 120, regular: 100, compact: 85 },
    broadcast: 30, chrome: { regular: 60, compact: 30 },
    stripWidth: { large: 130, regular: 98, compact: 84 },   // knob col + fader + VU, calibrated
  },
  gridPad: 16, gridGap: 8,
  scratchOnlyFixed: 164,   // header 95 + lanes 41 + record select 28
} as const;

export interface DjLayoutInput {
  width: number;            // DJ view root width
  height: number;           // root height minus measured top bar
  deckCount: 2 | 3;
  deckC: 'track' | 'scratchOnly' | null;
  waveformCount: number;    // decks whose waveform strip renders (has peaks)
  dubBusOn: boolean;        // FX WET row
  pointer: DjPointer;       // D5: echoed, moves nothing yet (exemption below)
}

export interface DjLayout {
  scale: DjScale;
  steps: readonly DjStep[];
  waveformHeight: number;
  rowHeight: number;
  columns: string;                       // grid-template-columns
  mixer: { extras: 'inline' | 'popover'; knob: 'xs' | 'sm' | 'md'; compact: boolean; needed: number };
  deck: {
    width: number; panel: 'docked' | 'onDemand'; panelBodyHeight: number;
    platter: number; scope: number; transportButton: number; gap: number;
    patternHeight: { track: number; trackC: number };   // may be < patternMinPx only after 'compact'
    showPattern: { track: boolean; trackC: boolean };
  };
  floor: { scroll: boolean; minHeight: number };
  /** D5 undecided - consumed by DJ-VIEW-TOUCH. Exempt from the no-knob-without-effect rule. */
  pointer: DjPointer;
}
```

Solver, in order: choose `large` if the large sizes fit and
`deckWidth >= largeDeckWidthPx && row >= largeRowPx`, else `regular`; then apply each
`DjStep` only while the region it affects still does not fit:

```ts
const STEPS: ReadonlyArray<{ step: DjStep; affects: 'mixer' | 'decks' | 'both' }> = [
  { step: 'mixerExtrasPopover', affects: 'mixer' },
  { step: 'shortWaveforms',     affects: 'both'  },
  { step: 'deckPanelOnDemand',  affects: 'decks' },
  { step: 'compact',            affects: 'both'  },
];

export function djLayout(input: DjLayoutInput): DjLayout {
  let state = initialState(input);                   // large or regular, no steps
  for (const { step, affects } of STEPS) {
    const misfit = misfits(state, input);            // { mixer: boolean; decks: boolean }
    if (!misfit.mixer && !misfit.decks) break;
    if (affects === 'both' ? (misfit.mixer || misfit.decks) : misfit[affects]) {
      state = apply(state, step);
    }
  }
  return finish(state, input);   // floor.scroll = misfits still true after all steps
}
```

`misfits()` uses `rowHeight = height - waveformCount * waveformHeight - gridPad`;
mixer need = sum of `DJ_SIZES.mixer` rows for the current knob size / extras placement
(+ `fxWet` when `dubBusOn`); deck need = `deckPad + header + transport(+wrap) +
tabStrip + (docked ? panelBody : 0) + gaps + patternMinPx` (the `patternMinPx` term is
dropped once `compact` is applied - D1), `+ deckCLanes` for a Deck C track, and
`scratchOnlyFixed + one pad row` for scratch-only Deck C (its pad grid scrolls inside,
DJVR-25). Deck width = `(width - gridPad - mixerContentWidth - gaps) / deckCount`;
transport wraps (+ one transport row + gap) when deck inner width <
`4*btn + 3*8 + 8 + 2*btn + 4`. `columns` =
`minmax(0,1fr) auto minmax(0,1fr)` (+ ` minmax(0,1fr)` for 3 decks).

**DJVR-07** `src/lib/dj/__tests__/djLayout.test.ts` - table over the 8 target screens
(viewport = screen - 100 browser chrome - 30 StatusBar - top bar 45 or 80 when the
width is under the top bar's content width, from DJVR-01) x 2/3 decks x Deck C
`track | scratchOnly` x dub on/off. Asserts per cell: `floor.scroll === false`;
mixer need <= rowHeight; every deck kind's need <= rowHeight; `showPattern.track`
is true wherever `patternHeight.track >= patternMinPx`. Pinned tiers (computed in this
plan, re-pinned after DJVR-01): 1920x1080 2 decks dub off -> `regular`, no steps;
1280x720 3 decks -> includes `compact`; 2560x1440 2 and 3 decks -> `large`, no steps;
1512x982 2 decks -> `mixerExtrasPopover` + `shortWaveforms`, panel still `docked`.
Plus: `pointer: 'coarse'` returns the same sizes as `'fine'` (D5 exemption is real,
not accidental) and `pointer` is echoed.

**DJVR-08** `src/hooks/__tests__/useBreakpoint.test.tsx` - new `it` in the
"breakpoint single source of truth" block: in `src/components/dj/**`,
`src/hooks/dj/**` and `src/lib/dj/**`, no `(height|Height|width|Width|row|Row)\w*
[<>]=? \d{3,4}` literal and no `h-44`/`h-16`/`SIZE = 96` band constants outside
`djLayout.ts`. Message points at `DJ_LAYOUT_LIMITS` / `DJ_SIZES`. Run it on the
current tree first: it must flag `DeckPanelTabs.tsx` `h-44` (red), green after DJVR-21.

**DJVR-09** `src/hooks/dj/useDJLayout.ts` + `src/components/dj/DJLayoutContext.tsx`:

```ts
export function useDJLayout(rootRef: RefObject<HTMLElement>, topBarRef: RefObject<HTMLElement>): DjLayout {
  const [box, setBox] = useState({ width: 0, height: 0, topBar: 0 });
  useEffect(() => {
    const root = rootRef.current, bar = topBarRef.current;
    if (!root || !bar) return;
    const read = () => setBox({ width: root.clientWidth, height: root.clientHeight, topBar: bar.offsetHeight });
    const ro = new ResizeObserver(read);
    ro.observe(root); ro.observe(bar);
    read();
    return () => ro.disconnect();
  }, [rootRef, topBarRef]);
  const thirdDeck = useDJStore((s) => s.thirdDeckActive);
  const deckC = useDJStore((s) => !s.thirdDeckActive ? null : s.decks.C.fileName ? 'track' : 'scratchOnly');
  const waveformCount = useDJStore((s) => (['A','B','C'] as const)
    .filter((d) => (d !== 'C' || s.thirdDeckActive) && (s.decks[d].waveformPeaks?.length ?? 0) > 0).length);
  const dubBusOn = useDrumPadStore((s) => s.dubBus.enabled);
  const { isCoarsePointer } = useResponsiveSafe();
  return djLayout({ width: box.width, height: box.height - box.topBar,
    deckCount: thirdDeck ? 3 : 2, deckC, waveformCount, dubBusOn,
    pointer: isCoarsePointer ? 'coarse' : 'fine' });
}
```

(`deckC` uses the same "has a file loaded" signal `DJDeck.tsx:389` uses for
`scratchOnly`; reuse that selector, do not write a second one.) No `useMemo`: the
solver is a few dozen additions; the context value changes only when an input does,
because `djLayout` is called on render with primitive inputs - DJVR-10 wraps the
provider value in `useMemo` keyed on those inputs only because every DJ component
re-renders on a new context object (referential stability across a boundary).

**DJVR-10** `src/components/dj/DJView.tsx`: `rootRef` on the outer element, `topBarRef`
on the top bar (`:415`); `<DJLayoutContext.Provider value={layout}>` around the
waveform strip and the grid; grid at `:566` becomes

```tsx
<div data-dj-region="grid" data-dj-scale={layout.scale} data-dj-steps={layout.steps.join(' ')}
     className="relative flex-1 grid gap-2 p-2 overflow-hidden min-h-0"
     style={{ gridTemplateColumns: layout.columns }}>
```

and each column cell (`:588-606`) carries `data-dj-region="deckA|mixer|deckB|deckC"`.

**DJVR-11** `src/components/layout/AppLayout.tsx:51`:
`const isFullscreenView = activeView === 'vj' || activeView === 'dj';`

**DJVR-12** Top bar (`DJView.tsx:415-417`): `flex-wrap` on the inner row, drop
`overflow-x-auto scrollbar-hidden`; append the view switcher exactly as VJ does

```tsx
<CustomSelect value="dj" onChange={(v) => switchView(v, 'dj')}
  options={VIEW_OPTIONS.map((v) => ({ value: v.value, label: v.label }))} title="Switch view" />
<Button variant="ghost" size="sm" icon={<Settings size={14} />} iconPosition="left"
  onClick={() => useUIStore.getState().openModal('settings')} title="Settings (Ctrl+,)">Settings</Button>
<DJSetBrowser />
```

(Settings opens through the same path the NavBar uses - read `NavBar.tsx`
`setShowSettings` and call that store action, do not add a second one.)

**DJVR-13** Floor: when `layout.floor.scroll`, the DJ root gets `overflow-y-auto` and
the inner column a `minHeight: layout.floor.minHeight`. No target cell reaches it
(DJVR-07).

Automated: type-check; `djLayout.test.ts`; guard test; `vitest run
src/components/layout` for AppLayout. Success: table test green for all cells; guard
test red on the old tree and green after Phase 3.

## Phase 2 - mixer

**DJVR-14** Grid column from `layout.columns` (`auto`); `DJMixer.tsx:38` root adds
`w-fit`; rows that were `w-full` keep `w-full` (they fill the content width the knob
row sets). Remove nothing else.

**DJVR-15** `src/components/ui/AnchoredPopover.tsx` (new, extracted from
`DJView.tsx:494-506`): portal to `document.body`, invisible backdrop closes on click,
position from the anchor's `getBoundingClientRect`, Escape closes, opens by click only
(no hover - touch-compatible, D5). The Auto DJ dropdown switches to it in the same
commit (one popover pattern, not two).

**DJVR-16** `src/components/dj/DJMixerExtras.tsx` (new): renders `CamelotWheel`,
`MixerTransition` and the broadcast row (moved from `DJMixer.tsx:95-157`, with its
`showBroadcast` state). `DJMixer` renders them inline when
`layout.mixer.extras === 'inline'`, else a `<Button variant="ghost">More</Button>` in the
crossfader row opening `<AnchoredPopover><DJMixerExtras /></AnchoredPopover>`.

**DJVR-17** `src/components/controls/Knob.tsx:151`: add `xs: { knob: 32, fontSize: 9,
stroke: 2 }`; `MixerEQ`, `MixerFilter`, `MixerMaster`, `MixerCueSection` take
`size={layout.mixer.knob}`; mixer gaps `gap-1 p-1` when `layout.mixer.compact`.
Knob perf invariants (`docs/CONTROL_PATTERNS.md`) unchanged.

**DJVR-18** `src/lib/deckIdentity.ts`:

```ts
/** The number a deck is called by in the UI: A = 1, B = 2, C = 3. */
export function deckNumber(deckId: DeckIdentityId): '1' | '2' | '3' {
  return deckId === 'A' ? '1' : deckId === 'B' ? '2' : '3';
}
```

Used at `MixerEQ.tsx:31,83`, `MixerFilter.tsx:36`, `MixerChannelStrip.tsx:88`,
`MixerVUMeter.tsx:107`, `DJDeck.tsx:391`. Regression test
`src/components/dj/__tests__/deckCMixerTooltipsSayDeck3.test.tsx`: render
`MixerEQBandKnob deckId="C"`, `MixerFilterKnob deckId="C"`, `MixerChannelStrip
deckId="C"`, `MixerVUMeter deckId="C"`; every `title` contains "Deck 3" and none
"Deck 2". Revert-check: fails on the current tree.

Automated: type-check; the tooltip test; `deckPanelTabs.test.tsx` untouched-green;
`AnchoredPopover` unit test (opens on click, closes on backdrop and Escape).
Success: mixer fits its budget in DJVR-07; Auto DJ dropdown behaves as before.

## Phase 3 - decks and waveforms

**DJVR-19** `DeckAudioWaveform.tsx:324`: `h-16` -> `style={{ height:
layout.waveformHeight }}` plus `data-dj-band="waveform"`; the worker already reads the
container size (`:198` ResizeObserver) - confirm the zoom area = height - `OVERVIEW_H`
stays >= 24 at 40 px.

**DJVR-20** `DJView.tsx:547-548`: add `{thirdDeckActive && <DeckAudioWaveform
deckId="C" />}`; the SYNCED badge moves from `top-1/2` to `style={{ top:
layout.waveformHeight }}` so it stays on the A/B boundary.

**DJVR-21** `src/components/dj/DeckPanelTabs.tsx`: prop-free - reads
`layout.deck.panel` and `layout.deck.panelBodyHeight`. Store
`deckPanelOpen: Record<'A'|'B'|'C', boolean>` in `useDJStore` beside `deckPanelTab`
(`:324,522,606`), not persisted (comment, same as the neighbours at `:565`).

```tsx
const onDemand = layout.deck.panel === 'onDemand';
const open = !onDemand || panelOpen;
const select = (id: DeckPanelTab) => {
  if (onDemand && id === tab && panelOpen) setPanelOpen(deckId, false);
  else { setTab(deckId, id); if (onDemand) setPanelOpen(deckId, true); }
};
return (
  <div className="relative flex flex-col gap-1 min-w-0 flex-shrink-0" data-deck-panel-tabs data-dj-band="panel"
       data-deck-panel-mode={layout.deck.panel}>
    {open && (
      <div role="tabpanel" data-deck-panel-body data-dj-scrolls
           className={`min-w-0 overflow-x-hidden overflow-y-auto ${onDemand
             ? 'absolute bottom-full inset-x-0 mb-1 z-20 bg-dark-bg border border-dark-border rounded' : ''}`}
           style={{ height: layout.deck.panelBodyHeight }}>
        {/* unchanged tab bodies */}
      </div>
    )}
    <TabStrip ... onChange={select} />
  </div>
);
```

In docked mode the order stays strip-then-body as today (render the body after the
strip when docked). Escape closes an open on-demand body. `deckPanelTabs.test.tsx`
gains: on-demand body hidden until a tab click, re-click closes, docked unchanged.

**DJVR-22** `DeckTurntable.tsx:27`: `SIZE` -> `size = layout.deck.platter`; on change
post `{ type: 'resize', width: size, height: size }` (the worker handles `resize`,
`dj-turntable.worker.ts:98`). `DJDeck.tsx:433` `size={64}` -> `layout.deck.scope`.

**DJVR-23** `DeckTransport.tsx:70,90,107,126`, `DeckNudge.tsx:40,58`: `h-10 min-w-10`
-> `style={{ height: btn, minWidth: btn }}` with `btn = layout.deck.transportButton`.

**DJVR-24** `DJDeck.tsx:456`: when `!layout.deck.showPattern[kind]` the flex area
renders nothing (pitch slider stays). `kind` = `trackC` for Deck C with a track.

**DJVR-25** `DeckCScratchOnly.tsx` / `DeckScratch.tsx:143`: the pad grid sits in a
`flex-1 min-h-0 overflow-y-auto` region with `data-dj-scrolls`; deck column stays
`overflow-hidden`. `deckCScratchOnlyLayout.test.tsx` stays green.

**DJVR-26** `DJDeck.tsx:398` `gap-2 p-3` -> `gap` from `layout.deck.gap`; bands get
`data-dj-band` (`header`, `lanes`, `transport`, `panel`, `pattern`).

Automated: type-check; `deckPanelTabs.test.tsx`, `deckCScratchOnlyLayout.test.tsx`,
`deckScopesFitTheDeckWidth.test.tsx`, `deckPatternViewFitsEveryChannel.test.tsx`;
guard test now green. Success: every deck kind fits its row in DJVR-07.

## Phase 4 - large screens (D4)

**DJVR-27** `large` sizes from `DJ_SIZES` flow through the same props as Phase 2/3:
platter 144, scopes 96, mixer knobs `md` (56), waveforms 80, panel body 240, Camelot
`size={140}` (`CamelotWheel.tsx:81` default stays 108 for other callers).
`DeckCssTurntable.css:32-33` max size 628x505 rises to the container (container
queries already size it). Automated: DJVR-07 pins 2560x1440 -> `large`. Success:
2560x1440 2 and 3 decks use `large`, none clipped in DJVR-29.

## Phase 5 - reachability and verification

**DJVR-28 THE reachability test** (one per feature, protocol gate 3):
`src/components/dj/__tests__/djViewFitsEveryCommonResolution.test.tsx`, in `test:ci`
(default `src/**/*.test.tsx` glob, `vite.config.ts:134`). Written first in Phase 1
(red: DJView ignores the size), committed when green at the end of Phase 3.

- Entry point: `<DJView />` (the product's DJ view), mounted per cell.
- Mocks only what jsdom cannot run: the `?worker` factories / `OffscreenBridge`, WebGL
  visualizer and `DJ3DOverlay`; `ResizeObserver` stubbed to report the cell's root box
  (screen - 100 browser - 30 StatusBar) and a top bar of 45 or 80 px.
- Sentinel (gate 3b): `vi.mock('@/lib/dj/djLayout', async (orig) => ({ ...(await
  orig()), djLayout: vi.fn((await orig()).djLayout) }))`; assert it was called with the
  cell's `width`/`height - topBar`/`deckCount`.
- Assert the DOM consumed the solver's output (the values could only come from it):
  grid `style.gridTemplateColumns === layout.columns` and contains `auto`;
  `data-dj-scale`/`data-dj-steps` equal the result; each waveform's `style.height ===
  waveformHeight`; Deck C waveform present when Deck C has peaks; every
  `[data-deck-panel-tabs]` has `data-deck-panel-mode === layout.deck.panel`; mixer
  extras inline vs. behind the More button as `layout.mixer.extras` says; no NavBar
  element (`[data-navbar]`, added to `NavBar.tsx` root) in DJ view.
- Assert the spec numbers ("nothing clipped" in jsdom terms): `layout.floor.scroll ===
  false` and, per column, the sum of the rendered `data-dj-band` budget heights
  (`data-dj-budget` attribute written from `DJ_SIZES`) <= `layout.rowHeight`.
- Cells: 1280x720, 1366x768, 1440x900, 1536x864, 1512x982, 1728x1117, 1920x1080,
  2560x1440 x 2 decks / 3 decks (Deck C scratch-only); plus 1280x720 and 1920x1080
  with Deck C holding a track.

jsdom proves the wiring and the arithmetic. Whether a band's real content is taller
than its budget is a real-browser fact - that is DJVR-29.

**DJVR-29 Real-Chrome sweep.** Agent, via the DEViLBOX MCP against the owner's tab
(dev server `npm run dev:fullstack`, no own tab): for each of the 16 cells (+ the two
Deck C track cells) `set_dj_layout_frame {width, height}` then `get_dj_layout_fit`;
PASS = every region `clipped: false` and every band `actual <= budgeted + 2`.
Verdicts written per cell to `test-data/dj-layout-fit.json` as each completes
(resumable: skip recorded cells; `--only` re-run a cell). A FAIL on a band means the
`DJ_SIZES` value is wrong: fix the constant (or the band), re-run that cell only.
Finish with `set_dj_layout_frame null` and `stop` if anything played.

**DJVR-30** `npm run type-check`; `npm run lint`; targeted vitest runs of the files
named in each phase (not the full suite - the pre-push hook runs it).

**DJVR-31** Owner manual check (below) under "Blocked on me" in the report.

**DJVR-32** Research doc: outcome line + commits; `thoughts/spot/todos.md`
DJ-VIEW-RESOLUTIONS ticked with commits.

## Automated verification (all phases)

| Check | Command |
|---|---|
| Type-check | `npm run type-check` |
| Lint | `npm run lint` |
| Layout table | `npx vitest run src/lib/dj/__tests__/djLayout.test.ts` |
| Guard | `npx vitest run src/hooks/__tests__/useBreakpoint.test.tsx` |
| Reachability | `npx vitest run src/components/dj/__tests__/djViewFitsEveryCommonResolution.test.tsx` |
| Deck/mixer units | `npx vitest run src/components/dj/__tests__/deckPanelTabs.test.tsx src/components/dj/__tests__/deckCMixerTooltipsSayDeck3.test.tsx src/components/dj/__tests__/deckCScratchOnlyLayout.test.tsx src/components/dj/__tests__/deckScopesFitTheDeckWidth.test.tsx` |
| Real-browser fit | DJVR-29 sweep, `test-data/dj-layout-fit.json` all PASS |

Run with `VITEST_MAX_WORKERS=2`, one command at a time.

## Manual owner check (only a human can judge these) - LOCAL

URL: `http://localhost:5174` (dev server running, DJ view selected from the view
switcher).

1. Your own window (1658x913): DJ view - no NavBar; the top bar shows view switcher,
   Settings and DJ Sets and wraps instead of hiding buttons. PASS: Master, Cue and the
   whole mixer are visible without scrolling (today Broadcast and the bottom of
   Master/Cue are cut off).
2. Same window, Deck C on: mixer has a **More** button in the crossfader row; click it.
   PASS: Camelot wheel, transition buttons and Broadcast open in a popover; click
   outside or Escape closes it.
3. Shrink the window (or Chrome DevTools device toolbar, Responsive, 1280x720): PASS:
   decks show a tab strip without the pad panel; clicking **Pads** opens the panel over
   the pattern view, clicking **Pads** again closes it; nothing at the bottom of any
   column is cut off. The pattern view may be gone on Deck C (D1).
4. Deck C mixer knobs: hover the Deck C EQ/filter/fader. PASS: tooltips say "Deck 3".
5. Load a track on Deck C. PASS: a third waveform appears in the top strip; SYNCED
   badge still sits between A and B.
6. If a 2560x1440 screen is available (or DevTools Responsive 2560x1440 at 50 %):
   PASS: bigger platter, scopes and mixer knobs; no large empty band under the mixer.
7. Feel: does the give-way order (waveforms shrink before the pad panel folds away)
   suit how you play? A "no" is a reorder of `STEPS`, one line.

## Success criteria

- Phase 0: instrument reports the known-clipped and known-fitting frames correctly.
- Phase 1: table test green for every cell; DJView reads its size from one source;
  NavBar gone in DJ view; no hidden horizontal scroll in the top bar.
- Phase 2: mixer column content-width; extras popover; Deck C tooltips "Deck 3".
- Phase 3: decks fit at every target cell; Deck C waveform shown; guard test green.
- Phase 4: 2560x1440 in `large`.
- Phase 5: reachability test green in `test:ci`; real-Chrome sweep 18 of 18 PASS;
  owner check list handed over. Done = 32 of 32 items, the sweep file all PASS.

## Riskiest item

DJVR-01/DJVR-29: the solver budgets bands from `DJ_SIZES`; any band whose real
content is taller than its constant (track info wrapping, a long playlist name,
font metrics) passes every jsdom test and still clips in Chrome. The calibration
before freezing and the real-Chrome sweep after are what make the jsdom result true.

## Commits (planned, one per phase, file names only, no push)

1. Phase 0 - MCP layout-fit tools. 2. Phase 1 - layout source. 3. Phase 2 - mixer.
4. Phase 3 - decks/waveforms + reachability test. 5. Phase 4 - large tier.
Each names the DJVR IDs it closes.
