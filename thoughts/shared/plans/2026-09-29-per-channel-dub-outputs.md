---
date: 2026-09-29
topic: Per-channel dub sends (and isolation) for every engine
tags: [dub, audio, engines, worklets, isolation]
status: draft
---

# Per-channel dub outputs for every engine

Owner go: 2026-09-29 ("all engines should be able to support it" / "yes!").

## Problem

A dub send on channel N needs channel N's audio as its own signal. Only
libopenmpt, Hively, UADE and Furnace expose it (AudioWorklet outputs
5..36). Every other engine mixes inside its worklet, so the dub bus can only
take the whole mix (fallback, 613d703c0) and "throw channel 2" throws
everything.

## What exists (research 2026-09-29, two survey agents)

Output contract (ChannelRoutedEffects.ts:57,87; LibopenmptEngine.ts:137):
37 stereo outputs - 0 main mix, 1..4 isolation slots (channel REMOVED from
0, fed to a per-channel effect chain / sidechain tap), 5..36 dub sends (a
COPY; channel stays in 0). Messages `dubChannelEnable/Disable/DisableAll`,
`addIsolation/removeIsolation` (dubChannelMessage sends both `cmd` and
`type`). Engines implement IsolationCapableEngine; resolvers are keyed by
editorMode.

Per-channel audio already present at render time:
- 20 routed template engines (SoundControl, DeltaMusic1/2, RonKlaren,
  Actionamics, ActivisionPro, Synthesis, Dss, SoundFactory2, FaceTheMusic,
  FredReplayer2, Oktalyzer, InStereo1/2, FutureComposer, QuadraComposer,
  SoundMon, DigMug, DavidWhittaker, SonicArranger) + 3 unwired (Voodoo, Gmc,
  SoundFx): `_xx_render_multi` Float32 per voice, bit-exact, the main output
  IS their sum. JS-only change.
- TFMX (Hippel / TFMX / 7V), Sonix, Cinter4: Int16 per-voice scope written in
  the same render call, after volume, before pan (TFMX: before LED filter).
  JS-only for dub copies.
- SunTronic: per-voice Float32 on the main thread, resampled in a worklet -
  needs per-voice rings (architecture work).

Known defects found on the way:
- UADE isolation does not remove the channel from output 0 (plays twice),
  UADE.worklet.js:2203-2210.
- PreTracker is claimed by the classic resolver but has 5 outputs, so dub
  connects throw (resolver now gated to PreTracker songs, commit after
  613d703c0).
- Furnace re-renders per dub/isolation slot without saving chip state
  (UNVERIFIED: may advance emulation).

## Decisions

- D1 Resolution follows the engine that is PLAYING, not the editor mode:
  NativeEngineRouting registers the started engine as the active isolation
  engine when it implements IsolationCapableEngine; cleared on stop. Mode
  resolvers stay as fallback for engines started elsewhere (libopenmpt,
  Hively, Furnace, UADE).
- D2 IsolationCapableEngine gains `supportsDubSends(): boolean` so an
  isolation-only engine (PreTracker) is not used for dub sends; the dub bus
  falls back to the whole mix for it.
- D3 One shared worklet helper, `public/worklets/channel-outputs.js`
  (loaded like channel-stream.js by WASMSingletonBase), owns the dub /
  isolation message handling and output filling; each worklet only hands it
  per-voice buffers and its pan law.
- D4 Dub sends are mono per voice written to both sides (UADE convention).
  A muted channel sends nothing (template C zeroes muted voices; UADE does
  the same) - documented, not changed.
- D5 Isolation (outputs 1..4) for template engines: the channel is removed
  from output 0 by summing only non-isolated voices in JS (main = sum of
  voices, so no C change).

## Phases (checklist)

- [x] P0 D1+D2: active-engine registration in NativeEngineRouting,
      `supportsDubSends`, getActiveIsolationEngine checks the playing engine
      first. Test: Hippel-after-MOD resolves to the playing engine or null.
- [x] P1 channel-outputs.js + WASMSingletonBase implements
      IsolationCapableEngine (37 outputs, addIsolation/removeIsolation,
      dub messages, rebuildDubConnections after play). Convert ONE template
      worklet (Oktalyzer: 8 voices, already fixed today) and prove it live:
      dub send on channel N correlates with channel N's stream and not with
      the others.
- [x] P2 Convert the remaining 19 routed + 3 unwired template worklets
      (mechanical; engineChannelStreams-style harness test per worklet:
      output[5+ch] equals voice ch).
- [x] P3 (f7fec3d82 TFMX, 53c0f12a5 Sonix, e10e13512 Cinter4; dub sends only, supportsIsolationSlots false; TFMX verified live) TFMX (Hippel/TFMX/7V) dub copies from gScope; Sonix; Cinter4.
      Isolation for these needs the voice removed from the C mix (C change) -
      separate item P3b.
- [ ] P4 SunTronic per-voice rings to its resampler worklet.
- [x] P5 (272565b54) UADE: remove isolated channels from output 0 (C isolation mask; capture FIFO not render-aligned, so no worklet subtraction).
- [ ] P6 Measure: audio-thread cost of 32 dub outputs per engine with no
      sends open (outputs unconnected are cheap; verify with thcpu.py).

## Verification

- Automated: per-worklet harness (node) checks output[5+ch] == voice ch and
  output 0 excludes isolated voices; reachability test from
  NativeEngineRouting start to a registered channel tap.
- Manual (owner): echo throw on a single channel of a SoundMon / Hippel song
  throws only that channel.
