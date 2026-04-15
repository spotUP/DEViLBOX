# Handoff — Tour Polish & Generic Synth Editor Layout

**Date:** 2026-04-15
**Branch:** `main` (all committed and pushed)

## What Was Done This Session

### 1. Infinite Recursion Bug — ROOT CAUSE FIX (commit `31976e6a7`)

**The bug:** When `suppressFormatChecks()` is active (e.g. during the guided tour), any store method that checks format limits would enter an infinite microtask loop:

```
addCurve() → checkFormatViolation() returns true (suppressed) → .then(ok => addCurve()) → ∞
```

This affected `useAutomationStore.addCurve`, `useInstrumentStore.createInstrument`, `useTrackerStore` (patterns/channels/positions), and `useTransportStore` (BPM/groove).

**The fix:** `getActiveFormatLimits()` in `src/lib/formatCompatibility.ts` now returns `null` when `_suppressDepth > 0`. Since ALL call sites guard with `if (limits && ...)`, this short-circuits the entire check — no recursion possible. One fix covers every store.

### 2. TB303 Editor Not Showing in Tour (commit `e68c89b21`)

**The bug:** `createAndSelectInstrument('TB303', 'Acid Bass')` only passed `{ synthType, name }` to the store. The default instrument has no `tb303` sub-config, so `SynthTypeDispatcher` (which checks `instrument.tb303` truthy) rendered nothing.

**The fix:** `createAndSelectInstrument()` in `tourScript.ts` now provides `{ ...DEFAULT_TB303 }` as the `tb303` config when creating TB303/Buzz3o3 instruments.

### 3. Earlier This Session (already committed)

- **Format check suppression** wrapping entire tour (`suppressFormatChecks`/`restoreFormatChecks`)
- **Speech synth pad demo** fixed (pads 13-14, bank A, dectalk config)
- **AHX loading** through native parser path (bypass libopenmpt)
- **Sample pitch fix** (use instrument's `baseNote` not hardcoded C4)
- **Interactive sample editor demo** (8 operations with before/after playback)
- **Music ducking** during speech (DJ master → 0.25, tracker → -18dB)
- **DJ track loading** via `loadUADEToDeck()` (correct path for tracker modules)

---

## OPEN ISSUE: Generic Synth Editor Layout

**User request:** The generic synth editor (used by MonoSynth, DuoSynth, Synth, FMSynth, PluckSynth, etc.) has Oscillator, Pitch Env, Output panels stacked full-width. User wants them in **two columns**.

**NOT tour-related — this is a standalone UI layout fix.**

### Current Architecture

- `MonoSynth` → `getEditorMode()` returns `'generic'` (fallback)
- `UnifiedInstrumentEditor.tsx` line 329: `if (editorMode !== 'generic')` dispatches to SynthTypeDispatcher; otherwise renders the generic editor
- Generic editor calls `renderAllSections()` from `VisualSynthEditorContent.tsx`
- The outer grid (`div.synth-all-sections` in `src/index.css:2690`) is already `grid-template-columns: 1fr 1fr`
- BUT the inner "controls" section (Oscillator + Pitch Env + Output) is a single `<section>` with `space-y-4`, so all three sub-sections stack vertically within one grid cell

### What Needs To Change

The three sub-sections inside the "controls" panel need to be arranged in two columns. Options:

**Option A (recommended):** Split Oscillator+Output into separate grid items at the top level (alongside env-filter, mod, special). Currently there are ~4 sections in the outer 2-col grid. Making Oscillator and Output separate sections would let the grid naturally arrange them.

**Option B:** Make the inner "controls" section itself a 2-column grid instead of `space-y-4`.

### Key Files

| File | What |
|------|------|
| `src/components/instruments/editors/VisualSynthEditorContent.tsx` | `renderAllSections()` — builds the section array |
| `src/index.css:2690` | `.synth-all-sections` grid CSS |
| `src/components/instruments/editors/UnifiedInstrumentEditor.tsx:357` | Generic editor container |

### Important: Don't Touch

- TB303 editor (`editorMode === 'tb303'`) — user explicitly said don't touch
- Any other synth-specific editors in `SynthTypeDispatcher.tsx`
- Tour code (this is not tour-related)

---

## Tour Status Summary

The guided tour is feature-complete with these demo sections:
1. ✅ Welcome
2. ✅ Tracker — loads AHX chiptune, shows pattern editor
3. ✅ Instruments — creates DuoSynth, opens editor, plays notes
4. ✅ TB303 — creates acid bass, opens 303 editor, plays acid sequence
5. ✅ Sample Editor — interactive demo (reverse, normalize, fade, exciter, etc.)
6. ✅ DrumPads — shows pads, triggers 808/909 sounds, speech synth demo
7. ✅ DJ Mixer — loads 3 tracks via Modland search + local files, crossfade demo
8. ✅ Automation — sine wave on volume, sawtooth on filter
9. ✅ Mixer view
10. ✅ Closing

### Known Tour Issues (minor, not blocking)

- DJ tracks other than Jogeir Liljedahl may still have playback issues depending on UADE cache state
- Speech phonemization could be improved (user noted "mussick" pronunciation)
- Subtitle fade has a slight two-step appearance

### Key Tour Files

| File | Lines | Purpose |
|------|-------|---------|
| `src/engine/tour/tourScript.ts` | ~1360 | All tour steps + helper functions |
| `src/engine/tour/TourEngine.ts` | ~500 | Orchestrator, speech, FX, ducking |
| `src/components/tour/TourOverlay.tsx` | ~200 | Subtitle bar + controls |
| `src/stores/useTourStore.ts` | ~50 | Tour state (Zustand) |
| `src/lib/formatCompatibility.ts` | ~320 | Format suppression (root recursion fix) |
