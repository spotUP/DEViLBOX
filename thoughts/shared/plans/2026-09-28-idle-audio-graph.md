---
date: 2026-09-28
topic: The audio graph costs nothing when nothing uses it
tags: [performance, audio-thread, dub, channel-routing]
status: draft
---

# The audio graph costs nothing when nothing uses it

## Problem (measured 2026-09-28, ghostbattle_gameover.hip7, song stopped)

The renderer's Realtime AudioWorklet thread was 48-62 % busy with no song
playing (macOS `sample`), which starved the pattern editor (10 fps). The song
engine itself costs 1-2 ms/s. Two new dev tools (MCP get_audio_worklet_profile)
show where the time goes:

- Worklets: 82 ms/s total. re201 35-43, fil4 14, aelapse 9-14, dattorro 1.5-5.5,
  tonearm 4.5-6.7, calf-phaser 3, ring-mod 1.5-3, bitta 1-3 (all dub bus / fx).
- Native nodes alive, by creator:
  - PerChannelDubFx: 256 Gain, 64 Biquad, 32 Delay, **32 Oscillator** (LFO per
    channel slot, started in the constructor, plus a delay feedback loop).
  - ChannelFilterManager: 204 Gain, **136 ConstantSource**, 34 Biquad
    (Tone.Filter x2 per channel; Tone signals are ConstantSourceNodes).
  - ChannelRouting 64 Gain / 16 Panner / 16 Analyser; DubBus 61 Gain / 22 Biquad /
    6 Oscillator / 12 Analyser / convolver.

Sources (oscillators, constant sources) and feedback loops never go silent, so
Chrome never idles the nodes behind them. The dub bus's `enabled` gates only
its return; its input still carries every channel's send, so its effects
process real audio behind a muted return.

## Changes

- [x] P1 ChannelFilterManager: native BiquadFilterNodes instead of Tone.Filter
      (no ConstantSources). Callers wire through connectAudio.
- [x] P2 PerChannelDubFx: the comb-sweep section (LFO, modulated delay,
      feedback loop) exists only while sweep amount > 0; built on demand,
      torn down after it ramps to 0.
- [x] P3 (already so: disabling ramps bus input to 0) DubBus disabled: the input is gated too (no send audio enters the
      effects); the return gate stays.
- [x] P4 (worklets/idle-gate.js, -80 dBFS, 1 s) Effect worklets skip their DSP while their input has been silent
      longer than their tail (RE-201, fil4, aelapse, tonearm, calf-phaser,
      dattorro, ring-mod, bitta; vinyl-noise by its own level).
- [x] P5 (LfoLink) DubBus oscillators (master chorus LFOs, sweep LFO, ...): stopped or
      disconnected while their feature is off.
- [x] P8 Fewer nodes (owner go 2026-09-28; lazy per-channel dub chains via _ensureDubChannel, test in idleAudioGraph.test.ts; live node count pending reload): per-channel structures
      exist for 32 (PerChannelDubFx) / 16 (ChannelRouting) slots on a 7-channel
      song. MEASURED: +1000 silent GainNodes = +~20 % audio thread (15 -> 36 %),
      i.e. ~2 % per 100 nodes. Lazy per-channel dub FX would drop ~200 nodes
      (~4 %). Touches dub send seeding (see project_dub_send_gain_seeding).
- [ ] P6 Measure after, same song, stopped and playing: worklet ms/s, node
      census, AudioWorklet thread busy %, pattern-editor frame stats.
- [ ] P7 Tests for each behaviour (filters still sweep; comb sweep still
      audible when engaged; dub bus still sounds when enabled; worklets resume
      on signal).

## Measured after P1-P5 (same song, same machine load ~20)
- Stopped: worklets 90 -> 2.5 ms/s; audio thread 62 % -> 15 % once settled
  (33 % read right after stop, while the 1 s idle timers ran); renderer ~140 % -> ~43 % CPU.
- Playing (5 s): long frames 54 -> 10; timer ticks 48 -> 160 of 250; worklets ~30 ms/s.

## Verification
- `npm run type-check`; targeted tests.
- MCP get_audio_worklet_profile before/after; `sample` of the renderer.
- Owner: dub moves sound as before (manual).

## 2026-09-29 per-node attribution (chrome://tracing, disabled-by-default-webaudio.audionode, 4-ch MOD playing, dub bus on)
Untraced main-context load: 0.90 ms per 128-frame quantum (34 %), p99 2.46 ms of 2.67 ms.
Nodes processed per quantum (trace trace_dbxdbg3.json.gz):
GainNode 363 · BiquadFilter 57 · Analyser 42 · AudioWorklet 30 · ChannelSplitter 25 · StereoPanner 24 · WaveShaper 14 (2x oversampled) · ConstantSource 14 · Delay 8 · Oscillator 4 · DynamicsCompressor 3 · Convolver 2 (always processing: dub feedback floor keeps inputs non-silent).
Traced self-time shares (inflated by per-event tracing cost): per-node overhead 44 %, AudioWorklet calls 29 % (idle-gated worklets still pay the call + buffer copy), convolver FFT 10 %, gains 6 %, biquads 4 %.
Next (P9, proposed): size per-channel structures to the song's channel count, built lazily - ChannelRouting (64 gains/16 splitters/16 analysers/16 panners), ChannelEffectsManager (32 gains), TrackerReplayer (36 gains), SendBusManager (12), ChannelFilterManager (34 biquads). Then: fewer always-on worklets (30), convolvers that stop when their tail is done.
