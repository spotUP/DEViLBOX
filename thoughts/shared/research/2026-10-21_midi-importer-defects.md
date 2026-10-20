---
date: 2026-10-21
topic: MIDI importer defects measured on two General MIDI reggae riddims
status: in progress
inputs:
  - src/__tests__/fixtures/midi/queen_majesty.mid (8 tracks, ppq 480, tempo 78.010, 4/4, 2 bars)
  - src/__tests__/fixtures/midi/cuss_cuss.mid (6 tracks, ppq 480, tempo 74.670, 4/4, 1 bar)
---

# MIDI importer defects

Ground truth comes from an independent Python dump of the raw .mid bytes
(scratchpad `midi/dump.py`); the "before" column is what `importMIDIFile`
returned for the same bytes (probe test, `before.log`). Import path:
`ImportMIDIDialog` -> `songBranches.ts` (`importMIDIFile`) -> `applySong`;
`parseModuleToSong` -> `MidiToSong.parseMIDIFile` wraps the same function.

## Defects (measured)

| # | Defect | Ground truth | Before | Root cause |
|---|--------|--------------|--------|------------|
| D1 | Chords collapse to one note per row | guitar chords 32 notes (8 x 4), organ chords 24 (8 x 3), cuss "chorus delay" 29 (5-note chords) | 8, 8, 6 notes kept (75% / 67% / 79% lost) | one tracker channel per MIDI track; later chord notes overwrite the cell |
| D2 | Track names and channel CCs lost | tracks named bass / guitar chords / organ chords / chorus delay; cuss bass CC7 = 126/127, CC10 = 64 | channels named "Track 2", "Track 4", "Track 6"; CC7/CC10 dropped | @tonejs/midi `splitTracks` puts events before the first program change (name, bank, CC7, CC10) into a separate note-less track that the importer skips |
| D3 | Tempo rounded to an integer | 78.010 BPM, 74.670 BPM | 78, 75 (cuss +0.44%, 28 ms drift per 2 bars) | `Math.round` on the tempo; the replayer and transport store accept fractional BPM |
| D4 | Staccato notes become legato | queen bass notes last 46-74 ticks (0.4-0.6 row), cuss bass 85-130 ticks | queen bass 24 notes, 2 note-offs; cuss bass 13 notes, 3 note-offs | note-off rounds to the note's own row and is discarded, so every short note rings until the next note |
| D5 | Swing flattened | hats offbeats at +18 ticks past the 16th (15% of a row), snare ghost +14 ticks | all hits on the grid, no delay | rows are rounded, no EDx note delay emitted |
| D6 | Channel volume/pan ignored | cuss bass CC7 126 -> volume 99%, CC10 64 -> centre | volume 80 / pan 0 defaults; after D2 is fixed the CC would land as C3F on row 0 and override the velocity column | CC7/CC10 mapped only to row effects, never to channel defaults |
| D7 | GM2 percussion 82-87 unnamed | note 85 = Castanets | instrument "Perc 85" with snare fallback | `GM_PERCUSSION_MAP` stops at 81 |
| D8 | Song length rounded to 16 rows regardless of meter | 4/4 here, so no measured loss | 32 / 16 rows (correct for these files) | bar length hard-coded to 16 rows; end-of-track position ignored |

Correct before the fix: pitch mapping (MIDI 39 -> note 28, D#-2 in the
house convention), velocity -> volume column 0x10..0x50, 4 rows per beat with
speed 6, drums split one channel per GM note, pattern count (1), song length.

## Fixes

All in `src/lib/import/MIDIImporter.ts` unless noted. Numbers are from the importer run on the fixture files after the change (`src/lib/import/__tests__/MIDIImporter.test.ts`).

| Defect | Fix | Before | After |
|--------|-----|--------|-------|
| D1 chords collapse | Voice allocation per melodic track: notes sorted by tick, a voice is free when its note has ended, a new voice (channel) is opened otherwise. All voices share one instrument; names `<track> 1..n`. | guitar 8 of 32, organ 8 of 24, chorus delay 6 of 29 notes | 32 (4 voices), 24 (3 voices), 29 (5 voices) |
| D2 track names, CC 7/10 lost | `mergeSplitTracks`: @tonejs/midi splits a track at each program change and reports channel 0 for the note-less half, so the note-less split is folded (name, CCs, pitch bends, end-of-track) into the track with notes that directly follows it. | `Track 2`, `Track 4`, `Track 6` | `bass`, `guitar chords n`, `organ chords n`, `chorus delay n` |
| D3 tempo rounded | BPM kept to two decimals (replayer runs float BPM); the dialog preview shows the same value. | 78, 75 | 78.01, 74.67 |
| D4 staccato became legato | A note that ends inside its own row gets an `ECx` note cut (x = replayer ticks played, at least delay + 1); longer notes get a note-off on the row where they end. | queen bass notes 120 ticks long (full row) | queen bass row 0 `EC3` (62 ticks = 3.1 ticks), chorus delay stabs `EC1`/`EC2` |
| D5 swing flattened | Late notes keep their offset as `EDx` note delay (x = round(lateness in rows * 6)); off by default `quantize: 0`, suppressed by `quantize >= 1`. Early notes stay on their row (a tracker cannot play before the row). | offbeat hats on the grid | hats rows 1,3,5... `ED1` (18 ticks = 0.9 ticks late); cuss bass rows 1,3,5,9,13 `ED1` |
| D6 CC 7/10 ignored | CC 7 and CC 10 up to the first note become the channel's `volume` (0-100) and `pan` (-100..100, MIDI 64 = centre) for all voices of the track and are not placed as `Cxx`/`8xx` row effects. | cuss bass volume 80, pan 0 | volume 99 (CC 7 = 126), pan 0 (CC 10 = 64) |
| D7 GM2 drums unnamed | `GMSoundBank.ts`: entries 82 Shaker, 83 Jingle Bell, 84 Belltree, 85 Castanets, 86 Mute Surdo, 87 Open Surdo. | `Perc 85` | `Castanets` |
| D8 bar length fixed at 16 rows | Pattern length rounded up to a whole bar of the file's time signature; end-of-track markers extend the song. Also `speed` exported (`MIDI_IMPORT_SPEED = 6`) and consumed by `MidiToSong.ts` and `songBranches.ts` instead of a hard-coded 6. | 16 | 16 for 4/4 (no change for these files) |

Regression test: `src/lib/import/__tests__/MIDIImporter.test.ts` (fixtures `src/__tests__/fixtures/midi/`), added to `test:ci`. With the importer reverted to HEAD the two song tests fail (2 failed, 1 passed); with the fix 3 pass.

### Open

- Only the first tempo is used; mid-song tempo changes are not emitted as `Fxx`.
- Notes early of their row are snapped to the row (no tracker effect can play a note before its row).
- A song whose voices plus drum channels exceed `MAX_CHANNELS` (16) is not clamped here; both fixtures need 15 and 9.
- Overlapping notes of the same pitch on one voice are played as retriggers (XM has no per-note release).

