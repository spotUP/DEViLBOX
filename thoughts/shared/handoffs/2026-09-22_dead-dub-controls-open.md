---
date: 2026-09-22
topic: Dub deck controls going dead after a few seconds — open
tags: [dub, dubbus, session-restore, hively, open]
status: resolved — root cause was the starved dub bus
---

# Dub deck controls go dead after a few seconds — INTERMITTENT

**RESOLVED (`8e00ca17d`), and it was never about the controls.**

The dub bus was starved: with the song playing at insertIn 0.076 the bus read
busInput 0.000001. The worklet's `play()` opens with `teardownAllDubSlots_()`,
and the engine restored the slots on a blind `setTimeout(..., 100)` counted
from when it POSTED the play message — a 400 KB module instantiates slower
than that, so the teardown wiped the slots the rebuild had just made, and the
rebuild is single-shot. Nothing reached the bus for the rest of the song.

That is why the deck felt dead and then "worked for some seconds": the buttons
were firing all along, into a bus with no input. Toggling any channel send
repaired it, which is what made it look intermittent.

The worklet now posts `playReady` once the module exists and the engine
rebuilds then; the timer stays at 400 ms only as a backstop for a cached
worklet. Owner confirmed after the fix: "the power is back".

The lead recorded below about two songs loading per boot is still real and
still unfixed — it is just not what caused this.

Reported while testing the responsive/pointer work: "the channels sliders are
dead", "many of the dub deck buttons are too", then "it worked for some
seconds".

## What is measured, not guessed

- The dub ENGINE is fine. `fire_dub_move` with `moveId: echoThrow` returned
  `{ fired: true, heldHandle: "dh1" }` and `release_dub_move` released it.
  So the failure is above the engine.
- `useDrumPadStore.dubBus.enabled` is `true` (read through
  `get_dub_bus_state.storeSettings`, which reads that store directly), so the
  controls are NOT gated off by an unarmed bus.
- `Fader.tsx` — what the dub deck's channel faders use — has NO commit from
  2026-09-22. Last touched in `20d945575`.
- `DubDeckStrip.tsx` was not part of the pointer conversion; it was never on
  the mouse-only allowlist.
- No modal or overlay: `get_modal_state` returns all null.

## The lead worth chasing first

Every boot loads TWO songs. The console shows the crash-recovery restore
bringing back `Cannabusiness` (classic MOD), and then `loadSongFile`
(`UnifiedFileLoader.ts:865` → `App.tsx:1198`) loading `amanda` (Hively) over
the top of it. During that swap:

    [DubBus] setSettings enabled=false
    [DubBusCtrl] unwireMasterInsert     (masterInsert=true → torn down)
    [DubBus] setSettings enabled=true
    [DubBusCtrl] wireMasterInsert

and `[ChannelRoutedEffects] Dub channel 0..3 activated` fires four separate
times.

That is the shape of "it worked for some seconds": the user interacts with the
first song, the second load lands, and the bus is unwired and rewired
underneath the mounted deck. Whether the deck's handles survive that re-wire
is the thing to check.

Second observation from the same boot: `[HivelyWorklet] render player=0 n=128
max=0.000000` repeatedly — amanda renders silence. May be unrelated, may be
the same re-wire.

## Ruled out (each was checked, not assumed)

- iPhone device emulation. The `OffscreenCanvas worker skipped (iOS...)` line
  only appeared when the console was opened; the failing boots show
  `editorMode="classic"` and no iOS line.
- The Maschine. No device is connected (`[nihia] HID open failed`, `HID
  reader: no device`).
- A bisect against `fc6cce436` (before today's 9 commits) is INCONCLUSIVE by
  the owner's judgement: slider fixes landed today, so the old build fails for
  a different reason.

## Next steps, in order

1. Instrument the song-swap path: why does a restore load a second song at
   all? One of `useProjectPersistence.ts:1076` (restore) and `App.tsx:1198`
   (load) should win, not both.
2. Watch `DubDeckStrip`'s held-move handles across `unwireMasterInsert` /
   `wireMasterInsert`. If the deck keeps a reference to a node that the
   re-wire replaced, its controls would go inert exactly as described while
   the engine still answers MCP.
3. Only then look at today's commits.

## Today's commits (all on local main, unpushed)

`3359e180f` viewport/modal · `9f534e2b5` knob+pitch faders to pointer ·
`c886c352d` automation lanes · `1bb988021` editors/pads · `ac08caa99`
hardware UIs · `ab654b0c8` one tracker tree · `8c095490c` three phone-test
fixes · `4b5ddcd6b` master volume through the store · `6f5f00b46` Maschine
bridge stops inventing knob values.
