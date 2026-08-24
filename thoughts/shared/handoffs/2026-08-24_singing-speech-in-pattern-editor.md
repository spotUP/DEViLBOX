---
date: 2026-08-24
topic: Singing speech synths in the pattern editor — design handoff (TMS5220)
tags: [tms5220, speech, tracker, pattern-editor, design, handoff]
status: draft
---

# Handoff: singing speech synths in the pattern editor

## The task for the next session

The user asked: **"how can we make it awesome to create singing speech synths
in the pattern editor?"**

I classified this as **architectural** under `superpowers:brainstorming` (per-row
lyrics do not exist in the tracker today — there is no existing flow to modify),
announced that, and began the context exploration. The session ended during that
exploration. **Nothing has been designed, decided, or built. No approval has
been given for anything.**

Resume at the brainstorming checklist, architectural path, step 1→3:
explore context (mostly done, see below), then ask clarifying questions ONE at a
time, then propose 2-3 approaches with a recommendation.

Do NOT start implementing. The approval gate has not been passed.

## What I already learned about the current state

### How a TMS5220 note works today (`src/engine/tms5220/TMS5220Synth.ts`)

`writeKeyOn(note, velocity)` at line ~370 has three branches:

1. **sing mode + a vowel sequence** → sets `SPEECH_PITCH_OFFSET` from the note
   (`Math.round((note - 60) * 0.5)`), then `_speakSingleVowel()` — plays the NEXT
   vowel in the sequence and advances `_vowelIndex`. `_vowelLoopSingle` sustains
   it while the key is held (re-sent every ~950 ms by `_startVowelSustain`).
2. **sing mode, no vowel sequence** → same pitch offset, then
   `speakText(this._speechText)` — the whole stored text, every note.
3. **not sing mode** → `stopSpeaking()` then `speakText(this._speechText)`.

So today a pattern can only ever re-trigger ONE stored utterance, or step through
a fixed vowel ring. There is no way to say a different word per row.

### The two text parameters (`setTextParam`, line ~862)

- `speechText` — a single string per instrument.
- `vowelSequence` — comma-separated SAM codes, split into `_vowelSequence`.

Both arrive via `updateMAMEChipTextParam` → `setTextParam`. They are per
INSTRUMENT, not per row or per note.

### What a pattern row can carry (`src/types/tracker.ts:71` `TrackerCell`)

XM core: `note`, `instrument`, `volume`, `effTyp`/`eff`.
DEViLBOX extensions already present: `effTyp2..8`/`eff2..8`, `flag1`/`flag2`
(TB-303 accent/slide — precedent for per-synth custom columns), automation
columns `cutoff`/`resonance`/`envMod`/`pan`, `probability`, plus format-specific
carriers (`saArpTable`, `sunRaw`, …).

Note the precedent: **`flag1`/`flag2` are extra columns that only one synth
family uses.** A lyric/phoneme column would follow that pattern. There is no
string field on a cell today — every field is numeric.

### The speech entry point from the engine

`speakMAMEChipText` in `src/engine/tone/SynthParameterUpdates.ts:288` calls
`synth.speakText(text)`. That is the only text path into the chip; note triggers
never carry text.

### Relevant machinery that already exists and should be reused

- **Bracketed phoneme notation** — `[SIHKS]` is parsed literally, unbracketed
  text goes through G2P (`isPhonemeNotation` / `splitSpeechSegments` /
  `textToTokensSmartAsync` in `src/engine/speech/Reciter.ts`). A lyric column
  gets per-syllable phoneme control for free by reusing this.
- **eSpeak-NG G2P** is live (en-us) with SAM-code output; SAM rules are the
  fallback. `src/engine/speech/EspeakNG.ts`.
- **Per-word prosody**: `buildWordPitchOffsets` / `applyPitchContour` in
  `src/engine/speech/sentenceProsody.ts`. A tracker would want the NOTE to own
  pitch instead — see open questions.
- **Phoneme library**: `AUTHENTIC_PHONEMES` (bundled) and the runtime ROM-mined
  library are byte-identical; `buildFramesFromROMLibrary` renders a token
  sequence to frames.
- **`SPEECH_PITCH_OFFSET`** (chip param 17) is how a MIDI note currently bends
  speech pitch; the C++ clamps the result to 1..31 and cannot force unvoiced.

## Design questions I had queued (not yet asked — ask ONE at a time)

1. What is the unit per row — a syllable, a word, or a phoneme group? (Drives
   whether the column is a short string or an index into a per-instrument list.)
2. Should the note pitch REPLACE the synthesized contour (true singing) or ride
   on top of it (spoken-with-melody)? Today `applyPitchContour` imposes its own
   declination and final fall, which fights a melody line.
3. Does a held note sustain the vowel (like `_vowelLoopSingle`) and a new note
   advance the syllable? That is the UTAU/Vocaloid convention and the vowel-ring
   code is 80% of it already.
4. Where does the lyric live — a new cell column (needs a string field on
   `TrackerCell`, which is numeric-only today, plus serializer work in every
   format exporter) or a per-instrument syllable LIST indexed by an existing
   numeric column? The second is far cheaper and round-trips through existing
   formats; the first is nicer to edit.
5. Does this need to survive export to .dbx/XM/MOD, or is it DEViLBOX-native
   only? (Serialization cost differs enormously.)

My provisional lean, for what it's worth — **not** a decision, and I had not yet
proposed approaches: a per-instrument syllable list plus one numeric column
indexing it is the cheap, round-trip-safe 80% (it reuses `flag1`-style column
precedent, needs no string in `TrackerCell`, and the syllable list can just be
the existing `speechText` split on spaces). A real string lyric column is the
better editing experience but touches every format serializer.

## Session state

- Branch `main`, clean except `.serena/project.yml` and `src/generated/*`
  (generated churn, not mine).
- **1 commit ahead of origin at handoff time** — `88a474129` may still need a
  push; verify with `git status -sb` and push if so.
- 35 commits this session (`a72109d01..88a474129`), all TMS5220/MAME work.

## Learnings from this session that the next one should not rediscover

- **The oscilloscope mixin the browser runs is
  `public/mame/mame-worklet-init.js`**, loaded before any chip worklet. Every
  chip worklet inlines a copy guarded by `if (!globalThis.OscilloscopeMixin)`,
  so the inline copies never execute. Patching all 32 of them changed nothing.
- **A chip's picker entry needs FOUR things**: engine class, worklet glue, wasm,
  registry entry — AND its id in the lazy-loader list in
  `src/engine/registry/sdk/index.ts`. Missing the last one makes the chip fall
  through to a plain Tone.js synth with only a console warning.
- **Sparse instrument parameters are normal.** Only touched values are stored.
  `resolveChipParameters` (in `src/constants/chipParameters.ts`) fills declared
  defaults; creation and the editor's first sync both use it.
- **Editor writes must be deltas.** Sending a whole rebuilt `parameters` object
  resurrects stale values, because store writes are batched to the next frame.
- **`noise_mode: 1` forces 100% of speech frames unvoiced** (measured: 44/44 vs
  3/44 at defaults). That was the "breathy on restore" mystery — persisted data,
  not a code path.
- **Process traps that cost real time this session:** a python `s.replace()`
  without an `assert` silently no-ops (shipped a "Twin Peaks preset" commit
  containing no preset); a test that only SKIPS a missing thing passes vacuously;
  `git push` can report success with no transport line while the ref does not
  move (always verify with `git status -sb`); and `expect()` in a 221k-iteration
  loop blows vitest's 5s default timeout on CI while passing locally.

## Artifacts

- Plan: `thoughts/shared/plans/2026-08-23-tms5220-phoneme-quality.md` (status:
  implemented)
- Previous handoff: `thoughts/shared/handoffs/2026-08-23_tms5220-quality-milestone.md`
- Oracle tool: `tools/tms5220-audit/holdoutReconstruction.ts` — leave-one-out DTW,
  the ONLY non-circular way to judge a phoneme-source change.
- Bundle tool: `tools/espeak-repack.mjs` — rebuilds `public/espeak-ng.{js,data}`;
  the `lang/` tree is REQUIRED (dropping it is what broke eSpeak for months).

## Other open items (unrelated to the design task)

- User's ears still owed on: MSM5232 + TIA sounding in-browser, Twin Peaks
  flavor, full-width scope, knobs no longer flipping Noise Mode.
- `MAMEAICA` — dead picker entry, artifacts exist, no engine class. Same job as
  MSM5232/TIA. `MAMEMultiPCM` is unfixable without porting the emulator (no
  source in repo). Both pinned as known-dead in
  `src/engine/registry/__tests__/mameChipWiring.test.ts`.
- Offered but not taken up: blending voicing into the Whisper preset (user said
  it is "very breathy", which is what a whisper is — may be fine as-is).
