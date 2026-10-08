---
date: 2026-10-08
topic: Which players compiled C64 SIDs use, and GoatTracker 2 SIDs opened as songs (S1)
tags: [sid, hvsc, sidid, goattracker, s1]
status: final
---

# SID player coverage (S1 phase 1) and GoatTracker 2 decode (phase 2)

Owner decision 2026-10-08: compiled SIDs open as editable songs for KNOWN players
only; unknown players keep the visualizer. Generic load-time data-flow tracing
is declined.

## Phase 1 - player per song

### Sources

- **HVSC, all 58,150 tunes**: the `player` column of DeepSID's `hvsc_files`
  table in `server/data/deepsid.db` (file dated 2026-03-03). DeepSID fills
  that column by running SIDId over HVSC, so these are SIDId names. Counted
  with `fullname LIKE '_High Voltage SID Collection/%.sid'` (the DB also holds
  2,859 "SID Happens" and 7 "Exotic" tunes, left out).
- **Our own files** (11 C64 SIDs: `public/data/songs/sid`, `public/deepsid`,
  and the 9 HVSC files in `server/data/modland-cache/files`): SIDId 1.x
  (`sidid.c` + `sidid.cfg`, github.com/cadaver/sidid, fetched 2026-10-08,
  built in the session scratchpad, not vendored).

### HVSC, top 15 (SIDId name as DeepSID stores it)

| # | Player | Songs | Share |
|---|--------|------:|------:|
| 1 | GoatTracker_V2.x | 6,625 | 11.4% |
| 2 | Music_Assembler | 6,315 | 10.9% |
| 3 | DMC_V4.x | 5,424 | 9.3% |
| 4 | FutureComposer_V1.0 | 3,103 | 5.3% |
| 5 | DMC | 2,949 | 5.1% |
| 6 | DMC_V5.x | 2,265 | 3.9% |
| 7 | SoundMonitor/MusicMaster_1 | 2,156 | 3.7% |
| 8 | JCH_NewPlayer_V20 | 1,666 | 2.9% |
| 9 | GoatTracker_V1.x | 1,377 | 2.4% |
| - | (unidentified) | 1,306 | 2.2% |
| 10 | HardTrack_Composer | 1,167 | 2.0% |
| 11 | Master_Composer | 965 | 1.7% |
| 12 | Hermit/SidWizard_V1.x | 942 | 1.6% |
| 13 | Geir_Tjelta/SIDDuzz'It | 939 | 1.6% |
| 14 | JCH_NewPlayer_V14 | 702 | 1.2% |
| 15 | Digitalizer_V2.x | 678 | 1.2% |

708 distinct player names in all; the long tail is mostly one-composer
players (Rob_Hubbard 280, David_Whittaker 118, ...).

By family (same source): DMC all versions 10,653 (18.3%), GoatTracker V1+V2
8,003 (13.8%), JCH / Laxity NewPlayer all versions 3,857 (6.6%), Future
Composer all 3,764 (6.5%), SID-Wizard 942, CheeseCutter_2.x 297, SID Factory
II (SidFactory_II/Laxity 254 + SidFactory/Laxity 40) 294.

Note: DeepSID stores one name per file, the first SIDId hit; GoatTracker's
stereo build (`GT_V2.x_2SID`, a sub-signature) is counted inside
GoatTracker_V2.x there.

### Our files (SIDId run)

| Player | Files |
|--------|------:|
| GoatTracker_V2.x | 3 (Jammar_akhbar, 424, 80squares) |
| GoatTracker_V1.x | 1 (Paranoimia) |
| CheeseCutter_2.x | 1 (abaddon-starfish-test) |
| GMC/Superiors, JammicroV1, Music_Assembler, OdinTracker, Soundbooster | 1 each |
| unidentified | 1 (public/deepsid/test.sid) |

(The six SidMon 1 `.sid` files in the cache are Amiga modules, not C64.)

## Phase 2 - GoatTracker 2 SIDs open as GoatTracker songs

### Where the layout comes from

GoatTracker 2.77 source (sourceforge goattracker2, "latest" zip, fetched
2026-10-08): `src/greloc.c` (packer/relocator) and `src/player.s`. The repo's
`gtultra-wasm/src/greloc.c` is the GTUltra fork of the same code (same label
order for 3-channel songs). Data after the player code, in label order:
`mt_freqtbllo/hi`, `mt_songtbllo/hi` (songs*3), `mt_patttbllo/hi`,
instrument columns `ad, sr, waveptr, [pulseptr], [filtptr], [vibparam,
vibdelay], [gatetimer, firstwave]`, tables `wave/note, [pulse L/R], [filter
L/R], [0] speedleft, [0] speedright`, orderlists, packed patterns
(greloc.c `relocator()` "Insert ..." blocks; `packpattern()`).

The optional parts and the parameters folded into the code (instrument
hard-restart order FIRSTNOHRINSTR / FIRSTLEGATOINSTR, fixed gatetimer /
firstwave, DEFAULTTEMPO, NOWAVEDELAY, SIMPLEPULSE) are assembly-time
conditionals, so the decoder reads them where player.s uses them: the song
table from the SIDId signature (the sequencer's `lda mt_songtbllo,y`), the
pattern table from mt_getnewnote, each step table's start from its
`lda label,y / cmp #$ff` jump check, instrument columns from the `lda
label-1,y` operands, the instrument order from `cmp #FIRSTNOHRINSTR` and the
hard-restart write. Every reverse transform is the inverse of a named greloc.c
step (wave left column delay/silent shift, note-column high bit, filter
passband bits, simple pulse nybble swap, orderlist repeat swap, tempo command
minus one).

### Code

- `src/lib/import/formats/GoatTrackerSid.ts`: `decodeGoatTracker2Sid`,
  `goatTrackerSongBytes` (the one rule: a GT .sng as is, a GT2 .sid decoded),
  `parseGoatTrackerSng` / `writeGoatTrackerSng` (GTS5, gsong.c).
- `classifySong` (`src/lib/song/openSong.ts`) sends a decodable GT2 .sid to
  the `goatTracker` kind; the GoatTracker branch (`songBranches.ts`
  `loadSongFile`) applies the decoded .sng as `engine.goatTrackerData`, the
  same path a .sng takes. Every entry (drop, file browser, jukebox, Modland,
  HVSC, MCP load_file) goes through classifySong. A SID that does not match,
  or whose layout cannot be read back unambiguously, stays a SID (visualizer).
- Test: `src/lib/song/__tests__/goatTrackerSidOpensAsSong.test.ts` (in test:ci).

### Verification

1. **Round trip through the real packer** (scratchpad harness, not CI): the 14
   GoatTracker 2.77 example songs, each packed by gt2reloc 2.77 (built from the
   same source) with 12 option sets (default, buffered, sound effects, volume,
   author info, full buffering, no optimizations, 2x speed, other player/zp
   address, NTSC, 25 Hz, zero-page ghost registers). Decode -> write .sng ->
   pack again with the same options -> compared byte for byte with the first
   pack, and the decoded song compared with the source .sng as it plays.
   Result: see "Round trip" below.
2. **Answer key**: HVSC `MUSICIANS/S/Shogoon/Jammar_akhbar.sid` vs
   `public/data/songs/goat-tracker-ultra/$3jammar-akhbar.sng`.
3. **Our other GT2 SIDs**: Jammer `424.sid` (fixed gatetimer/firstwave, no
   wave delays, simple pulse) and `80squares.sid` decode.

### Answer key: what differs

The HVSC file is a later revision than the .sng: it has 79 patterns to the
.sng's 78 - pattern 18 also exists as a copy (pattern 26 in the SID), used
once on voice 3; every pattern number after it is one higher. With that
mapping:

- every pattern is the .sng's, note for note and command for command;
- the orderlists of both subtunes, all three voices, are identical;
- every note plays an instrument identical in ad, sr, gate timer, hard-restart
  type, first wave, vibrato and its wave / pulse / filter programs.

What the SID does not hold, so the opened song lacks it:

- instrument names (empty), song name / author / copyright come from the PSID
  header instead;
- instrument numbers: the packer renumbers by hard-restart type and drops
  unused ones (35 used of the .sng's 35 here, so only the order can change);
- table row numbers: unused rows are dropped and duplicates merged, pointers
  remapped (wave-pointer commands read 42 where the .sng says 137, same
  program);
- an instrument number repeated on consecutive notes is written once
  (998 such cells in this song); the playing instrument is the same;
- unused patterns and empty subtunes; tempo command values 2 and 3 both come
  back as 3 (they play the same); mastervolume timing marks when the SID was
  packed without author info; the hard-restart ADSR (-A option) and speed
  multiplier, which a .sng does not store either.

### Round trip (gt2reloc 2.77, 14 example songs x 12 option sets = 168 builds)

Option sets: default, -B1 buffered, -C1 -ZE0 zero-page ghost registers, -D1
sound effects, -E1 volume, -H1 author info, -J1 full buffering, -I0 no
optimizations, -S2 2x speed, -S0 25 Hz, -N NTSC, -W20 -Z02 other addresses.

- 168 of 168 decode, and the decoded song equals the source .sng as it plays
  (same check as the test: patterns, orderlists, instruments and table
  programs).
- 144 of 168 re-pack byte for byte identical to the original build.
- The other 24 (sixpack, transylvanian, every option set) re-pack 1 speed-table
  row shorter: their .sng has instruments with a speed-table pointer but
  vibrato delay 0, so the original packer kept a row nothing reads; the decoded
  song does not point at it, so the second pack drops it. Same playback.

Found on the way and fixed in the decoder: multispeed builds (-S2 and up)
number the legato instruments one higher in the code than in the data
(greloc.c counts an extra no-hard-restart instrument after mapping), and the
filter "set" rows lose their low nybble (the player reads only `& 0x70`,
gplay.c), so a .sng value of B1 comes back as B0.

### HVSC sample (60 random GoatTracker_V2.x tunes, downloaded from hvsc.c64.org)

- 54 decode and pass the decoder's own consistency check (every orderlist
  entry, pattern note, instrument number, table pointer and jump in range).
- 2 are GoatTracker stereo (2SID, six voices): rejected, stay SIDs.
- 3 use an older player/data layout (e.g. Butka "Ranked #1", 2006): the
  instrument and table data sit before the song table, not after it; rejected
  ("wave table reference"), stay SIDs. A second layout variant would cover
  them; not built.
- 1 carries the sequencer twice (NVitia "Brick Buster"): rejected.

There is no answer key for these 54 beyond the consistency check; the
round-trip and Jammar comparisons are the proof of the transforms.

Known gap, not decoder-specific: GoatTracker .sng files do not store the speed
multiplier, and the GTUltra open path does not set one, so a 2x (or 25 Hz)
song - .sng or decoded .sid - plays at 1x in the editor. The decoder reads the
multiplier from the PSID (`layout.multiplier`); wiring it into GTUltra
(`gt_set_multiplier` exists in GTUltraBridge.cpp) is a separate change.

## Next players worth doing (by HVSC share and what we already edit)

1. **DMC (Demo Music Creator) V4/V5/older** - 18.3% of HVSC together, the
   biggest family; no DMC editor in the app yet, so it needs one (or a mapping
   into an existing editor) before a decoder pays off.
2. **JCH / Laxity NewPlayer (V14-V21)** - 6.6%; SID Factory II's Laxity
   driver descends from NewPlayer 21, and the app has an SF2 editor
   (`src/components/sidfactory2`). Unverified: whether SF2's own Laxity
   converter covers compiled V20 tunes - check SF2's source first.
3. **Music_Assembler** - 10.9%, second-largest single name; no editor in the
   app. Or, cheaper and already editable here: **CheeseCutter 2.x** (297) and
   **SID Factory II** (294) compiled tunes into the existing CheeseCutter and
   SF2 editors - small share, but the editors exist and both packers are open
   source.

GoatTracker V1.x (1,377, 2.4%) is the closest follow-up in effort: same
author, older player, opens in the same editor.
