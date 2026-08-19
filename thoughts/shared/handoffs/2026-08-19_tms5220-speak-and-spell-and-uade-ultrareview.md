---
date: 2026-08-19
topic: "TMS5220 Speak & Spell audio work + UADE ultrareview fixes"
tags: [tms5220, speak-and-spell, mame-wasm, uade, vsm-rom, speech, ultrareview]
status: in-progress
---

# Session handoff — TMS5220 Speak & Spell + UADE ultrareview

Two bodies of work. The UADE half is **finished, merged and deployed**. The Speak &
Spell half is **in progress with five commits unpushed and a dirty tree**.

---

## 1. Task(s)

| # | Task | State |
|---|------|-------|
| 1 | `/code-review ultra` on the UADE MaxTrax work, fix all findings | DONE, merged to main, deployed |
| 2 | Speak & Spell synth "sounds shitty and unfinished" | IN PROGRESS |
| 3 | Two audio visualisers in the synth editor | NOT STARTED (diagnosed only) |
| 4 | "Plays two things at the same time" | DONE (`09bb92306`) |
| 5 | Nasal timbre / phoneme level issues | PARTLY — resampling fixed, cause of remainder unresolved |
| 6 | ROM words unplayable + wrong dropdown labels | DONE (uncommitted) |
| 7 | Entries 44-199 and 201 sound wrong | OPEN — next step defined below |

---

## 2. Critical references

### Speak & Spell / TMS5220
- `mame-wasm/tms5220/TMS5220Synth.cpp` — the chip. `process()` ~line 700 (resampling +
  cabinet), `Biquad` class above `class TMS5220Synth`, `PARAM_CABINET = 18`.
- `src/engine/tms5220/TMS5220Synth.ts` — TS wrapper. `speakText()` ~line 350 (ROM-word
  precedence), `speakTextHybrid()` ~line 423, `_loadROMs()` ~line 137, paramMap ~line 667.
- `src/engine/speech/VSMROMParser.ts` — `buildWordTableFromMCU()` rewritten; new
  `VERIFIED_ROM_ORDER` array above it.
- `src/engine/speech/SpeechChain.ts` — NEW, generation-guarded word chaining.
- `src/engine/speech/tms5220PhonemeMap.ts` — hand-authored phoneme table (54 entries).
- `src/engine/speech/ROMPhonemeExtractor.ts` — letter-recording phoneme extraction.
- `src/engine/mame/MAMEBaseSynth.ts` — `set()` ~line 1120 (was dropping all params).
- `src/constants/chipParameters.ts` — `MAMETMS5220` block ~line 494, `cabinet` knob.
- `src/components/instruments/controls/ChipSynthControls.tsx` — ROM Speech select,
  `useSyncExternalStore` subscription at top of component.
- ROMs: `public/roms/snspell/{tmc0351n2l.vsm,tmc0352n2l.vsm,tmc0271h-n2l}` — verified
  byte-identical to MAME's `snspell` set.
- Reference implementation: `/Users/spot/Downloads/ti_lpc-1.04` (FLTK app, MAME-derived).
  Chip tables in `ti_lpc.cpp` `cb_bt_tms5100_actual()` / `cb_bt_tms5220_actual()`.
  **No TTS capability** — it plays ROM strings and pasted hex only.

### Duplicate visualiser (task 3, not started)
- `src/components/instruments/editors/SynthTypeDispatcher.tsx:2302` — `EditorHeader`
  rendered WITHOUT `hideVisualization`, so it draws `VisualizationRow`.
- Same file line ~2340 — `MAMEOscilloscope` draws a second scope.
- **Measured**: `engine.getInstrumentAnalyser(1)` reads `level 0, peak 0` while audio
  flows, so the shared header scope is the DEAD one. Keep `MAMEOscilloscope`, suppress
  the header row. (Earlier code-reading suggested the opposite — trust the measurement.)

---

## 3. Recent changes

### Merged + deployed (UADE)
`859e40728` merge, live at `devilbox.uprough.net`, verified by hashing the live
`UADE.wasm` and `TMS5220.wasm` against the committed ones.

All 15 ultrareview findings fixed, plus three the fixes uncovered:
- `uadeutils.c` was a build input **never committed** — hidden by an unanchored pattern
  in `third-party/uade-3.05/src/.gitignore` (git matches such patterns at any depth).
- `cinter4` had `matchMode: 'both'` with an empty `prefixes` array.
- `test:ci` is an explicit file list, not a glob — new tests must be added by hand.
- `.github/workflows/uade-core.yml` added: builds the UADE core from committed sources,
  runs the audio.device sanitizer harness, fails if a committed artifact is stale.

### Unpushed commits (5)
```
8b6e2c885 fix(tms5220): band-limit the 8 kHz chip output instead of sample-and-holding it
85ffdd984 fix(tms5220): put synthesised phonemes back in the human pitch range
dd9f214db Revert "fix(tms5220): speak with ROM LPC data..."
d3beb83f9 fix(tms5220): speak with ROM LPC data...        <-- the reverted mistake
09bb92306 fix(tms5220): stop a retrigger from playing the previous sentence underneath
```
`d3beb83f9` + `dd9f214db` are a mistake and its revert. User was asked whether to squash
them out of history; **no answer yet**.

### Uncommitted working tree (all deliberate, all type-checked)
- `mame-wasm/tms5220/TMS5220Synth.cpp` + `public/mame/TMS5220.wasm` — cabinet stage
  (`PARAM_CABINET`, highpass 130 Hz → +9 dB @ 320 Hz → +3 dB @ 900 Hz, dry/wet).
- `src/engine/mame/MAMEBaseSynth.ts` — `set()` now delegates to `setParam()`.
- `src/engine/tms5220/TMS5220Synth.ts` — Speak button auditions the selected ROM word.
- `src/engine/speech/VSMROMParser.ts` — real table parse + `VERIFIED_ROM_ORDER`.
- `src/engine/speech/__tests__/vsmWordTable.test.ts` — NEW, 5 tests, not yet in `test:ci`.
- `src/components/instruments/controls/ChipSynthControls.tsx` — ROM word subscription.
- `src/constants/chipParameters.ts` — `cabinet` knob, default 0 (bypassed).
- `src/engine/speech/tms5220PhonemeMap.ts` + `phonemePitchRange.test.ts` — pitch retarget.

Pre-existing dirt NOT ours: `.serena/project.yml`, `src/generated/*`, submodule pointers,
`FXChainPlayer-Releases-1.3.11/`, the `dragon'sbreath *.dsc` songs,
`mame-wasm/*/build/` (untracked build dirs).

---

## 4. Learnings

### Bugs found and fixed
1. **Shipped wasm ≠ committed source.** `public/mame/TMS5220.wasm` was linked at 08:12,
   its source last edited 10:35, and the correct artifact was already sitting unused in
   `mame-wasm/public/mame/`. The shipped one ran **2× hot** (peak 1.60 = +4.08 dBFS vs
   0.80), clipping every word. Votrax was in the same state. Same disease as the UADE
   core. **~25 MAME chips still have no CI guard.**
2. **Retrigger overlap.** `speakTextHybrid` guarded chain steps with
   `if (!this._speakingChain)`, which cannot distinguish "no chain" from "a NEWER chain".
   Stale timers resumed the previous sentence over the new one — two voices, ~2×
   amplitude. Fixed with a generation token (`SpeechChain`).
3. **Sample-and-hold masquerading as interpolation.** `lastSpeechSample_` was overwritten
   every output sample, so 8 kHz → 44.1 kHz was ZOH. Images at 8k±f read as nasal.
   ti_lpc uses a windowed-sinc FIR for exactly this. Fixed: true linear interpolation +
   6th-order Butterworth at 3.4 kHz. Out-of-band energy 36.9% → 26.0%. **User confirmed
   "sounds a lot better".**
4. **`MAMEBaseSynth.set()` handled only `'volume'`** and silently dropped everything
   else. The MCP bridge calls `.set()`, so every `set_synth_param` returned `ok: true`
   and did nothing. This wasted four A/B attempts. Now delegates to `setParam()`.
5. **ROM words were unplayable.** The Speak button always read the text field; only a
   note-on honoured the ROM Speech selection. Speak now checks it first.
6. **Word table was guessed, not read.** `buildWordTableFromMCU` ignored the MCU ROM
   (`_mcuRom` unused) and scanned the first 1 KB for anything that decoded as LPC frames,
   then applied gap heuristics. It ran 29 entries past the table's end (addresses like
   277, 5464 → garbage playback). The real table: **byte offset 4, 16-bit LE
   `chip<<14|address`, strictly increasing, 243 entries, last at 32032**. Skip the 4
   pre-letter entries (130, 228, 326, 448) → 239 recordings, index 0 = "A" @1296.
7. **Labels came from an alphabetical vocabulary list that doesn't match ROM order.**

### ROM layout, verified BY EAR with the user
```
1-26    A B C D E ... Z          (1-5 confirmed aloud)
27      attention beep
28-38   ZERO ONE ... TEN         (28, 29, 37, 38 confirmed)
39      "that is correct"
40      "you are correct"
41      "that is right"
42      "you are right"
43      sound effect (chirps)
44-199  mostly wrong/fragmentary — UNEXPLAINED
200     real word again
201     broken
202+    unverified
```

### Measurement mistakes I made (read before trusting any number here)
- **Rendered byte 0 as "a ROM word"** — it is header data. Produced a bogus "67% of
  energy below 150 Hz" baseline that drove a wrong conclusion about bass. A real word
  measures 0.1% below 150 Hz, and TTS measures 0.2% — they are nearly identical, so the
  chip has almost no bass **by design** and neither did the toy.
- **Optimised a coverage metric instead of the goal.** Mining the whole 272-word
  vocabulary for phonemes took "authentic fraction" 30% → 90%, and the result was
  *alien chatter* — proportional segmentation put real TI frames in the wrong phoneme
  slots. Reverted (`dd9f214db`). Authentic data in wrong slots is worse than consistent
  fakes.
- **First band-ratio probe decimated without filtering**, aliasing high energy into every
  bin (reported 61%/51.7%; real numbers were 36.9%/26.0%).
- **A K1-shift sweep disproved my own "K1 is the cause" theory** before I edited the
  table — 1.5% → 7.4% low-end, nowhere near the 79% I was chasing.
- **The master meter (`get_audio_level`) is unreliable here** — reported `silent: true`
  over audio the user could clearly hear. `AudioDataBus` taps Tone.Destination's input;
  the native MAME synth path can bypass it.

### Environment gotchas
- `sing_mode` defaults to **1**: every note-on sings one vowel instead of speaking. That
  is what the "beeps" were in several tests.
- `hard_reload` over MCP **wipes the user's instruments**. Do not use it on their session.
- The dev server (`npm run dev:fullstack`) was killed by the harness four times. Have the
  user run it in their own terminal.
- MCP tools dropped out mid-session; drive the browser directly via
  `ws://localhost:4003/mcp` with `{id, type:'call', method, params}`. Helper scripts left
  at `/tmp/mcpcall.cjs`, `/tmp/one.cjs` (play one ROM entry).
- `npx tsx` cannot resolve the repo's path aliases; run TS harnesses through `vitest`.
- Writing files with Python: use `encoding='utf-8'`, not `latin-1` — a failed write
  **truncated `TMS5220Synth.cpp` to zero** (recovered with `git checkout`).

---

## 5. Artifacts

- `thoughts/shared/prs/78_description.md` — the UADE ultrareview PR writeup.
- `tools/tms5220-audit/renderWord.ts` — headless chip render (loads the shipped
  `public/mame/TMS5220.{js,wasm}` outside a browser, speaks from a byte address, reports
  peak/RMS/nonzero fraction). Used to prove the clipping.
- `uade-wasm/tests/` — audio.device sanitizer harness (6 cases, all fail pre-fix).
- `uade-wasm/verify_amigamsg.py` — score.s ↔ amigamsg.h lockstep check.
- `/tmp/rom_order.md` — ROM order notes (transcribed into `VERIFIED_ROM_ORDER`).
- New tests: `speechChain.test.ts`, `phonemePitchRange.test.ts`, `vsmWordTable.test.ts`.

---

## 6. Next steps (ordered)

1. **Add `vsmWordTable.test.ts` to `test:ci`** in `package.json` — it is not wired in yet,
   and unwired tests are decoration.
2. **Run the bit-alignment test** for the 44-199 / 201 mystery. For a known-broken entry,
   decode at bit offsets 0-7 from its byte address and check which offset yields a
   recording that terminates in a proper stop frame within its byte span. If one does,
   recordings are bit-addressed and the table needs the low bits; if none does, those
   entries are genuine phrase fragments and the ROM is fine. **This is automated — no
   listening required.**
3. **Answer the still-open question**: does a *real ROM word* sound too high, or only
   synthesised text? Now that ROM words play with correct labels, play entry 1 ("A"). If
   ROM words sound right, all remaining pitch/timbre work belongs in the phoneme frames;
   if they also sound high, the decode path is at fault and the phoneme work is moot.
4. **Duplicate visualiser** — suppress the header `VisualizationRow` for the MAME branch
   (keep `MAMEOscilloscope`; the shared analyser reads 0 for this synth).
5. **Decide on the squash** of `d3beb83f9` + `dd9f214db`, then push (5 commits + the
   working tree). Pre-push runs the full suite; it takes >10 min, so run it backgrounded.
6. **Extend CI to the MAME chips** — `uade-core.yml` guards only UADE. Two chips shipped
   stale today and were caught by luck.

---

## 7. Other notes

- User works **directly in main**, no PRs. The branch used for the ultrareview existed
  only because `/code-review ultra` requires a PR target on this repo (local bundling
  refuses: "Repo is too large"). It was merged and deleted.
- `gh` active account had to be switched to `spotUP`; `johanBMS` has no push rights.
- The cabinet knob exists but **defaults to 0 (bypassed)** — the user tried it at 0.7 and
  said "high pitched and noisy". It moves energy from >800 Hz into 300-800 Hz; it cannot
  add sub-300 Hz because the source has none.
- Do not re-attempt ROM phoneme mining without solving segmentation properly. The payoff
  is real (41 phonemes vs 16) but proportional splitting produced unusable audio.

---

## 8. Session 2 (2026-08-20) — the 44-199 mystery, solved

### What the ROM actually is
The bit-alignment test in step 2 came back negative: offset 0 wins 122 entries and the
other seven offsets score 82-109 each, which is the noise floor. Recordings are byte
addressed. The table was the problem, not the addressing.

`ti_lpc`'s `build_rom_word_addr_list()` (`~/Downloads/ti_lpc-1.04/ti_lpc.cpp:6327`) reads
the VSM as a self-describing directory, and the shipped ROM decodes cleanly under it:

```
byte 0-3     entry-byte count of each of the four spelling lists
byte 4-11    start address of each of those lists      <- NOT recordings
byte 0x0C..  the system phrase table, one address per entry
list entry   6-bit ASCII spelling (bit 0x40 = last letter), then the LPC address
```

The 4 "pre-letter entries" (130, 228, 326, 448) previously skipped are the four spelling
list pointers. And part of the system table is INDIRECT — "wrong", "that is incorrect",
"spell", "now spell", "next spell", "now try", "try" and "here is your score" hold the
address of a slot that holds the recording address. Reading those as recording addresses
lands mid-word in unrelated speech, which is exactly the chirping the 43rd entry played,
and every entry after it was shifted onto spelling-list bytes.

Result: **175 recordings with real names** — 58 system entries plus the 117 spelled
vocabulary words (COLOR, ISLE, ANGEL, QUESTION, COULDN'T, RHYTHM, ...) — replacing 239
entries of which 40 decoded straight past their neighbour. The MCU ROM is not fetched any
more; it never held the table.

`vsmWordTable.test.ts` is rewritten against the real structure and wired into `test:ci`.
Its overrun check is the discriminator: the old table failed it 40 times, the directory
passes for every entry.

### Also done
- Header `VisualizationRow` suppressed for the MAME editors (`SynthTypeDispatcher.tsx`),
  keeping `MAMEOscilloscope` — the measured-live one.
- `.github/workflows/mame-chips.yml` + `tools/mame-wasm-staleness.py`: every chip is now
  compiled from committed sources on CI, and a source change without an artifact rebuild
  fails the build. No byte-diff of the wasm — emcc -O3 is not reproducible across
  toolchains, so that gate would go red on emsdk bumps instead of on staleness.
- `mame-wasm/ymopq/CMakeLists.txt` resolved `ymfm` and its output directory relative to
  its own directory, so `emcmake cmake -S mame-wasm` failed to configure at all. Fixed;
  the aggregate project builds.

### New finding — two dead chips
MSM5232 and TIA have sources, a CMake target, chip parameters and a slot in the instrument
picker, but no worklet glue, no engine class and no committed wasm. Selecting either falls
through `InstrumentFactory`'s default branch to a plain Tone.js synth with a console
warning. Their wasm builds fine (parked at the session scratchpad, not committed — an
artifact nothing can load is not worth shipping). Wiring them is real work:
`MSM5232Synth.ts` / `TIASynth.ts`, the worklet glue, factory and `ToneEngine` cases.

### Still open
1. **The listening test** (was step 3): play entry 1 ("A") and a spelling word such as
   COLOR. If ROM words sound right, the remaining pitch work belongs in the phoneme
   frames; if they also sound high, the decode path is at fault. Needs a page reload —
   HMR left the tab's audio graph on a stale AudioContext.
2. **The squash decision** on `d3beb83f9` + `dd9f214db`, then push (8 commits + the
   working tree).
3. Working tree still carries the cabinet stage (cpp + wasm), the `MAMEBaseSynth.set()`
   delegation and the phoneme pitch retarget, all type-checked, none committed.
