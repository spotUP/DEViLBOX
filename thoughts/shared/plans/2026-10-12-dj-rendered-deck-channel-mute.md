---
date: 2026-10-12
topic: DJ rendered-deck channel mute (SCOPE-MUTE)
tags: [dj, deck, mute, render-worker, stems, memory]
status: implemented
---

# DJ rendered-deck channel mute (SCOPE-MUTE)

Owner report (twice): "muting channels does nothing in dj view".

## Invariant violated

A deck's CH mute (store `decks[id].channelMask`, written by DeckChannelToggles,
DeckScopes, DJKeyboardHandler) reaches only `TrackerReplayer.setChannelMuteMask`
(`DJDeck.tsx:64-72` -> `DJActions.setDeckChannelMuteMask`, `DJActions.ts:938`).
A deck in `playbackMode 'audio'` plays the WAV the DJ render worker pre-rendered
(`DeckEngine.ts:502/653`, `DeckAudioPlayer` Tone.Player -> keyLock.input). That
WAV is one stereo mix; nothing per channel exists at playback, so the mask has
nothing to act on. Every module deck is in audio mode, so mute is dead for
practically every deck.

Second path found: `DjFxActions.createChannelMuteToggle` (`DjFxActions.ts:1610`,
pads "Mute Ch 1..8") writes the replayer mask directly, bypassing the store - the
deck buttons never show a pad mute. Whatever the fix, the pads must go through
`useDJStore.toggleDeckChannel` (one mute path).

## What the render pass has per channel today (measured from source)

| Engine | Tap (`dj-render.worker.ts`) | Usable as audio stem? |
|---|---|---|
| UADE | Paula channel FIFO, int16 mono, captured BEFORE the A500/LED RC filter (`third-party/uade-3.05/src/audio.c:50-75, 285`) | No: unfiltered; mix = filter(ch0+ch3, ch1+ch2). Exact stem needs a render with `uade_wasm_mute_channels(1<<k)` (mute is applied before the filter) |
| libopenmpt | one solo module instance per channel, full stereo float (`:1357`) | Yes (full output chain, separation 100 like the main module) |
| Hively | split render: same frame re-rendered per channel gain, stereo (`:761`) | Yes (currently averaged to mono for scopes; keep L/R) |
| WebSID | per-voice trace streams, pre-filter (`:1006`) | No: SID filter is after the voices; exact stem = render with other voices muted |

Scopes keep only 11 kHz int8 mono (`channelScopeTrack.ts`) - not audio.

## Options

**A. Channel contributions rendered in the same pass, played from ONE
multichannel source, subtracted on mute.** The worker renders, beside the mix,
each channel's contribution through the engine's full output chain (solo
instance / split render / mute-mask render). The deck's AudioBuffer becomes
2 + 2N channels: [mixL, mixR, ch0L, ch0R, ...]. One Tone.Player plays it; a
`DeckChannelMute` node (ChannelSplitter -> per-channel gain, default 0 ->
ChannelMerger(2)) sits between the player and keyLock.input and outputs
mix - sum(muted_k * contrib_k). One source means one position: sample alignment
is structural, so seek, loop, pitch/nudge, pattern scratch and doubles cannot
drift the stems off the mix. Unmuted output is bit-identical to today (all
gains 0). Mute is a 3 ms gain ramp - immediate. Key Lock, the scratch capture
ring and the reverse scratch all sit after this node, so they hear the muted
signal with no extra work. Cost: RAM = (1 + N) x today's deck buffer; render
time x(1+N) for UADE and SID (two more engine instances run in lockstep);
libopenmpt and Hively already pay it. Fails to cover: Demucs stem mode
(DeckStemPlayer plays the separated mix, not channels - mute stays a no-op
there), modules with more channels than stems kept.

**B. Re-render with a channel mask on mute.** Zero memory. Latency = a render
from the song start (UADE cannot seek) to the playhead plus forward - seconds,
and every toggle is another render. Fails the "immediate" requirement outright;
a DJ mute that lands 2-5 s late is worse than none.

**C. Separate stem sources per channel (reuse DeckStemPlayer as is).** Same
memory as A, but N+1 Tone.Players kept in step by mirroring every transport
call (the way Demucs stem mode does). Any one-sample offset turns the
subtraction into a comb filter instead of silence, and the deck has many
transport paths (seek, loop timer, rate checkpoints, scratch, nudge). Parallel
transport = parallel mechanism; rejected in favour of A's single source.

**D. Worklet deck source reading int16 stems.** Replace the deck's Tone.Player
with an AudioWorklet that holds the mix and stems as int16 and mixes with mute
gains. Halves the RAM of A (int16 instead of float32 AudioBuffer). Cost: a
rewrite of DeckAudioPlayer's transport (position, seek, loop, rate, scratch
priming, key-lock latency accounting) - multi-day, high regression risk in the
DJ path. Worth it only if A's RAM is unacceptable.

## Memory (the owner trade-off)

Today a deck buffer is float32 stereo at 44.1 kHz: 0.35 MB/s = 21 MB/min.

| Track | Today | A, 4 stereo stems | A, 8 stereo stems | D (int16), 4 stems |
|---|---|---|---|---|
| 3 min, per deck | 64 MB | 318 MB | 572 MB | 159 MB |
| 5 min, per deck | 106 MB | 529 MB | 953 MB | 265 MB |
| 3 decks x 5 min | 318 MB | 1.6 GB | 2.9 GB | 0.8 GB |

Audio cache (IndexedDB, WAV int16): x(1+N) per entry, e.g. 5-min 4-channel
module 53 MB -> 265 MB. Render time for UADE/SID modules x5 (not measured;
from the extra lockstep instances).

N is capped at 4 (deck UI and keyboard expose CH1-4; DECK_SCOPE_CHANNELS); the
FX pads offer Mute Ch 5-8, which would stay no-ops on rendered decks.

## Decision needed from the owner (answered 2026-10-12, see Owner decisions)

Recommended: **A with N = 4 stereo stems**, because it is the only design that
is immediate, exact when unmuted, structurally sample-locked, and touches no
transport code; Key Lock, scratch and doubles work for free. Price: about 5x
deck RAM (~530 MB per loaded 5-min module deck, ~1.6 GB for three) and 5x
cache size for module entries, plus 5x render time for UADE/SID modules.

If that RAM is too much: D halves it (~265 MB per 5-min deck) at the price of
a deck-transport rewrite. B is not offered: it cannot be immediate.

Questions:
1. Accept A's memory (~5x per module deck, ~5x cache per module)? Or D?
2. Pads Mute Ch 5-8 on rendered decks: drop them, or keep 8 stems (A = 9x RAM)?

## Implementation sketch (after the decision, option A)

1. `dj-render.worker.ts`: per engine, keep each channel's stereo contribution
   (libopenmpt solos and Hively split already render it; UADE and SID get
   lockstep instances with `mute_channels(1<<k)` / voice mute). Ship as
   `channelStems: { left: Float32Array; right: Float32Array }[]`.
2. `channelScopeTrack.ts` -> the stems travel with the WAV the same way
   (WeakMap by WAV bytes); scopes are derived from the stems (one source).
3. `DJAudioCache`: store stems int16; `CHANNEL_SCOPE_RENDER_VERSION` -> 2 so
   `needsChannelScopeRerender` re-renders old entries at low priority through
   the existing `DJChannelScopeRerender` queue (SCOPE-RERENDER).
4. `DeckEngine.loadDecodedAudio`: build the 2+2N AudioBuffer; new
   `DeckChannelMute` node between DeckAudioPlayer and keyLock.input.
5. `setDeckChannelMuteMask`: write replayer mask AND `DeckChannelMute` gains
   (one action; replayer for tracker mode, node for audio mode).
6. `DjFxActions.createChannelMuteToggle` -> `useDJStore.toggleDeckChannel`.
7. Reachability test: DeckChannelToggles click -> rendered deck with a 2-channel
   synthetic stem buffer -> OfflineAudioContext level of the muted channel = 0,
   other channel unchanged; sentinel on `DeckChannelMute.setMask`.

## Owner decisions (2026-10-12)

1. **Option A**: per-channel stems rendered in the same pass; the deck splitter
   (DeckChannelMute) subtracts a muted channel on a 3 ms ramp.
2. **One stem per channel the module actually has** (up to the 8 the mute
   controls reach). Pads for channels the song does not have stay disabled on
   rendered decks, so only songs with more channels pay for more stems.
3. The pads' Mute Ch 1-8 (DjFxActions) go through the one store mute path.

## As built

- Worker (`src/workers/dj-render.worker.ts`): libopenmpt solo instances and
  Hively split renders keep L/R as stems (up to 8 channels); UADE and SID get
  one solo pass per sounding channel/voice on a fresh instance (mute mask /
  emu_enable_voice), exactly the mix's frame count. Request flag `stems`
  (default true).
- Track (`channelScopeTrack.ts`): `ChannelScopeTrack.stems` (int16 stereo,
  encoded like the WAV), so the stems ride every path the scopes ride (cache,
  pipeline, deck, doubles, re-render). `CHANNEL_SCOPE_RENDER_VERSION` 2: older
  cache entries re-render at low priority through DJChannelScopeRerender.
- Deck: `DeckChannelMute` between DeckAudioPlayer and Key Lock;
  `bufferWithStems` builds the 2+2N buffer from the WAV bytes at the render
  rate (not the context-rate decode, which put the stems off the mix's
  timeline). A late stem track swaps the buffer; a playing source picks it up
  at its next start.
- One mute path: `useDJStore decks[id].channelMask` (buttons, keys, pads,
  panic) -> DeckEngine subscription -> replayer + DeckChannelMute. Every
  deck load resets the mask to all audible. Panic used to write mask 0 (all
  muted); it now writes all audible.
- `deckChannelMutable`: a pad for a channel without a stem does nothing.

## Measured (2026-10-12, node in-process worker, full-length renders)

| Song | Engine | Length | Render mix -> with stems | Deck buffer | Cache (WAV + stems) | mix - sum(stems) |
|---|---|---|---|---|---|---|
| a sleep so deep.mod | UADE | 4.6 min | 4.8 s -> 19.9 s | 97 -> 486 MB | 49 + 194 MB | -65.5 dB |
| aquarivs.bp | UADE | 4.2 min | 3.4 s -> 17.6 s | 88 -> 440 MB | 44 + 176 MB | -49.4 dB |
| flo boarding - level 1.xm | libopenmpt | 2.2 min | 3.5 s total | 46 -> 232 MB | 23 + 93 MB | -75.4 dB |
| aces_high.ahx | Hively | 4.7 min | 3.4 s total | 99 -> 495 MB | 50 + 198 MB | -71.6 dB |
| hexplosion.hvl (16 ch, 8 stems) | Hively | 3.7 min | 10.8 s total | 79 -> 711 MB | 40 + 316 MB | n/a (ch 9-16 unstemmed) |

The int16 stems also stay resident while the track object lives (the cache
column's stem figure). SID stems are built but not measured.

## Cached stems compressed (owner decision 2026-10-12)

Measured on full-length renders (int16 stems from the render, FLAC = the
app's encoder, lib/export/audioEncoders):

| Song | Engine | L/R of each stem | int16 stereo | mono | FLAC stereo | FLAC mono |
|---|---|---|---|---|---|---|
| a sleep so deep.mod | UADE | L == R exactly (-227 dB) | 194.2 MB | 97.1 MB | 46.1 MB | 46.1 MB |
| aquarivs.bp | UADE | L == R (-162 dB) | 176.0 MB | 88.0 MB | 40.3 MB | 40.3 MB |
| flo boarding - level 1.xm | libopenmpt | L == R (-161 dB) | 92.7 MB | 46.4 MB | 15.3 MB | 15.3 MB |
| aces_high.ahx | Hively | constant pan k 0.41, only to -75 dB | 198.0 MB | 99.0 MB | 100.6 MB | 55.8 MB |
| hexplosion.hvl (8 of 16 ch) | Hively | pans move (-7 dB) | 316.1 MB | 158.1 MB | 44.6 MB | 36.9 MB |

SID: no SID file in the format corpus; not measured.

Decision as built: one stereo FLAC per channel for every engine. FLAC's
stereo decorrelation stores an L == R stem at exactly the mono size, so
mono-plus-pan would save nothing where it is exact (UADE, libopenmpt) and is
not exact for Hively (AHX -75 dB, HVL -7 dB). Encoded in the render worker
(the encoder's wasm build loads in the worker scope), decoded on deck load by
the wasm FLAC decoder in its own Web Worker. Track version 3: version-2
entries (raw int16 stems) re-render at low priority.

Per 4.6-min MOD cache entry: 243 MB (WAV 48.6 + int16 stems 194.2) -> 95 MB
(WAV 48.6 + FLAC stems 46.1): about 8 -> 21 such tracks under the 2000 MB cap.
Stems alone: 4.2x smaller. Mute residual unchanged (reachability test asserts
-49 dB); the decoder's 1/32767 scale vs the WAV's 1/32768 adds about -90 dB.
