---
date: 2026-10-15
topic: Tracker pitch slider / Key Lock reach per playback engine (PITCH-SLIDER-ALL-FORMATS, TRACKER-KEY-LOCK open part)
tags: [pitch-slider, key-lock, engines, census, tempo, native-engines]
status: final
---

# Pitch slider engine census

Counted from: `WASM_ENGINES` in src/engine/replayer/wasmEngineRegistry.ts (65 descriptors, lines 99-1040; 63 have
`needsDirectRouting: true`, only `Hively` and `V2M` have false) plus the non-registry branches of `startNativeEngines`
(src/engine/replayer/NativeEngineRouting.ts: C64 SID :742, CheeseCutter :862, Symphonie :901, SunVox :959) plus
TrackerReplayer scheduler and LibOpenMPT. NOT counted from MCP get_format_engines (that lists only formats with a
user-selectable engine choice).

## Root finding

`PatternScheduler.applyPitchState` (PatternScheduler.ts:142-176) reaches only: replayer tempo/samples, Tone synth detune,
C64SIDEngine, `setSynthBusPitchRate` (PitchResampler worklet on synthBus, ToneEngine.ts:1484-1522), LibOpenMPT.
The 63 direct-routed registry engines output via `openEngineRouting` (NativeEngineRouting.ts:322-375) ->
`separationNode.inputTone` -> `outputTone` -> `engine.masterInput` (TrackerReplayer.ts:836-851), which is DOWNSTREAM of
the synthBus resampler. The slider therefore does nothing to them (by code; see "Not verified").

Native-control survey (grep of worklet message handlers in public/ and KEEPALIVE exports in *-wasm/): the only
engines with a tempo/rate control are LibOpenMPT (chiptune3.worklet.js:324-328 setPitch/setTempo; LibopenmptEngine.ts:343,353),
Hively (varispeed ring read, Hively.worklet.js:196 `setRateFactor`, HivelyEngine.ts:392), Furnace
(FurnaceSequencer.cpp:3014 furnace_seq_set_tempo, :2989 set_speed; FurnaceDispatchWrapper.cpp:1357 set_tick_rate;
FurnaceDispatch.worklet.js:425,661-681), GTUltra (GTUltraBridge.cpp:972 gt_set_tempo, song tempo not a scale), C64 SID
(C64SIDEngine.ts:353-363 -> JSSIDEngine.ts:409 setSpeedMultiplier, JSIDPlay2Engine.ts:314). Every other engine is a
render(buffer) WASM with no tempo export.

Common structure of the tick replayers: tempo = samples per tick, pitch = voice increment from the engine sample rate
(e.g. Hively hvl_replay.c:2047 `samples = ht_Frequency/50/ht_SpeedMultiplier`; Symphonie symphonie_wrapper.c:262
samplesPerTick). So "native tempo" for these = one new export scaling samples-per-tick (pitch untouched) = lossless
Key Lock. "Pitch only" = scale the voice-rate/sample-rate input without touching the tick length.

## Table

Legend slider today: none / pitch-only (resampler, drops out at rate != 1) / tempo / both. Cost S/M/L per engine class.

| # | Engine (registry key) | Format examples | Slider today | Native controls (file:line) | Proposed method | Cost |
|---|---|---|---|---|---|---|
| 1 | TrackerReplayer scheduler (samples+synths) | MOD/XM/S3M/IT w/o libopenmpt, native-parsed | both, Key Lock lossless | replayer.setTempoMultiplier, ToneEngine.setGlobalPlaybackRate (PatternScheduler.ts:153-160) | done | - |
| 2 | LibOpenMPT | MOD/XM/S3M/IT/MPTM from file | both, Key Lock lossless | play.tempo_factor / pitch_factor (LibopenmptEngine.ts:343,353) | done; dub tape-stop overrides it (transportRate.ts) | - |
| 3 | Hively | AHX, HVL | pitch-only via resampler (Hively synth -> synthBus; HivelySynth.ts:86,105), tempo none, dropouts | `setRateFactor` varispeed (Hively.worklet.js:196, HivelyEngine.ts:392); hively_get_speed_multiplier only getter (HivelyWrapper.c:232); tick length hvl_replay.c:2047 | Key Lock off: setRateFactor(rate) (exists, clean). Key Lock on: new export `hively_set_tempo_scale` scaling samples-per-tick | S (off), S-M (on) |
| 4 | V2M | Farbrausch .v2m | pitch-only via resampler | none (V2 synth render) | varispeed render + stretch, or v2 player tempo if exposed | M |
| 5 | Klystrack | .kt | none | klys_get_song_rate/speed getters only (KlysWrapper.c:215-229) | add tick-length scale in klys render loop | M |
| 6 | JamCracker | .jam | none | none (jamcracker-wasm/src) | samples-per-tick scale export | S |
| 7 | FuturePlayer | .fp | none | none | tick scale export | S |
| 8 | PreTracker | .prt | none | none | tick scale export | S |
| 9 | MusicAssembler | .ma | none | none | tick scale export | S |
| 10 | BenDaglish | .bd | none | none | tick scale export | S |
| 11 | Hippel (COSO) + HippelSt | .hipc/.sog/.mcmd | none | none | tick scale export | S |
| 12 | Sonix | .snx/.smus | none | none | tick scale export | S |
| 13 | MaxTrax | .mxtx | none | none (MIDI-like tempo inside engine) | tempo scale in engine | S |
| 14 | Pxtone | .ptcop | none | none | tempo scale (BPM native in format) | S |
| 15 | Organya, PiyoPiyo | .org, .pmd-like | none | none | tempo scale (wait-per-step) | S |
| 16 | Sawteeth | .st | none | none | tick scale | S |
| 17 | Eupmini, Pmdmini, Mdxmini, Fmplayer, S98, TFM (FM/OPN chip players) | .eup .pmd .mdx .m .s98 .tfm | none | pmd/mdx timer-B based; none exposed | chip clock vs timer: scale timer-B period (tempo) separate from chip clock (pitch) | M |
| 18 | Ixalance, Cpsycle | .ixs, Psycle | none | none | tempo scale in engine (Psycle has BPM) | M |
| 19 | Sc68, Psgplay, Asap | .sc68, .sndh, .sap | none | CPU-emulated, tempo = vblank/timer IRQ rate | scale emulated machine clock = varispeed only; independent needs stretch | L |
| 20 | Qsf, Zxtune, Gme, Aylet | .qsf, many chip formats, .nsf/.gbs..., .ay | none | emulated CPU + chip; no tempo export | varispeed via render rate + Signalsmith on that engine's node | M-L |
| 21 | StoneTracker, SteveTurner, MusicMaker, PumaTracker, SidMon1, SidMon2, ArtOfNoise, Cinter4 | Amiga | none | none | tick scale export each (Paula replayers share structure) | S each |
| 22 | EaglePlayer, Nuade | Amiga multi-format | none | eagleplayer ep_wasm_player_ticks getter only (eagleplayer_wasm.c:50) | tick scale per player | M |
| 23 | MusicLine, TFMXModule | .ml, .mdat | none | TFMX has CIA-timer BPM in file (NativeEngineRouting.ts:627) | scale timer period in replayer | S-M |
| 24 | SoundControl, DeltaMusic1/2, RonKlaren, Actionamics, ActivisionPro, Synthesis, Dss, SoundFactory2, FaceTheMusic, FredReplayer2, Oktalyzer, InStereo1/2, FutureComposer, QuadraComposer, SoundMon, DigMug, DavidWhittaker, SonicArranger, SunTronicSong | Amiga | none | none | tick scale export each | S each (about 19 engines, mechanical) |
| 25 | UADEEditable + UADE classic (UADESynth) | ~100 Amiga formats | editable: none (direct); classic: pitch-only via resampler | uade_wasm_get_cia_state (uade-wasm/src/entry.c:786), tick counters only; no tempo export | varispeed: render rate + ring (as Hively). Independent: no clean path (players rewrite CIA); use per-engine Signalsmith compensation | L |
| 26 | C64 SID jsSID | .sid | tempo only (VSync), varispeed (CIA) | JSSIDEngine.ts:409 setSpeedMultiplier; C64SIDEngine.ts:353,363 | CIA tunes: add resampler-free pitch compensation | M |
| 27 | C64 SID JSIDPlay2 / ScriptNodePlayer / SF2Engine | .sid, .sf2 | JSIDPlay2 fast-forward; ScriptNode and SF2 none | JSIDPlay2Engine.ts:314 | SF2: its own tempo (sequencer) | M |
| 28 | CheeseCutter | .ct | pitch-only via synthBus | none (6502 CPU + reSID) | 6502 frame-rate scale = varispeed; independent needs CPU-frame vs SID-clock split | M |
| 29 | Symphonie | .symmod | none (node -> separation, NativeEngineRouting.ts:901-950) | player_set_speed song speed; samplesPerTick (symphonie_wrapper.c:51,262) | scale samplesPerTick (tempo) and sample step (pitch) | S |
| 30 | SunVox (song mode) | .sunvox | pitch-only via synthBus (UNVERIFIED) | sunvox_wasm_get_bpm getter (SunVoxWrapper.cpp:540); SunVox has sv_set_..bpm via sunvox lib | tempo: BPM/speed override; pitch: global transpose | M |
| 31 | Furnace sequencer + dispatch | .fur, .dmf | UNVERIFIED (synthBus -> pitch-only by design) | furnace_seq_set_tempo FurnaceSequencer.cpp:3014, set_speed :2989, set_tick_rate FurnaceDispatchWrapper.cpp:1357, worklet setTickRate :425 | tempo native today; pitch via chip clock/detune; both exist | M |
| 32 | GTUltra | .sng (GoatTracker) | UNVERIFIED | gt_set_tempo GTUltraBridge.cpp:972 (per-channel song tempo, not a scale) | scale frame length (framerate) for tempo | S-M |

## Verification

Done live (aces_high.ahx via MCP): load, play, 1.5 s band spectra at globalPitch 0 vs +12 were identical (63 Hz -20.7 vs
-20.6 dB, 16 kHz -38.8 vs -38.7). That does NOT show the slider fails: MCP `set_global_pitch` only writes the store and
never calls `PatternScheduler.setGlobalPitchOffset` (ledger: DJView.tsx:208, MCP handler). So the probe is void for the
slider itself. Playback stopped, pitch reset to 0.

Not verified (no way to drive the real slider without a browser tab or an engine import): the "none" claim for the 63
direct-routed engines rests on code reading (routing path above); Furnace, GTUltra, SunVox routing (rows 30-32) were not read.
Per-engine "no tempo export" claims come from grepping KEEPALIVE exports and worklet message handlers by name pattern
(tempo|speed|bpm|rate|timer|cia|tick), which proves a spelling is absent, not that the C has no tempo variable.

## Recommended order

1. Fix the apply path first: MCP set_global_pitch / DJView.tsx:208 must call the scheduler, otherwise no engine can be tested via MCP.
2. Hively (AHX/HVL): `setRateFactor` already exists (varispeed); add tick-scale export for Key Lock. Owner's example, cost S.
3. The Amiga/chiptune tick replayers (rows 5-16, 21-24, ~45 registry engines): they share one structure, so one shared pattern:
   export `<engine>_set_tempo_scale(f)` scaling samples-per-tick, one worklet message `setTempoScale`, one TS entry in the
   descriptor (`tempoControl?` field in NativeEngineDescriptor) consumed by applyPitchState via computeTempoPitchSplit.
   Pitch for these = rate of the whole render (resampling ring as Hively) or voice increment scale.
4. Emulator-clocked engines (rows 19, 20, 25, 28): varispeed render-rate with ring read now; independent tempo only via
   per-engine Signalsmith insert (never on synthBus).
5. Furnace/GTUltra/SunVox/SID last: native tempo already exists, wire into the same descriptor field.
