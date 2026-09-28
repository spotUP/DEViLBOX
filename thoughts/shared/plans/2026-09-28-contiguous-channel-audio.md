---
date: 2026-09-28
topic: Contiguous per-channel audio for the runtime role classifiers
tags: [channel-intelligence, oscilloscope, worklets, classifier]
status: implemented-partly
---

# Contiguous per-channel audio for the runtime role classifiers

## Problem (measured)

Both runtime channel classifiers analyse audio that was never contiguous.

- Engines post `oscData` snapshots of 128-256 samples per voice, every ~23 ms
  (8 renders) or ~33 ms (UADE). A snapshot is the recent past, not what came
  after the previous one.
- `AutoDub` polls `useOscilloscopeStore.channelData` every 250 ms and feeds
  that one snapshot to `ChannelAudioClassifier.updateChannelClassifierFromTap`
  (a 2048-sample ring) and `CedChannelAccumulator.feed` (a 32768-sample ring).
  Both append snapshot after snapshot, so each FFT or CED window is 8-128
  snippets glued end to end, with a click at every join.
- Result, measured on the TFMX worklet 2026-09-28: every Hippel channel reads
  `percussion` (prehistoric_tale 4 of 4, ghostbattle 5 of 7). Fed the same
  voices as continuous audio, the same classifier says lead / lead /
  percussion / lead. The CED window of 0.68 s took about 32 s to fill, all
  of it glued snippets.

A single snapshot is no substitute: 256 samples at 48 kHz is shorter than one
cycle of a 60 Hz bass note.

## Design

The fix lives at the source. Engines send every rendered sample, and one tap
keeps it contiguous.

1. **Producer contract.** An `oscData` message carries `channels` (one Int16Array
   per voice holding EVERY sample rendered since the previous message), `frame`
   (the engine's running sample index of `channels[*][0]`) and `sampleRate`.
   Messages without `frame` keep today's meaning: a display snapshot only.
2. **Shared worklet helper** `public/worklets/channel-stream.js` defines
   `globalThis.DevilboxChannelStream` once per AudioWorkletGlobalScope:
   per-voice Int16 accumulation, a running frame counter, and a flush every N
   frames (default 1024). `WASMSingletonBase` adds this module before an
   engine's own worklet, so no worklet carries a copy of it.
3. **Store.** `useOscilloscopeStore.updateChannelData(channels, frame?,
   sampleRate?)` keeps showing the LAST 256 samples per channel, so the scopes
   look as they do today, and hands the full chunk to the tap when `frame` is
   given.
4. **Tap** `src/bridge/analysis/ChannelAudioTap.ts`. Per channel it keeps a
   32768-sample ring, the capacity CED needs. A chunk whose `frame` is not the
   expected next one resets that channel, so a join is never analysed.
   `latest(ch, n)` returns the last n contiguous samples, or null.
5. **Consumers.** `ChannelAudioClassifier` classifies `tap.latest(ch, 2048)` on
   each AutoDub tick, and keeps no ring of its own. `CedChannelAccumulator`
   fires on `tap.latest(ch, 32768)` with its cooldown. A channel with no
   contiguous audio gives no vote: no evidence rather than false evidence.

## Checklist

- [x] C1 `channel-stream.js` helper + loaded by WASMSingletonBase before the engine worklet
- [x] C2 ChannelAudioTap (ring, frame continuity, latest) + unit test (a gap resets; contiguous chunks join)
- [x] C3 store: updateChannelData(channels, frame, sampleRate); display keeps the last 256; tap fed
- [x] C4 ChannelAudioClassifier reads the tap (its stitching ring is removed)
- [x] C5 CedChannelAccumulator reads the tap (its stitching ring is removed)
- [x] C6 TFMX worklet on the helper (reference engine) + reachability test: TFMX worklet -> store -> tap -> classifier gives contiguous-audio votes
- [x] C7 the 26 other WASMSingletonBase worklets on the helper; engine TS passes frame/sampleRate
- [x] C8 UADE worklet (own loader) on the helper
- [ ] C9 libopenmpt / chiptune3 worklet — NOT converted, OWNER DECISION: its scope renders one channel per process call from a second module instance (round robin), so contiguous per-channel audio needs one extra decode per channel (8-32x CPU on the busiest engine). Sample formats keep the offline SampleSpectrum evidence. Stays display-only (no runtime vote) until decided.
- [x] C10 Hively worklet
- [x] C11 Furnace dispatch
- [x] C12 SunTronic song engine
- [ ] C13 browser: scopes unchanged; runtime roles for prehistoric_tale and one MOD not all percussion
- [ ] C14 ledger + handoff note

## Done notes
- C7: 22 template worklets by one checked regex; Sonic Arranger by hand; Cinter4 and Sonix read every render (Cinter4's 256-sample ring was read every 768 samples; Sonix posted 1 render in 4).
- C11: FurnaceDispatchWrapper read the 16.16 osc needle as a sample index; now the integer position, held (-1) samples resolved; worklet streams each channel from its last read at 65536 Hz. The display scopes may have been reading the wrong stretch before this (not verified).
- MCP: get_oscilloscope_info.analysisAudio = unbroken samples per channel.

## Automated verification
- `npm run type-check`
- ChannelAudioTap unit test; TFMX reachability test (C6); the existing
  ChannelAudioClassifier / CED tests, updated to the tap.

## Manual verification (owner)
- Scopes look as before on a MOD, a Hippel song and a UADE song.
- Ears: are the runtime roles right? (the "Label the corpus" item)
