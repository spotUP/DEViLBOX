---
date: 2026-10-08
topic: Native Hippel ST (TFMX-ST / COSO-ST) decoder with a YM2149 model
tags: [hippel, atari-st, ym2149, furnace, ay8910, native, K9]
status: draft
---

# Native Hippel ST (K9, owner decision A, 2026-10-08)

Spec = Wanted Team `Jochen Hippel ST_v4.asm` (2990 lines, fetched from uade gitlab master to the session scratchpad;
the repo copy is only the Amiga `Jochen Hippel_v1.asm`). `Play` (asm 1601-2490) fills a 16-byte YM register shadow
(`lbL000E26`) once per 50 Hz tick; `Play_Emu` (1286-1540) only turns that shadow into Paula writes. So the native
decoder is a port of `Init/InitPlay/Play` + the macro interpreter to C, whose output is the YM register file, and the
sound comes from a real YM2149 core.

## YM core (owner hint: Furnace has it)
`third-party/furnace-master/src/engine/platform/sound/ay8910.cpp` (MAME ay8910_device, `PSG_TYPE_YM`, standalone: only
`<algorithm>`, `<vector>`), already built into furnace-wasm. Reused as the chip. No second YM model written. sc68's
emu68/ym is a full 68k machine and the psgplay engine runs 68k code; neither fits a register-level decoder.

## Pieces
1. P1 `hippelst-wasm/` (C, new small module, pattern of aylet-wasm): `hst_load(bytes)`, `hst_set_subsong`,
   `hst_tick()` -> 16 YM regs + digi trigger, `hst_render(n)` (tick at 50 Hz, ay8910 clocked 2 MHz), per-voice mute,
   walk export (row/step/voice events), note-on for an instrument (keyboard), YM register dump. Size: ~700 lines C.
2. P2 Compress (raw TFMX -> COSO) exists in TS (`compressHstSong`); the C side takes the playback image the TS module
   already builds (`hstPlaybackImage`-style), so loading raw/COSO is one path.
3. P3 digi drums (Paula voice 1 of the Amiga player; on the ST: sample playback via YM volume). Check in asm; if the
   corpus songs do not use them, mark exemption in writing.
4. P4 Engine + worklet + routing: `.hst/.sog/.soc` with fileData to the new engine, native over UADE, position
   reporting, grid from the decoder walk (as dac96670a for 7V), keyboard voice = decoder note-on of the instrument (K2),
   live edit through the engine.
5. P5 Tests: reachability (top-level load -> sentinel -> numbers), per-song oracle vs UADE Paula (note/period/volume
   within stated tolerance), key within 50 cents / 2 dB of the song voice, export round trip byte-exact stays, revert
   check, test:ci wiring, provenance + ratchet.

## Oracle
UADE's current ST player (the asm itself, running on Paula): per tick, voice period/volume from the Paula writes (same
`uadeImportHarness` as K8). Stronger and cheaper: read the player's own YM shadow (`lbL000E26`) from chip RAM each
tick and compare the 16 registers 1:1 with the port. No SNDH twin in public/data/songs/sndh for these tunes (84 files,
none Hippel by name; unverified beyond a name grep).

## Estimate
Port + core + routing + tests: roughly 1500 lines new code, 6-10 work hours of runs. Corpus: 5 crown .hst, demo music10
.sog, astaroth .sog (formats/), ghostbattle .soc.

## Risks
Digi drums; Play's per-voice state offsets ($1A..$33 etc.) must be ported byte-exact; ay8910 filter vs Paula rendering
differ by design, so audio comparison is on notes/volumes, not waveforms.

## Licence and origin of the spec (checked 2026-10-08)
`Jochen Hippel ST_v4.asm`: https://gitlab.com/uade-music-player/uade/-/raw/master/amigasrc/players/wanted_team/Jochen_Hippel_ST/src/Jochen%20Hippel%20ST_v4.asm
Header: "Jochen Hippel ST replayer for EaglePlayer, written by Jochen Hippel, updated by WT" (Wanted Team). No licence
text in the file; UADE `COPYING` says "various licenses"; the Hippel replay routine itself is Jochen Hippel's original
code. Licence is NOT clear for redistribution in this public repo. Decision (main, 2026-10-08): the asm is a SPEC only.
It stays in the session scratchpad, is not committed, and the C is a clean implementation written from the observed
behaviour (state machine, formats, effect semantics), not a line-by-line translation; tables that are mathematical
(semitone ratios) are computed, not copied; tables that are data are measured from the player's runtime (UADE chip RAM)
or from the song files. The Amiga `Jochen Hippel_v1.asm` already in third-party/uade-3.05 is UADE's, not ours.

- Licence decision (owner 2026-10-08): "we dont need to keep it private" - commit the transpiled Hippel ST player and its asm under third-party/ with an origin/licence README.

## Progress (2026-10-08, stopped at main's request)

Decision change: the player is NOT hand-ported; it is the WT asm through tools/asm68k-to-c (owner), committed
with its origin in third-party/hippelst/README.md. Exactness is by construction and by oracle.

DONE (committed): C player (hippelst-wasm/src/hippelst_play.c, regen.sh), three transpiler bugs fixed with tests
(RMW on (An)+/-(An); MOVEA.W sign extension; byte through SP steps 2), oracle test hippelStNativeMatchesPlayer
(8 songs, every subsong, 1500 ticks, 11 YM regs equal to UADE's shadow, in test:ci).
DONE (this commit): YM render (Furnace ay8910 + blip_buf, ym_render.cpp), position tracking, keyboard player
(hst_key_on runs the player's own note start), worklet, HippelStEngine, HippelStSynth, registry entry 'HippelSt'
(before UADEEditable; song field hippelStFileData), routing position wiring, live-edit route 'hippelst-module',
tests hippelStNativeReachability (import -> registry -> engine class -> worklet; audio == decoder core, position ==
decoder, key sounds) and hippelStKeysMatchSongVoice (key regs == song voice regs per instrument; within 50 cents /
2 dB; silent exactly when the volume sequence has no volume).

OPEN (next steps, in order):
1. Live edit measured: edit a cell via sendCellEditsToEngine, worklet audio == decoder core of the edited image
   (write hippelStLiveEditHeard.test.ts; the code path applyHippelStEdits exists, untested).
2. Revert-checks of: key volume/attenuation resets, MOVEA.W/RMW/SP transpiler fixes (core), reload path.
3. Provenance + ratchet guards: gridProvenance/formatNameSymmetry were not run; run them.
4. Known: V2M feeder test (everyEngineHasAFeeder) fails independent of this work; JochenHippelSTParser.test.ts
   needs files under "Reference Music/" that are absent (pre-existing).
5. Not modelled: SID command (old/new) and digi drums ($EC) are Paula-side in the WT player; the corpus
   registers match without them, usage in the corpus not counted. Volume >= 16 (YM envelope mode) is played as
   volume 12 (WT's Amiga table entry 16 = half amplitude).
6. Owner test (LOCAL http://localhost:5174): open public/data/songs/hippel-st/crown england.hst, press play
   (YM sound, not Paula), press keys on instruments 1-9, edit a note while playing.
