# Format Reverse-Engineering Playbook

Distilled from the SunTronic V1.3 "Delirium" port (2026-07-13 → 2026-07-19), the
most complete compiled-format RE effort in DEViLBOX. This is the reusable
methodology + gotcha catalogue for taking any compiled Amiga music format from
"play-only via UADE" to **editable grid + byte-exact round-trip + native playback**.

Companion docs:
- [`FORMAT_COMMAND_STREAM_GRID.md`](FORMAT_COMMAND_STREAM_GRID.md) — the 3-layer
  command-stream→grid recipe (the *what*). This doc is the *how* + the *gotchas*.
- [`HARDWARE_UI_PATTERN.md`](HARDWARE_UI_PATTERN.md) — WASM module extraction.

---

## 0. When this applies

A format qualifies for the full port when its parser can decode **real structure**
(located command streams, instrument tables, per-voice cursors) — NOT when the
"format" is an opaque compiled 68k player whose notes ARE program logic (those are
terminal, play-only; see the exhausted opaque-RE bucket in MEMORY). Litmus test:
can you point at the bytes that encode note/instrument/effect per voice? If yes,
this playbook applies.

---

## 1. The north star: three separable deliverables

Never conflate these. SunTronic burned sessions because "it plays" and "the grid is
byte-exact" and "native synthesis is 1:1" were treated as one goal.

| Deliverable | Definition | Proof |
|---|---|---|
| **Editable grid** | parser decodes bytes → `TrackerCell` patterns the UI can edit | grid shows real notes; edits mutate the right cells |
| **Byte-exact round-trip** | unedited module re-exports its original bytes verbatim | round-trip harness ratchet = byte-exact, fails-on-revert |
| **Native/faithful playback** | audio matches the original replayer | oracle per-tick PER/VOL lockstep, or reuse the format's WASM engine |

Ship them in that order. The grid + carrier is almost always achievable and is the
"editability" the user usually means. **Native per-tick fidelity is a separate,
often much larger effort** (SunTronic's cycle-accurate Paula-DMA scheduler was judged
not worth porting for audible fidelity — see MEMORY). Do NOT gate editability on it.

---

## 2. Analyse-first: measure before the first edit

Codified house rule, proven repeatedly on SunTronic. Before writing any decode:

1. **State the invariant in the format's own terms**, not the first symptom. donner
   "plays noise" was really "0-synth module trips a `<=` guard → decode throws → falls
   to UADE's mis-render." The symptom was three layers from the root.
2. **Enumerate the level the fix lives at** — data format / decode arithmetic / guard
   condition / playback engine / presentation. A fix at the wrong level is a band-aid.
3. **Build the smallest discriminating probe.** SunTronic's whole port ran on probes:
   `probe-oracle-final.ts` (offline UADE render vs decoded grid, per-voice), a 20-line
   dlopen probe, per-frame diff counters. One decisive measurement beats three patches.
   **Never guess a constant or offset a probe can read from the real artifact.**
4. **Locate structure, don't hardcode offsets.** SunTronic found its instrument tables
   by locating `lea synthTable(pc),a0` / `lea sampledTable(pc),a1` LEA references and
   computing `deltaA`, not by pasting a magic address. Header pointer tables (SNX/TINY
   section pointers) are the same idea — read the pointer, follow it.

---

## 3. The command-stream → grid → carrier recipe (the core move)

Full detail in [`FORMAT_COMMAND_STREAM_GRID.md`](FORMAT_COMMAND_STREAM_GRID.md). The
one-paragraph version proven on SNX (this repo, commit `b7dfd04d8`) and the SunTronic
class:

A compiled format stores **one contiguous command stream per voice** (opcodes:
note-on, rest/delay, set-instrument, set-volume, set-tempo, loop, end). The editable
UI wants a **tick grid** (rows × channels). These are different shapes: `buildPatterns`
splits each voice stream across many display patterns. The whole-stream inverse
therefore **cannot** be reconstructed from one display pattern's rows.

Fix = attach a **structural raw-block carrier** to the `UADEVariablePatternLayout`:
- `blockRawBytes[ch]` = the original voice-stream bytes.
- `blockRows[ch]` = the FULL per-channel decoded baseline.

`encodeVariableBlock` emits `blockRawBytes[ch]` **verbatim** when `rows` still match
`blockRows[ch]` (unedited → byte-exact), and only runs the format's real packer once a
cell diverges. This gives byte-exact export for the untouched 99% while keeping edits
live. It is the SAME path the round-trip harness measures and the live chip-RAM rewrite
uses — measurement == export.

**The trap it avoids:** encoding one display pattern's rows and comparing to the whole
stream → 0% match (exactly what SNX did before the carrier). If your round-trip is 0%
on a per-voice command stream, you're missing the carrier.

---

## 4. Playback: reuse the format's engine, don't reinvent

SunTronic built a dedicated native engine (`SunTronicSongEngine`) but the decisive
lesson is cheaper: **check whether a WASM engine already handles the format before
writing synthesis.** For Sonix TINY the C engine (`sonix.c`) already had complete
detection + `parse_tiny` + tick playback + `.instr`/`.ss` loading — the only gap was
the TS parser throwing instead of attaching `sonixFileData`. Reusing an existing engine
turns a multi-session synthesis port into a ~10-line attach.

Routing pattern (both SunTronic and Sonix): the native engine activates on the presence
of a `*FileData` field (`sonixFileData`, `sunTronicSongFileData`). Companion samples
ride along in a sidecar map (`sonixSidecarFiles`) delivered to the engine's MEMFS.
`withFallback.ts` / `injectUADEPlayback` skips UADE injection when a dedicated engine
is present (`hasDedicatedEngine` list) — add the format's `*FileData` field there.

---

## 5. Decode arithmetic MUST mirror the player bit-for-bit

The richest vein of SunTronic bugs. The decoder is a re-implementation of the 68k
replayer; every arithmetic divergence is a wrong note.

- **Wrap at the same step the player wraps.** donner/ghost-notes: grid did
  `sunPitchToNote(((~b)&0xff)-transpose)` (mask, then subtract) but the player does
  `u8(~b - transpose)` — the `MOVE.B` truncates to 8 bits *before* the table lookup.
  At underflow the player wraps out-of-range → SILENT; the grid's small negative showed
  a phantom note. Fix: `sunPitchToNote((~b - transpose) & 0xff)`. **Match the operation
  ORDER and the register width, not just the formula.**
- **Operand width is version-dependent.** SunTronic 0x9b pitch-slide operand was 1
  sign-extended byte in Version-A, a full word in Main. Probe the real bytes per
  version; don't assume.
- **Table spans are full-byte-indexed.** drin arp selector is a full byte → table is
  `256 << shift`, not `(1<<shift)*16`. An out-of-range index silently produced no
  sweep. Size tables by the selector's actual range.
- **Guards must admit edge/equal cases.** donner 0-synth: `sampledTableOff <=
  synthTableOff` rejected the legitimate all-sampled module (0 synth records → the two
  LEAs coincide). Changed `<=` → `<`. drin gate rejected valid tables whose span
  overruns hunk#1 (extraction zero-fills the tail) — accept when the START is in-bounds.
  Every `<`/`<=`/`>=` in a structural guard is a decision about an edge case; verify it.
- **Loop-restart reloads per-voice state.** SunTronic streamed garbage for one whole
  position after looping because `loadPosition` set `position=0` and returned WITHOUT
  reloading each voice's cursor/transpose. On loop, re-init voice cursors exactly as the
  constructor does.

---

## 6. Reproject / writeback: re-run the decode, never a linear model

When the display pitch differs from the pool pitch by a transform (transpose, glide),
do NOT invert it with a linear `±transpose` — that is lossy for glide/clamp cells that
read pitch from a different stream carrier. SunTronic's fix: `reprojectSunGrid` re-runs
the SAME `decodeSunGroup` on the raw bytes at the target position, falling back to the
linear model only when raw bytes are absent (genuinely-edited cells). Carry the raw
source bytes on the cell so writeback can re-decode.

---

## 7. Regression discipline — every fix, fails-on-revert, in test:ci

Non-negotiable house rule; SunTronic added a test per fix.

- The round-trip **ratchet** (`encoderRoundtrip.ratchet.json`) IS the regression for
  carrier work: a byte-exact format may only stay byte-exact, `matchPct` may only rise,
  the unexercised set may only shrink. Adding a fixture that flips a format to byte-exact
  is self-guarding — revert the carrier and the "no regression" test fires (proven for
  SNX this session).
- For decode-arithmetic fixes, add a named regression (`sunGroupCodec.test.ts`
  "transpose underflow wraps to a blank note") that **fails on revert** — temporarily
  undo the fix and confirm RED before committing. A test green on broken code is
  decoration.
- Wire it into the `test:ci` glob or it doesn't count.
- Fixture rule: **real songs only, git-tracked only.** The harness `fixtures.map.ts` is
  populated by MEASURING that a fixture yields the claimed `formatId` — never guess a
  path. For a sub-format whose extension resolves to a dispatcher registry entry (e.g.
  `.snx`/`.tiny` share the `iffSmus` entry), add a per-fixture `parser` override naming
  the real dispatcher parser — points at existing app code, no logic duplication.

---

## 8. Native-audio measurement blind-spots

- `get_audio_level` taps the Tone masterMeter and is **BLIND** to a native engine's own
  AudioContext — it reports `silent:true` while native audio plays. Use `export_wav`
  `liveCapture:true` (honors the native path, respects mixer mute) or
  `get_oscilloscope_info`. Codified as a permanent MEMORY blind-spot.
- `solo_channel` does not reach native capture; use `set_channel_mute` for native
  isolation.
- The MCP relay socket flaps on heavy transfers (many companion samples, WAV polling) —
  "Browser disconnected" is transient; retry the same call 2–3× and it lands.

---

## 9. Oracle discipline (for the native-fidelity deliverable only)

If you DO pursue per-tick playback fidelity: build an **offline oracle** (the reference
replayer rendering to a buffer) and a windowed per-tick PER/VOL diff metric. Rules
learned the hard way:
- Run the oracle for ≥2 loops and collapse per-group to the last audible note before
  trimming to grid length — a 1-loop probe truncates and manufactures false divergences.
- If widening a correlation window monotonically lifts fidelity, the residual is
  **phase drift** (accumulated scheduler error), NOT timbre — do not widen the window to
  mask it (that hides the mismatch). SunTronic proved its type-2 gap was phase, not
  spectral, this way, and correctly deferred the scheduler port.
- A "cheap fix" probe that RUNS and shows the shipped code already beats every variant
  is a valid CLOSE — don't port a scheduler the measurement says won't help.

---

## 10. Process hygiene

- **Disclose the deliverable boundary.** "Editable" ≠ "native byte-exact playback."
  State which of the three §1 deliverables a change actually lands (the donner commit
  had to be amended for overclaiming native playback).
- **Never mark a driver "finished"** until its stated success bar (usually per-tick
  AUD PER/VOL lockstep, or byte-exact corpus-wide) is green. SunTronic is STILL not 1:1
  (tank1 ±2-tick) despite every decode bug being closed.
- Parallel investigation agents (ASM spec / engine map / byte probe) front-loaded the
  SunTronic and TINY ports cheaply — dispatch them before committing to an approach.

---

## 11. Worked example: Sonix TINY (this repo, applying the playbook)

TINY (`tiny.*`) was the second Sonix binary sub-format after SNX. It shipped
editable-grid + byte-exact carrier + WASM playback in one session by following
this doc. What each section bought:

- **§2 measure-don't-guess resolved a hard blocker.** The ASM-spec agent found the
  voice-stream **pointer base offset** disagreed across four code paths
  (`0x20`/`0x30`/`0x34`/`0x48`) and flagged it as blocking. A 30-line byte-probe on a
  real module (`tiny.ingame 17`) settled it in one shot: 4 pointers at bytes
  **48/52/56/60** = `320, 580, 704, 880`, each stream ending `0xFFFF`. The `0x140`
  the detector treats as an equality *marker* is simply **voice-0's pointer**. Never
  arbitrate a constant from conflicting static reads when the artifact can answer.
- **§5 decode-mirrors-player caught a fatal cross-format assumption.** TINY looks
  SNX-like but its opcodes are **NOT** SNX's. Verified against the ASM + the probe:

  | word | SNX meaning | TINY meaning |
  |---|---|---|
  | `0x80nn` | instrument change | **rest** for `nn` ticks |
  | `0x81nn` | loop control | **instrument change** to table[nn] |
  | `0x00–0x7F` low byte | note **volume** | note **duration** in ticks |
  | `0x82/0x83/0xC000` | tempo/volume/long-rest | **do not exist** |

  Reusing `parseSnxVoiceStream` on a TINY stream would mis-decode every instrument
  change, every rest, and every note's timing. The byte-probe's "velocity 8/16/32"
  was the tell — powers of two are note **lengths**, not velocities. A separate
  `parseTinyVoiceStream` was mandatory; sharing the SNX decoder was the band-aid.
- **§3 carrier gave byte-exact for free.** Each of the 4 voice streams is one
  contiguous command stream `buildPatterns` splits across many display patterns, so
  `blockRawBytes[ch]` + `blockRows[ch]` on the `UADEVariablePatternLayout` make the
  unedited round-trip byte-exact (harness: `sonixMusicDriverTiny` 100%, `encode-pattern`).
  A distinct `formatId` (`sonixMusicDriverTiny`) + its own registered encoder let the
  ratchet exercise TINY independently of SNX.
- **§4 reuse-the-engine made playback a 4-line attach.** The Sonix C engine
  (`sonix.c`) already had `parse_tiny` + tick playback. Playback routing keys purely
  on `song.sonixFileData` presence (`usePatternPlayback.ts`), so TINY rides the exact
  SNX path: set `sonixFileData` + `sonixSidecarFiles`, done. Instrument names come
  from the 4-byte ASCII table at file `0x40` (the `.instr` companion basenames).
- **§7 double regression.** The ratchet entry guards the carrier; a dedicated
  `sonixTinyRoundtrip.test.ts` guards the **grid** (asserts real notes decode + named
  instruments), both fails-on-revert (the old `throw` → parse rejects → red), both in
  `test:ci`.
- **§1 deliverable boundary, disclosed.** Grid pitch is the raw note index (same
  convention as SNX), NOT the type-1 synth's resolved Hz — audible 1:1 synthesis would
  need porting the ~460-line SYNTHTECH routine, which is the separate native-fidelity
  deliverable and is not required for editing or for WASM playback.
