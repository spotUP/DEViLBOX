---
date: 2026-11-02
status: survey (read-only, no code changed)
---
# N16: MagPlaySID port survey

## Source + licence

- Repo: https://github.com/MagnarHarestad/MagPlaySID (C#/.NET 8, Avalonia; by Magnar Harestad / Censor Design). 136 files, shallow-cloned and read, clone deleted afterwards.
- Licence: GNU GPL v2 or later. File: `LICENSE` (GPL-2.0 text); stated in README.md "License" section. `THIRD-PARTY-NOTICES.md` lists reSID (GPL-2+, Dag Lem) and an MIT component. The engine is shared with the MagSID editor (github.com/MagnarHarestad/MagSID).
- Verdict: code cannot be copied or translated into DEViLBOX without checking DEViLBOX's own licence. A C# to TypeScript translation is a derivative work and must be GPL-2+ compatible (DEViLBOX already ports GPL code: GoatTracker gplay/greloc comments in GoatTrackerSid.ts say GPL, so the repo may already be GPL; confirm the DEViLBOX LICENSE before copying anything). If DEViLBOX is not GPL-compatible: ideas and algorithms only, clean-room.
- It is not a per-format decoder (see next section), so the code that would be copied is generic heuristics, not format tables.

## How MagPlaySID produces its pattern display

It does NOT parse per-player data tables. Pipeline (docs/PLAN.md, `src/MagPlay.C64`, `src/MagPlay.Transcribe`):
1. Run the tune's own 6502 code on an emulated C64 (CIA 1/2 timers, IRQ/NMI, VIC raster, KERNAL stubs, cycle-exact bus; RSID and digi tunes run too). Every SID write is recorded with its cycle, tagged call (IRQ) / NMI / main.
2. `Transcriber.cs` + `Music.cs` (972 lines) infer a score: note per gate-on, note table recovered from frequencies, instruments per "way a note is played" (ADSR, wave program, pulse program, hard restart as gate timer, filter program), row grid fitted (longest row length / funk pair that puts 9 in 10 notes on a row).
3. Lossless by construction: whatever the music model misses is written in a raw layer, so replaying the score reproduces the register writes. Measured 95.4% of register changes explained by music on 471 local tunes (median 98.5%).
4. Read-only. No write-back, no .sid export. PLAN.md states "Read-only: a way to see how a tune is built".
5. Separate: `src/MagSid.Core/SidImport/SidTranscriber.cs` (1601 lines) is the older Import SID analysis (notes, sounds, grid, glides) used by the MagSID editor, which is editable but only into MagSID's own song format.

PLAN.md names GoatTracker 2, CheeseCutter, SID-Duzz'It, Hubbard, JCH/Laxity, DMC, Future Composer only as test references for effects. No per-player source file exists; step 2b (GoatTracker .sng to score, check against exported .sid) is planned, not shipped. So the "many formats" are one generic method.

## Formats table

| format | MagPlaySID method | MagPlaySID files | DEViLBOX today | gap |
|---|---|---|---|---|
| Any PSID/RSID (generic) | 6502+CIA+VIC emulation, register trace, heuristic transcription, row-grid fit | src/MagPlay.C64/*, src/MagPlay.Transcribe/{Recording,Music,Transcriber,Agreement}.cs, MagSid.Core/SidImport/SidTranscriber*.cs | `SIDParser.ts` (500 lines) already does emulation trace to patterns (Cpu6502, 18000 frames, SIDPatternCache.ts, 2SID/3SID, speed detect, pattern split, loop detect). Pattern grid yes, editable NO (read-only trace), plays via C64SIDEngine/deepsid | Quality of transcription (no instruments, ADSR/wave/pulse/filter programs, note-table recovery, hard-restart handling, cycle-exact CIA/NMI/RSID); DEViLBOX emits notes only |
| GoatTracker 2 | none (only a planned test reference) | - | `GoatTrackerSid.ts` decodes GT2-packed PSID back to full GT song (static parse of mt_ tables); `GoatTracker1Sid.ts` for GT1; `.sng` read/write; GTUltra engine+store. Parser yes, grid yes, editable yes, write-back yes | none; DEViLBOX is ahead |
| GoatTracker 1 | none | - | GoatTracker1Sid.ts, same as above | none |
| CheeseCutter | none | - | CheeseCutterParser.ts (.ct, sequences + order lists), CheeseCutterEngine. Parser yes, grid yes, editable partial/yes | compiled-PSID to .ct reverse (not .ct files) absent |
| SID Factory II | none | - | SIDFactory2Parser.ts (.sf2), SF2Engine | same: compiled .sid reverse absent |
| SID-Wizard / SID-Duzz'It / JCH-NewPlayer / DMC / Future Composer C64 / Hubbard C64 / Laxity C64 | none (generic trace) | - | Only the generic SIDParser trace. LaxityParser.ts is the Amiga Laxity stub; RobHubbardParser, FCParser, DavidWhittaker, Hippel, MartinWalker are Amiga formats | no C64-player-specific static parsers; they get the trace grid only |
| MIDI import to SID | GM bank + chord analyzer | src/MagSid.Core/Midi/* | not surveyed | out of scope |

Format count: 1 generic decoder covering every PSID/RSID. 0 per-player decoders.

## Ranked port plan

DEViLBOX already has the same architecture (emulate, trace, group into patterns), so the port value is in the better transcription layer, not new coverage. Ideas (clean-room unless the licence is confirmed compatible):

1. Instrument inference from the trace (value high, effort medium): per note derive ADSR, wave-control program, pulse program, filter program and give each distinct sound an instrument, instead of bare notes. Reference: Music.cs "instrument per way a note is played" and the sharing table in PLAN.md.
2. Note-table recovery + gate-based note segmentation (value high, effort low-medium): note = gate-on until next gate-on/legato glide, pitch snapped to the tune's own note table found from frequencies; removes vibrato/slide noise in the grid. SIDParser uses sidFreqToNote only.
3. Row-grid fitting (value medium, effort low): longest row length or funk pair that puts ~90% of note starts on a row (Music.RowsOf). Compare with SIDParser.detectSpeed (gcd of intervals) which likely fails on funk tempo and swing.
4. Cycle-exact C64 (CIA timers, NMI, raster IRQ, RSID, multispeed, call detection by IRQ) (value medium, effort high): fixes RSID/digi/CIA-timed tunes where the 50 Hz frame loop in SIDParser is wrong. Check Cpu6502 bus timing first.
5. Lossless raw layer + agreement metric (value medium, effort medium): a per-tune "% register changes explained" score is a ready regression gauge for the SID importer and tells which tunes need a player-specific parser. Worth doing even without copying code.
6. Effect inference (portamento, vibrato, arpeggio, slides) as effect column (value medium, effort high).
Not worth porting: reSID C# (DEViLBOX has its own SID engines), PortAudio, UI/visualisers, MIDI import.
Editing: nothing to port; MagPlaySID is read-only. Editable C64 formats in DEViLBOX come from player-specific static parsers (the GoatTrackerSid.ts route), so the best editing win is more of those (SID-Wizard, JCH, Laxity, Hubbard C64 from compiled PSIDs), which MagPlaySID does not help with.

## Open questions

- DEViLBOX licence: is it GPL-2+ compatible? Decides copy vs clean-room (check repo LICENSE; not verified here).
- HVSC share per player is not in MagPlaySID; use HVSC Songlengths/STIL + a player-ID signature scan (sidid) to rank C64 static parsers. No sidid code exists in DEViLBOX (grep found no player-ID module in src/lib/sid).
- Does the user want better generic transcription (items 1-3) or more player-specific editable parsers? Different projects.
- Unverified: how SIDParser output is wired to instruments and whether `src/lib/sid/__tests__` covers it; not read in depth.
