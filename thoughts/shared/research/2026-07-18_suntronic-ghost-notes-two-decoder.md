---
date: 2026-07-18
topic: suntronic-ghost-notes-two-decoder
tags: [suntronic, ghost-notes, editability, two-decoder, single-source-of-truth]
status: final
---

# SunTronic ghost notes — root cause: two independent decoders

> **CORRECTION 2026-07-18 (supersedes the diagnosis below).** The "two
> independent decoders needing a player-driven grid rewrite" conclusion and the
> bug counts (60 tail / 42 within-song) are WRONG — both were measurement
> artifacts. Decisive re-measurement (an in-player fire-time `rowRecorder` hook
> capturing the authoritative channel/position/row at each note-on, compared to
> the grid keys) showed the grid already carries a cell for every within-song
> note. The real cause was TWO narrow bugs, both fixed at the decode/player
> layer (no rewrite):
>
> - **Bug 2 (within-song) — variant-dependent operand widths.** `sunCommandLen`
>   used FIXED widths for opcodes `0x9a`/`0x9b`, but the player's `controlOpcode`
>   uses driver-variant-dependent widths: `0x9b` pitch-slide = WORD (2 bytes)
>   when `arpShift>=4` (Main variant) else 1 sign-ext byte (Version-A); `0x9a`
>   vol-slide reads a 2nd rate byte only when `volSlideRateFromStream`. Wrong
>   width → grid walk consumed the wrong byte count, desynced mid-position, ended
>   groups early and never reached later note bytes → invisible notes. Fix:
>   `sunCommandLen` now takes a `SunCmdWidths {arpShift, volSlideRateFromStream}`
>   and computes the two widths per variant; both call sites (grid walk in
>   `SunTronicParser.walkV13Voice`, block decode in `SunTronicV13.decodeSunBlock`)
>   pass the score's widths. NOT a cross-voice-global-opcode bug — that theory was
>   never confirmed and is retracted.
> - **Bug 1 (stop-song tail).** A `endKind='stop'` song past its last position
>   kept a stale cursor in `loadPosition` and streamed phantom retriggers forever.
>   Fix: `loadPosition` idles the voice (`flags=0xfe`) at song end for non-restart
>   songs. (This part of the diagnosis below was directionally right; the "60
>   files" count wrongly included clean restart-loop replays.)
>
> Result: ZERO ghost notes across all 124 corpus files. Regression:
> `src/lib/import/formats/__tests__/sunTronicGhostNotes.test.ts` (in `test:ci`,
> fails-on-revert of either fix). The measurement subtleties that produced the
> inflated counts: player `tempoNote` is 1-based vs grid 0-based (map `row-1`);
> external state read after `tick()`'s double-step is unreliable (need fire-time
> hook); restart songs loop cleanly (counting replays = probe error).

## Symptom (user)
"Many ghost notes in the pattern editor — they play but are not visible in the
pattern editor. Pretty far from having SunTronic fully editable."

## Root cause (measured)
The editable **grid** and the audio **player** are two independent decoders of
the same command stream:
- Grid: `src/lib/import/formats/SunTronicParser.ts::walkV13Voice` (472-545) —
  self-described "display approximation", walks each voice through
  `subsongs[0].entries` **independently**, with its own rows/position handling.
- Player: `src/engine/suntronic/SunTronicPlayer.ts` — the oracle-verified decode
  that produces the actual audio (VOL corpus GREEN, PER near-1:1).

They diverge for ~half the corpus. Two distinct divergence classes, both measured
with a per-grammar-row probe (player `stepVblankOnce` + `debugVoice` position/
tempoNote to count grammar-row advances per voice, compared to the flat grid
note-rows):

### Bug 1 — player past-end tail garbage (60/128 files)
When a voice's `position` runs past the sequence end and `seqEndKind !== 'restart'`
(`loadPosition`, SunTronicPlayer.ts:571-576), `loadPosition` returns early WITHOUT
idling the voice (`flags` not set to `0xfe`). The voice keeps its stale `v.cursor`
and `getNextNote` streams whatever bytes follow in `h1` — spurious `>= 0xB8`
bytes fire phantom retriggers past the real song end. These notes have no grid
row → counted as ghosts. This is a player past-end handling bug (should idle/stop
or loop cleanly), audible-suspect too.

### Bug 2 — within-song grid divergence (42/128 files)
Inside the real song the grid genuinely misplaces/drops notes. Confirmed cause:
**cross-voice global opcodes decoded per-voice by the grid.** In the player
(`controlOpcode`) these are GLOBAL — they mutate all 4 voices at the real
playback tick:
- `0x8c` global rows/position (SunTronicPlayer.ts:464-465) `for (w of voices) w.rowsPerPos = r`
- `0x98` global speed (432-433)
- `0x92`/`0x93` master vol / fade (443-446)

`walkV13Voice` applies `0x8c`/`0x8b` only to the voice whose stream it is walking
(SunTronicParser.ts:534-536, comment 468-470 admits "cross-voice timing not
simulated"). So when any one voice's stream changes `rowsPerPos` globally, the
player shifts ALL voices' row cadence but the grid shifts only that one voice →
the 4 columns desync for the rest of the song. Worst: snake 83, star-fog 152,
tsm-first 110, suntronic-k4 129, winter_games 75 within-song ghosts. (Small
counts of exactly 4 = one-per-voice boundary off-by-one at the loop restart, a
probe artifact, not the core bug.)

## What is NOT the cause (disproven by measurement)
- Pitch clamp to invisible note (`sunPitchToNote` → 0): **0 clamps corpus-wide**
  (probe-clamp.ts).
- Notes dropped by the grid decode in aggregate: **ghost=0** on total counts for
  clean files (probe-ghost-notes.ts).
- Voice-row desync from unequal total row counts: **0/124** (probe-row-align.ts).
- Grid row cap truncation (64*128): **0/124 exceed**.
- Within its own row range, the grid matches the player EXACTLY (ox.src voice1
  fire rows `0,16,32,48,64,80,128,160,…` identical to grid note rows).

## Second defect (independent, same symptom)
Native SunTronic engine exposes **zero playback-position feedback**
(SunTronicSongEngine.ts has no getCurrentRow/getPosition; PatternEditorCanvas
falls back to `transportState.currentRow` which nothing updates for native). So
even a correct grid can't show which row is playing — the highlight is stuck.
Fixing this is required for "see the notes play"; it also falls out naturally
from a player-driven grid (the same player instance can report its grammar row).

## Fix decision — player-driven grid (single source of truth)
Chosen because it is the ONLY option guaranteeing exact note parity. Build the
editable grid by running `SunTronicPlayer` in a display "record" pass for one
full loop, capturing per-voice per-grammar-row (note, instrument, effTyp) sourced
from the player's real position/loop/global-opcode handling. Delete
`walkV13Voice` as the display source. Grid becomes identical to playback by
construction → within-song ghost = 0, and the record pass stops at the real loop/
song end → no garbage tail (fixes both bugs).

Carrier preservation: `uadeVariableLayout` (blockRows/blockRawBytes/trackMap) is
per-FILE-BLOCK, independent of the position sequence. Each recorded row must tag
its source block via `v.cursor → blockIndexByOffset` so `fpPerRow` keeps unedited
blocks byte-exact for UADE export.

Regression gate: corpus probe within-song ghost = 0 across all parseable files,
fails-on-revert, wired into test:ci.

## Key files
- src/lib/import/formats/SunTronicParser.ts:472-635 (walkV13Voice + parseSunTronicV13File)
- src/engine/suntronic/SunTronicPlayer.ts:341-471 (getNextNote/controlOpcode), :569-592 (loadPosition), :613-643 (stepAll)
- src/engine/suntronic/SunTronicSongEngine.ts (no position feedback)
- src/components/tracker/PatternEditorCanvas.tsx:2704-2745 (row highlight fallback)
- probes: tools/suntronic-re/probe-ghost-notes.ts, probe-row-align.ts, probe-clamp.ts
