---
date: 2026-11-01
topic: ANSI music (BBS-era PLAY strings) and whether DEViLBOX can import it
status: research done, no build go-ahead yet
---

# ANSI music

## What it is

BBS-era music embedded in ANSI art streams (.ANS files, BBS menus). A terminal
(Telix, Qmodem, Telemate, later SyncTERM / NetRunner) sees an escape intro,
reads a GW-BASIC `PLAY` macro string, and plays it on the PC speaker. The
string ends at byte 0x0E (Ctrl-N, "SO").

Intro sequences seen in the wild (from memory, verify against SyncTERM's
`cterm.adoc` before implementing):

- `ESC [ M` - the classic one. Clashes with ANSI "Delete Line" (CSI M), so
  terminals use heuristics (what follows the M).
- `ESC [ N` - alternate intro.
- `ESC [ MF`, `ESC [ MB`, `ESC [ MN`, `ESC [ ML`, `ESC [ MS` - the intro M is
  also the first letter of an M-command.
- `ESC [ |` - SyncTERM's unambiguous intro (unverified detail: SyncTERM has a
  `CSI = n M` mode switch choosing which intros it honours).

## Command set (GW-BASIC PLAY macro language)

| Command | Meaning |
|---------|---------|
| `A`-`G` | Note. Suffix `#` or `+` sharp, `-` flat; CTerm stacks them (`C++` = D). Optional length digit after the note (`C8`). |
| `.` | Dotted: 1.5x. CTerm: not cumulative (`C..` = `C.`). |
| `O n` | Octave 0-6 (default 4). |
| `<` / `>` | Octave down / up. |
| `N n` | Absolute note. CTerm: 0-71, N0 = C0 (not a rest). GW-BASIC: 0-84, 0 = rest (unverified). |
| `L n` | Default length 1-64 (1 whole, 4 quarter). |
| `P n` | Pause (rest), length 1-64, dots allowed. |
| `T n` | Tempo 32-255 quarter notes per minute (default 120). |
| `MN` | Normal articulation (7/8 of length: GW-BASIC, unverified for terminals). |
| `ML` | Legato: full length. |
| `MS` | Staccato (3/4: unverified for terminals). |
| `MF` / `MB` | Foreground / background playback. Scheduling only, no sound effect. |

Not in ANSI music: `X` (substring execute) and `=var` arguments only make sense
inside BASIC; terminals ignore them.

## How advanced is it

Very basic. One voice, one timbre (PC-speaker square wave, 50% duty), no
volume, no envelopes, no effects, no instruments, no loops, no channels. The
only expressive controls are tempo, note length (incl. dots) and the
articulation gate (7/8, 3/4, full). Pitch is fixed 12-TET from a fixed table;
no slides, no vibrato, no detune.

Per-note volume: **no**. The PC speaker is 1-bit (on/off), so the format has
nothing to carry it. PCjr / Tandy Cartridge BASIC added `V n` (volume 0-15)
and 3-voice PLAY for the SN76489 chip (unverified detail), but that is BASIC,
not ANSI music; no terminal reads it from an ANSI stream as far as I know.
In DEViLBOX the imported song becomes a normal pattern, so volume, effects
and other instruments can be added after import; they just cannot be saved
back into an ANSI music string.

## Fit in DEViLBOX

Reusable pieces found:

- `FurnacePCSPKR` instrument already exists
  (`src/constants/synthCategories/furnaceChips.ts:580`) - authentic PC-speaker
  voice; no new synth needed.
- `MDXParser.ts` is the closest existing MML-style command parser (YM2151);
  pattern for a text command stream to a grid.
- `docs/FORMAT_COMMAND_STREAM_GRID.md` - the recipe for turning a per-channel
  command stream into an editable tick grid.
- Format registry: `src/lib/import/formatRegistryData.ts`.

Import design (sketch, not approved):

1. Scan the .ANS byte stream for intros; each music block up to 0x0E becomes a
   subsong (one file can hold several tunes, e.g. a menu jingle per screen).
   Ignore the art bytes; SAUCE record at the end gives title/author.
2. Parse PLAY string to events (note, length in whole-note fractions, gate).
3. Grid: rows of 1/64 whole-note would miss dotted 64ths and triplet-ish dots;
   use 1/192 whole (or speed/BPM set so `T` maps to BPM directly and lengths
   to tick counts). `T` changes mid-string become BPM effect commands.
4. Gate (MN/MS/ML) becomes a note-off at 7/8 / 3/4 / end of the note's span.
5. One channel, FurnacePCSPKR instrument.
6. Export back to an ANSI music string is straightforward (one channel,
   quantised lengths) - optional.

Open questions: detection by extension (`.ans`, `.asc`, `.mus`?) clashes with
plain ANSI art that has no music; need a content check (intro present). Real
test files: 16colo.rs packs and BBS menu sets contain music ANSIs; need to
pick a few real ones for tests (no synthetic fixtures).

Out of scope unless asked: rendering the ANSI art itself.

## Later: demoscene PC-speaker music (separate from ANSI music)

Owner note 2026-11-01: demoscene PC-speaker tunes go far past ANSI music limits.
Those tunes program the timer chip (PIT channel 2) directly: fast arpeggios fake
polyphony, PWM plays samples (RealSound-style). Most live inside executables, so
they cannot be imported as files. The one known file format is MONOTONE (.MON,
Trixter's PC-speaker tracker) - candidate for a separate importer after ANSI
music. Furnace's PC Speaker system already supports arpeggio-based songs.
Owner wants .MON support too (2026-11-01). Research agent checking layout, effects, voice sharing and real files; plan covers both formats.

## Verified against sources (2026-11-01)

Sources: CTerm `cterm.txt` (gitlab.synchro.net sbbs master, src/conio/cterm.txt),
Terminate/SMILE ANSMUSIC.DOC. Full notes: session scratchpad
`ansi-spec-findings.md` (temporary).

- Intros CSI M, CSI N, CSI |. `CSI = Ps M`: 0 = only CSI |, 1 = CSI | and CSI N,
  2 = all three (Delete Line lost). Default 0 per the table; cterm.txt prose
  contradicts itself.
- After CSI M, a first char in `BbFfLlSs`, or `N`/`n` not followed by a digit, is
  the M-command (MF/MB/ML/MS/MN).
- Allowed chars: `aAbBcCdDeEfFgGlLmMnNoOpPsStT0-9.-+#<> ` and space; any other
  char voids the whole string, intro included.
- Terminator 0x0E confirmed. SMILE also stops at next ESC or end of line.
- O 0-6 default 4 (clamped), L 1-64 default 4, T 32-255 default 120 (clamped).
- CTerm pitch: C0..C6 = 65.406, 130.81, 261.62, 523.25, 1046.5, 2093, 4186 Hz.
  A440 = O2 A; default O4 C = 1046.5 Hz. GW-BASIC is one octave lower
  (unverified). Importer must pick one table; CTerm is the live reference.
- No volume, one voice, no alternate waveform found in CTerm.
- SMILE non-standard `ESC[MF Freq;Dur;Cycles;Delay;Var` sound effects: not
  portable, out of scope.
- PC speaker as Telix/Qmodem playback device: not stated in fetched docs.

Real fixtures: 4 found on discmaster.textfiles.com, now in
`src/lib/import/__tests__/fixtures/ansi-music/` (details in plan D4).
16colo.rs 1993-96 packs (~200 scanned) contain no music blocks. Real string from the Terminate doc (LOGO.ANS):
`ESC[MB O3 T120 L2CO4CO3L6BGABO4L2CO3L2CL2AL1GL2CFL4EL6CDEL4FL3DL6O2BO3CDL4EL2C` 0x0E.
Untried leads: discmaster.textfiles.com (megacd_rom_1 MUSIC/ANSIPL20.ZIP),
demo files in ter61.zip.
