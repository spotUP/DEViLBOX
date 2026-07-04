---
date: 2026-04-20
topic: dub-studio-demo-session
tags: [handoff, dub, audio, furnace, loading-paths]
status: draft
---

# Session Handoff — Dub Studio Demo + Loading-Path Regressions

## Task(s)
Started as a feature-by-feature demo of the Tracker Dub Studio (Phase 4 validation). Turned into a multi-bug investigation when the demo exposed real regressions.

## Bugs Shipped (fixed this session)

### 1. DubBus disable didn't fully drain (`src/engine/dub/DubBus.ts`)
On `setSettings({ enabled: false })`, only `return_.gain` was ramped to 0. Echo intensity, spring wet, and input gain stayed at their settings values, so the feedback loop kept running on stale buffer content. Any path re-opening the return (drain bug, re-enable) leaked a stale tail. **Fix:** the enable-flag handler now ramps input gain to 0 (40ms), zeros echo intensity, zeros spring wet; the later unconditional `echo.setIntensity / setSpringWet / echo.wet = merged.*` writes are gated on `this.enabled` so a disabled bus can't revive its own loops.

### 2. VOICE presets had no audible effect (`src/stores/useDrumPadStore.ts` + `src/engine/dub/DubBus.ts`)
Preset overrides were applied only to `bus.settings` internally. Store kept factory values. Mirror effect (`useEffect → setDubBusSettings` on every render) then re-wrote store defaults to the bus, silently clobbering the preset. **Fix:** store's `setDubBus` now merges the preset's overrides into the store state when `patch.characterPreset` is non-custom. DubBus `_applyCharacterPreset` trimmed to just DSP-only bits (spring params + tape-sat curve rebuild) and gated on a `_lastAppliedPreset` transition.

### 3. DubDeckStrip clipped off-screen (`src/stores/useDubStore.ts` + `src/components/dub/DubDeckStrip.tsx` + `src/stores/useUIStore.ts`)
Strip's header row (Bus ON/OFF, REC, VOICE, KILL) was clipped by the pattern editor on compact layouts. **Fix:** added `stripCollapsed` state (default true), chevron toggle on `DUB DECK ▸` label, body rows gated behind `!stripCollapsed`. Auto-layout: flipping Bus ON↔OFF now auto-expands strip AND toggles `editorFullscreen` (hides tracker toolbars for max room). Only fires on transition, not mount, to avoid view-cycling on a persisted-enabled bus.

### 4. DubFullScreenMode overlay removed (`src/components/tracker/TrackerView.tsx`)
The gig-shell overlay (`DubFullScreenMode.tsx`) was visually horrible — pattern editor bleeding through with blurry overlap. User's preference was to kill it. Deleted the component file, backtick keybind, `DUB MODE` button, `fullScreen` / `setFullScreen` store fields, and the mount point. Test case updated (`src/stores/__tests__/useDubStore.test.ts`).

### 5. Permanent dev-mode `[unhandledrejection]` probe (`src/main.tsx`)
Empty-message `UnhandledRejection: ""` lines in smoke-test output had no source. **Shipped:** structured handler that emits `console.error('[unhandledrejection] type=X name=Y reason=Z\n<stack>')` — synthetic stack when reason isn't an Error. Dev mode also appends to `window.__capturedRejections`. Existing `get_console_errors` MCP tool grep-friendly. Tester verified: flow 05 can be re-added with inline stacks.

### 6. AutoGain default → OFF (`src/stores/useAudioStore.ts`)
`AutoGainController` was applying ±12 dB proportional bus corrections by default. On chiptune formats (Genesis, C64) that already peak near 0 dBFS, +10–12 dB means clipping. Default flipped to `false`; mixer UI still has the toggle for sample-heavy mixes.

## Critical References
- `src/engine/dub/DubBus.ts:1094-1157` — enable/disable flag handling + gate
- `src/stores/useDrumPadStore.ts:482-510` — preset-aware `setDubBus`
- `src/engine/dub/DubBus.ts:1208-1243` — DSP-only `_applyCharacterPreset` + last-applied gate
- `src/components/dub/DubDeckStrip.tsx:131-156` — auto-expand + editor-fullscreen on bus transition
- `src/main.tsx:86-132` — `[unhandledrejection]` probe
- `src/engine/tone/ChannelRoutedEffects.ts:625-717` — isolation engine resolver registry
- `src/lib/file/UnifiedFileLoader.ts:68-177` — import pipeline + libopenmpt path selection

## Open Bugs (NOT fixed)

### Task #11 — DJ deck native playback with WAV-driven beat sync (pre-existing, pending)
Research agents' dossiers ready; synthesis into plan not yet done.

### Task #26 — Demo walkthrough (in progress, stalled)
Blocked on audio regressions below. Dub bus dispatch and presets are verified working; move-firing and per-channel sends blocked by loading-path + gain-staging issues.

### Loading-path regression — MODs don't route through LibOpenMPT
Worked path: `load_file → writeHandlers.ts → importTrackerModule → native TS parser for .mod → applyEditorMode({libopenmptFileData: arrayBuffer})`. But `useFormatStore.getState().libopenmptFileData` is `null` after the load completes. `LibopenmptEngine.hasInstance()` stays false → no isolation engine → per-channel dub sends are no-ops. Not fixed this session — deferred because Furnace was supposed to be an isolation-capable alternative. User flagged **broader Modland-browser regressions** in the same area; worth a dedicated audit.

### Task #30 — Audio gain-staging audit (NEW)
Furnace multi-chip songs clip heavily. Genesis "All Good Times" demo peaks at +10 dBFS at `masterInput`. User recalls pre-gig output-level boosts to fix low DJ volumes — that boost is now pushing Furnace (POST_AMP Genesis=2x, multi-chip summation) through the ceiling. Live patches via `nativeEngineRouting` entry gain didn't help — suggests clipping may be inside the worklet output stream itself or on a different connection path (keepalive → destination?). Needs: bisect recent gain-staging edits, measure per-engine worklet output peaks, decide between a master limiter or per-engine gain calibration.

**What I tried and reverted:**
- Added `this._sharedGain.gain.value = 0.5` in `FurnaceDispatchEngine.getOrCreateSharedGain()` — HMR didn't pick it up on the live engine (engine constructed pre-edit), and full reload still showed distortion. **Reverted** so the file matches the pre-session state.

## Recent Changes (this session's commits / file edits — uncommitted)

Modified (per live `git status`):
- `src/engine/dub/DubBus.ts` — bus-disable drain fix (#1) + preset DSP-only refactor (#2)
- `src/stores/useDrumPadStore.ts` — preset-aware `setDubBus` (#2)
- `src/stores/useDubStore.ts` — `stripCollapsed` state, removed `fullScreen`
- `src/stores/__tests__/useDubStore.test.ts` — test swap
- `src/stores/useUIStore.ts` — added `setEditorFullscreen`
- `src/components/dub/DubDeckStrip.tsx` — collapse + auto-fullscreen
- `src/components/tracker/TrackerView.tsx` — remove DubFullScreenMode mount
- `src/main.tsx` — `[unhandledrejection]` probe
- `src/stores/useAudioStore.ts` — autoGain default false
- `src/components/dub/DubFullScreenMode.tsx` — **deleted**

## Learnings / Gotchas
- **HMR module duplication is severe in this codebase.** Zustand stores, engine singletons, and module-local `_engine` references all get cloned when a module is re-imported (even via dynamic `import()` in MCP eval). Live diagnostics frequently read state that doesn't match what the UI is rendering. Bias toward: UI-driven tests, hard reloads between probes, not imported modules.
- **Empty-message UnhandledRejections** are usually dynamic-import failures (stale Vite cache) or `Promise.reject()` with no arg. The new probe in `main.tsx` surfaces both kinds with a synthetic stack.
- **AutoGainController** auto-balances sample vs synth RMS with ±12 dB, which is WRONG for single-engine chiptune sources. Disabling it fixed the Genesis clipping mystery in a prior dubug attempt — but that's not the full story; Furnace is still loud post-autoGain-off.
- **Per-engine isolation (LibOpenMPT / UADE / Hively / Furnace)** is the foundation for per-channel dub moves. Any engine not routed as isolation means dub moves that need channel audio (SLAM, echoThrow) will fire but hear silence.
- **Siren self-oscillates bus feedback** independently of channel audio — useful as a "bus is alive" sanity check that doesn't depend on routing.

## Next Steps
1. **Root-cause Furnace clipping (Task #30).** Add per-worklet level probes, bisect recent gain-related commits, decide on a master limiter vs. per-engine recalibration. Until this is solved, chiptune demos will distort.
2. **Fix MOD → LibOpenMPT loading path.** `libopenmptFileData` should be populated in the format store for `.mod` files after `load_file`. Also audit Modland-browser loading regressions the user flagged.
3. **Resume demo walkthrough (Task #26)** once 1+2 are done. Most dub features verified working in isolation; only the last-mile "moves feeding bus" step is blocked on routing.
4. **Re-add flow 05 to ui-smoke.** Probe is live, tester is ready.
5. **Synthesize Task #11 plan** from the research dossiers waiting in context.

## Other Notes
- Task #16 (DubFullScreenMode gig shell) marked deleted — intentional, per user preference.
- Tests passing except unrelated `useClickOutside.test.tsx` TS6133 (unused `useRef`).
- User prefers DOM-first testing over MCP-eval diagnostics when HMR state may differ. Use UI button clicks via `document.querySelectorAll('button')` when debugging live flows.
