---
date: 2026-10-12
topic: DJ Key Lock stretcher - SoundTouch replaced by Signalsmith Stretch, measured
tags: [dj, key-lock, time-stretch, signalsmith, soundtouch, bungee, measurement]
status: final
---

# Key Lock stretcher measurement (KEYLOCK-SIGNALSMITH)

Owner report 2026-10-12: Key Lock in the DJ view "sounds like 90's jungle timestretch". The insert was SoundTouch (time-domain WSOLA) in `public/soundtouch/`, wrapped by `src/engine/dj/DeckKeyLock.ts`.

## Method

- Songs (UADE render, 48 kHz, 20 s): drums = `public/data/songs/mod/break the box.mod`, tonal = `public/data/songs/formats/a sleep so deep.mod`.
- Deck chain: source resampled at playbackRate (linear interpolation, as Chrome's AudioBufferSourceNode) then the Key Lock insert at `computeKeyLockShift(...).pitchCompensate`, 128-frame quanta.
- Each worklet processor ran unmodified in Node (`tools/keylock/workletHost.ts`); Bungee (v2.4.35, commit 052451eff35165dae16221092447be0ce521dd24, MPL-2.0) compiled with emcc -O3 -msimd128 around `Bungee::Stream`; audiojs `@audio/stretch` 2.2.0 atoms (transient 1.2.3, hybrid 1.2.3, pghi 1.3.0, pvsola 1.0.0) as stretch-then-resample pitch shifters.
- Metrics (`tools/keylock/stretchMetrics.ts`) compare against the unstretched source mapped onto the output timeline: fluxCorr (onset curve, 1 = ideal), warbleDb (band-energy jitter on sustained notes, lower better), lsdDb (log-spectral distance, lower better). Latency from a click train. CPU = Node V8 time inside process() per quantum; budget 2.667 ms; 3-deck load = 3 x mean / budget.
- "ceiling" = offline Signalsmith buffer-mode pure time-stretch of the unresampled source (default 120 ms blocks, tonality 20 kHz). It is the best available offline reference on spectral distance but NOT on transients (long blocks smear), so it is not a true ceiling.
- `@audio/quality` lsd / spectralSim compare frames at the same index of two equal-timeline signals; a tempo-changed output has no same-timeline reference, so they do not measure what they claim here and were not used.

## Live chain = offline chain

Real Chrome 154 OfflineAudioContext (AudioBufferSourceNode playbackRate 0.85 -> SoundTouch worklet initialised as DeckKeyLock did) vs the Node harness: residual -25.9 dB at lag 0, fluxCorr 0.334 vs 0.333, warble 2.19 vs 2.19 dB. The app's chain is not worse than the offline render; the artifact is SoundTouch's WSOLA itself. SoundTouch's reported latency was also wrong at slow rates (0.5: reported 110 ms, heard 69 ms), so phase sync against a key-locked deck was off by up to 41 ms. Its "short blocks" after engage (15 ms at 0.92 to 70 ms at 0.5) fall inside its own latency - the engage ramp-in, not a later dropout.

## Decision

Signalsmith Stretch 1.3.2 (MIT, official WASM/AudioWorklet build, vendored unmodified in `public/signalsmith-stretch/`), configuration chosen by measurement: blockMs 80, intervalMs 20, splitComputation, tonalityHz 20000 ("signalsmith-shipped"). Default preset (120 ms) has more warble and 120 ms latency; 60 ms blocks sharpen +-8 % but warble more at <= 0.6; the 8 kHz default tonality limit costs ~1.5 dB LSD. Bungee hop -1 is equal on quality at 100 ms latency but needs our own build and worklet; Bungee default best at 0.5-0.6 on LSD but 190-200 ms latency; audiojs-transient best onset curve at slow rates but worst LSD and p99 up to 2.5 ms/quantum (3 decks overrun the 2.667 ms budget); hybrid/pghi/pvsola overrun the budget alone. Owner listened 2026-10-12: drums_0.60_signalsmith-shipped "sounds good".

Shipped: latency 100 ms at every pitch (reported = heard within 3 ms, locked by keyLockKeepsTransientsSharp), CPU 0.040-0.053 ms mean / 0.21-0.46 ms p99 per quantum per deck (3 decks: 4.5-6 % of the audio thread), a bypassed deck idles (no WASM call; idle shim `public/signalsmith-stretch/idleWhenBypassed.js`). Engaging Key Lock resets the stretcher, so 100 ms of ramp-in silence follows an engage (inherent to any insert with latency).

## Numbers

### drums: fluxCorr / warbleDb / lsdDb per rate

| engine | 1.08 | 0.92 | 0.85 | 0.75 | 0.60 | 0.50 |
|---|---|---|---|---|---|---|
| soundtouch | 0.486 / 2.26 / 3.92 | 0.396 / 2.36 / 3.81 | 0.333 / 2.19 / 3.87 | 0.58 / 2.29 / 4.01 | 0.38 / 2.36 / 4.47 | 0.001 / 2.48 / 5.5 |
| signalsmith | 0.883 / 1.63 / 4.15 | 0.798 / 1.53 / 3.97 | 0.711 / 1.66 / 4.21 | 0.556 / 1.75 / 4.34 | 0.347 / 1.99 / 4.71 | 0.296 / 2.14 / 4.72 |
| signalsmith-shipped | 0.811 / 1.31 / 3.08 | 0.778 / 1.21 / 2.96 | 0.706 / 1.42 / 3.24 | 0.623 / 1.72 / 3.66 | 0.438 / 2.15 / 4.36 | 0.344 / 2.39 / 4.8 |
| bungee | 0.858 / 1.86 / 3.62 | 0.806 / 1.74 / 3.52 | 0.773 / 1.8 / 3.73 | 0.662 / 1.84 / 3.89 | 0.553 / 1.82 / 4.14 | 0.265 / 1.89 / 4.3 |
| bungee-hop-1 | 0.877 / 1.23 / 3.25 | 0.844 / 1.26 / 3.23 | 0.794 / 1.43 / 3.45 | 0.644 / 1.76 / 4.19 | 0.429 / 2.16 / 4.68 | 0.312 / 2.26 / 4.56 |
| audiojs-transient | 0.841 / 1.37 / 4.39 | 0.855 / 1.42 / 4.4 | 0.787 / 1.65 / 4.71 | 0.714 / 2.03 / 4.93 | 0.514 / 2.42 / 5.82 | 0.409 / 2.58 / 5.86 |
| audiojs-hybrid | -0.003 / 3.2 / 8.68 | 0.802 / 1.64 / 5.01 | 0.687 / 1.92 / 5.31 | 0.569 / 1.98 / 5.34 | 0.493 / 2.43 / 6.01 | 0.346 / 2.71 / 6.08 |
| audiojs-pghi | 0.848 / 1.5 / 3.43 | 0.858 / 1.33 / 3.19 | - | - | - | - |
| audiojs-pvsola | 0.645 / 2.34 / 5.08 | 0.718 / 2.18 / 5.36 | - | - | - | - |
| ceiling | 0.85 / 1.79 / 3.18 | 0.791 / 1.57 / 2.98 | 0.637 / 1.73 / 3.39 | 0.435 / 1.96 / 3.99 | 0.282 / 2.14 / 4.48 | 0.219 / 2.25 / 4.8 |

### tonal: fluxCorr / warbleDb / lsdDb per rate

| engine | 1.08 | 0.92 | 0.85 | 0.75 | 0.60 | 0.50 |
|---|---|---|---|---|---|---|
| soundtouch | 0.644 / 1.87 / 3.29 | 0.511 / 1.86 / 3.14 | 0.519 / 1.83 / 3.24 | 0.601 / 1.89 / 3.4 | 0.43 / 1.96 / 3.78 | 0.007 / 2.06 / 4.88 |
| signalsmith | 0.896 / 1.86 / 4.76 | 0.832 / 1.72 / 4.54 | 0.758 / 1.76 / 4.62 | 0.688 / 1.68 / 4.73 | 0.4 / 1.73 / 4.87 | 0.291 / 1.7 / 4.76 |
| signalsmith-shipped | 0.861 / 1.32 / 2.77 | 0.834 / 1.36 / 2.68 | 0.771 / 1.43 / 2.88 | 0.663 / 1.6 / 3.27 | 0.443 / 1.78 / 3.85 | 0.341 / 1.86 / 4.22 |
| bungee | 0.898 / 1.79 / 3.26 | 0.841 / 1.64 / 3.15 | 0.776 / 1.81 / 3.31 | 0.705 / 1.79 / 3.47 | 0.497 / 1.71 / 3.63 | 0.245 / 1.67 / 3.76 |
| bungee-hop-1 | 0.909 / 1.49 / 3.05 | 0.875 / 1.37 / 2.94 | 0.839 / 1.36 / 3.08 | 0.632 / 1.68 / 3.65 | 0.371 / 1.88 / 4.07 | 0.251 / 2.01 / 3.97 |
| audiojs-transient | 0.885 / 1.86 / 4.19 | 0.888 / 1.58 / 4.24 | 0.838 / 1.49 / 4.53 | 0.802 / 1.7 / 4.76 | 0.594 / 2.05 / 5.47 | 0.501 / 2.2 / 5.5 |
| audiojs-hybrid | -0.079 / 2.42 / 7.95 | 0.854 / 1.52 / 4.47 | 0.72 / 1.54 / 4.79 | 0.745 / 1.67 / 4.88 | 0.643 / 1.96 / 5.36 | 0.367 / 2.09 / 5.56 |
| audiojs-pghi | 0.904 / 1.72 / 3.18 | 0.906 / 1.48 / 2.95 | - | - | - | - |
| audiojs-pvsola | 0.686 / 1.75 / 3.88 | 0.776 / 1.69 / 3.83 | - | - | - | - |
| ceiling | 0.893 / 1.82 / 2.64 | 0.828 / 1.7 / 2.53 | 0.685 / 1.81 / 2.88 | 0.448 / 1.79 / 3.42 | 0.271 / 1.82 / 3.78 | 0.223 / 1.81 / 4.11 |

### latency (measured by click train / reported) and CPU (ms per 128-frame quantum mean / p99; 3-deck load %), drums 0.92

| engine | latency ms | CPU |
|---|---|---|
| soundtouch | 88.5 / 95.6 | 0.0492 / 1.0569; 5.5 % |
| signalsmith | 119.8 / 120 | 0.0454 / 0.4443; 5.1 % |
| signalsmith-shipped | 100 / 100 | 0.0467 / 0.4101; 5.3 % |
| bungee | 200 / 200.1 | 0.047 / 0.4775; 5.3 % |
| bungee-hop-1 | 100 / 100.1 | 0.0403 / 0.3037; 4.5 % |
| audiojs-transient | 117.3 / - | 0.0938 / 0.715; 10.5 % |
| audiojs-hybrid | 242.3 / - | 0.5208 / 4.269; 58.6 % |
| audiojs-pghi | 117 / - | 0.6351 / 4.0334; 71.4 % |
| audiojs-pvsola | 112.2 / - | 1.1797 / 9.4928; 132.7 % |
| ceiling | 0 / - | - / -; - % |

A/B WAVs (RMS-matched, latency trimmed): `thoughts/spot/renders/keylock/` (gitignored), INDEX.md there.

## Follow-up option (not built): tracker decks without stretching

A module deck could key-lock with no stretcher: re-render the module at the new tempo (replayer tempo changes, note pitch stays). UADE renders 60 s in 0.62-0.72 s in Node (83-97x realtime). Render-ahead in 2 s chunks would cost ~25 ms per chunk, so a fader change could land within one chunk plus a crossfade (~30-60 ms) instead of 100 ms latency, with zero artifacts. Open costs (unverified): the replayer must reach the current song position at the new tempo without replaying from the start (state snapshot or seek), every fader move re-renders the remaining chunk, and UADE needs a tempo-scale control for CIA-timed players.
