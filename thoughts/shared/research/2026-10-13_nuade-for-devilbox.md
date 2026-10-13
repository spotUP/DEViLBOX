---
date: 2026-10-13
topic: nuade-for-devilbox
tags: [nuade, uade, amiga, replayers, editability, wasm, research]
status: draft
---

# nuade (emoon) for DEViLBOX

Source examined: `emoon/nuade` at `4900e597e6718d523e50bbaf6e1fc6ca41ebe683` (2026-10-13, tag `v0.1.0`, five commits,
the first an "Initial import" `278fe909`). Cloned and built out of tree in the session scratchpad; nothing was added to
this repository except this file.

## Summary

- nuade is a C library of **121 native players** that cover 132 UADE eagleplayers. It is a playback and display library,
  **not** an editing library. It has no write API and no module encoders. The player vtable's display hooks are read-only
  by contract.
- **Formats nuade makes editable for us: 0.** Nothing in it writes a module.
- What it does add, counted from its 121 vtables against our `gridProvenance.ts`:
  - **84 players** cover formats that we play through UADE today (classic, UADEEditable or the catchall), where nuade
    gives a native C replayer instead.
  - **14 players** decode the stored pattern data (`tracker_cells`) of formats whose grid we only RECONSTRUCT (or do not
    list at all).
  - The other 70 tick players expose per-voice state that can serve as a replayer-walk oracle.
- **Fidelity, measured on 15 corpus songs** (20 s, 20 ms envelope correlation against `uade123 --filter=NONE`): nuade
  scores 0.967 to 0.999 on 13 of them. Where we have our own engine, nuade comes out closer to UADE on 3 of 3
  (SoundMon 0.987 vs 0.949, SidMon II 0.989 vs 0.968, Future Composer 0.990 vs 0.976). David Whittaker ties: both
  engines stop at 4.2 s, where UADE runs on to 8.5 s.
- **License: MIT.** It can be used in GPL-3 DEViLBOX. Three data files copied from eagleplayers are unlicensed (see §1.4).
- **Recommendation:** vendor nuade at a pinned SHA and compile it to **one WASM engine** ("Nuade") in
  `wasmEngineRegistry`. Use it to replace UADE playback for the "Replace" rows. Keep our parsers, encoders and our own
  engines for the "Keep ours" rows. The decisive trade-off: one 1.76 MB engine takes about 84 formats off UADE and gives
  a walk oracle, at the cost of no live chip-RAM edits on those formats until each one has an encoder (edits reach the
  engine by export and reload instead).

## 1. What nuade is

### 1.1 Purpose
- A port of UADE's player routines from 68000 assembly to C ([README.md:5-6](https://github.com/emoon/nuade/blob/4900e597e6718d523e50bbaf6e1fc6ca41ebe683/README.md#L5-L6)). The stated goals are
  readable format documentation, pattern/note displays and metadata, editors built on top, and better synth output
  ([README.md:12-18](https://github.com/emoon/nuade/blob/4900e597e6718d523e50bbaf6e1fc6ca41ebe683/README.md#L12-L18)).
- Its status, in its own words: "very early stage of development. Expect bugs" ([README.md:22](https://github.com/emoon/nuade/blob/4900e597e6718d523e50bbaf6e1fc6ca41ebe683/README.md#L22)). Most
  of the translation and A/B testing was done by AI agents, with UADE as the reference
  ([README.md:24-27](https://github.com/emoon/nuade/blob/4900e597e6718d523e50bbaf6e1fc6ca41ebe683/README.md#L24-L27)).

### 1.2 Architecture
- **Not a UADE fork and not a 68k emulator.** No Musashi or CPU core is in the tree (grep for m68k, musashi and cpu_step
  finds nothing). Each player is hand-translated C.
- **Framework:** `src/`, about 2.9k lines. It provides a Paula channel model, a mixer, a tick scheduler, a song API, a
  file index, scan and trace. The library entry points are `nuade_open/start/render/close`
  ([include/nuade/nuade.h](https://github.com/emoon/nuade/blob/4900e597e6718d523e50bbaf6e1fc6ca41ebe683/include/nuade/nuade.h)). Rendering is 48 kHz-capable float stereo, with optional per-voice
  mono buffers for isolation ([player.h:121-124](https://github.com/emoon/nuade/blob/4900e597e6718d523e50bbaf6e1fc6ca41ebe683/include/nuade/player.h#L121-L124)).
- **Player vtable** ([include/nuade/player.h:101-168](https://github.com/emoon/nuade/blob/4900e597e6718d523e50bbaf6e1fc6ca41ebe683/include/nuade/player.h#L101-L168)): `probe`, `open`,
  `start`, then either `tick` (the framework owns the clock and the mixer) or `render_raw`, then `metadata` and the
  display hooks `position`, `voice_info`, `events`, `tracker_info`, `tracker_cells` and `grid_ticks`.
  - The display hooks are "Read-only: no allocation, no locking, no I/O, no change to the song"
    ([player.h:128-129](https://github.com/emoon/nuade/blob/4900e597e6718d523e50bbaf6e1fc6ca41ebe683/include/nuade/player.h#L128-L129)).
  - `grid_ticks` players get a grid that the framework synthesises by scanning voice starts
    ([player.h:151-163](https://github.com/emoon/nuade/blob/4900e597e6718d523e50bbaf6e1fc6ca41ebe683/include/nuade/player.h#L151-L163)). It is a view, not decoded data.
- **No writer.** The only "export" in the tree is `sa_export`, which returns the original file unmodified
  ([players/sonicarranger/sonic_arranger.c:2340-2360](https://github.com/emoon/nuade/blob/4900e597e6718d523e50bbaf6e1fc6ca41ebe683/players/sonicarranger/sonic_arranger.c#L2340-L2360)). That
  comment mentions "the WASM replayer", which points to where this file came from (§1.5).
- **Players:** 121 directories, about 168.5k lines of C. The registry is generated at configure time from
  `players/*/nuade_player.cmake` ([cmake/nuade_players.cmake:58](https://github.com/emoon/nuade/blob/4900e597e6718d523e50bbaf6e1fc6ca41ebe683/cmake/nuade_players.cmake#L58)).
  `NUADE_PLAYERS` selects a subset ([README.md:41](https://github.com/emoon/nuade/blob/4900e597e6718d523e50bbaf6e1fc6ca41ebe683/README.md#L41)).
- **Language and build:** C11 by declaration ([CMakeLists.txt:35](https://github.com/emoon/nuade/blob/4900e597e6718d523e50bbaf6e1fc6ca41ebe683/CMakeLists.txt#L35)), CMake 3.16. CI builds on
  Linux, macOS and Windows and compiles the README example. **No test suite is in the repo.** The A/B harness that the
  README describes is not shipped; only a `dump_state` hook exists, in 3 players.

### 1.3 How the formats were counted
- **121 players:** one `const NuadePlayer` vtable per `players/<id>/`, extracted by script from the source. This matches
  the 121 entries the generated `nuade_players.c` registry holds after a full build. It also matches
  [docs/players.md:7](https://github.com/emoon/nuade/blob/4900e597e6718d523e50bbaf6e1fc6ca41ebe683/docs/players.md#L7): "132 ported (by 121 nuade players), 13 not ported, 31 skipped".
- **Every player is a tick player** (121 of 121; none uses `render_raw`).
- Display capability per vtable, counted from the same extraction:

| Display mode (vtable hooks) | Players | Meaning |
|---|---|---|
| Rows: `tracker_info` + `tracker_cells` | 35 | decodes the stored pattern/track data into cells |
| Events: `events` | 1 (sonix) | per-voice event stream (SMUS/SNX) |
| Grid(scan): `grid_ticks` | 70 | a grid the framework derives from voice starts |
| Voices: `voice_info` only | 10 | current note and instrument per voice |
| none | 5 | audio only |

- **Not ported:** SIDMon 1, Steve Turner, Future Player, Paul Tonge, RJ, and the ST/PSG/YM/AGI/MIDI-Loriciel formats
  ([docs/players.md:144-171](https://github.com/emoon/nuade/blob/4900e597e6718d523e50bbaf6e1fc6ca41ebe683/docs/players.md#L144-L171)).
- **Skipped on purpose:** AHX, AON, PreTracker, TFMX (all variants), the MOD/MED/DIGI family and the MOD packers
  ([docs/players.md:173-195](https://github.com/emoon/nuade/blob/4900e597e6718d523e50bbaf6e1fc6ca41ebe683/docs/players.md#L173-L195)).

### 1.4 License
- nuade is MIT ([LICENSE](https://github.com/emoon/nuade/blob/4900e597e6718d523e50bbaf6e1fc6ca41ebe683/LICENSE)), copyright Daniel Collin 2026.
- 25 players are ports of NostalgicPlayer, which is also MIT
  ([THIRD_PARTY_NOTICES.md:3-33](https://github.com/emoon/nuade/blob/4900e597e6718d523e50bbaf6e1fc6ca41ebe683/THIRD_PARTY_NOTICES.md#L3-L33)).
- Three files hold eagleplayer data that is copied unchanged and carries no stated license: `pokeynoise/pn_waves.c`,
  `davidhanney/dh_data.c` and `majortom/mt_data.c`
  ([THIRD_PARTY_NOTICES.md:62-71](https://github.com/emoon/nuade/blob/4900e597e6718d523e50bbaf6e1fc6ca41ebe683/THIRD_PARTY_NOTICES.md#L62-L71)). We already ship UADE's eagleplayer binaries, so
  this adds no new exposure.
- MIT code can be combined into GPL-3-or-later DEViLBOX.

### 1.5 Shared code with DEViLBOX
- 27 of our `*-wasm` replayer sources share 39-67% of their distinct non-trivial lines with a nuade player. Examples:
  ronklaren 0.67, sonix 0.66, voodoo 0.66, bendaglish 0.65, actionamics 0.64, sonic arranger 0.57.
- Our files were committed between March and April 2026, and nuade arrived as one import on 2026-10-13. The
  `sa_export` comment exists verbatim in our `sonic-arranger-wasm/src/sonic_arranger.c:2545-2557`.
- So these nuade players share lineage with our ports. The direction cannot be proven from nuade's one-commit history.
- Both copies carry `SPDX-License-Identifier: MIT` headers, so there is no license conflict. For these 27 formats nuade
  is a sibling of what we already have, not new work.

## 2. DEViLBOX state for the same formats

DEViLBOX sources read for this section:

- `src/lib/import/gridProvenance.ts` is the single per-format source for grid origin (DIRECT / WALK / RECONSTRUCTED /
  SCOPE), `EXPORT_ROUND_TRIP`, `LIVE_EDIT` and `ADD_ON_EMPTY_ROW`. It holds 279 keys: 94 DIRECT, 14 WALK,
  142 RECONSTRUCTED and 29 SCOPE.
- `src/engine/uade/__tests__/encoderRoundtrip.ratchet.json` (byte-exact pattern codecs) and
  `src/lib/export/__tests__/exporterRoundtrip.ratchet.json` (byte-exact exporters).
- `src/engine/replayer/wasmEngineRegistry.ts` lists the engines that play natively. Our own C replayers are the
  `*Replayer` keys, plus SonicArranger, SidMon2, PumaTracker, JamCracker, MusicAssembler, BenDaglish, Sonix, MusicMaker
  and SunTronicSong. Hippel songs go through libtfmxaudiodecoder. EaglePlayer means Musashi running UADE's own player,
  per `src/engine/eagleplayer/eaglePlayerFormats.ts`.
- The planned walk work in `thoughts/shared/plans/2026-10-07-grid-from-replayer-walk.md` (G11 / U-units), plus
  `src/lib/formats/EditableFormatRegistry.builtins.ts` and `src/lib/import/formatRegistryData.ts`.
- The 2026-07-07 phase-0 handoff and `tools/format-state.json` hold older audit state. Where they disagree with the
  ratchets and `gridProvenance.ts`, the newer sources were used.

Mapping nuade ids to our registry keys:

- The match is by normalised name, with hand overrides for about 45 ids such as fred_np to fred, digmug to mugician and
  hippelhip to uade_hip.
- 4 nuade players have no key in our registry: amcomposer, audiosculpture, dirkbialluch and protracker4. They are
  assumed to reach UADE through the catchall (**unverified**).
- The engine column for "own" engines was assigned by hand from `wasmEngineRegistry.ts`. It was read from source, not
  measured per song.

## 3. Per-format table (121 nuade players)

Column guide:

- **nuade:** the display mode from the vtable (§1.3).
- **DV keys:** our registry and `gridProvenance` keys.
- **DV grid:** the best grid source among those keys.
- **byte-exact:** "yes" when either ratchet has `byte-exact` for the format, and "partial" for `pattern-match`. RT is
  `EXPORT_ROUND_TRIP`.
- **Basis:** "measured" means 20 s renders compared by 20 ms RMS-envelope correlation against `uade123 --filter=NONE`.
  "ours" figures come from our own replayer C sources compiled natively in the scratchpad. Everything else was read from
  source.

Verdict counts:

- Keep ours: 36. These are our own engine (29) or Musashi EaglePlayer (7).
- Merge: 1 (sonic arranger).
- Replace engine, keep our parser/encoder: 12.
- Replace: 72.

| nuade id | nuade name | nuade | DV keys | DV grid | DV engine | DV byte-exact | nuade adds | Verdict | Deciding reason | Basis |
|---|---|---|---|---|---|---|---|---|---|---|
| actionamics | Actionamics Sound Tool | Rows | actionamics | WALK | own: ActionamicsReplayer | partial / RT pass | shared code with ours (0.64) | Keep ours | our engine has the edit API and our encoder; same code lineage, ours not measured | read from source |
| activisionpro | Activision Pro | Grid(scan) | activisionPro | WALK | own: ActivisionProReplayer | yes / RT pass | shared code with ours (0.52) | Keep ours | our engine has the edit API and our encoder; same code lineage, ours not measured | read from source |
| amcomposer | AM-Composer | Grid(scan) | - | - | UADE catchall (unverified) | no | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| amos | AMOS Music AmosBank | Rows | amosMusicBank, uade_abk | DIRECT | UADE | no | native replayer | Replace engine, keep our parser/encoder | our grid is DIRECT; nuade only removes UADE | read from source |
| andersoland | Anders 0land | Grid(scan) | anders0land | DIRECT | EaglePlayer (Musashi + UADE player) | no | - | Keep ours | Musashi runs the original player, exact by construction | read from source |
| andrewparton | Andrew Parton | Grid(scan) | andrewParton | RECONSTRUCTED | UADE | no | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| aprosys | AProSys | Grid(scan) | aProSys | RECONSTRUCTED | UADE | no | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| artandmagic | Art and Magic | Grid(scan) | artAndMagic | RECONSTRUCTED | UADE | no | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| ashleyhogg | Ashley Hogg | Grid(scan) | ashleyHogg | RECONSTRUCTED | UADE | no | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| audiosculpture | Audio Sculpture | Rows | - | - | UADE catchall (unverified) | no | native replayer; stored-pattern decoder | Replace | nuade plays it natively; its decoder gives the grid we only reconstruct | read from source |
| beathoven | Beathoven Synthesizer | Grid(scan) | uade_bss | RECONSTRUCTED | EaglePlayer (Musashi + UADE player) | no | walk oracle (voice_info) | Keep ours | Musashi runs the original player, exact by construction | read from source |
| bendaglish | Ben Daglish | Grid(scan) | benDaglish | WALK | own: BenDaglish | yes / RT pass | shared code with ours (0.65) | Keep ours | our engine has the edit API and our encoder; same code lineage, ours not measured | measured: nuade 0.998 |
| bendaglishsid | Ben Daglish SID | Grid(scan) | benDaglishSID | SCOPE | EaglePlayer (Musashi + UADE player) | no | - | Keep ours | Musashi runs the original player, exact by construction | read from source |
| cinemaware | Cinemaware | Grid(scan) | cinemaware | RECONSTRUCTED | UADE | no | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| coredesign | Core Design | Grid(scan) | coreDesign | RECONSTRUCTED | EaglePlayer (Musashi + UADE player) | no | walk oracle (voice_info) | Keep ours | Musashi runs the original player, exact by construction | measured: nuade 0.985 |
| dariuszendeh | Darius Zendeh | Grid(scan) | uade_dz, uade_mkiio | RECONSTRUCTED | UADE | no | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| davelowe | Dave Lowe | Grid(scan) | daveLowe | DIRECT | EaglePlayer (Musashi + UADE player) | yes | - | Keep ours | Musashi runs the original player, exact by construction | measured: nuade 0.994 |
| davidhanney | David Hanney | Rows | uade_dh | RECONSTRUCTED | UADE | no | native replayer; stored-pattern decoder | Replace | nuade plays it natively; its decoder gives the grid we only reconstruct | read from source |
| davidwhittaker | David Whittaker | Grid(scan) | davidWhittaker | WALK | own: DavidWhittakerReplayer | yes / RT pass | shared code with ours (0.51) | Keep ours | our engine has the edit API and our encoder; same code lineage, ours not measured | measured: nuade 0.852 = ours 0.854 (both stop at 4.2 s, UADE runs 8.5 s) |
| deltamusic1 | DeltaMusic 1 | Rows | deltaMusic1 | DIRECT | own: DeltaMusic1Replayer | yes | shared code with ours (0.09) | Keep ours | our engine has the edit API and our encoder; same code lineage, ours not measured | read from source |
| deltamusic2 | Delta Music 2 | Rows | deltaMusic2 | DIRECT | own: DeltaMusic2Replayer | yes | - | Keep ours | our engine has the edit API and our encoder; independent code, ours not measured | read from source |
| desire | Desire | Grid(scan) | desire | RECONSTRUCTED | UADE | no | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| digmug | Digital Mugician | Rows | mugician | RECONSTRUCTED | own: DigMugReplayer | yes | stored-pattern decoder; shared code with ours (0.49) | Keep ours | our engine has the edit API and our encoder; same code lineage, ours not measured | read from source |
| dirkbialluch | Dirk Bialluch | Grid(scan) | - | - | UADE catchall (unverified) | no | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| dsc | Digital Sonix & Chrome | Grid(scan) | digitalSonixChrome | WALK | UADE | yes / RT pass | native replayer | Replace engine, keep our parser/encoder | our grid is WALK; nuade only removes UADE | read from source |
| dss | Digital Sound Studio | Rows | digitalSoundStudio | DIRECT | own: DssReplayer | no | shared code with ours (0.47) | Keep ours | our engine has the edit API and our encoder; same code lineage, ours not measured | read from source |
| dynamicsynthesizer | Dynamic Synthesizer | Grid(scan) | uade_dns | RECONSTRUCTED | UADE | no | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| earache | EarAche | Grid(scan) | earAche | RECONSTRUCTED | UADE | yes | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | measured: nuade 0.984 |
| ems | EMS (Editeur Musical Sequentiel) | Rows | uade_ems | RECONSTRUCTED | UADE | no | native replayer; stored-pattern decoder | Replace | nuade plays it natively; its decoder gives the grid we only reconstruct | read from source |
| emsv6 | EMS v6 (Electronic Music System) | Grid(scan) | uade_emsv6 | RECONSTRUCTED | UADE | no | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| facethemusic | Face The Music | Rows | faceTheMusic | DIRECT | own: FaceTheMusicReplayer | yes | shared code with ours (0.39) | Keep ours | our engine has the edit API and our encoder; same code lineage, ours not measured | read from source |
| fashiontracker | Fashion Tracker | Rows | fashionTracker | DIRECT | UADE | yes | native replayer | Replace engine, keep our parser/encoder | our grid is DIRECT; nuade only removes UADE | read from source |
| fcbsi | Future Composer BSI | Grid(scan) | uade_fc_bsi, uade_bsi | RECONSTRUCTED | UADE | no | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| forgottenworlds | Forgotten Worlds | Grid(scan) | uade_fw | SCOPE | UADE | no | native replayer | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| fred_np | Fred Editor | Grid(scan) | fred | WALK | own: FredReplayer2 | yes / RT pass | shared code with ours (0.63) | Keep ours | our engine has the edit API and our encoder; same code lineage, ours not measured | read from source |
| fredgray | Fred Gray | Grid(scan) | fredGray | RECONSTRUCTED | UADE | no | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| futurecomposer | Future Composer | Rows | fc | DIRECT | own: FutureComposerReplayer | yes | shared code with ours (0.51) | Keep ours | our engine has the edit API and our encoder; port nuade's playback deltas (closer to UADE) | measured: nuade 0.990 / ours 0.976 |
| gluemon | GlueMon | Rows | gluemon | RECONSTRUCTED | UADE | yes | native replayer; stored-pattern decoder | Replace | nuade plays it natively; its decoder gives the grid we only reconstruct | read from source |
| gmc | Game Music Creator | Rows | gameMusicCreator | DIRECT | UADE | yes | native replayer; shared code with ours (0.47) | Replace engine, keep our parser/encoder | our grid is DIRECT; nuade only removes UADE | read from source |
| hippel | Jochen Hippel COSO | Grid(scan) | hippelCoso | DIRECT | own: Hippel (libtfmxaudiodecoder) | yes | - | Keep ours | our engine has the edit API and our encoder; independent code, ours not measured | measured: nuade 0.998 |
| hippel7v | Jochen Hippel 7V | Grid(scan) | jochenHippel7V | WALK | own: Hippel (libtfmxaudiodecoder) | yes / RT pass | - | Keep ours | our engine has the edit API and our encoder; independent code, ours not measured | measured: nuade 0.999 |
| hippelhip | Jochen Hippel (.hip) | Grid(scan) | uade_hip | RECONSTRUCTED | UADE | no | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| howiedavies | Howie Davies | Grid(scan) | uade_hd | RECONSTRUCTED | UADE | no | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| infogrames | Infogrames | Grid(scan) | infogrames | RECONSTRUCTED | UADE | yes | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| instereo1 | InStereo! 1.0 | Rows | inStereo1 | DIRECT | own: InStereo1Replayer | partial | shared code with ours (0.56) | Keep ours | our engine has the edit API and our encoder; same code lineage, ours not measured | read from source |
| instereo2 | InStereo! 2.0 | Rows | inStereo2 | DIRECT | own: InStereo2Replayer | yes | shared code with ours (0.53) | Keep ours | our engine has the edit API and our encoder; same code lineage, ours not measured | read from source |
| jamcracker | JamCracker | Rows | jamcracker | DIRECT | own: JamCracker | yes | - | Keep ours | our engine has the edit API and our encoder; independent code, ours not measured | read from source |
| jankomrsicflogel | Janko Mrsic-Flogel | Grid(scan) | jankoMrsicFlogel | RECONSTRUCTED | UADE | no | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| jasonbrooke | Jason C. Brooke | Grid(scan) | jasonBrooke | RECONSTRUCTED | UADE | no | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| jasonpage | Jason Page | Grid(scan) | jasonPage | RECONSTRUCTED | UADE | no | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| jeroentel | Jeroen Tel | Grid(scan) | jeroenTel | DIRECT | UADE | no | native replayer | Replace engine, keep our parser/encoder | our grid is DIRECT; nuade only removes UADE | read from source |
| jesperolsen | Jesper Olsen | Grid(scan) | jesperOlsen | RECONSTRUCTED | UADE | no | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| kimchristensen | Kim Christensen | Grid(scan) | kimChristensen | RECONSTRUCTED | UADE | no | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| krishatlelid | Kris Hatlelid | Grid(scan) | krisHatlelid | RECONSTRUCTED | UADE | no | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| laxity | Laxity | Rows | laxity | RECONSTRUCTED | UADE | no | native replayer; stored-pattern decoder | Replace | nuade plays it natively; its decoder gives the grid we only reconstruct | read from source |
| legglessmusiceditor | Leggless Music Editor | Grid(scan) | lme | RECONSTRUCTED | UADE | no | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| majortom | Major Tom | Rows | uade_arp | RECONSTRUCTED | UADE | no | native replayer; stored-pattern decoder | Replace | nuade plays it natively; its decoder gives the grid we only reconstruct | read from source |
| maniacsofnoise | Maniacs of Noise | Voices | maniacsOfNoise | RECONSTRUCTED | UADE | no | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| markcooksey | Mark Cooksey | Grid(scan) | markCooksey | RECONSTRUCTED | UADE | no | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| markcooksey_old | Mark Cooksey (old) | Grid(scan) | markCooksey | RECONSTRUCTED | UADE | no | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| markii | Mark II | Grid(scan) | markII | RECONSTRUCTED | UADE | no | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| maximumeffect | Maximum Effect | Grid(scan) | maximumEffect | RECONSTRUCTED | UADE | no | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| mcmd | MCMD | Grid(scan) | uade_mcmd | RECONSTRUCTED | UADE | no | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| medley | Medley | Grid(scan) | medley | RECONSTRUCTED | UADE | no | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| mikedavies | Mike Davies | Grid(scan) | mikeDavies | RECONSTRUCTED | UADE | no | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| mmdc | OctaMED MMDC | Rows | mmdc | RECONSTRUCTED | UADE | no | native replayer; stored-pattern decoder | Replace | nuade plays it natively; its decoder gives the grid we only reconstruct | measured: nuade 0.996 |
| musicalenlightenment | The Musical Enlightenment | Rows | tme | RECONSTRUCTED | UADE | no | native replayer; stored-pattern decoder | Replace | nuade plays it natively; its decoder gives the grid we only reconstruct | measured: nuade 0.967 |
| musicassembler | Music Assembler | Grid(scan) | musicAssembler | WALK | own: MusicAssembler | yes | shared code with ours (0.64) | Keep ours | our engine has the edit API and our encoder; same code lineage, ours not measured | read from source |
| musicmaker | MusicMaker V8 | Grid(scan) | musicMaker | DIRECT | own: MusicMaker | no | - | Keep ours | our engine has the edit API and our encoder; independent code, ours not measured | read from source |
| ntsp | NTSP-system | none | ntsp, uade_ntsp | RECONSTRUCTED | UADE | no | native replayer | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| oktalyzer | Oktalyzer | Rows | okt | DIRECT | own: OktalyzerReplayer | no | shared code with ours (0.53) | Keep ours | our engine has the edit API and our encoder; same code lineage, ours not measured | read from source |
| onescapee | onEscapee | none | onEscapee | RECONSTRUCTED | UADE | no | native replayer | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| paulrobotham | Paul Robotham | Grid(scan) | paulRobotham | RECONSTRUCTED | UADE | yes | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| paulshields | Paul Shields | Voices | paulShields | RECONSTRUCTED | UADE | yes | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| paulsummers | Paul Summers | Voices | paulSummers | RECONSTRUCTED | UADE | no | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| peterverswyvelen | Peter Verswyvelen | Grid(scan) | peterVerswyvelenPacker | DIRECT | UADE | no | native replayer | Replace engine, keep our parser/encoder | our grid is DIRECT; nuade only removes UADE | read from source |
| pierreadane | Pierre Adane Packer | Grid(scan) | pierreAdane | RECONSTRUCTED | UADE | no | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| pokeynoise | Pokeynoise | Voices | uade_pn | RECONSTRUCTED | UADE | no | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| professionalsoundartists | Professional Sound Artists | Grid(scan) | psa | RECONSTRUCTED | UADE | no | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| protracker4 | Protracker4 | Rows | - | - | UADE catchall (unverified) | no | native replayer; stored-pattern decoder | Replace | nuade plays it natively; its decoder gives the grid we only reconstruct | read from source |
| pumatracker | PumaTracker | Rows | pumaTracker | DIRECT | own: PumaTracker | yes | - | Keep ours | our engine has the edit API and our encoder; independent code, ours not measured | read from source |
| quadracomposer | Quadra Composer | Rows | quadraComposer | DIRECT | own: QuadraComposerReplayer | yes | shared code with ours (0.50) | Keep ours | our engine has the edit API and our encoder; same code lineage, ours not measured | read from source |
| quartet | Quartet | Grid(scan) | quartet | RECONSTRUCTED | UADE | no | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| richardjoseph | Richard Joseph Player | Grid(scan) | richardJoseph | DIRECT | UADE | no | native replayer | Replace engine, keep our parser/encoder | our grid is DIRECT; nuade only removes UADE | read from source |
| riffraff | Riff Raff | Grid(scan) | uade_riff | RECONSTRUCTED | UADE | no | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| robhubbard | Rob Hubbard | Grid(scan) | robHubbard | WALK | UADE | yes / RT pass | native replayer | Replace engine, keep our parser/encoder | our grid is WALK; nuade only removes UADE | measured: nuade 0.996 |
| robhubbardst | Rob Hubbard ST | none | robHubbardST, uade_rhst | DIRECT | UADE | no | native replayer | Replace engine, keep our parser/encoder | our grid is DIRECT; nuade only removes UADE | read from source |
| ronklaren | Ron Klaren | Grid(scan) | ronKlaren | RECONSTRUCTED | own: RonKlarenReplayer | yes | walk oracle (voice_info); shared code with ours (0.67) | Keep ours | our engine has the edit API and our encoder; same code lineage, ours not measured | read from source |
| scottjohnston | Scott Johnston | Grid(scan) | soundPlayer | DIRECT | EaglePlayer (Musashi + UADE player) | yes | - | Keep ours | Musashi runs the original player, exact by construction | read from source |
| scumm | SCUMM | Grid(scan) | scumm | RECONSTRUCTED | UADE | yes | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| seanconnolly | Sean Connolly | Grid(scan) | seanConnolly | RECONSTRUCTED | UADE | no | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| seanconran | Sean Conran | none | seanConran | RECONSTRUCTED | UADE | no | native replayer | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| sidmon2 | SidMon II | Rows | sidmon2 | DIRECT | own: SidMon2 | yes | shared code with ours (0.56) | Keep ours | our engine has the edit API and our encoder; port nuade's playback deltas (closer to UADE) | measured: nuade 0.989 / ours 0.968 |
| silmarils | Silmarils | Grid(scan) | uade_mok | RECONSTRUCTED | UADE | no | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| sonicarranger | Sonic Arranger | Rows | sonicArranger | DIRECT | own: SonicArranger | yes | shared code with ours (0.57) | Merge | our engine has the edit API and our encoder; take nuade's binary-variant loader | measured: nuade 0.997 on the 0x4EFA binary variant; ours refuses it (falls to UADE) |
| sonix | Sonix Music Driver | Events | iffSmus | DIRECT | own: Sonix | yes | shared code with ours (0.66) | Keep ours | our engine has the edit API and our encoder; same code lineage, ours not measured | read from source |
| soundcontrol | Sound Control | Grid(scan) | soundControl | DIRECT | own: SoundControlReplayer | yes | shared code with ours (0.64) | Keep ours | our engine has the edit API and our encoder; same code lineage, ours not measured | read from source |
| soundfactory | Sound Factory | Grid(scan) | soundFactory | RECONSTRUCTED | own: SoundFactory2Replayer | yes | walk oracle (voice_info); shared code with ours (0.53) | Keep ours | our engine has the edit API and our encoder; same code lineage, ours not measured | read from source |
| soundfx | SoundFX | Rows | soundfx | DIRECT | UADE | yes | native replayer; shared code with ours (0.57) | Replace engine, keep our parser/encoder | our grid is DIRECT; nuade only removes UADE | read from source |
| soundimages | Sound Images | Voices | uade_tw | RECONSTRUCTED | UADE | no | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| soundmaster | Sound Master | Grid(scan) | soundMaster | WALK | UADE | yes / RT pass | native replayer | Replace engine, keep our parser/encoder | our grid is WALK; nuade only removes UADE | read from source |
| soundmon | BP SoundMon | Rows | soundmon | DIRECT | own: SoundMonReplayer | yes | shared code with ours (0.47) | Keep ours | our engine has the edit API and our encoder; port nuade's playback deltas (closer to UADE) | measured: nuade 0.987 / ours 0.949 |
| specialfx | Special FX | Grid(scan) | specialFX | RECONSTRUCTED | UADE | no | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| speedya1system | Speedy A1 System | Grid(scan) | speedySystem | RECONSTRUCTED | UADE | no | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| speedysystem | Speedy System | Grid(scan) | speedySystem | RECONSTRUCTED | UADE | no | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| spl | Sound Programming Language | none | uade_spl | RECONSTRUCTED | UADE | no | native replayer | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| stevebarrett | Steve Barrett | Voices | steveBarrett | RECONSTRUCTED | UADE | no | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| suntronic | SUN-Tronic | Voices | suntronic, uade_sun | WALK | own: SunTronicSong | yes / RT fail | - | Keep ours | our engine has the edit API and our encoder; independent code, ours not measured | read from source |
| synthdream | Synth Dream | Grid(scan) | uade_sdr | RECONSTRUCTED | UADE | no | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| synthesis | Synthesis | Rows | synthesis | DIRECT | own: SynthesisReplayer | yes | shared code with ours (0.58) | Keep ours | our engine has the edit API and our encoder; same code lineage, ours not measured | read from source |
| synthpack | Synth Pack | Grid(scan) | synthPack | RECONSTRUCTED | UADE | no | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| syntracker | SynTracker | Rows | uade_synmod | RECONSTRUCTED | UADE | yes | native replayer; stored-pattern decoder | Replace | nuade plays it natively; its decoder gives the grid we only reconstruct | read from source |
| thomashermann | Thomas Hermann | Voices | thomasHermann | RECONSTRUCTED | UADE | no | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| timetracker | TimeTracker | Rows | timeTracker | RECONSTRUCTED | UADE | no | native replayer; stored-pattern decoder | Replace | nuade plays it natively; its decoder gives the grid we only reconstruct | read from source |
| timfollin | Tim Follin | Voices | uade_tf | RECONSTRUCTED | UADE | no | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | measured: nuade 0.993 (ends at 11.8 s) |
| tomytracker | Tomy Tracker | Rows | tomyTracker, uade_tomy | RECONSTRUCTED | UADE | yes | native replayer; stored-pattern decoder | Replace | nuade plays it natively; its decoder gives the grid we only reconstruct | read from source |
| tronic | Tronic | Rows | tronic | RECONSTRUCTED | UADE | no | native replayer; stored-pattern decoder | Replace | nuade plays it natively; its decoder gives the grid we only reconstruct | read from source |
| ufo | UFO | Voices | ufo | RECONSTRUCTED | UADE | no | native replayer; walk oracle (voice_info) | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| voodoo | Voodoo Supreme Synthesizer | Grid(scan) | uade_vss | RECONSTRUCTED | UADE | no | native replayer; walk oracle (voice_info); shared code with ours (0.66) | Replace | nuade plays it natively; its voice state can be the walk oracle | read from source |
| wallybeben | Wally Beben | Grid(scan) | wallyBeben | RECONSTRUCTED | EaglePlayer (Musashi + UADE player) | yes | walk oracle (voice_info) | Keep ours | Musashi runs the original player, exact by construction | read from source |
| zoundmonitor | ZoundMonitor | Rows | zoundMonitor | DIRECT | UADE | yes | native replayer | Replace engine, keep our parser/encoder | our grid is DIRECT; nuade only removes UADE | read from source |

### 3.1 Measurements (small set, no sweep)

Every song was rendered for 20 s at 48 kHz, compared by mono 20 ms RMS envelope with the best lag within ±1 s. UADE is
`uade123 -1 --filter=NONE`.

- **nuade against UADE:**
  - bp3 0.987
  - sid2 0.989
  - sa 0.997
  - fc 0.990
  - tme 0.967
  - mmdc 0.996
  - tf 0.993 (nuade ends at 11.8 s)
  - rh 0.996
  - bd 0.998
  - hipc 0.998
  - hip7 0.999
  - dl 0.994
  - core 0.985
  - ea 0.984
  - dw 0.852 (ends at 4.2 s against UADE's 8.5 s)
- **The A500 filter matters.** With UADE's default A500 filter the same pairs score 0.81-0.97 at 100 ms. Always compare
  with the filter off.
- **Our engines against UADE**, from the same songs, with our C sources built natively:
  - SoundMon 0.949
  - SidMon II 0.968
  - Future Composer 0.976
  - David Whittaker 0.854 (also stops at 4.2 s)
  - `sa_create` refuses `almighty.sa`. That file is the 0x4EFA player+data binary, which `SonicArrangerParser.ts` routes
    away from our engine (`useOffsetTable`, :1006). nuade plays it natively at 0.997.
- **Decoded grid check:** nuade's `tracker_cells` returns real stored pattern cells for both of these, where our grid is
  RECONSTRUCTED:
  - `64_conversion.tme`: note / inst / list / vol / flg / arg columns, 32 rows.
  - The MMDC title song: note / inst / fx / arg columns, 40 rows.
- **WASM:** an `emcmake` build of all 121 players compiled cleanly. `render.wasm` is 1.76 MB uncompressed. Its node
  render of `antidust.bp3` is **byte-identical** to the native build.
- **Limits of the measurement:**
  - Envelope correlation shows tick and volume agreement, not sample or register identity.
  - 15 songs cover 15 of 121 players.
  - All "read from source" verdicts are unmeasured.

### 3.2 Completeness and code quality (read from source)
- No TODO, FIXME or "not implemented" markers in `players/`.
- 70 build warnings on Apple clang, all of the missing-initializer kind.
- Known gaps it states itself:
  - Packed `@OARV` Sonic Arranger is not supported ([docs/players.md:112]).
  - CustomMade `cm` is open.
  - The ST variants are refused.
- The NostalgicPlayer-lineage players read like our own ports (shared code, §1.5). The UADE-only players (Wanted Team
  family, Hubbard, Follin, etc.) are new code we do not have.
- Weak points: no test suite in the repo, and the API is at version 2 of a project at v0.1.0, so it can still change.

## 4. Integration options

1. **One nuade WASM engine (recommended).**
   - Vendor the library pinned to a SHA under `third-party/nuade`, add a `nuade-wasm/` with the usual
     `build.sh` / CMake, a worklet, and a `Nuade` descriptor in `wasmEngineRegistry` (`fileDataKey: nuadeFileData`,
     player id selected by our parser).
   - Use `nuade_render` with the per-voice buffers for channel isolation and dub sends, and `nuade_snapshot` or
     `voice_info` for position.
   - Effort: M for the engine, then S per format to route.
   - Risks:
     - Upstream churn. Mitigate by pinning the SHA and keeping our own routing tests.
     - Fidelity unknown on the 106 unmeasured players. Mitigate by gating each routed format with one UADE comparison
       test, the same pattern as `uadeEnvelopeCorrelation` in `eaglePlayerFormats.ts`.
     - Live edits on these formats lose the chip-RAM path until each one gets an encoder. Edits would go through the
       module-swap path (`editedModuleForPlay`), which needs our exporter.
2. **Per-player WASM builds** (`NUADE_PLAYERS=<id>`).
   - This follows the existing one-engine-per-format pattern, but means 84 more worklets and loaders. That duplication
     is what option 1 avoids.
   - Only worth it if a single 1.76 MB module is too large to load lazily.
3. **Reference only (port into our engines and parsers).**
   - Use nuade's decoders for the 14 Rows-over-RECONSTRUCTED formats to write DIRECT parsers and encoders.
   - Port its playback deltas into SoundMon, SidMon II and FC.
   - This is cheap to start but keeps UADE as the engine for about 84 formats, which runs against "UADE is the last
     resort".
4. **nuade's data model as the carrier.**
   - Its cells are display values (`int32` columns), not file offsets, and nothing maps them back to bytes. They cannot
     carry byte-exact edits.
   - Our `blockRows` / layout codecs stay the carrier.

**Recommended: option 1, with option 3 applied to the 14 decoded formats.**

- **Decisive trade-off:** one engine moves about 84 formats off UADE onto readable, A/B'd C with per-voice output, and
  each player becomes a walk oracle for the G11 / U-units in `2026-10-07-grid-from-replayer-walk.md`. The cost is that
  editability on those formats still has to come from our own encoders.
- nuade does not move any format to editable by itself.

## 5. Decisions for the owner
1. **Adopt nuade as a single WASM engine for the 84 UADE-played formats?** This is a scope and product decision. Rollout
   would be per format, behind one UADE comparison test each.
2. **For the 29 formats where we have our own engine:** keep ours (the edit API is wired), or port the playback deltas
   nuade measured closer on? SoundMon, SidMon II and FC are each 0.01-0.04 closer to UADE on one song each.
3. **The shared lineage (§1.5):** whether to raise it with emoon, or offer the edit API back upstream.

## 6. Open / unverified
- 106 players have no measurement.
- The engine for the 4 players without a registry key (amcomposer, audiosculpture, dirkbialluch, protracker4) is
  assumed to be the UADE catchall.
- nuade's `protracker4` uses extension `ptm`, which collides with PolyTracker `ptm` in our registry; not resolved.
- `apb.dw` stops at 4.2 s in both nuade and our engine but not in UADE. The cause is not investigated.
