---
date: 2026-09-22
topic: Responsive and mobile — making DEViLBOX usable on phones and tablets
tags: [mobile, responsive, tablet, touch, layout, breakpoints, ui]
status: draft — decisions answered 2026-09-22
---

# Responsive / mobile — make DEViLBOX usable on phones and tablets

## The problem, in the app's terms

DEViLBOX's architecture rule is stated in `CLAUDE.md`: *Stores + Hooks (shared data) → DOM Components*, with a single source of truth and components as presentation only. Data obeys this. **Layout does not.**

Below 768px, `src/components/tracker/TrackerView.tsx:403` does not render a narrower tracker. It returns a *different component tree* — `MobileTrackerView` — and never reaches the desktop `return` at `:524`. That fork is the whole problem. Everything the desktop tree gained after the fork was last maintained (2026-04-23, per `git log` on the mobile components) is unreachable on a phone, not because it doesn't fit but because nothing mounts it:

`FT2Toolbar` (`:532`), `InstrumentKnobPanel` (`:542`), `TrackScopesStrip` (`:548`), `EditorControlsBar` (`:554`), `PatternOrderSidebar` (`:574`), `PatternBottomBar` (`:802`), **`DubDeckStrip` (`:812`)**, `MinimapWrapper` (`:816`), `DJPitchSlider` (`:822`), the `InstrumentList` panel (`:844`), `GridSequencer` (`:795`), `PianoRollView` (`:797`).

The Dub Studio — five months and roughly the whole of `thoughts/shared/plans/2026-09-17-*` — has **no phone surface at all**. That is not a CSS defect.

### Second violation: "mobile" is not single-source

Four independent, disagreeing definitions:

| Definition | Threshold | What it decides |
|---|---|---|
| `src/hooks/useResponsive.ts:19` | `width < 768` | App chrome (`AppLayout.tsx:47`) and **which tree renders** (`TrackerView.tsx:138`), `EditInstrumentModal.tsx:90` |
| `src/hooks/useBreakpoint.ts:29` via `src/contexts/ResponsiveContext.tsx` | `width < 640` | Touch handlers and canvas metrics in `PatternEditorCanvas.tsx:150`; collapse defaults in Furnace/Hively/Klystrack/TFMX/SunTronic views; `AutomationParameterPicker.tsx:27` |
| `src/midi/BluetoothMIDIManager.ts:45` | user-agent | MIDI SysEx (`MIDIManager.ts:91` — the boot log line) |
| `src/utils/platform.ts:5` | user-agent, module constant | **nothing — zero consumers** |

Plus ad-hoc thresholds that answer to none of them: `windowWidth >= 900` twice in `TrackerView.tsx:828,844`; `@media (max-width: 639px)` at `index.css:1630` and `:1754`; `(min-width: 540px) and (max-width: 767px)` at `:1718`; `(min-width: 640px) and (max-width: 1024px)` at `:1734`; `(min-width: 900px)` at `:2627`; `(max-width: 600px)` at `:2748`; `(prefers-color-scheme: dark) and (max-width: 768px)` at `:3035`; `@container (min-width: 700px)` at `:2651`; `@container instrument-panel (max-width: 17rem)` at `:3060`.

`tailwind.config.js` defines **no `screens` key** — so Tailwind's stock 640/768/1024/1280/1536 are in play as a fifth, unwritten scale.

The container queries are the *deliberate* ones, and they are right: `instrument-panel` at `17rem` and `synth-controls-flow` at `700px` react to the panel's own width, which is what a panel should do. The media queries are the accidental ones.

### The 640–767 dead zone

Between 640 and 767 CSS px inclusive — a small tablet, a large phone in portrait on a scaled viewport — `AppLayout` renders the mobile hamburger and the bottom tab bar and `TrackerView` renders `MobileTrackerView`, while `PatternEditorCanvas` believes it is on a desktop:

- `:928` `handleLongPress` returns early — block selection by touch is dead
- `:1522`, `:1529` `useMobilePatternGestures({ enabled: isMobile })` — swipe channel navigation is dead
- `:785` the desktop mouse-drag selection path is *active*, driven only by browser touch-compatibility mouse events
- `:351-352` desktop character metrics

The user sees mobile navigation wrapped around a desktop-density, non-touch pattern grid.

### Third violation: the finger-sized grid is nearly unreachable

`PatternEditorCanvas.tsx:350`: `const mobileCanvas = webglUnsupported && isMobile;`

`webglUnsupported` is set true in exactly one place for device reasons — `:2009-2014`, iOS user-agent, where the OffscreenCanvas worker is skipped. So the 1.6× metrics added by commit `f981a0fc9` ("scale up pattern editor 1.6x for finger-friendly touch targets", `MOBILE_SCALE` at `:83`) reach **one** configuration: an iPhone in portrait under 640 CSS px.

- iPad (768–1024) → `isMobile` false → desktop 12px metrics, desktop mouse handlers
- iPhone rotated to landscape (844×390) → desktop metrics **and** the full desktop tree
- Any Android phone → OffscreenCanvas supported → worker/WebGL path → `webglUnsupported` false → desktop metrics

"Is it a phone" is being inferred from "did WebGL-in-a-worker fail". Those are different questions.

**Statement of the invariant violated:** *the app has one component tree per view, parameterised by shared state.* Mobile broke it by forking the tree, and then broke the parameter itself by defining it four ways.

## Measured defects

Each of these was counted, not assumed.

**M1 — Viewport units.** 85 occurrences of `100vh` and 14 of `h-screen` across `src/`; **zero** `dvh` or `svh`. `AppLayout.tsx:52` roots the app at `h-screen` and `MobileTabBar.tsx:105` is `fixed bottom-0`. On iOS Safari `100vh` excludes the browser toolbar's effect, so the bottom of the app — the tab bar — sits underneath it. `index.html:12` already has `viewport-fit=cover` and `index.css:1604` defines `.mobile-bottom-padding`, so the intent was there; the unit is wrong.

**M2 — Modal is too wide for a phone.** `src/components/ui/Modal.tsx:204-209`: `sm: 'w-80 max-w-sm'` (320px fixed), `md: 'w-96 max-w-md'` (384px fixed, **and `md` is the default**, `:54`). The backdrop adds `p-4` (`:199`). On a 375px iPhone the default modal is 384px inside a 343px content box. `max-w-md` cannot rescue it because `w-96` is a fixed width, not `w-full`.

**M3 — Three dead mobile primitives.** `src/components/ui/TouchTarget.tsx`, `src/components/ui/BottomSheet.tsx`, `src/components/ui/SwipeablePanel.tsx` — exported from `src/components/ui/index.ts:6-13`, **zero consumers each**. `.hide-mobile` (`index.css:1664`) — zero consumers. Somebody built the mobile toolkit and nothing was ever plumbed into it. (`TouchTarget` is also a one-off `<button>`, which the component allowlist forbids; if it is revived it must wrap `<Button>` or be deleted.)

**M4 — DJ view has a hard 400px column.** `src/components/dj/DJView.tsx:563-564`: `grid-cols-[1fr_400px_1fr_1fr]` / `grid-cols-[1fr_400px_1fr]`. DJ carries `showInMobileMenu: true` in `src/constants/viewOptions.ts`, so a phone can navigate to it, and `src/App.tsx:1086` has no mobile branch. Three columns, one of them 400px, on a 390px screen.

**M5 — 44 of 55 files with `onMouseDown` have no `onPointerDown` or `onTouchStart` sibling.** 32 files use `setPointerCapture`. The good reference is `src/components/controls/Fader.tsx:157-205` — `onPointerDown` + `setPointerCapture(e.pointerId)` + `touchAction: 'none'`. `src/components/controls/Knob.tsx:538-539` is the older shape: `onMouseDown` + `onTouchStart` with window-level `mousemove`/`touchmove` listeners (`:364-367`), no pointer capture, so a drag that leaves the element behaves differently on the two input types. Drag surfaces with **no touch path at all**: `transport/DJPitchSlider.tsx`, `dj/DeckPitchSlider.tsx`, `dj/DeckAudioWaveform.tsx`, `dj/DeckTrackOverview.tsx`, `instruments/SampleEditor.tsx`, `instruments/SampleSpectrumFilter.tsx`, `tracker/AutomationLane.tsx`, `tracker/AutomationLanes.tsx`, `tracker/MacroLanes.tsx`, `tracker/ParameterEditor.tsx`, `arrangement/PatternMatrix.tsx`, `ui/FilterCurve.tsx`, `drumpad/PadButton.tsx`, `drumpad/PadEditor.tsx`, `automation/AutomationLaneStrip.tsx`, `instruments/editors/wavetable/DrawCanvas.tsx`, `instruments/shared/HarmonicBarsCanvas.tsx`, `instruments/controls/GeonkickEnvelopeCanvas.tsx`, and all thirteen `instruments/hardware/*Hardware*.tsx`.

**M6 — The tab bar was designed for five tabs and ships three.** `src/components/layout/MobileTabBar.tsx:3` documents "5 tabs: Pattern, Instruments, Mixer, Arrangement, Pads". `MOBILE_TAB_BAR_VIEWS` (`src/constants/viewOptions.ts`) yields tracker and drumpad only; the file splices in one modal tab, giving three. The comment is stale, but it records an intent — Mixer and Arrangement on a phone — that was never built.

**M7 — Token-allowlist drift, some of it inside the mobile code.** `bg-dark-bgPrimary`: 37 occurrences across 24 files. `text-text-tertiary`: 26 occurrences. Neither exists in `tailwind.config.js` — they emit nothing. One of them is in the mobile channel header itself: `PatternEditorCanvas.tsx:3110`. Correct replacements per the allowlist are `bg-dark-bg` (or `bg-dark-bgSecondary`) and `text-text-muted`.

**M8 — Mobile chrome bypasses the component allowlist.** `MobileTabBar.tsx:110` and the `MobileMenu.tsx` item rows are raw `<button className="...">`. App-wide, 78 files contain `fixed inset-0` against 20 that use `<Modal>`.

## Regression backlog found in `thoughts/`

Eleven concrete documented items. This is not a summary; each is a location.

1. `thoughts/spot/todos.md:71-82` — the parent task, with its own constraints (DOM-only, token allowlist, design-system components, compact typography, Fader/Knob pointer behaviour).
2. `thoughts/shared/plans/2026-03-25-ios-pattern-editor.md` — `status: draft — decisions answered 2026-09-22`, never marked implemented. Commit `69ec0f3f1` delivered part of it (main-thread Canvas2D). Its "Key Challenges" list at `:29-33` — *"Touch handling for scrolling, cursor movement, selection needs to work"* — is still open in the 640–767 band.
3. `thoughts/shared/plans/2026-09-17-dub-studio-progress.md:1673` — **X32**, dub deck header ran off the edge. Closed 2026-09-21 (`8550d9bcb`) by `flex flex-wrap`, verified at 1509/1280/1024/900. Never checked below 900.
4. `thoughts/shared/plans/2026-09-17-dub-studio-progress.md:2041` — **X24/X29**, the `instrument-panel` container query. Closed; it is the reusable pattern for "panel decides what it drops".
5. `thoughts/shared/handoffs/2026-09-21_dub-deck-ui-require-class-and-the-ahx-silence.md:17,32` — "make the header row survive a narrow window"; the `7rem` auto-fill floor at `DubDeckStrip.tsx:208`.
6. `thoughts/shared/handoffs/2026-04-20_tracker-dub-studio-phase-1-in-progress.md:126` — *"Full-Screen Dub Mode (spec Shell 2) — Tab-to-enter, big touch targets. Deferred."* This is the Dub-on-a-phone question, already asked and deferred once.
7. `thoughts/shared/research/2026-04-17_padeditor-chaos-audit.md:276` — 14 `<input type="range">` in PadEditor; *"no consistent haptic feedback on touch"*; violates the `<Knob>` rule.
8. `thoughts/shared/plans/2026-04-12-dj-drumpad-killer-feature.md:332` — `[ ] Touch-friendly pad sizes (minimum 80x80px)`, unchecked; `:318` "maximize pad size for touch".
9. `thoughts/shared/plans/2026-04-12-unified-sid-editor.md:218` — `Responsive layout for different panel sizes`, unchecked.
10. `thoughts/shared/handoffs/2026-02-28_workbench-3d-tracker.md:127-128` — CoverFlow touch drag *"needs testing on actual touch devices (currently only tested on trackpad)"*.
11. `thoughts/shared/handoffs/2026-04-03_dj-scratch-and-dx7.md:33` and `2026-04-04_session-handoff.md:28` — DOM playlist uses JS hover because `:hover` does not exist on touch. A known pattern that was never generalised.

`git log --oneline | grep -iE "mobile|responsive|touch|tablet"` returns 60+ commits. Dated, they cluster: a burst 2026-02-14 → 2026-02-21, a second 2026-03-23 → 2026-03-25 (`69ec0f3f1` "iOS/mobile feature parity"), then single commits through 2026-04-23, then **nothing**. Commits against the mobile components themselves stop entirely after 2026-04-23. The Dub Studio work began 2026-04-20 and ran to today. The backlog is not a list of bugs; it is a five-month divergence.

## Candidate approaches

**A — Per-component responsive classes and media queries.** Add `sm:`/`md:` variants and container queries to each panel that overflows; keep both trees. Cost: low per panel, but roughly forty panels, and it grows the breakpoint-source count that is already at nine. **What it fails to cover:** the actual complaint. `DubDeckStrip`, `PatternOrderSidebar`, `PatternBottomBar`, `InstrumentList` and eight more are not *narrow* on a phone — they are **not mounted**. No class on an unmounted component does anything. A also leaves the 640–767 dead zone exactly as it is, because that is a disagreement between two hooks, not a styling gap.

**B — Distinct mobile routes: keep and extend the second tree.** Build `MobileDubDeck`, `MobileMixer`, `MobileDJView` beside the existing `MobileTrackerView`. Cost: high and *recurring* — every future desktop feature is built twice, forever, by whoever remembers. **What it fails to cover:** it is the approach currently in place, and the five-month gap is its measured output. It also sits badly against the user's own constraint that the desktop UI is set in stone: a second tree cannot be held to a shape it does not share. B is the option that guarantees this plan is needed again in six months.

**C — A layout-primitive layer over one tree.** One breakpoint source (`ResponsiveContext`, extended with a coarse-pointer signal). Three or four primitives that express how a panel degrades — visible / collapsed to a disclosure / moved into a sheet reachable from the tab bar — and each desktop panel in `TrackerView` wrapped in the one that suits it. `MobilePatternInput` and `MobileTransportBar` survive as *additive* mobile surfaces (a piano and a transport a desktop does not need), not as a fork. Cost: one pass over `TrackerView`'s panel containers, plus writing the primitives, plus a per-view pass for the four views that genuinely cannot reflow. **What it fails to cover:** the pattern grid and the DJ decks, which are not reflowable under any layout system and need explicit per-view treatment regardless; and it does nothing for a drag handler that never listens for `pointerdown` — M5 is orthogonal and gets its own phase.

**Recommended: C.**

Decisive trade-off: A and B both leave the fork in place, and the fork is the mechanism that produced the backlog. C is the only option that makes "the Dub Deck exists on a phone" a consequence of the architecture rather than a task someone has to remember. It costs one structural pass now against an unbounded recurring cost later, and it restores the invariant the rest of the codebase already honours — one tree, parameterised by shared state.

## Phased work

Each phase is independently shippable, independently revertible, and does not depend on a later phase landing.

### Phase 0 — One definition of "mobile"

Nothing else is trustworthy until this is true.

- Delete `src/hooks/useResponsive.ts`. Re-point `AppLayout.tsx:9,47`, `TrackerView.tsx:39,138`, `EditInstrumentModal.tsx:25,90` at `useResponsiveSafe` from `src/contexts/ResponsiveContext.tsx`. One threshold, chosen once (see Decision 1).
- Extend `BreakpointState` in `src/hooks/useBreakpoint.ts` with `isCoarsePointer`, from `matchMedia('(pointer: coarse)')` via the existing `useMediaQuery` at `:91`. **Width and input type are different questions** and the codebase currently conflates them: a phone in landscape is 844px wide *and* a finger; a 900px desktop window is neither. `useIsTouchDevice` at `:140` is capability detection (`ontouchstart`), which is true on touch-capable laptops — keep it, but it is not the same signal and must not be used for sizing.
- Replace `windowWidth >= 900` at `TrackerView.tsx:828,844` with a named constant from the breakpoint module. Do not invent a new number; fold it into the scale.
- Add `screens` to `tailwind.config.js` matching the hook's thresholds exactly, so a Tailwind `md:` and a hook `isTablet` cannot disagree.
- Delete `src/utils/platform.ts` (zero consumers). Leave the user-agent checks that are genuinely about the platform and not the screen: `BluetoothMIDIManager.ts:16,35` (SysEx capability) and `PatternEditorCanvas.tsx:2009` (OffscreenCanvas+WebGL2 on iOS). Add a comment at each saying it is a platform capability check, not a layout signal.

*Automated:* extend `src/hooks/__tests__/useBreakpoint.test.tsx` (the pattern at `:10-16` — set `window.innerWidth`, dispatch `resize`) with the new threshold table and `isCoarsePointer`. Add a guard test that fails if a second `width <` breakpoint definition appears outside `useBreakpoint.ts`. Run `npm run type-check` — deleting `useResponsive.ts` will surface every consumer.
*Human:* none. This phase is fully machine-verifiable, which is why it goes first.

### Phase 1 — Viewport and chrome correctness

The class of bug where the app is *cut off* rather than *cramped*.

- `100vh` → `100dvh` with an `100vh` fallback declaration, across the 85 occurrences and the 14 `h-screen`. Prioritise the ones that bound the app shell: `AppLayout.tsx:52`, then anything `fixed`.
- `Modal.tsx:204-209`: `sm` → `w-full max-w-sm`, `md` → `w-full max-w-md`. Removes the fixed `w-80`/`w-96` without changing any modal's appearance above 400px.
- Verify the bottom tab bar clears the iOS toolbar and the home indicator. `safe-area-bottom` and `.mobile-bottom-padding` (`index.css:1604`) already exist — use them rather than adding a third mechanism.

*Automated:* a unit test asserting no `Modal` size variant emits a bare `w-<n>` class. A CSS lint step asserting no new `100vh` without a `dvh` companion.
*Human:* **required, and cannot be substituted.** iOS Safari with the toolbar visible, scrolled to hide it, and scrolled back; iPad Safari; Android Chrome. `dvh` behaviour and safe-area insets do not exist in a desktop browser at any emulated size. Local URL `http://localhost:5174` over LAN from the device, or the live `https://devilbox.uprough.net` after deploy.

### Phase 2 — Touch parity on drag controls

Independent of layout; ship it whenever.

- Convert the 44 mouse-only files to pointer events. `src/components/controls/Fader.tsx:157-205` is the reference implementation — copy its shape, do not invent a second one.
- Bring `Knob.tsx:364-367,538-539` onto the same shape: `onPointerDown` + `setPointerCapture` + `touchAction: 'none'`, dropping the split `mousemove`/`touchmove` window listeners. This must respect `docs/CONTROL_PATTERNS.md` throughout — the `useRef` mirror, `onChange`-only dependency arrays, no CSS transition on the indicator, no idle drop-shadow, `React.memo` skip on the subscribed value, rAF-batched store writes, and the `paramKey` prop for MIDI CC routing. **A pointer-event refactor that reintroduces a stale closure is a worse regression than the touch gap it fixes.**
- Order by user-visible value: `DJPitchSlider` and `DeckPitchSlider` first (a pitch fader that ignores a finger is the most obvious failure), then the tracker automation lanes, then `SampleEditor`, then the hardware UIs.

*Automated:* an ESLint rule or a test that fails on `onMouseDown` without a `onPointerDown`/`onTouchStart` sibling in the same file — this ratchets the count down and prevents regrowth. Per-control unit tests dispatching synthetic `PointerEvent`s and asserting the value changed and capture was requested.
*Human:* a real finger on a real knob and a real fader. Specifically: does a drag survive the finger leaving the control's bounds, and does the page scroll underneath it. Neither is observable without a touchscreen.

### Phase 3 — The layout primitives, and removing the fork

The structural phase. Decisions 1–3 are answered, so it is unblocked.

- Add the primitives (names to settle during implementation, but three roles): *Panel that hides below a width*, *Panel that collapses to a disclosure header*, *Panel that relocates into a sheet*. Build the sheet on `src/components/ui/BottomSheet.tsx` — it exists, it is dead, and reviving it is cheaper and more honest than writing a fourth overlay mechanism. It must be brought onto `<Button>` and the token allowlist as part of the revival.
- Wrap each `TrackerView` panel container in the primitive its Decision-3 answer chose.
- Make `TrackerView` render one tree. `MobileTrackerView`'s remaining, genuinely-mobile contributions — the format-editor routing at `:185-210`, the three-state piano, the orientation-driven `visibleChannels` at `:79-80` — move into the shared tree behind the responsive signal. `MobilePatternInput` and `MobileTransportBar` stay as components; only the *fork* goes.
- The 640–767 dead zone closes as a consequence: one signal, one tree, one set of handlers.

*Automated:* render `TrackerView` with `@testing-library/react` at 390 / 700 / 1024 / 1440 and assert every panel is **present or in a sheet** — a reachability assertion, one per panel, in the spirit of `~/.claude/REACHABILITY_PROTOCOL.md`. Note the limit precisely: **happy-dom performs no layout.** It can prove a panel is mounted; it cannot prove a row does not overflow. Do not write a test that claims to check overflow.
*Human:* two things. (a) The desktop tracker at 1440 is unchanged — this phase touches the desktop tree, so the desktop is the regression risk. (b) Width sweeps in real Chrome via the chrome-devtools MCP `resize_page` / `emulate`, which is the sanctioned browser path; `CLAUDE.md` forbids Playwright, whose bundled Chromium lacks WASM SIMD and cross-origin isolation.

### Phase 4 — The hard views

Four views cannot be reflowed by a layout primitive. Each needs a named decision about *which interaction must survive*.

**4a — Pattern editor canvas (`PatternEditorCanvas.tsx`).** The interaction that must survive: place the cursor on an exact cell, mark a block, and enter a note, without the page scrolling under the finger. Fix: decouple `mobileCanvas` at `:350` from `webglUnsupported`. Character metrics should follow coarse-pointer plus available width, so an iPad and a landscape phone get finger metrics; the OffscreenCanvas decision at `:2009` stays where it is and stops being read as a device test. This is the item `thoughts/shared/plans/2026-03-25-ios-pattern-editor.md` left open. It interacts with Decision 5.

**4b — Dub Deck (`DubDeckStrip.tsx`, 2083 lines).** The interaction that must survive: fire a move *at a musical moment*, and hold it. The move grid at `:208` is already `grid-cols-[repeat(auto-fill,minmax(7rem,1fr))]` and the header at `:1165` already wraps — it degrades to roughly 900px today. What it needs is a coarse-pointer target-size pass (the `7rem` floor and the `max-w-[56px]` card labels at `:1835`) and, above all, **an entry point on a phone**, which is Decision 2. Press-and-hold moves must survive `pointercancel` — a held dub move that latches because the browser stole the pointer is an audio failure, not a UI one.

**4c — DJ view (`DJView.tsx`).** The interaction that must survive: two decks and a crossfader visible simultaneously — that is the entire point of the view. `grid-cols-[1fr_400px_1fr]` at `:563` cannot deliver that at 390px, and neither can any reflow: two decks plus a mixer will not fit. This is Decision 4 and it is genuinely a shape change. Defensible interim: mark DJ as tablet-and-up in `viewOptions.ts` and say so, rather than shipping a broken three-column grid.

**4d — Instrument editors and FT2Toolbar.** Both already have partial machinery: `@container (min-width: 700px)` two-column flow at `index.css:2651` with a `@media (min-width: 900px)` fallback at `:2627`, and the `.ft2-toolbar` wrap rules at `:1647-1665`. Extend what is there. **Delete `.hide-mobile` (`:1664`) — zero consumers** — or actually apply it in `FT2Toolbar/FT2Toolbar.tsx`; a rule that hides nothing is worse than no rule.

*Automated per sub-phase:* reachability test that the view mounts and its principal control is present at the target width.
*Human per sub-phase:* 4a — enter a note on an iPad without mis-hitting. 4b — fire and hold a move on a phone during playback, then check it released. 4c — whatever Decision 4 chooses. 4d — read the labels.

### Phase 5 — Dead code and token drift

Small, safe, do it last so it does not collide with the phases above.

- `TouchTarget.tsx`, `BottomSheet.tsx`, `SwipeablePanel.tsx`: adopted by Phase 3 or deleted along with their `ui/index.ts` exports. No third state.
- `bg-dark-bgPrimary` → `bg-dark-bg` or `bg-dark-bgSecondary` (37 occurrences, 24 files, including the mobile channel header at `PatternEditorCanvas.tsx:3110`). `text-text-tertiary` → `text-text-muted` (26 occurrences).
- Add a CI check that fails on any `bg-dark-*` / `text-text-*` / `border-dark-*` / `bg-accent-*` class not in the `CLAUDE.md` allowlist. This is the only way the allowlist stays true — it has already drifted 63 times.
- `MobileTabBar.tsx:3`: correct the comment to describe what renders, or build what it describes (Decision 3).

*Automated:* the allowlist CI check is itself the verification. `npm run type-check` and `npm run lint`.
*Human:* none.

## What this plan is explicitly NOT doing

- **Not redesigning anything.** The user's words: the UI is "pretty set in stone". Every shape change is escalated below, not decided here.
- **Not building a separate mobile app, PWA shell, or mobile route table.** That is Approach B, and the backlog is its output.
- **Not introducing Pixi, WebGL, or any non-DOM renderer.** `CLAUDE.md` forbids it, and the existing WebGL worker is already the source of the `mobileCanvas` conflation — adding more GL would deepen it.
- **Not touching the audio engine, worklets, or the dub bus DSP.** The dub bus needs a *surface* on a phone, not different audio.
- **Not locking orientation.** `useOrientation.ts` already exposes a lock API; a music tool that refuses to rotate is worse than one that reflows.
- **Not fixing the 78 one-off `fixed inset-0` overlays.** Real, allowlist-violating, and a separate task — sweeping them while restructuring layout would make both unreviewable.
- **Not replacing PadEditor's 14 `<input type="range">` with `<Knob>`.** `thoughts/shared/research/2026-04-17_padeditor-chaos-audit.md:276` already owns it. Phase 2 will give those sliders touch behaviour; the component swap is that audit's job.
- **Not adding a CSS-in-JS layer, a UI framework, or a container-query plugin.** `index.css:3051` records the deliberate choice to write plain CSS rather than add a dependency for one rule. That choice stands.
- **Not using Playwright for verification.** `CLAUDE.md` bans it. Browser verification is DEViLBOX MCP plus chrome-devtools MCP against real Chrome at `http://localhost:5174`, and a human on a real device for anything involving `dvh`, safe areas, or a finger.

## Decisions — ANSWERED by the user 2026-09-22

All six are settled. They are recorded here because they change UI shape, and
the plan is not free to revisit them.

**D1 — What decides "phone layout": COARSE POINTER + SHORT VIEWPORT.**
Not width alone. A finger AND a small screen. This catches the case width
misses — an iPhone in landscape is 844×390 and today gets the full desktop tree
in a 390px-tall window — and correctly leaves a 900px-wide desktop window as
desktop. Phase 0 adds `isCoarsePointer` from `matchMedia('(pointer: coarse)')`
and a short-viewport test; the two together are the signal, and `useResponsive`
and the bare 640/768 thresholds go.

**D2 — The Dub Deck on a phone: FULL-SCREEN SHEET FROM THE TRANSPORT.**
Tap in, tap out. Not a tab: the deck needs the whole screen for a 39-move grid,
and the tab bar's remaining budget is better spent elsewhere (see D6). This is
the same shape `thoughts/shared/handoffs/2026-04-20_tracker-dub-studio-phase-1-in-progress.md:126`
specified as "Full-Screen Dub Mode — Tab-to-enter, big touch targets" and then
deferred. Build it on the dead `src/components/ui/BottomSheet.tsx`, brought onto
`<Button>` and the token allowlist as part of the revival.

**D3 — The five tracker panels: PER-PANEL DECISION.**
Not a uniform rule. Each panel gets what suits it — the order list and the
instrument list into sheets, the scope strip and minimap simply hidden (a scope
behind two taps is worse than no scope), the knob panel collapsed to a
disclosure. The `@container instrument-panel` rule at `index.css:3060` is the
precedent: a panel decides what it drops. This is why Phase 3 needs three
primitives rather than one.

**D4 — DJ view: TABLET AND UP.**
Two decks and a crossfader visible at once IS the view; a layout that breaks
that breaks the point of it, and no reflow fits two decks plus a mixer in
390px. Mark it tablet-and-up in `src/constants/viewOptions.ts` and say so,
rather than shipping a broken three-column grid. Revisit only if someone wants
a purpose-built phone DJ surface, which is a different product decision.

**D5 — Tablet pattern grid: FINGER METRICS.**
An iPad is a large phone, not a small desktop. The 1.6× metrics apply on
tablet, accepting roughly 2–3 visible channels instead of 8. Consequence to
carry deliberately: this propagates to every format editor — Furnace, Hively,
Klystrack, TFMX, SunTronic — so their collapse defaults and channel counts must
be checked at tablet width, not just the main grid. Real editing on an iPad is
the goal; overview is the price.

**D6 — Mobile tab bar: KEEP THREE, CORRECT THE COMMENT.**
`MobileTabBar.tsx:3` promises five tabs and ships three; the comment is what is
wrong. Mixer and Arrangement reach a phone through the D3 panel decisions
instead. This matters more now that D2 puts the Dub sheet on the transport
rather than a tab — the bar stays uncrowded.

## Files most likely to change

`src/hooks/useBreakpoint.ts` · `src/contexts/ResponsiveContext.tsx` · `src/hooks/useResponsive.ts` *(deleted)* · `src/components/tracker/TrackerView.tsx` · `src/components/tracker/MobileTrackerView.tsx` *(fork removed)* · `src/components/tracker/PatternEditorCanvas.tsx` · `src/components/layout/AppLayout.tsx` · `src/components/ui/Modal.tsx` · `src/components/ui/BottomSheet.tsx` · `src/components/controls/Knob.tsx` · `src/components/dub/DubDeckStrip.tsx` · `src/components/dj/DJView.tsx` · `src/index.css` · `tailwind.config.js` · `src/constants/viewOptions.ts`

### Critical files for implementation

- `src/components/tracker/TrackerView.tsx` — line 403 is the fork; lines 524–866 are the twelve unreachable panels
- `src/hooks/useBreakpoint.ts` — the surviving breakpoint source; gains `isCoarsePointer`
- `src/components/tracker/PatternEditorCanvas.tsx` — line 350 conflates device with WebGL support; lines 785/928/1522 are the dead-zone handler gates
- `src/components/controls/Fader.tsx` — lines 157–205, the pointer-event reference every Phase-2 conversion copies
- `src/components/ui/Modal.tsx` — lines 204–209, the fixed widths that overflow a phone

## Checklist

Phase 0 landed before this checklist was written (`useResponsive.ts` and
`utils/platform.ts` deleted, `useBreakpoint.ts` is the sole threshold source
with `isCoarsePointer`/`isPhone`/`isShortViewport`, `screens` in
`tailwind.config.js`). Items below are the remaining phases.

### Phase 1 — viewport and chrome correctness
- [x] R1-1 `--app-vh` defined once in `index.css`, upgraded to `100dvh` under
      `@supports`. One definition, every consumer reads it.
- [x] R1-2 `theme.extend.{height,minHeight,maxHeight}.screen` -> `var(--app-vh)`
      so the 14 `h-screen` follow without being edited.
- [x] R1-3 The 85 literal `100vh` (79 in .ts/.tsx, 6 in `index.css`) read the
      variable.
- [x] R1-4 `Modal.tsx` `sm`/`md` -> `w-full max-w-sm` / `w-full max-w-md`.
- [x] R1-5 Bottom tab bar clears the iOS toolbar and home indicator using the
      existing `safe-area-bottom` / `.mobile-bottom-padding`, not a third
      mechanism.
- [x] R1-6 Tests: no `Modal` size variant emits a bare `w-<n>`; no literal
      `100vh` outside the variable's own definition.

(Phase 1 landed in `3359e180f`. The device half — real iOS Safari, toolbar
shown and hidden, home indicator — is still open and only a human can close
it.)

### Phase 2 — touch parity on drag controls
- [x] R2-1 `Knob.tsx` onto the `Fader.tsx` pointer shape, `docs/CONTROL_PATTERNS.md`
      intact (ref mirror, `onChange`-only deps, no transition, `paramKey`).
- [x] R2-2 `DJPitchSlider`, `DeckPitchSlider` — the most visible failure.
- [x] R2-3 Tracker lanes: `AutomationLane`, `AutomationLanes`, `MacroLanes`,
      `ParameterEditor`, `AutomationLaneStrip`, `PatternMatrix`.
- [x] R2-4 Canvas editors: `SampleEditor`, `SampleSpectrumFilter`,
      `DeckAudioWaveform`, `DeckTrackOverview`, `FilterCurve`, `DrawCanvas`,
      `HarmonicBarsCanvas`, `GeonkickEnvelopeCanvas`, `PadButton`, `PadEditor`.
- [x] R2-5 The thirteen `instruments/hardware/*Hardware*.tsx`.
- [x] R2-6 Ratchet test: a file with `onMouseDown` and no pointer/touch sibling
      fails unless it is on a shrinking allowlist.

(Phase 2 landed in `9f534e2b5`, `c886c352d`, `1bb988021`, `ac08caa99`. All 43
mouse-only files converted, ratchet allowlist empty. A real finger on a real
knob is still open.)

### Phase 3 — layout primitives, one tree
- [x] R3-1 Primitives: hide-below-width, collapse-to-disclosure,
      relocate-into-sheet. The sheet revives `ui/BottomSheet.tsx` onto
      `<Button>` and the token allowlist.
- [x] R3-2 Each `TrackerView` panel container wrapped in its primitive.
- [x] R3-3 `MobileTrackerView`'s fork removed; its real contributions
      (format-editor routing, three-state piano, orientation `visibleChannels`)
      move into the shared tree behind `isPhone`.
- [x] R3-4 Reachability: render `TrackerView` at 390/700/1024/1440 and assert
      every panel is mounted or in a sheet. happy-dom does no layout — this
      proves mounting, never overflow.

(Phase 3: `MobileTrackerView` deleted, one tree, nine panels declaring how
they degrade. Sheet content unmounts when the sheet closes, so `DubDeckStrip`
is `keep` — it owns the dub bus toggle and already collapses itself. The
desktop regression check at 1440 is still open.)

### Phase 4 — the views that cannot reflow
- [ ] R4-1 (4a) `mobileCanvas` decoupled from `webglUnsupported`; character
      metrics follow coarse pointer plus width.
- [ ] R4-2 (4b) Dub Deck target sizes for a finger, and an entry point on a
      phone; a held move survives `pointercancel`.
- [ ] R4-3 (4c) DJ view: per Decision 4.
- [ ] R4-4 (4d) Instrument editors and `FT2Toolbar` extend the container
      queries already there; `.hide-mobile` applied or deleted.

### Phase 5 — dead code and token drift
- [ ] R5-1 `TouchTarget` / `BottomSheet` / `SwipeablePanel` adopted or deleted
      with their `ui/index.ts` exports. No third state.
- [ ] R5-2 `bg-dark-bgPrimary` (37) -> `bg-dark-bg`/`bg-dark-bgSecondary`;
      `text-text-tertiary` (26) -> `text-text-muted`.
- [ ] R5-3 CI check failing on any colour class outside the `CLAUDE.md`
      allowlist.
- [ ] R5-4 `MobileTabBar.tsx:3` comment describes what renders.
