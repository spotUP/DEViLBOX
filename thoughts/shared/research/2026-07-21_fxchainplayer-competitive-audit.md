---
date: 2026-07-21
topic: fxchainplayer-competitive-audit
tags: [competitive-analysis, dj, metering, visualization, export, research]
status: final
---

# FXChainPlayer vs DEViLBOX — grounded competitive audit

## Method + honesty note

FXChainPlayer (Andreas Wendorf / Akustikrausch) is **proprietary closed-source** native
C++20/Qt for Windows+macOS. The `FXChainPlayer-Releases` repo is a **binary distribution
repo** — README + screenshots + `latest.json`, **no source**. This audit compares FXCP's
own documented feature claims (README, 750 lines across all versions) against DEViLBOX's
**actual code**, verified by five parallel code investigations (DJ, metering/analysis,
visualizers, FX/mixer/export, player-extras). Every DEViLBOX claim below carries a
`file:line`. FXCP claims are taken at face value from its README (unverifiable — no source).

**Headline finding: DEViLBOX is NOT behind FXChainPlayer.** In the overlap (DJ, mixing,
analysis, visualization, format breadth) DEViLBOX matches or beats it, and does entire
classes of things FXCP cannot (native-format *editing* + byte-exact round-trip, MCP
automation, transpiled replayers, 3rd deck, stem separation, Auto-DJ, video/YouTube export).
FXCP's genuine edge is the *native-desktop player/listener* identity DEViLBOX deliberately
is not. The true on-mission gaps are few and small.

---

## Category-by-category

Legend: **HAVE** = DEViLBOX has it (verified). **BETTER** = DEViLBOX exceeds FXCP.
**GAP** = FXCP has, DEViLBOX doesn't. **NO-FIT** = FXCP-only, off-mission / browser-impossible.

### DJ mode — DEViLBOX BETTER

| FXCP claim | DEViLBOX | Verdict |
|---|---|---|
| Dual-deck | dual **+ 3rd deck** (`useDJStore.ts:302`) | BETTER |
| Crossfader + curves | linear/cut/smooth (`djEnvironment.ts:47`, `MixerCrossfader.tsx`) | HAVE |
| Per-deck waveform overview+closeup | `DeckAudioWaveform.tsx`, `DeckTrackOverview.tsx` | HAVE |
| 8 hot cues persisted | 8-slot, color+name (`useDJStore.ts:22-26,92`) | HAVE |
| Loops + auto-loop | tracker loop 1-32 + audio in/out + autoloop (`DeckLoopControls.tsx`) | HAVE |
| Beat-jump | `DJBeatJump.ts:21` | HAVE |
| 3-band EQ | 3-band **+ kill switches** (`MixerEQ.tsx:53`) | BETTER |
| Gain | volume+trim+**autogain** (`useDJStore.ts:76`) | BETTER |
| Play/Cue/Sync | `DeckTransport.tsx` | HAVE |
| BPM sync + phase-lock | `DJBeatSync.ts:12-60`, `DJAutoSync.ts` | HAVE |
| Vinyl scratch physics | jog worker + momentum + **6 scratch patterns** (`DeckTurntable.tsx`, `dj-turntable.worker.ts`) | HAVE |
| Pitch vs time-stretch | keylock decouple (`computeKeyLockShift.ts:27`) | HAVE |
| DJM filter knob | bipolar HPF/LPF + resonance (`MixerFilter.tsx:18`) | HAVE |
| Echo/gater FX | echo/gater + **dub moves** (throw, reverse-echo, wobble, siren, spring, filter-drop) (`DeckFXPads.tsx`) | BETTER |
| Camelot / harmonic hint | logic exists (`DJKeyUtils.ts:85,128` toCamelot/keyCompatibility) — **no wheel widget** | GAP (UI only) |
| BPM detection | `DJBeatDetector.ts`, essentia.js (`dj-analysis.worker.ts:57`) | HAVE |
| MIDI DJ controllers | preset lib Pioneer/Numark/… (`djControllerPresets.ts`, `DJControllerMapper.ts`) | HAVE |
| Dual audio output (cue) | multi-output/split-stereo/none (`useDJStore.ts:305`) | HAVE |
| Per-deck FX / dub sends | fxTargetChannels + dub sends (`useDJStore.ts:113`, `DubBusPanel.tsx`) | HAVE |
| Tracker DJing (mod vs mp3) | unified loader both modes (`DJTrackLoader.ts`, `useDJStore.ts:135`) | HAVE |

DEViLBOX-only DJ features FXCP lacks: 3rd deck, **stem separation + per-stem dub sends**
(`useDJStore.ts:162`), **Auto-DJ smart cuts** (`DJAutoDJ.ts`), **DJ set recording**
(`DJSetRecorder.ts`), **live streaming** (`DJStreamControl.tsx`), **video export**
(`DJVideoExport.tsx`), **YouTube upload** (`DJYouTubeUpload.tsx`).

### Analysis / metering — mostly HAVE, real gaps in loudness UI

| FXCP claim | DEViLBOX | Verdict |
|---|---|---|
| Key detection | Krumhansl-Schmuckler 24-key + essentia.js WASM (`MusicAnalysis.ts:134`, `dj-analysis.worker.ts:80`) | HAVE |
| BPM consensus + beat grid | essentia.js + downbeat + time-sig (`dj-analysis.worker.ts:57,208`) | HAVE |
| FFT spectrum | 64-bin + spectral metrics (`readHandlers.ts:1147`, `writeHandlers.ts:1415`) | HAVE |
| Peak/RMS metering | `readHandlers.ts:1131`, `getAudioLevel` sustained (`writeHandlers.ts:1267`) | HAVE |
| Instrument spectral classify | CED neural + spectral 10-class (`SampleSpectrum.ts`, `CedChannelAccumulator.ts`) | BETTER |
| LUFS | K-weighted BS.1770 approx **internal-only** (`previewGenerator.ts:182`) — no live meter | GAP (UI) |
| **EBU R128 live meter panel** (M/S/Integrated) | absent | **GAP** |
| **True-Peak** (oversampled, −1dBTP flag) | peak dBFS only, no oversample | **GAP** |
| **LRA** (loudness range) | absent | **GAP** |
| **DR** dynamic-range report | absent | **GAP** |
| **Lossy-transcode detection** (spectrum cutoff) | absent | **GAP** |

### Visualization — DEViLBOX BETTER, one gap

| FXCP claim | DEViLBOX | Verdict |
|---|---|---|
| FFT spectrum log+peak-hold | Canvas2D + WebGL audioMotion (`InstrumentSpectrum.tsx`, `AudioMotionVisualizer.tsx`) | HAVE |
| Spectrogram waterfall | `InstrumentSpectrogram.tsx:80` | HAVE |
| Phase scope / goniometer | Lissajous phosphor (`InstrumentLissajous.tsx:25`) | HAVE |
| VU/PPM | circular + per-channel + level meters (`CircularVU.tsx`, `InstrumentLevelMeter.tsx`) | HAVE |
| LED segmented | `FrequencyBars.tsx`, audioMotion ledBars | HAVE |
| 3D freq landscape | Three.js AudioTerrain (`AudioTerrain.tsx:16`) | HAVE |
| GPU shader visualizers | ISF + Three.js scenes (`ISFCanvas.tsx`, `ThreeCanvas.tsx`) | HAVE |
| Per-channel scopes | 6 scope components incl `TrackScopesStrip.tsx`, `ChannelOscilloscope.tsx` | BETTER |
| Unified pattern view + order list + tooltips | `PatternEditorCanvas.tsx`, `PatternOrderSidebar.tsx`, FT2 effect tooltips (`EffectCell.tsx`) | HAVE (editable, not just view) |
| **Live editable GLSL shader editor** | ISF **loads** presets; no user-writable hot-swap IDE | **GAP** |

### FX / mixer / export — mostly HAVE, export-format + compare gaps

| FXCP claim | DEViLBOX | Verdict |
|---|---|---|
| Per-channel effect chains | 4-slot insert per channel (`useMixerStore.ts:663`) | HAVE (4 vs FXCP 16) |
| Master effect chain | `masterEffects` + 30+ effects (`tonejs.ts`) | HAVE |
| Dub/VJ bus + sends | 4 send buses + dub bus (`useMixerStore.ts:664,713`, `dub.ts`) | BETTER |
| Auto-dub/auto-mix | `useDubStore.ts`, auto-mix MCP | BETTER |
| 3-band EQ built-in | EQ3 (`tonejs.ts:488`) | HAVE |
| Serial multi-slot reorder/bypass/mix | add/remove/toggle/move (`useMixerStore.ts:746`) | HAVE |
| External plugin hosting | **WAM 2.0** (Big Muff, TS-9, etc. `wam.ts`) — open web standard, NOT VST3/AU | HAVE (different std) |
| Export WAV/MP3 | `audioExport.ts:232,307` | HAVE |
| Stem/per-voice export | `exportLiveCaptureStems` (`audioExport.ts:784`) | HAVE |
| Export through FX chain | live capture incl inserts+master+mixer (`audioExport.ts:585`) | HAVE |
| MIDI/MOD/native export | MCP export_midi/export_mod/export_native | BETTER |
| **FLAC / OGG export** | absent (WAV/MP3 only) | **GAP** |
| **A/B (ABX) compare** | absent | **GAP** |
| **Bauer global crossfeed** | only SID StereoWidener (`SIDStereoTab.tsx`) | GAP (partial) |
| Auto loudness-normalize on playback | limiter as manual effect only | GAP (marginal) |

### Player / listener extras — many GAPs, mostly off-mission

| FXCP claim | DEViLBOX | Verdict |
|---|---|---|
| Format info + searchable library | per-format modals + in-app manual (`ModuleInfoModal.tsx`, `manualChapters.ts`) | HAVE (partial — no unified searchable panel) |
| File browser | FS-API/Electron/Server (`FileBrowser.tsx`) | HAVE |
| Playlist configurable | M3U/JSON, drag-reorder (`DJPlaylistPanel.tsx`) | HAVE |
| MIDI learn | `MIDILearnModal.tsx`, wizard, mapper | HAVE |
| HVSC + Modland browse | unified 190K+80K search (`DJModlandBrowser.tsx`) | BETTER |
| Favorites / ratings / play-count | VJ favorites, `StarRating.tsx`, playCount | HAVE |
| SID lyrics | STIL/DeepSID (`SIDSTILTab.tsx`) | HAVE (SID only) |
| **Synced .lrc karaoke lyrics** (audio) | absent | GAP |
| **Tag/metadata editor** (ID3/Vorbis) | absent | GAP |
| Gapless playback | absent | NO-FIT-ish |
| Internet radio stations | absent | NO-FIT |
| Library background-scan + cache | absent | NO-FIT |
| Discord presence / Last.fm scrobble | absent | NO-FIT |

### Format-coverage gaps (verified)

- **AmigaKlang** — FXCP plays AmigaKlang productions (they ship as raw Amiga
  executables) via its 68k emulation. DEViLBOX has **no AmigaKlang support**
  (verified: no player, not in UADE `eagleplayer.conf`; the only `klang` hits are
  SuperCollider `DynKlang` + an unrelated `4klang` string). DEViLBOX already has a
  68k/Amiga path (UADE + transpile engine), so this is a *reachable* gap, not a
  structural NO-FIT. **On-mission** (retro/demoscene format coverage is core
  DEViLBOX identity). Effort: investigate whether UADE's eagleplayer set can cover
  it, or whether it needs the exe-tune path. Tracked as a TODO.

### FXCP-only, structurally NO-FIT for DEViLBOX

- **Native VST3 / AU hosting** — impossible in browser sandbox. DEViLBOX's answer is WAM 2.0
  (open web plugin standard). An Electron build could theoretically host VST3 but that is a
  separate product decision, not a "keeping up" item.
- **Native audio backends** — WASAPI/ASIO/CoreAudio exclusive/hog modes, bit-perfect,
  output-pair routing. Browser has no equivalent (Web Audio only).
- **Network casting** — AirPlay 2 / Chromecast / DLNA-UPnP. Native-only.
- **Native decoders** (AudioToolbox AAC/ALAC/CAF), audio-CD play/rip, code-signed installers,
  plugin crash-isolation subprocess, DSD hi-res, hardware DJ-controller enumeration.

---

## True on-mission gaps (verified absent, plausibly worth building)

Ranked by (value to a music *creation* tool) × (small effort, leverages existing code):

1. **Live EBU R128 loudness meter panel** — M/S/Integrated LUFS windows, True-Peak
   (4× oversample) with −1 dBTP flag, LRA. DSP foundation exists (`previewGenerator.ts`
   LUFS approx). Real mastering/export-QA value. Verify against EBU 3341/3342 vectors.
   **Effort: medium. Fit: high.**
2. **Live GLSL shader editor** — user-writable fragment shader + hot-swap, audio as
   FFT+waveform texture. DEViLBOX already has the WebGL ISF/Three pipeline (`ISFCanvas.tsx`),
   so this is an editor UI on top, not a new renderer. Fits the VJ side. **Effort: medium.
   Fit: high (VJ).**
3. **Camelot wheel widget + cross-deck harmonic hint** — the LOGIC already exists
   (`DJKeyUtils.ts` toCamelot/keyCompatibility). Only the visual wheel + Match/Relative/
   Adjacent/Clash indicator UI is missing. **Effort: small. Fit: medium (DJ polish).**
4. **FLAC + OGG export** — export currently WAV/MP3 only. On-mission (export quality/size).
   **Effort: small-medium (add encoders to export router). Fit: high.**
5. **DR + lossy-transcode QA report** — dynamic-range value + spectrum-cutoff "is this a
   fake lossless" check, in an Analyze panel. Marginal for a creation tool but useful on your
   own renders. **Effort: small. Fit: low-medium.**
6. **A/B (ABX) compare** — dual-buffer sync switch. Marginal fit. **Effort: medium. Fit: low.**
7. **Global Bauer crossfeed** — one DSP node (gain+delay+lowpass blend). Marginal.
   **Effort: small. Fit: low.**
8. Insert chain 4 → 16 slots — trivial config bump if anyone hits the ceiling. **Fit: low.**

## Recommendation

**Do NOT chase FXCP's list.** The comparison shows DEViLBOX already wins the overlap; the
remaining FXCP advantages are its native-player identity, which is off-mission. Chasing
VST3/ASIO/casting/tag-editor/scrobble would make DEViLBOX a worse copy of a different product.

Build, if anything, the small on-mission shortlist that *serves making music*: **loudness
meter panel (#1), shader editor (#2), Camelot wheel (#3), FLAC/OGG export (#4).** Each
leverages code that already exists and reinforces DEViLBOX's identity rather than diluting it.

## Open questions for the user

- Is the goal parity-on-paper (marketing optics) or genuine capability we lack? Most of the
  perceived gap is optics — DEViLBOX has the capability, sometimes without the polished
  panel/widget FXCP ships.
- Does DEViLBOX want to grow a *listener* side (tag editor, gapless, radio) or stay a pure
  creation tool? That decision gates half the "gaps".
