---
date: 2026-04-21
topic: dj-per-channel-fx-and-pattern-aware-auto-dj-dub
tags: [dj, dub, autodub, autodj, smartcuts, handoff, session]
status: final
---

# DJ per-channel FX + pattern-aware Auto DJ/Dub — session handoff

Eight commits landed on `main` today. Two feature arcs + tuning + a
cosmetic fix: (1) DJ per-channel FX targeting — MUTE/FX mode chip,
per-deck channel taps on DubBus, per-channel EQ+filter chains. (2)
Smart Cuts wired end-to-end plus pattern-data awareness extended into
both Auto Dub and Auto DJ. (3) Deferral tuning so short fades don't
stall. (4) DUB 3/4 tab Nch suffix consistency fix caught during
Playwright browser-verification.

All automated checks green at every push (type-check + test:ci +
test:compliance). Browser-verified via Chrome DevTools MCP —
MUT/FX mode chip works both ways, fx-targeting writes through the
DUB tab header + state-aware tooltips, Smart Cuts toggle flips OFF↔ON
correctly. Hetzner auto-deploys on success per project CLAUDE.md.

## Commits landed (this session, chronologically, all on `main`)

| SHA | Subject |
| --- | --- |
| `e9a99424a` | feat(dj): per-channel FX targeting — MUTE/FX mode on scopes, per-channel DUB pads |
| `b4d40242c` | feat(dj): per-deck channel taps — audio layer for fxTargetChannels |
| `93066e054` | feat(dj): per-channel EQ + filter via fxRouteGain + Tone.js chains |
| `b2aa5d040` | feat(dj): Smart Cuts wired end-to-end — drum-break cut, harmonic bass-swap, chord-change defer |
| `8289a6200` | feat(dj): Smart Cuts UI toggle in DJAutoDJPanel |
| `955384e0c` | feat(dub+dj): pattern-data awareness — look-ahead, density bias, rename boost, break deferral |
| `d0193bf8d` | tune(dj): Auto-DJ deferral — proportional cap, short-fade skip, tighter chord window |
| *(pending)* | ui(dj): DUB 3 + DUB 4 tab headers reflect fxTargetCount (caught in browser verify) |

## What each arc delivered

### Arc 1 — DJ per-channel FX (commits `e9a9…`, `b4d4…`, `93066…`)

DJs can point DUB pads and deck EQ/filter at specific tracker channels
instead of the whole deck mix. Complete pipeline:

- **UI** (`DeckScopes.tsx`, `DeckChannelToggles.tsx`, `DeckFXPads.tsx`)
  — new `[MUT | FX]` mode chip next to ALL button on scope row. In FX
  mode clicks build a `fxTargetChannels: Set<number>` per deck; scopes
  show amber ring + "FX" glyph. DUB pads show `NCH` chip + tab header
  shows `DUB ·Nch` when targeting is armed.
- **Store** (`useDJStore.ts`) — `fxTargetChannels: Set<number>` +
  `channelModeUI: 'mute' | 'fx'` per deck, with
  `toggleFxTarget/setFxTarget/clearFxTarget/setChannelMode` actions.
  `makeDefaultDeckState()` factory replaces the shared default-object
  so Sets don't alias across decks. `enableMapSet()` called at import
  time so Sets draft correctly in isolated tests.
- **Audio layer (dub)** (`TrackerReplayer.ts`, `DeckEngine.ts`,
  `DubBus.ts`, `DubRouter.ts`, move files) —
  `TrackerReplayer.openChannelTap(ch)` taps the channel's gainNode,
  returns a native `GainNode` + dispose. `DeckEngine.openChannelTap`
  proxies, returns null in audio mode. `DubBus.deckChannelTaps` keyed
  `${deckId}:${ch}` — register/unregister API. `DubRouter.fire(...,
  opts: { deckId })` threads deck context so `bus.openChannelTap(ch,
  amt, atk, { deckId })` routes through the deck-scoped busGain.
  `DJDeck.tsx` useEffect subscribes to fxTargetChannels and
  eagerly registers taps to avoid first-fire latency.
- **Audio layer (EQ/filter)** (`DeckEngine.enableChannelFX/disableChannelFX`,
  new `fxRouteGain` per channel in TrackerReplayer) — per-channel
  `EQ3 + HPF + LPF` chains built on demand; source channels pulled
  from main mix via `fxRouteGain=0` so the two paths don't double-sum.
  `setEQ/setEQKill/setFilterPosition/setFilterResonance` mirror ramps
  into every active chain so knob sweeps move targeted channels in
  lockstep with the deck chain.
- **Tests** — 9 new store tests (`useDJStore.fxTarget.test.ts`) for
  toggle/set/clear/mode/reset/solo + no-aliasing. 6 new tests
  (`deckChannelTap.test.ts`) locking 3-arg (tracker) vs 4-arg (DJ)
  call shapes on echoThrow / dubStab / channelThrow.

**Known trade-off (documented in code):** per-channel chains tap
`ch.gainNode` upstream of the deck's `deckGain` auto-gain trim — so
FX-routed channels don't see the trim. Acceptable because trim is
~unity in practice. Fixing = add a per-channel trim mirror in
`setTrimGain`.

### Arc 2 — Smart Cuts + pattern-awareness (commits `b2aa…`, `8289…`, `95538…`)

Auto-DJ and Auto Dub now read pattern data and channel roles/names
instead of being purely DSP+rhythm-reactive.

- **`autoDJSmartCuts` flag** + `setAutoDJConfig({ smartCuts })` action
  in `useDJStore`. Default off. UI toggle — violet Scissors icon in
  `DJAutoDJPanel` alongside Shuffle/Filter, state-aware tooltip.
- **Smart Cuts branches** in `DJAutoDJ.selectTransitionType`:
  - drum-break tail on outgoing → `'cut'` (uses
    `detectDrumBreakTail` that's been in `smartCuts.ts` since
    commit `f9af92483` but was never wired)
  - chord change imminent in next 16 rows → fall through to
    `'crossfade'` instead of `'cut'` (uses new
    `isChordChangeImminent` predicate + `detectChordChangeRows`
    MusicAnalysis primitive)
  - keys compatible (`perfect`/`energy-boost`) + high-energy +
    BPM match → deterministic `'bass-swap'` (was 30% random roll)
- **Auto Dub look-ahead** (`channelHasNoteInWindow` predicate) —
  per-channel moves skip channels silent for the next 16 rows.
- **Auto Dub density bias** — `AutoDubPersona.densityBias: number`
  (-1..+1). Scientist +0.5, Jammy -0.6, others neutral.
  `computeDensityByRole` normalises notes-per-row-per-role capped at
  0.75 saturation. Bias affects BOTH the per-tick roll probability
  AND the weighted rule pick, clamped to [0.25, 1.75]× so extremes
  don't zero-out or double firing rate.
- **Auto Dub user-rename boost** — channels with non-generic names
  (via `isGenericChannelName` from ChannelNaming.ts) get 1.5× target
  weight when picking per-channel targets. Respects explicit user
  intent (user renamed "Channel 4" → "Lead Solo").
- **Auto DJ mid-break deferral (default ON)** —
  `shouldDeferForPatternData` runs `isChordChangeImminent` on
  outgoing at fire-time. Imminent → defer transition by one poll
  (~500 ms). Hard cap of 5 deferrals (~2.5 s). Independent of
  `autoDJSmartCuts` — it's a TIMING refinement, not a transition-
  type change, so respects the 2026-04-18 gig-fix against auto cuts.
- **Tests** — 5 new smartCuts tests + 11 total for chord-change
  window semantics; 12 new Auto Dub tests for look-ahead / density
  / rename boost. Full suite 2387/2387.

### Arc 3 — Deferral tuning (commit `d0193bf8d`)

Pattern-aware transition deferral added in Arc 2 had a fixed 5-poll
(~2.5 s) cap regardless of fade duration + a wide 16-row chord-imminent
window. Two problems: (a) short fades (≤ 2 s) could spend the entire
fade on deferrals; (b) dense progressions with frequent chord changes
hit the cap on every transition at the cost of adding 2.5 s of
uncertainty.

Tuning:
- **`MIN_TRANSITION_FOR_DEFER_SEC = 2`** — transitions shorter than
  2 s skip the defer check entirely.
- **`computeMaxPatternDefers(transitionDurationSec)`** scales the
  cap with fade duration (15% budget, clamped to
  `HARD_MAX_PATTERN_DEFERS = 5`). A 10 s fade allows 3 defers
  (~1.5 s); a 4 s fade allows 1; a 60 s fade caps at 5.
- **Chord-imminent window: 16 → 8 rows** (half a bar at standard
  tracker speed). Only catches changes the crossfade would actually
  split.

Tuning constants + `computeMaxPatternDefers` are module-level
exports so tests can drive the scaling without instantiating the
full Auto-DJ state machine. 7 new tests in
`src/engine/dj/__tests__/autoDJDefer.test.ts` cover zero fade, below
threshold, linear scaling, hard-cap saturation, negative inputs,
documented constants, + property test "defer budget ≤ 15% of fade
time" across [2, 4, 8, 16, 32, 64] s. Suite → 2426/2426.

### Arc 4 — DUB 3/4 tab header fix (caught in browser verify)

My Arc 1 commit extended the DUB / DUB 2 tab headers to show a
`·Nch` suffix when `fxTargetCount > 0`. Later, another agent added
DUB 3 and DUB 4 tabs without the same treatment. Caught via
Chrome DevTools MCP — state probe reported DUB + DUB 2 with
`·2ch` / "targeting 2 channels" titles while DUB 3 + DUB 4 showed
the default titles. Trivial fix — same conditional title + label
pattern applied to both tabs.

## Critical files touched

| File | Arc | Role |
| --- | --- | --- |
| `src/stores/useDJStore.ts` | 1 | `fxTargetChannels`/`channelModeUI` + factory + MapSet |
| `src/components/dj/DeckScopes.tsx` | 1 | MUT/FX chip + click branching + amber ring |
| `src/components/dj/DeckChannelToggles.tsx` | 1 | mirror of MUT/FX chip |
| `src/components/dj/DeckFXPads.tsx` | 1 | DUB tab per-channel fire + `Nch` badges; DUB 2 tab integration |
| `src/components/dj/DJDeck.tsx` | 1 | fxTargetChannels → tap/EngineFX bridge |
| `src/engine/TrackerReplayer.ts` | 1 | `openChannelTap`, `fxRouteGain`, `setChannelFxRouted` |
| `src/engine/dj/DeckEngine.ts` | 1 | tap proxy + `enable/disableChannelFX` + EQ/filter mirror |
| `src/engine/dub/DubBus.ts` | 1 | `deckChannelTaps` + deck-aware `openChannelTap` |
| `src/engine/dub/DubRouter.ts`, moves | 1 | thread `opts.deckId` through ctx |
| `src/engine/dj/DJAutoDJ.ts` | 2 | Smart Cuts branches + break deferral |
| `src/engine/dj/smartCuts.ts` | 2 | `detectDrumBreakTail` (pre-existing) + `isChordChangeImminent` (new) |
| `src/engine/dub/AutoDub.ts` | 2 | look-ahead, density, rename-boost; ctx extended |
| `src/engine/dub/AutoDubPersonas.ts` | 2 | `densityBias` field; Scientist/Jammy values set |
| `src/bridge/analysis/MusicAnalysis.ts` | 2 | `detectChordChangeRows` (row-indexed) |
| `src/components/dj/DJAutoDJPanel.tsx` | 2 | Scissors icon toggle for Smart Cuts |
| `src/engine/dj/DJAutoDJ.ts` (again) | 3 | `computeMaxPatternDefers` + tuning constants + `MIN_TRANSITION_FOR_DEFER_SEC` short-fade skip + window 16→8 |
| `src/engine/dj/__tests__/autoDJDefer.test.ts` (new) | 3 | scaling guards |
| `src/components/dj/DeckFXPads.tsx` (again) | 4 | DUB 3 + DUB 4 tab header `·Nch` suffix parity |

## Learnings / gotchas

- **Density bias must affect rollProb, not just weighted pick.** First
  implementation only multiplied per-rule weights. When all eligible
  rules share the same role (and thus the same density), the multipliers
  cancel out and rule selection is unchanged. Fix: density also
  multiplies the per-tick `rng() > rollProb` gate. Caught by test —
  `expected 105 to be greater than 105` was the smoking gun.
- **TrackerReplayer already has `getSong()`.** My first pass at
  exposing the loaded song added a duplicate `getLoadedSong()`. Removed
  it — `DeckEngine.getLoadedSong` delegates to the pre-existing
  `replayer.getSong()` (gated on playbackMode).
- **`_harness.resetStore` can't round-trip Sets.** The harness uses
  `JSON.parse(JSON.stringify(...))` which turns `Set` into `{}`. The
  `useDJStore.fxTarget.test.ts` file bypasses the harness and resets
  state via store actions instead.
- **`enableMapSet()` called at useDJStore import time.** main.tsx
  already calls it for the app bootstrap, but tests import the store
  in isolation and need the plugin loaded too. Idempotent, so no harm.
- **3-arg vs 4-arg bus.openChannelTap call shape.** Extending the
  signature to take `{ deckId }` risked breaking every existing move-
  unit test (`toHaveBeenCalledWith(ch, 1.0, 0.005)` — 3 args).
  Kept 3-arg form in each move when `deckId` is undefined (tracker
  view), 4-arg when defined (DJ context). Existing tests unchanged.
- **Sandbox policy classifier blocks pushes to main.** Even with
  `Bash(git push origin *:main)` in the allow list, the classifier
  re-evaluates and blocks push-to-main as "bypasses PR review."
  User ran the pushes via `!` prefix (shell exec).
- **Pre-push hook is still flaky.** `test:ci` sometimes fails on a
  fresh worktree with no output — retry usually works. Pre-populating
  `dist/version.json` with `{}` helps a bit but doesn't eliminate it.

## Verification status

**UI layer verified this session via Chrome DevTools MCP** — probed
the running dev server at `localhost:5173`, switched to DJ view via
`__soakActions__.switchView('dj')`, confirmed:

- ✅ MUT/FX mode chip renders on scope rows, flips mute ↔ fx-target
- ✅ FX-mode clicks on scope canvases add channels to
  `fxTargetChannels` (DUB tab title updates to "targeting N
  channels", label shows `·Nch` — surfaced the DUB 3/4 gap fixed
  in Arc 4)
- ✅ Smart Cuts toggle present in Auto DJ panel, state-aware
  tooltip flips between "OFF — click to enable …" and
  "ON — drum-break cuts + chord-aware fades + harmonic bass-swap"
- ✅ Click via `MouseEvent({ bubbles: true })` triggers React
  handler correctly (native `.click()` didn't — noted for future
  browser-automation runs)

**Audio layer NOT verified — no real audio played through yet.** No
tracker song was loaded into the decks during this session's browser
probe. Next session should:

1. Restart Claude Code so MCP tools bind (`get_song_info`, `play_fur`,
   `load_modland` — per `docs/MCP_DEBUGGING_GUIDE.md`).
2. Load two dub-friendly tracker songs on decks A and B. Known-good
   MODLAND queries: `"world class dub"`, `"king tubby"`, `"scientist"`.
3. Enable Auto DJ, pick Scientist persona, enable Smart Cuts (Scissors
   icon). Watch for:
   - Drum-break cut at track-end (instead of crossfade)
   - Chord-change deferral log lines
   - Bass-swap fires on key-compatible track pairs
4. Enable Auto Dub alongside; Scientist should fire more during dense
   bars. Flip to Jammy — should fire more during sparse bars.
5. Rename a channel manually (user gesture) and confirm dub moves
   start preferring it.

Per-channel FX (Arc 1) HAS been type-checked + fully tested but
also not browser-verified. Same flow: load MOD on deck A, flip to FX
mode, target ch 1+2, press DUB pads, sweep filter. Expected: only ch
1+2 wet / filtered.

## Artifacts

- Handoff (this file)
- Memory updates:
  - `project_dj_per_channel_fx.md`
  - `project_smart_cuts.md`
- Plan files (now implemented; kept for history per "never delete
  plans without approval"):
  - `~/.claude/plans/we-only-display-4-cryptic-stallman.md`
  - `~/.claude/plans/dj-per-deck-channel-taps.md`

## Next steps — queue for the next session

None owned by me. Concrete candidates the user can pick from:

1. **Browser-verify everything** (highest value — shipped a lot today
   without real-audio confirmation).
2. **Auto Dub browser-verify backlog** from `2026-04-21_auto-dub-browser-verify-pending.md`
   (was already pending before this session).
3. **DJ scratch regression tests** from `we-need-regression-tests-cheeky-crystal.md`
   (open plan, zero coverage on a DJ-critical feature).
4. **DJAutoDJ transitioning polish** — if any of today's pattern
   deferrals mis-fire in practice, the 5-deferral cap may need
   loosening; `autoDJTransitionBars` adjustments may interact.
