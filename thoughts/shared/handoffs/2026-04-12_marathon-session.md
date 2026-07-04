---
date: 2026-04-12
topic: marathon-session-handoff
tags: [geonkick, uade, gig-hardening, soak-test, session-handoff]
status: final
---

# Session Handoff — April 11-12 2026

Marathon session covering four major work streams. The live gig is April 18 (6 days away).

## 1. Geonkick Percussion Synth — Full WASM Port

Ported Quamplex Geonkick (https://gitlab.com/quamplex/geonkick) from scratch. The upstream is a GPL-3 Linux percussion synthesizer; DEViLBOX now runs its pure-C DSP engine in the browser via Emscripten.

**Architecture:**
- 10k-line C DSP engine compiled to 40 KB WASM (`-DGEONKICK_SINGLE`, 32 MB heap)
- `worker_stub.c` replaces upstream's pthread worker with synchronous rebake
- 32 exported C functions covering create/destroy/trigger/render + scalars + envelopes
- AudioWorklet processor with 26 message types
- TypeScript engine (singleton) + DevilboxSynth wrapper + preset loader

**Key bugs found & fixed during the port:**
- Geonkick's mixer writes stereo pairs (`out[2*ch+0/1]`); passing mono causes OOB → ring buffer div-by-zero
- Instrument output limiter defaults to 0 (only audition channel gets 1.0)
- Oscillator groups default to disabled; must enable explicitly
- `kick.ampl_env.length` is in milliseconds (upstream DspProxy divides by 1000)
- Preset `layers` array determines which groups are active; loader must disable groups NOT in layers

**Delivered:**
- 82 bundled `.gkick` presets across 7 bundles (UnfaTutorial, DigitalSamba, DSoS, GeonkickBells, HaraldReveryKicks, SPKickPresetsVol1, TimeKit)
- Interactive envelope editor (drag-point canvas) for all 8 kick-level + 36 per-oscillator envelopes
- Full scalar parameter UI (filter, distortion, per-osc amplitude/freq/function/FM/phase/seed)
- Registry integration — searchable in the synth browser under Drums, preset picker in the editor
- DOM + Pixi panels

**Commits:** `bfd229a1c` through `b8afdaae3` + `6334cd705` + `c53163584` + `9478d217b` + `336b47ce4`

**Follow-up needed:** Multi-instrument kit (drop `-DGEONKICK_SINGLE`), compressor/humanizer params, Pixi envelope canvas mirror.

---

## 2. UADE Phase 3/4/5 — Format Editability

**Phase 3 — Sample extraction (6 new formats):**
- MartinWalker: magic-byte scan → 4-byte offset entries (`10c43d1ba`)
- CoreDesign: HUNK parsing → 14-byte descriptors (`10c43d1ba`)
- KrisHatlelid: IFF FORM/8SVX scanning (`8c6a14b06`)
- SoundPlayer: IFF FORM/8SVX scanning (`8c6a14b06`)
- JesperOlsen: IFF FORM scanning, 3 variants (`8c6a14b06`)
- AshleyHogg: 68k opcode scan → 44-byte descriptors, old format (`8c6a14b06`)
- Cinemaware: instrument names extracted from 138-byte group descriptors; PCM blocked (external IFF companion files required) (`9478d217b`)

**Phase 4 — Tier 4 binary-only:** All 5 formats (GlueMon, Laxity, FredGray, SpeedySystem, SpecialFX) verified functional via the dynamic layout builder. No code changes needed.

**Phase 5 — Synth formats:**
- FredEditor: already wired to FredSynth + FredConfig + FredControls (pre-existing)
- RonKlaren: new RonKlarenConfig + RonKlarenControls with phase osc/vibrato/ADSR knobs + Pixi mirror (`95642a0d5` + `336b47ce4`)
- SunTronic: new parser from scratch — opcode scanning, 4-channel sample extraction, 5/7 test files pass (`49e991f58`)

---

## 3. Gig Hardening — 42 Bugs Fixed

Systematic audit + fix of every DJ/VJ subsystem for the April 18 live set. Four rounds of parallel audit agents followed by targeted fix agents.

### Audio Engine (7 fixes)
| Fix | File |
|-----|------|
| Worklet `onprocessorerror` handler | ChannelRouting.ts |
| NaN guard in envelope tick (`voice.fadeout ?? 65536`) | ChannelRouting.ts |
| Effect chain rebuild atomic swap (no audio gap) | MasterEffectsChain.ts |
| Effect chain bypass on FX creation failure | DJMixerEngine.ts |
| Limiter attack 3ms→1ms for crossfader transients | DJMixerEngine.ts |
| MIDI CC effect throttle @30Hz | parameterRouter.ts |
| Audio graph constructor try-catch | DJMixerEngine.ts + DeckEngine.ts |

### DJ Mixer (4 fixes)
| Fix | File |
|-----|------|
| Crossfader cut mode 2ms anti-click ramp | DJMixerEngine.ts |
| Master chain bypass when FX chain fails | DJMixerEngine.ts |
| BitCrusher bits floor/clamp | EffectParameterEngine.ts |
| Tab visibility handler + AudioContext resume | DJEngine.ts |

### Deck Playback (6 fixes)
| Fix | File |
|-----|------|
| Loop rAF dispose race guard (`_disposed` flag) | DeckAudioPlayer.ts |
| Loop region clamp to track duration | DeckAudioPlayer.ts |
| Seek during crossfade try-catch | DJActions.ts |
| Playback rate clamp 0-4x | DeckAudioPlayer.ts |
| Audio buffer release on track replace | DeckAudioPlayer.ts |
| 100 MB file size limit | DeckAudioPlayer.ts |

### DJ Components (6 fixes)
| Fix | File |
|-----|------|
| `beatGrid!.bpm` → `beatGrid?.bpm ?? 120` | DJView.tsx |
| RAF poll error logging | useDeckStateSync.ts |
| DeckFXPads timer refs + cleanup | DeckFXPads.tsx |
| DJSamplerPanel per-pad timer Map | DJSamplerPanel.tsx |
| DJModlandBrowser close timer ref | DJModlandBrowser.tsx |
| Keyboard safety — block tracker undo/redo in DJ/VJ mode | useGlobalKeyboardHandler.ts |

### DJ Stores + Pipeline (5 fixes)
| Fix | File |
|-----|------|
| Cross-store stale read (capture before mutate) | useDJPlaylistStore.ts |
| Serato metadata cleanup on track load | useDJStore.ts |
| AutoDJ fire-and-forget `.catch()` | DJAutoDJ.ts |
| Worker `onerror` → reject all pending callbacks | DJPipeline.ts |
| 60-second task timeout | DJPipeline.ts |

### DJ Recording (2 fixes)
| Fix | File |
|-----|------|
| Video recorder auto-save every 10 min (was 3.7 GB in RAM) | DJVideoRecorder.ts |
| Mic recorder auto-save pattern | DJMicEngine.ts |

### VJ Rendering (5 fixes)
| Fix | File |
|-----|------|
| ProjectMCanvas: rAF Float32Array pre-allocation (~1 MB/sec GC eliminated) | ProjectMCanvas.tsx |
| KraftwerkHeadOverlay: WebGL context listener cleanup | KraftwerkHeadOverlay.tsx |
| Three.js geometry + material `.dispose()` on unmount | ReactiveParticles, AudioTerrain, WireframeSphere |
| ProjectM preset race condition guard (`mountedRef`) | ProjectMCanvas.tsx |
| ISF shader error auto-recovery (fallback to preset 0) | ISFCanvas.tsx |

### VJ Loading (2 fixes)
| Fix | File |
|-----|------|
| Butterchurn load failure → fallback UI (not frozen forever) | VJView.tsx |
| VJPresetBrowser `.catch()` | VJPresetBrowser.tsx |

### App Shell + Performance (5 fixes)
| Fix | File |
|-----|------|
| Mixer + DrumPad error boundaries | App.tsx |
| DJHealthMonitor error visibility (not silent swallow) | DJHealthMonitor.ts |
| GC pressure: channel levels buffer reuse | ChannelRouting.ts |
| Scope canvases idle after 1s when deck paused | DeckScopes.tsx |
| DJActions spin-down abort on tab-hidden | DJActions.ts |

---

## 4. Soak Test Infrastructure

**Design spec:** `thoughts/shared/research/2026-04-11_soak-test-design.md`

**Browser-side hooks** (`src/debug/soakActions.ts`, dev-only):
- 9 DJ/VJ actions: switchView, loadDeck, playDeck, stopDeck, setCrossfader, setEQ, setFilter, setDeckVolume, nextVjPreset
- Frame-time rAF recorder (30K-sample ring buffer) → p50/p95/p99/max/jankRatio
- GPU stats collector (WEBGL_debug_renderer_info)
- 3 new MCP tools: `dj_vj_action`, `get_frame_stats`, `get_gpu_stats`

**Scenario runner** (`tools/soak-test.ts` + `tools/soak-scenarios/gig.ts`):
- `--scenario` flag switches from format-cycling to DJ/VJ scenario mode
- Default gig scenario: 23 steps/cycle × 120s = ~60 cycles for 2 hours
- Crossfade ramps, EQ/filter sweeps, VJ preset cycling, telemetry snapshots
- Report: frame-time table, GPU info, memory sparkline, action log, pass/fail gates
- Gates: heap drift <50 MB, jank <1%, zero action failures

**To run:**
```bash
npx tsx tools/soak-test.ts \
  --scenario tools/soak-scenarios/gig.ts \
  --duration 2 \
  --music-dir "/Users/spot/Code/Reference Music" \
  --report "tools/soak-report-$(date +%Y%m%d).md"
```

---

## 5. Other Fixes

- **fx-delay audit regression** — was an audit script bug (`delayTime` vs `time` param key), not a product bug. Fixed in `88379bb8f`.
- **Editor maximization** — verified all 4 tasks (FuturePlayer, SonicArranger, JamCracker, FC) shipped. Design-token cleanup on FuturePlayer negate toggles (`7c60dbe30`).
- **Cinemaware** — instrument names extracted from group descriptors. Full PCM blocked by external companion files.

---

## Next Steps (Priority Order)

1. **Run the soak test** — 30-min smoke first, then 2-hour overnight. Needs dev server on normal ports.
2. **Manual DJ/VJ test** — load tracks, crossfade, apply effects, switch tabs, rapid VJ preset cycling. Verify the 42 fixes hold under real interaction.
3. **Pixi mirror of Geonkick envelope canvas** — CLAUDE.md compliance, not gig-critical.
4. **Geonkick multi-instrument kit** — drop `-DGEONKICK_SINGLE` for 16-piece kits.
5. **Cinemaware companion file loading** — needs the Instruments/ directory present alongside CIN.* modules.

---

## Artifacts

| Path | What |
|------|------|
| `third-party/geonkick-master/src/dsp/` | Upstream DSP source (39 files) |
| `geonkick-wasm/` | Build skeleton + bridge + stubs + smoke tests |
| `public/geonkick/` | WASM + worklet + 82 presets |
| `src/engine/geonkick/` | Engine + Synth + PresetLoader |
| `src/components/instruments/controls/GeonkickControls.tsx` | DOM editor |
| `src/components/instruments/controls/GeonkickEnvelopeCanvas.tsx` | Drag-point envelope |
| `src/pixi/views/instruments/PixiGeonkickPanel.tsx` | Pixi preset picker |
| `src/pixi/views/instruments/PixiRonKlarenPanel.tsx` | Pixi synth controls |
| `src/debug/soakActions.ts` | Soak test browser hooks (dev-only) |
| `tools/soak-scenarios/gig.ts` | 2-hour DJ/VJ scenario |
| `tools/soak-test.ts` | Scenario runner (extended) |
| `thoughts/shared/research/2026-04-11_soak-test-design.md` | Soak test design spec |
