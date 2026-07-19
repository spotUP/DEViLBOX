---
date: 2026-04-17
topic: dj-panic-button
tags: [dj, panic, keyboard, safety, gig]
status: draft
---

# DJ View — Panic Button (ESC Key)

## Problem

At a live gig, any of dozens of FX/drumpad state can get stuck and drown out the
song: master FX chains misfire, drumpad samples loop, EQ kills stay down, a
filter sweep holds, a fader LFO runs, mic/PTT stays hot. The DJ needs a single
recovery action that silences everything except the playing songs.

First production use of DJ view is **April 18** (day after this spec is written).

## Goals

- One key (ESC) resets all "stuck-able" DJ state to neutral.
- Deck playback (song audio, positions, volumes, crossfader) is never touched.
- No visual feedback — audio stopping is the confirmation.
- Modals take ESC priority (existing behavior via `stopPropagation`).

## Non-goals

- No physical panic button in the UI.
- No toast, flash, or other visual indicator.
- No "undo panic" or state-restoration feature.
- No global (cross-view) panic changes — only the DJ view gets this binding.

## Scope — What Panic Kills vs. Keeps

### Killed (reset to neutral)

| Subsystem                       | Reset action                                  |
|---------------------------------|-----------------------------------------------|
| Master FX chain                 | `useAudioStore.setMasterEffects([])`          |
| Drumpad samples playing         | `DrumPadEngine.stopAll()`                     |
| Drumpad note repeat             | `NoteRepeatEngine.stopAll()`                  |
| Quantized FX sweeps / LFOs      | `cancelAllAutomation()` (DJQuantizedFX)       |
| Per-deck fader LFO              | `stopDeckFaderLFO(deckId)`                    |
| Per-deck EQ kills (lo/mid/hi)   | `setDeckEQKill(deckId, band, false)` × 3      |
| Per-deck filter                 | `setDeckFilter(deckId, 0)`                    |
| Per-deck echo-out               | toggle off if currently active                |
| Per-deck line loop              | `clearDeckLineLoop(deckId)`                   |
| Per-deck channel mute mask      | `setDeckChannelMuteMask(deckId, 0)`           |
| Per-deck slip mode              | `setDeckSlipEnabled(deckId, false)`           |
| Per-deck pitch / key-shift      | `setDeckPitch(deckId, 0)`                     |
| Per-deck scratch                | `stopScratch(deckId, 50)` (fast decay)        |
| Mic (if on)                     | `toggleMic()` (fire-and-forget)               |
| Vocoder PTT                     | `useVocoderStore.setPTT(false)`               |

"Per-deck" = A, B, and C (only if `thirdDeckActive`).

### Kept untouched

- Deck play/pause state, positions, audio volumes, trim gains
- Beatgrid, BPM, sync state
- Loaded tracks and cue points
- Master volume, **crossfader position**, PFL/headphone cue routing
- AutoDJ state
- Key lock — N/A, feature removed from codebase

## Implementation

### New function

`djPanic()` in `src/engine/dj/DJActions.ts`, placed next to the existing
`killAllDecks()` function. Orchestrates all subsystem resets in a single call.

Pseudo-code:

```ts
export function djPanic(): void {
  const state = useDJStore.getState();
  const decks: DeckId[] = state.thirdDeckActive ? ['A', 'B', 'C'] : ['A', 'B'];

  useAudioStore.getState().setMasterEffects([]);
  DrumPadEngine.getInstance()?.stopAll();
  NoteRepeatEngine.getInstance()?.stopAll();
  cancelAllAutomation();

  for (const d of decks) {
    stopDeckFaderLFO(d);
    setDeckEQKill(d, 'low', false);
    setDeckEQKill(d, 'mid', false);
    setDeckEQKill(d, 'high', false);
    setDeckFilter(d, 0);
    clearDeckLineLoop(d);
    setDeckChannelMuteMask(d, 0);
    setDeckSlipEnabled(d, false);
    setDeckPitch(d, 0);
    stopScratch(d, 50);
    if (state.decks[d].echoOutActive) echoOut(d);
  }

  if (useDJSetStore.getState().micEnabled) {
    void toggleMic();
  }
  useVocoderStore.getState().setPTT(false);
}
```

### ESC binding

Add a new case to the main key switch in
`src/components/dj/DJKeyboardHandler.tsx` (not the Ctrl-combo block):

```ts
case 'escape':
  djPanic();
  return true;  // consume event
```

### Modal priority is automatic

`DJKeyboardHandler` is registered via `registerViewHandler` in
`src/engine/keyboard/KeyboardRouter.ts`. Modals (DJPlaylistModal,
HeadphoneSetupDialog, DJSetBrowser, DJPlaylistPanel) attach their own keydown
listeners that call `stopPropagation` before the view handler runs, so ESC on an
open modal dismisses the modal and never reaches `djPanic`. No explicit
open-modal check needed.

## Files Touched

| File                                             | Change                                 |
|--------------------------------------------------|----------------------------------------|
| `src/engine/dj/DJActions.ts`                     | Add `djPanic()` export                 |
| `src/components/dj/DJKeyboardHandler.tsx`        | Add `case 'escape'` → `djPanic()`      |

No new files. No store changes. No UI component changes.

## Verification

### To confirm during implementation (not decided)

- Exact name of the echo-out active flag on `DeckState` (spec uses
  `echoOutActive` as a placeholder — verify in `useDJStore.ts`).
- Whether `DrumPadEngine` and `NoteRepeatEngine` expose `getInstance()` or use
  a different singleton accessor.
- Whether `setDeckChannelMuteMask(deckId, 0)` means "no channels muted"
  (bit = muted).

### Automated checks

- `npm run type-check` passes.

### Manual verification

1. Load a track on Deck A, start playback.
2. Add master FX (e.g., Big Muff).
3. Trigger a drumpad sample that loops (echo pad).
4. Hold an EQ-kill pad; engage filter sweep; engage fader LFO; enable slip.
5. Press ESC.
6. Expected: deck A still plays at same volume/position; master FX cleared;
   drumpad silent; EQ kills visually off; filter centered; LFO stopped; slip
   off.
7. Open DJPlaylistModal → press ESC → modal closes, no panic fired
   (verify by keeping master FX active before opening modal; it should still
   be active after modal dismissal).

## Out of Scope

- Global/cross-view panic behavior changes.
- Adding panic logic to other views (tracker already has double-ESC panic).
- State-restoration / "undo panic" UI.
- Any changes to Key lock (feature removed).
