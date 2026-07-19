---
date: 2026-07-19
topic: suntronic-donner-noise-fix
tags: [suntronic, native-decode, v13, donner, sampled-instruments]
status: implemented
---

# SunTronic donner noise bug — all-sampled (0-synth) decode fix

## Task(s)

**DONE (committed 2e2c24c95, live-verified):** Fix user-reported "suntronic-donner.src plays noise" bug.
donner was the sole 1-of-142 SunTronic .src song that played garbage. Root-caused, fixed at
the decode layer, regression added, verified clean in real Chrome. Awaiting explicit commit/push.

User decision this session (AskUserQuestion): chose **"Fix native decode"** over pulling donner
from the corpus.

## Root cause (measured, not guessed)

donner is the **only all-sampled** SunTronic V1.3 module in the corpus: **14 sampled instruments,
0 synth instruments**. In an all-sampled module the replayer's `lea synthTable(pc),a0` and
`lea sampledTable(pc),a1` both target the SAME hunk#1 address (donner: 0x15b8), so
`synthTableOff === sampledTableOff` and the synth count is 0.

The decode guard in `parseSunTronicV13Score` was:
```
if (synthTableOff < 0 || sampledTableOff <= synthTableOff || sampledTableOff >= h1.length)
  throw new Error('SunTronic V1.3: instrument table offsets out of range');
```
The `<=` treated the equal case (0 synths) as structurally broken → **threw**. That drop routed
donner to `withNativeThenUADE(injectUADE)` → UADE, whose SunTronic eagleplayer **mis-renders this
build variant as noise**. Proven this session that even a pure-UADE single-driver instrument (all
Sampler display stubs stripped) still played noise → the noise is UADE's own replay of donner, not
a suppressible Sampler-stub leak. deltaA was NOT miscalibrated (0x68 correct; LEAs located fine) —
the earlier "deltaA miscalibrated / tables out of range" hypothesis was WRONG. The tables coincide
legitimately because there are no synth records.

## The fix

`src/lib/import/formats/SunTronicV13.ts` (~line 901): guard `sampledTableOff <= synthTableOff`
changed to `sampledTableOff < synthTableOff`. Accepts the equal case (count 0). Right level:
decode structural guard, not a render band-aid.

**What the fix actually changes (playback):** the noise was UADE 'enhanced' reconstruction from DMA
snapshots, reached because decode threw. With decode succeeding, donner takes the SAME path as the
other 141 V1.3 songs: UADE plays the ORIGINAL bytes 1:1 (clean) and the decoded grid provides
editability. This does NOT put donner on the native SunTronic engine — native byte-exact playback of
the decoded grid is still gated behind the Gate B.2/D/E work in progress. Until that lands, donner's
audio (like the rest of the V1.3 corpus) plays via UADE; "editable" = decoded-grid parity with the
other V1.3 modules, not native synthesis.

## Recent changes (this session, UNCOMMITTED)

- `src/lib/import/formats/SunTronicV13.ts` — the one-char guard fix + explanatory comment.
- `src/lib/import/formats/__tests__/sunTronicV13Parse.test.ts` — new regression case
  "suntronic-donner.src: all-sampled build (0 synth) whose synth/sampled LEAs coincide still
  decodes". Asserts synthInstrumentCount 0, sampledInstruments 14, 14 sample-type instruments,
  notes in grid. **Fails-on-revert CONFIRMED** (revert `<`→`<=` → 1 failed). Already in the
  test:ci glob (sunTronicV13Parse.test.ts was already listed).

Prior-session experimental edits to `withFallback.ts` and `sunTronicHybridRouting.test.ts` were
reverted (git checkout) and are NOT part of this fix — those were dead ends (forcing classic mode,
retag-all-to-UADEEditableSynth). Ignore them.

## Verification

- **Corpus scan (probe, since deleted):** 142/142 .src decode now (was 141/142). donner is the
  SOLE 0-synth module → the equal-case change affects nothing else.
- **type-check:** `npm run type-check` clean.
- **Regression:** 9/9 in sunTronicV13Parse.test.ts; fails-on-revert proven.
- **Live real Chrome (MCP):** loaded donner → SunTronic native, 4 ch, 20 patterns, 14 instruments
  all named (sphere.x, popsnare2.x, haha2.x, newbass.x, ping1.x, bais.x, laser.x, wind.x, span.x,
  donner.x, 3kla.x, alien.x, over.x, hihat.x). play → oscilloscope 4 active "SunTronic N" channels
  hasData. Captured 60s WAV via export_wav liveCapture (native-aware; get_audio_level is BLIND to
  native context — showed silent:true falsely, expected). Decoded stats:
  - ch0 peak 0.248 rms 0.0567 clipFrac 0.00000 zcr 0.047
  - ch1 peak 0.231 rms 0.0441 clipFrac 0.00000 zcr 0.030
  Low zcr (0.03–0.05) + zero clipping = clean tonal music, NOT noise (white noise zcr ≈ 0.5).

## Critical references

- `src/lib/import/formats/SunTronicV13.ts:894-906` — LEA-located instrument tables + the fixed guard.
- `src/lib/import/formats/SunTronicV13.ts:485-490` — REF_SYNTH_LEA/REF_SAMPLED_LEA/deltaA constants.
- `src/lib/import/parsers/AmigaFormatParsers.ts:2397-2424` — SunTronic routing. `prefs.suntronic ===
  'native'` → parseSunTronicFile → native engine (dedicated audio). On throw → withNativeThenUADE
  injectUADE → UADE. donner now succeeds in the native branch.
- `src/lib/import/formats/__tests__/sunTronicV13Parse.test.ts` — the regression (new case + existing).
- donner files: `public/data/songs/{,formats/}SUNTronicTunes/suntronic-donner.src` (two shipped
  copies, identical). 14 samples in `.../SUNTronicTunes/instr/*.x` all present + byte-identical.

## Learnings

- SunTronic V1.3 modules CAN be all-sampled (0 synth records); the two instrument-table LEAs then
  coincide. Any guard on table-offset ordering must allow equal, not just strict-greater.
- `get_audio_level` (Tone masterMeter) is BLIND to the native SunTronic context — reports
  silent:true while native audio plays. Use `export_wav liveCapture:true` (honors native path) or
  `get_oscilloscope_info` for native-visible measurement. Known blind-spot, see MEMORY.md.
- The MCP relay socket flaps on heavy transfers (load_file with 14 companion samples, export_wav
  polling) — "Browser disconnected" / "No browser connected" are transient; retry the same call
  2–3× and it lands. State queries (get_playback_state) keep working through the flap.

## Slow-cursor report — INVESTIGATED, NOT A REAL BUG (resolved on clean reload)

**Symptom (user, 2026-07-19):** donner appeared to play with correct audio but a crawling visual
row cursor. **Resolved:** after restarting dev + MCP and doing a clean browser reload, the user
confirmed "it seems fine now." Root of the false alarm: the earlier slow-scroll was a desynced
playback-state artifact from a flapping/killed-then-reconnected MCP relay session, not a donner bug.
A clean get_full_state showed `song.currentPattern`/`currentPosition` tracking correctly (pattern 3
at globalRow 192), and `editor.followPlayback: false` (view auto-scroll was off anyway). The stale
`playback.currentPattern: 0` field that looked stuck is a separate counter, not what the grid uses
once state is fresh. No fix needed. Details below kept for reference only.

**Original (stale-session) observations:**
donner played with correct audio ("audio is fine") but the visual row cursor appeared to crawl.

**NOT the decode fix** — decode is done and audio verified clean. This is a separate, pre-existing
DISPLAY bug in native SunTronic follow-scroll that donner surfaces.

**Mechanism located (static):** during native SunTronic playback there are TWO independent clocks:
- Audio = `src/engine/suntronic/SunTronicSongEngine.ts` — plays donner's real tempo. It reports NO
  row/position to the UI (only pushes scope windows per pump tick, ~25fps; grep confirms no
  position/getRow/onRow/currentRow hook in SunTronicSongEngine or SunTronicNativeRender).
- Visual cursor = the generic `TrackerReplayer` grid clock, stepping the flattened grid at the
  HARDCODED `initialSpeed 6 / initialBPM 125` (SunTronicParser.ts:723/724 for the V13 path, :418/419
  raw-rip path — every SunTronic song gets 6/125 regardless of its real tempo).
- `NativeEngineRouting.ts:814-833` — SunTronicSong is `suppressNotes: true`,
  `needsDirectRouting: true`, singleton; audio decoupled from the grid.

**Live evidence captured this session:** `get_playback_state` during donner play returned
`currentGlobalRow: 128` while `currentPattern: 0, currentRow: 15` — internally inconsistent
(globalRow 128 = pattern 2 row 0), i.e. the audio-derived position ran ahead while the displayed
grid cursor lagged.

**Structural note:** donner grid = 79 sequence positions × 16 rows/pos = 1264 rows, chunked into
20×64-row patterns (1264/64 = 19.75, last pattern partial). mule = 12×32 = 384 = 6×64 exact. donner's
non-integer position-to-pattern packing may interact with the follow-scroll mapping.

**Cannot settle without the running stack (dev + MCP were killed at session end):**
1. Is the slow cursor donner-specific or does it affect ALL native SunTronic songs? Compare mule.src
   in native mode live (watch currentRow vs audio).
2. Exact divergence point: where currentGlobalRow (audio-derived) and currentPattern/currentRow
   (grid clock) come from, and why they don't agree. Trace in the store's playback-position setter
   and the follow-scroll hook.

**Hypotheses to test (do NOT code blind — measure first per analyse-first rule):**
- (a) UI grid clock at fixed 6/125 is simply slower than donner's real native tempo → all native
  SunTronic songs lag proportionally to their real-vs-6/125 mismatch. Fix = derive the real
  tick/speed per song (is there a per-song speed field beyond rowsPerPositionDefault? Only
  rowsPerPositionDefault is currently read — check the replayer for a VBLANK/tick divider).
- (b) Position-to-pattern mapping mismatch from the 16-rows/pos → 64-row-pattern packing.
- (c) The native engine SHOULD drive the cursor (emit row/position events consumed by the store)
  instead of a parallel free-running grid clock — the two-clock architecture is the root and the
  cursor should follow the audio engine's actual position.

## Next steps

1. **Commit + push the DECODE fix** (awaiting user OK — independent of the scroll bug, audio verified
   clean). Suggested commit:
   `fix(suntronic): decode all-sampled (0-synth) modules — donner no longer noise`
   Two files: SunTronicV13.ts + sunTronicV13Parse.test.ts. Pre-push hook runs type-check + test:ci +
   test:compliance. Deploy = `git push origin main` (CI → Hetzner).
2. Nothing else open on donner. The slow-cursor report was a stale-session artifact (see above),
   resolved on clean reload. donner joins the 141 clean native songs.

## Other notes

- Dev server + MCP relay were killed at session end (background tasks stopped). Restart with
  `npm run dev` for next live check.
- Broader SunTronic 1:1 fidelity (tank1 PER ±2-tick, cycle-accurate Paula-DMA scheduler) is a
  SEPARATE deferred TODO — unrelated to this decode fix. See MEMORY.md.
